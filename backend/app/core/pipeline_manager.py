import asyncio
import time
import numpy as np
from collections import deque
from typing import Optional, Set
from fastapi import WebSocket
from app.ml.inference import InferencePipeline
from app.services.video_reader import VideoReader
from app.services.frame_processor import FrameProcessor
from app.services.event_logger import FODEventLogger
from app.schemas.detection import PipelineStatus
from app.config import settings
from app.core.logger import logger

# ─────────────────────────────────────────────────────────────────────────────
# FOD Tracker — identik dengan FODTracker di notebook trial2
# Digunakan agar hasil file pipeline sama dengan notebook:
#   - Sebuah deteksi harus muncul di MIN_TRACK_FRAMES frame berturut-turut
#     sebelum dianggap "confirmed" dan ditampilkan.
#   - Box posisi mengikuti deteksi terakhir, ukuran dirata-rata (stabilisasi).
# ─────────────────────────────────────────────────────────────────────────────
_STABILIZATION_WINDOW = 5
_IOU_THRESHOLD_TRACK  = 0.3
_MAX_FRAMES_LOST      = 10
_MIN_TRACK_FRAMES     = 3


class _FODTracker:
    def __init__(self, track_id, initial_box, confidence, frame_num):
        self.track_id     = track_id
        self.recent_boxes = deque([initial_box], maxlen=_STABILIZATION_WINDOW)
        self.current_box  = initial_box
        self.confidences  = deque([confidence],  maxlen=_STABILIZATION_WINDOW)
        self.frames_seen  = 1
        self.frames_lost  = 0
        self.first_frame  = frame_num
        self.last_frame   = frame_num
        self.is_confirmed = False

    def update(self, box, confidence, frame_num):
        self.recent_boxes.append(box)
        self.current_box  = box
        self.confidences.append(confidence)
        self.frames_seen += 1
        self.frames_lost  = 0
        self.last_frame   = frame_num
        if self.frames_seen >= _MIN_TRACK_FRAMES:
            self.is_confirmed = True

    def mark_lost(self):
        self.frames_lost += 1

    def is_dead(self):
        return self.frames_lost > _MAX_FRAMES_LOST

    def get_stabilized_box(self):
        arr    = np.array(self.recent_boxes)
        w_mean = int(arr[:, 2].mean())
        h_mean = int(arr[:, 3].mean())
        x, y   = self.current_box[0], self.current_box[1]
        return (x, y, w_mean, h_mean)

    def get_avg_confidence(self):
        return float(np.mean(self.confidences))

    def should_draw(self):
        return self.is_confirmed and self.frames_lost == 0


def _compute_iou(box1, box2):
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    ix1 = max(x1, x2);  iy1 = max(y1, y2)
    ix2 = min(x1+w1, x2+w2);  iy2 = min(y1+h1, y2+h2)
    iw  = max(0, ix2 - ix1);  ih = max(0, iy2 - iy1)
    inter = iw * ih
    union = w1*h1 + w2*h2 - inter
    return inter / union if union > 0 else 0.0


def _match_detections(detections, trackers):
    """Greedy IoU matching — identik dengan notebook."""
    if not trackers:
        return [], list(range(len(detections))), []
    if not detections:
        return [], [], list(range(len(trackers)))

    iou_mat = np.zeros((len(detections), len(trackers)))
    for d, det in enumerate(detections):
        for t, tr in enumerate(trackers):
            iou_mat[d, t] = _compute_iou(det, tr.get_stabilized_box())

    matched, unmatched_d, unmatched_t = [], list(range(len(detections))), list(range(len(trackers)))
    while unmatched_d and unmatched_t:
        best = 0.0; bd = bt = -1
        for d in unmatched_d:
            for t in unmatched_t:
                if iou_mat[d, t] > best:
                    best = iou_mat[d, t]; bd = d; bt = t
        if best < _IOU_THRESHOLD_TRACK:
            break
        matched.append((bd, bt))
        unmatched_d.remove(bd)
        unmatched_t.remove(bt)
    return matched, unmatched_d, unmatched_t


class PipelineManager:
    """
    Singleton yang mengelola state pipeline deteksi.
    Satu instance dipakai seluruh aplikasi.
    """
    
    def __init__(self):
        self.status = PipelineStatus.IDLE
        self.video_id: Optional[str] = None
        self.video_path: Optional[str] = None
        
        # Core components
        self.inference = InferencePipeline()
        self.reader = VideoReader()
        self.processor = FrameProcessor()
        self.event_logger = FODEventLogger()

        # Tracking state — identik dengan notebook trial2
        self._trackers: list = []
        self._next_track_id: int = 1
        self._confirmed_ids: set = set()
        
        # WebSocket clients yang sedang terhubung
        self._active_clients: Set[WebSocket] = set()
        
        # Control flags
        self._running = False
        self._paused = False
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # not paused initially
        self._task: Optional[asyncio.Task] = None
        
        # Metrics
        self._start_time: float = 0
        self._fps_counter = 0
        self._fps_timer = 0
        self._current_fps = 0.0
    
    def initialize_models(self):
        """Dipanggil saat startup aplikasi"""
        self.inference.load_models()
    
    async def add_client(self, websocket: WebSocket):
        """Tambah client WebSocket baru"""
        self._active_clients.add(websocket)
        logger.info(f"Client baru terhubung. Total: {len(self._active_clients)}")
    
    async def remove_client(self, websocket: WebSocket):
        """Hapus client yang disconnect"""
        self._active_clients.discard(websocket)
        logger.info(f"Client disconnect. Total: {len(self._active_clients)}")
    
    async def start_pipeline(self, video_path: str, video_id: str):
        """Mulai pipeline deteksi"""
        if self._running:
            await self.stop_pipeline()
        
        self.video_path = video_path
        self.video_id = video_id
        self.event_logger.reset()
        self._running = True
        self._paused = False
        self._pause_event.set()
        self.status = PipelineStatus.RUNNING
        self._start_time = time.time()

        # Reset tracker
        self._trackers = []
        self._next_track_id = 1
        self._confirmed_ids = set()
        
        # Jalankan sebagai background task
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Pipeline dimulai untuk video: {video_id}")
    
    async def stop_pipeline(self):
        """Stop pipeline deteksi"""
        self._running = False
        self._paused = False
        self._pause_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.reader.release()
        self.status = PipelineStatus.STOPPED
        logger.info("Pipeline dihentikan")
        
        # Notifikasi semua client
        await self._broadcast({"type": "status", "status": "stopped"})
    
    async def pause_pipeline(self):
        """Pause pipeline deteksi"""
        if not self._running or self._paused:
            return
        self._paused = True
        self._pause_event.clear()
        self.status = PipelineStatus.PAUSED
        logger.info("Pipeline di-pause")
        await self._broadcast({"type": "status", "pipeline_status": "paused", "status": "paused"})
    
    async def resume_pipeline(self):
        """Resume pipeline dari pause"""
        if not self._running or not self._paused:
            return
        self._paused = False
        self._pause_event.set()
        self.status = PipelineStatus.RUNNING
        logger.info("Pipeline di-resume")
        await self._broadcast({"type": "status", "pipeline_status": "running", "status": "running"})
    
    async def _run_loop(self):
        """
        Loop utama: baca frame → inference → broadcast ke semua client.
        """
        try:
            self.reader.open(self.video_path)
            
            # Notify clients that pipeline actually started processing
            await self._broadcast({
                "type": "status",
                "status": "processing",
                "pipeline_status": "running",
                "video_id": self.video_id,
                "total_frames": self.reader.total_frames,
                "message": f"Pipeline dimulai — {self.reader.total_frames} frames"
            })
            
            frame_interval = 1.0 / settings.TARGET_FPS
            
            loop = asyncio.get_event_loop()
            
            while self._running:
                # ── Wait if paused ───────────────────────────────────────
                await self._pause_event.wait()
                if not self._running:
                    break
                loop_start = time.time()
                t_read = time.time()
                # ── Baca frame (blocking → thread pool) ──────────────────
                result_read = await loop.run_in_executor(
                    None, self.reader.read_frame
                )
                t_read_done = time.time()
                if result_read is None:
                    logger.info("Video selesai diputar")
                    # Reset status SEBELUM broadcast agar WS client baru yang
                    # connect setelah ini langsung mendapat pipeline_status: "idle"
                    self.status = PipelineStatus.IDLE
                    self._running = False
                    await self._broadcast({
                        "type": "status",
                        "status": "finished",
                        "pipeline_status": "idle",
                        "total_fod": self.event_logger.total_fod_count
                    })
                    break
                frame, frame_idx = result_read
                t_infer = time.time()
                # ── Inference (blocking → thread pool) ───────────────────
                detection = await loop.run_in_executor(
                    None, self.inference.process_frame, frame
                )
                t_infer_done = time.time()
                # ── Tracking — identik dengan notebook trial2 ─────────────
                # Detections adalah list BoundingBox; buat list tuple (x,y,w,h)
                det_boxes = [(b.x, b.y, b.width, b.height) for b in detection.bboxes]
                det_confs = {(b.x, b.y, b.width, b.height): b.confidence for b in detection.bboxes}

                matched, unmatched_dets, unmatched_tracks = _match_detections(
                    det_boxes, self._trackers
                )
                for det_idx, track_idx in matched:
                    box = det_boxes[det_idx]
                    self._trackers[track_idx].update(box, det_confs[box], frame_idx)
                for det_idx in unmatched_dets:
                    box = det_boxes[det_idx]
                    self._trackers.append(
                        _FODTracker(self._next_track_id, box, det_confs[box], frame_idx)
                    )
                    self._next_track_id += 1
                for track_idx in unmatched_tracks:
                    self._trackers[track_idx].mark_lost()
                self._trackers = [t for t in self._trackers if not t.is_dead()]
                for t in self._trackers:
                    if t.is_confirmed:
                        self._confirmed_ids.add(t.track_id)

                # Bboxes yang di-broadcast & divisualisasi hanya dari tracker confirmed
                confirmed_bboxes = []
                from app.schemas.detection import BoundingBox as _BBox
                for t in self._trackers:
                    if t.should_draw():
                        x, y, w, h = t.get_stabilized_box()
                        confirmed_bboxes.append(_BBox(
                            x=x, y=y, width=w, height=h,
                            confidence=round(t.get_avg_confidence(), 4),
                            label="FOD"
                        ))

                # Override detection bboxes dengan tracker-confirmed bboxes
                detection.bboxes = confirmed_bboxes
                detection.anomaly_detected = len(confirmed_bboxes) > 0

                # ── Record ke event logger ────────────────────────────────
                self.event_logger.record(detection)
                # ── Simpan snapshot FOD jika ada tracker confirmed ─────────
                from app.services.fod_snapshot import save_fod_snapshot
                from app.models.fod_snapshot import FODSnapshot
                from app.db import SessionLocal
                import datetime
                if detection.anomaly_detected and detection.bboxes:
                    db = SessionLocal()
                    try:
                        for bbox in detection.bboxes:
                            img_filename = save_fod_snapshot(
                                frame,
                                {
                                    "x": bbox.x,
                                    "y": bbox.y,
                                    "width": bbox.width,
                                    "height": bbox.height
                                },
                                self.video_id or "novid",
                                frame_idx,
                                bbox.label,
                                bbox.confidence
                            )
                            snapshot = FODSnapshot(
                                timestamp    = datetime.datetime.utcnow(),
                                video_id     = self.video_id,
                                frame_number = frame_idx,
                                bbox         = {
                                    "x": bbox.x, "y": bbox.y,
                                    "width": bbox.width, "height": bbox.height
                                },
                                image_path  = img_filename,
                                label       = bbox.label,
                                confidence  = bbox.confidence
                            )
                            db.add(snapshot)
                        db.commit()
                    except Exception as e:
                        logger.error(f"Gagal simpan snapshot FOD: {e}")
                        db.rollback()
                    finally:
                        db.close()

                t_overlay = time.time()
                # ── Gambar overlay di frame ───────────────────────────────
                annotated_frame = self.processor.draw_detection_overlay(
                    frame, detection
                )
                t_overlay_done = time.time()
                # ── Encode frame ke JPEG bytes ────────────────────────────
                frame_bytes = self.processor.encode_frame_bytes(annotated_frame)
                t_encode_done = time.time()
                # ── Update FPS counter ────────────────────────────────────
                self._update_fps()
                # ── Susun payload JSON (tanpa frame) ─────────────────────
                payload = {
                    "type": "frame",
                    "frame_id": frame_idx,
                    "timestamp": detection.timestamp,
                    "fps": self._current_fps,
                    "anomaly_detected": detection.anomaly_detected,
                    "anomaly_score": detection.anomaly_score,
                    "bboxes": [
                        {
                            "x": b.x, "y": b.y,
                            "width": b.width, "height": b.height,
                            "confidence": b.confidence,
                            "label": b.label
                        }
                        for b in detection.bboxes
                    ],
                    "score_history": self.event_logger.get_score_history(),
                    "recent_events": self.event_logger.get_recent_events(10),
                    "total_fod_count": self.event_logger.total_fod_count,
                    "pipeline_status": self.status.value,
                    "video_progress_pct": self.reader.get_progress(),
                    "current_frame": self.reader.current_frame,
                    "total_frames": self.reader.total_frames,
                    "elapsed_seconds": time.time() - self._start_time,
                    "runway_area_pct": detection.runway_area_pct,
                    "video_id": self.video_id,
                }
                t_payload_done = time.time()
                # ── Broadcast ke semua client ─────────────────────────────
                await self._broadcast((payload, frame_bytes))
                t_broadcast_done = time.time()
                # ── Profiling log ─────────────────────────────────────────
                logger.debug(
                    f"Frame {frame_idx:05d} | "
                    f"read={t_read_done-t_read:.3f}s "
                    f"infer={t_infer_done-t_infer:.3f}s "
                    f"overlay={t_overlay_done-t_overlay:.3f}s "
                    f"encode={t_encode_done-t_overlay_done:.3f}s "
                    f"payload={t_payload_done-t_encode_done:.3f}s "
                    f"broadcast={t_broadcast_done-t_payload_done:.3f}s "
                    f"total={t_broadcast_done-loop_start:.3f}s"
                )
                # ── Frame rate control ────────────────────────────────────
                elapsed = time.time() - loop_start
                sleep_time = frame_interval - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Error di pipeline loop: {e}\n{tb}")
            self.status = PipelineStatus.ERROR
            await self._broadcast({
                "type": "error",
                "pipeline_status": "error",
                "message": str(e),
                "video_id": self.video_id,
            })
        finally:
            self.reader.release()
            self._running = False
            # Jika status masih RUNNING (belum di-reset secara eksplisit),
            # reset ke IDLE agar koneksi WebSocket baru tidak mendapat
            # pipeline_status: "running" yang salah.
            if self.status == PipelineStatus.RUNNING:
                self.status = PipelineStatus.IDLE
    
    async def _broadcast(self, data):
        """Kirim payload ke semua WebSocket client yang aktif"""
        if not self._active_clients:
            return
        # Snapshot client set to avoid RuntimeError if set changes during await
        clients = list(self._active_clients)
        disconnected = set()
        for client in clients:
            try:
                if isinstance(data, tuple):
                    # Kirim JSON metadata dulu
                    await client.send_json(data[0])
                    # Kirim frame JPEG binary
                    await client.send_bytes(data[1])
                else:
                    await client.send_json(data)
            except Exception:
                disconnected.add(client)
        self._active_clients -= disconnected
    
    def _update_fps(self):
        """Update FPS counter"""
        self._fps_counter += 1
        now = time.time()
        if now - self._fps_timer >= 1.0:
            self._current_fps = self._fps_counter
            self._fps_counter = 0
            self._fps_timer = now
    
    def get_status(self) -> dict:
        return {
            "status": self.status.value,
            "video_id": self.video_id,
            "current_frame": self.reader.current_frame if self.reader else 0,
            "total_frames": self.reader.total_frames if self.reader else 0,
            "elapsed_seconds": time.time() - self._start_time if self._running else 0,
            "detected_fod_count": self.event_logger.total_fod_count,
        }

# ── Global singleton ──────────────────────────────────────────────────────────
pipeline_manager = PipelineManager()