import asyncio
import time
from typing import Optional, Set
from fastapi import WebSocket
from app.models.inference import InferencePipeline
from app.services.video_reader import VideoReader
from app.services.frame_processor import FrameProcessor
from app.services.event_logger import FODEventLogger
from app.schemas.detection import PipelineStatus
from app.config import settings
from app.core.logger import logger

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
        
        # WebSocket clients yang sedang terhubung
        self._active_clients: Set[WebSocket] = set()
        
        # Control flags
        self._running = False
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
        self.status = PipelineStatus.RUNNING
        self._start_time = time.time()
        
        # Jalankan sebagai background task
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Pipeline dimulai untuk video: {video_id}")
    
    async def stop_pipeline(self):
        """Stop pipeline deteksi"""
        self._running = False
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
    
    async def _run_loop(self):
        """
        Loop utama: baca frame → inference → broadcast ke semua client.
        """
        try:
            self.reader.open(self.video_path)
            frame_interval = 1.0 / settings.TARGET_FPS
            
            loop = asyncio.get_event_loop()
            
            while self._running:
                loop_start = time.time()
                t_read = time.time()
                # ── Baca frame (blocking → thread pool) ──────────────────
                result_read = await loop.run_in_executor(
                    None, self.reader.read_frame
                )
                t_read_done = time.time()
                if result_read is None:
                    logger.info("Video selesai diputar")
                    await self._broadcast({
                        "type": "status",
                        "status": "finished",
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
                # ── Record ke event logger ────────────────────────────────
                self.event_logger.record(detection)
                # ── Simpan snapshot FOD jika terdeteksi ────────────────
                from app.services.fod_snapshot import save_fod_snapshot
                from app.models.fod_snapshot import FODSnapshot
                from app.db import SessionLocal
                import datetime
                if detection.anomaly_detected and detection.bboxes:
                    db = SessionLocal()
                    try:
                        for bbox in detection.bboxes:
                            # Crop & simpan gambar
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
                            # Simpan metadata ke DB
                            snapshot = FODSnapshot(
                                timestamp = datetime.datetime.utcnow(),
                                video_id = self.video_id,
                                frame_number = frame_idx,
                                bbox = {
                                    "x": bbox.x,
                                    "y": bbox.y,
                                    "width": bbox.width,
                                    "height": bbox.height
                                },
                                image_path = img_filename,
                                label = bbox.label,
                                    confidence = bbox.confidence
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
            logger.error(f"Error di pipeline loop: {e}")
            self.status = PipelineStatus.ERROR
            await self._broadcast({"type": "error", "message": str(e)})
        finally:
            self.reader.release()
            self._running = False
    
    async def _broadcast(self, data):
        """Kirim payload ke semua WebSocket client yang aktif"""
        if not self._active_clients:
            return
        disconnected = set()
        for client in self._active_clients:
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