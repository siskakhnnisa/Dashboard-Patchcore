"""
Stream Pipeline Manager — mengelola pipeline deteksi FOD dari live video stream.

Arsitektur mirip PipelineManager, tapi:
  - Input dari RTSP/RTMP/SRT stream (bukan file upload)
  - Infinite loop (stream tidak punya akhir)
  - Dedicated WebSocket endpoint terpisah (/ws/stream-live)
  - Auto-reconnect jika stream terputus
"""
import asyncio
import time
import datetime
from typing import Optional, Set
from fastapi import WebSocket
from app.services.stream_reader import StreamReader
from app.services.frame_processor import FrameProcessor
from app.services.event_logger import FODEventLogger
from app.services.activity_history import finalize_stream_history
from app.schemas.detection import PipelineStatus
from app.config import settings
from app.core.logger import logger
from app.core.pipeline_manager import _FODTracker, _match_detections


class StreamPipelineManager:
    """
    Singleton untuk mengelola live stream detection pipeline.
    Terpisah dari PipelineManager (file-based) agar bisa jalan paralel.
    """

    def __init__(self):
        self.status = PipelineStatus.IDLE
        self.stream_url: Optional[str] = None
        self.stream_name: Optional[str] = None

        # Core components
        self.inference = None  # Shared with pipeline_manager, set at init
        self.reader = StreamReader()
        self.processor = FrameProcessor()
        self.event_logger = FODEventLogger()

        # WebSocket clients
        self._active_clients: Set[WebSocket] = set()

        # Control flags
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._paused = False
        self.history_entry_id: Optional[int] = None

        # Metrics
        self._start_time: float = 0
        self._fps_counter = 0
        self._fps_timer = 0
        self._current_fps = 0.0
        self._total_frames_processed = 0

        # Tracking state — identik dengan notebook trial2
        self._trackers: list = []
        self._next_track_id: int = 1
        self._confirmed_ids: set = set()

    def initialize(self, inference_pipeline):
        """Set shared inference pipeline (dipanggil saat startup)."""
        self.inference = inference_pipeline
        logger.info("Stream pipeline manager initialized")

    async def add_client(self, websocket: WebSocket):
        self._active_clients.add(websocket)
        logger.info(f"Stream client connected. Total: {len(self._active_clients)}")

    async def remove_client(self, websocket: WebSocket):
        self._active_clients.discard(websocket)
        logger.info(f"Stream client disconnected. Total: {len(self._active_clients)}")

    async def start_stream(self, stream_url: str, stream_name: str = "Drone Feed"):
        """Mulai pipeline dari live stream URL."""
        if self._running:
            await self.stop_stream()

        self.stream_url = stream_url
        self.stream_name = stream_name
        self.event_logger.reset()
        self._running = True
        self._paused = False
        self.status = PipelineStatus.RUNNING
        self._start_time = time.time()
        self._total_frames_processed = 0

        # Reset tracker
        self._trackers = []
        self._next_track_id = 1
        self._confirmed_ids = set()

        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Stream pipeline started: {stream_url} ({stream_name})")

    async def stop_stream(self):
        """Stop stream pipeline."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.reader.release()
        self.status = PipelineStatus.STOPPED
        finalize_stream_history(self.history_entry_id, "stopped", self.get_status())
        self.history_entry_id = None
        logger.info("Stream pipeline stopped")
        await self._broadcast({"type": "status", "status": "stopped", "stream_name": self.stream_name})

    async def pause_stream(self):
        """Pause processing (masih membaca tapi tidak inference)."""
        self._paused = True
        self.status = PipelineStatus.PAUSED
        logger.info("Stream pipeline paused")
        await self._broadcast({
            "type": "status",
            "status": "paused",
            "pipeline_status": "paused",
            "stream_name": self.stream_name,
        })

    async def resume_stream(self):
        """Resume processing."""
        self._paused = False
        self.status = PipelineStatus.RUNNING
        logger.info("Stream pipeline resumed")
        await self._broadcast({
            "type": "status",
            "status": "running",
            "pipeline_status": "running",
            "stream_name": self.stream_name,
        })

    async def _run_loop(self):
        """
        Main loop: baca frame dari stream → inference → broadcast.
        Loop infinite sampai di-stop manual.
        """
        try:
            loop = asyncio.get_event_loop()

            # Open stream connection
            await loop.run_in_executor(None, self.reader.open, self.stream_url)

            await self._broadcast({
                "type": "status",
                "status": "connected",
                "pipeline_status": "running",
                "stream_url": self.stream_url,
                "stream_name": self.stream_name,
                "resolution": f"{self.reader.width}x{self.reader.height}",
                "stream_fps": self.reader.fps,
                "message": f"Stream connected — {self.reader.width}x{self.reader.height} @ {self.reader.fps:.0f}fps",
            })

            frame_interval = 1.0 / settings.TARGET_FPS
            consecutive_empty = 0

            while self._running:
                loop_start = time.time()

                if self._paused:
                    await asyncio.sleep(0.1)
                    continue

                # Read latest frame from stream buffer
                result = await loop.run_in_executor(None, self.reader.read_frame)

                if result is None:
                    consecutive_empty += 1
                    if consecutive_empty > 150:  # ~10s at 15fps with no frames
                        logger.warning("Stream appears dead — no frames for 10s")
                        await self._broadcast({
                            "type": "warning",
                            "message": "Stream tidak mengirim frame — menunggu reconnect..."
                        })
                        consecutive_empty = 0
                    await asyncio.sleep(0.05)
                    continue

                consecutive_empty = 0
                frame, frame_idx = result

                # Inference
                detection = await loop.run_in_executor(
                    None, self.inference.process_frame, frame
                )

                # Tracking — identik dengan notebook trial2
                det_boxes = [(b.x, b.y, b.width, b.height) for b in detection.bboxes]
                det_confs = {(b.x, b.y, b.width, b.height): b.confidence for b in detection.bboxes}
                matched, unmatched_dets, unmatched_tracks = _match_detections(det_boxes, self._trackers)
                for det_idx, track_idx in matched:
                    box = det_boxes[det_idx]
                    self._trackers[track_idx].update(box, det_confs[box], frame_idx)
                for det_idx in unmatched_dets:
                    box = det_boxes[det_idx]
                    self._trackers.append(_FODTracker(self._next_track_id, box, det_confs[box], frame_idx))
                    self._next_track_id += 1
                for track_idx in unmatched_tracks:
                    self._trackers[track_idx].mark_lost()
                self._trackers = [t for t in self._trackers if not t.is_dead()]
                for t in self._trackers:
                    if t.is_confirmed:
                        self._confirmed_ids.add(t.track_id)
                from app.schemas.detection import BoundingBox as _BBox
                confirmed_bboxes = []
                for t in self._trackers:
                    if t.should_draw():
                        x, y, w, h = t.get_stabilized_box()
                        confirmed_bboxes.append(_BBox(x=x, y=y, width=w, height=h,
                                                      confidence=round(t.get_avg_confidence(), 4), label="FOD"))
                detection.bboxes = confirmed_bboxes
                detection.anomaly_detected = len(confirmed_bboxes) > 0

                # Record event
                self.event_logger.record(detection)

                # Save snapshot if FOD detected
                if detection.anomaly_detected and detection.bboxes:
                    await self._save_snapshots(frame, detection, frame_idx)

                # Draw overlay
                annotated = self.processor.draw_detection_overlay(frame, detection)
                frame_bytes = self.processor.encode_frame_bytes(annotated)

                # Update FPS
                self._update_fps()
                self._total_frames_processed += 1

                # Build payload
                stream_stats = self.reader.get_stats()
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
                            "confidence": b.confidence, "label": b.label
                        }
                        for b in detection.bboxes
                    ],
                    "score_history": self.event_logger.get_score_history(),
                    "recent_events": self.event_logger.get_recent_events(10),
                    "total_fod_count": self.event_logger.total_fod_count,
                    "pipeline_status": self.status.value,
                    "stream_name": self.stream_name,
                    "stream_url": self.stream_url,
                    "stream_fps": stream_stats["actual_fps"],
                    "stream_resolution": stream_stats["resolution"],
                    "stream_uptime": stream_stats["uptime_seconds"],
                    "stream_reconnects": stream_stats["reconnect_attempts"],
                    "total_frames_processed": self._total_frames_processed,
                    "elapsed_seconds": time.time() - self._start_time,
                    "runway_area_pct": detection.runway_area_pct,
                }

                await self._broadcast((payload, frame_bytes))

                # Frame rate control
                elapsed = time.time() - loop_start
                sleep_time = frame_interval - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Stream pipeline error: {e}\n{tb}")
            self.status = PipelineStatus.ERROR
            finalize_stream_history(self.history_entry_id, "error", self.get_status(), error_message=str(e))
            self.history_entry_id = None
            await self._broadcast({
                "type": "error",
                "pipeline_status": "error",
                "message": str(e),
                "stream_name": self.stream_name,
            })
        finally:
            self.reader.release()
            self._running = False

    async def _save_snapshots(self, frame, detection, frame_idx):
        """Simpan FOD snapshot ke database."""
        try:
            from app.services.fod_snapshot import save_fod_snapshot
            from app.models.fod_snapshot import FODSnapshot
            from app.db import SessionLocal

            db = SessionLocal()
            try:
                video_id = f"stream_{self.stream_name or 'live'}".replace(" ", "_").lower()
                for bbox in detection.bboxes:
                    img_filename = save_fod_snapshot(
                        frame,
                        {"x": bbox.x, "y": bbox.y, "width": bbox.width, "height": bbox.height},
                        video_id, frame_idx, bbox.label, bbox.confidence
                    )
                    snapshot = FODSnapshot(
                        timestamp=datetime.datetime.utcnow(),
                        video_id=video_id,
                        frame_number=frame_idx,
                        bbox={"x": bbox.x, "y": bbox.y, "width": bbox.width, "height": bbox.height},
                        image_path=img_filename,
                        label=bbox.label,
                        confidence=bbox.confidence,
                    )
                    db.add(snapshot)
                db.commit()
            except Exception as e:
                logger.error(f"Gagal simpan stream snapshot: {e}")
                db.rollback()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Snapshot save error: {e}")

    async def _broadcast(self, data):
        """Broadcast ke semua stream WebSocket clients."""
        if not self._active_clients:
            return
        clients = list(self._active_clients)
        disconnected = set()
        for client in clients:
            try:
                if isinstance(data, tuple):
                    await client.send_json(data[0])
                    await client.send_bytes(data[1])
                else:
                    await client.send_json(data)
            except Exception:
                disconnected.add(client)
        self._active_clients -= disconnected

    def _update_fps(self):
        self._fps_counter += 1
        now = time.time()
        if now - self._fps_timer >= 1.0:
            self._current_fps = self._fps_counter
            self._fps_counter = 0
            self._fps_timer = now

    def get_status(self) -> dict:
        stream_stats = self.reader.get_stats() if self.reader else {}
        return {
            "status": self.status.value,
            "stream_url": self.stream_url,
            "stream_name": self.stream_name,
            "paused": self._paused,
            "fps": self._current_fps,
            "total_frames_processed": self._total_frames_processed,
            "total_fod_detected": self.event_logger.total_fod_count,
            "elapsed_seconds": round(time.time() - self._start_time, 1) if self._running else 0,
            "stream_info": stream_stats,
        }


# Global singleton
stream_pipeline = StreamPipelineManager()
