"""
Stream Reader — membaca frame dari live video stream (RTSP/RTMP/HTTP/SRT).

Menggunakan OpenCV VideoCapture agar pixel values identik dengan notebook
(yang juga menggunakan cv2.VideoCapture). Decoder yang berbeda (PyAV, Decord)
menghasilkan pixel values yang berbeda, yang menyebabkan PatchCore memberikan
hasil deteksi yang sangat berbeda karena sensitivitas nearest-neighbor matching.

Fallback ke PyAV hanya jika OpenCV gagal connect.
"""
import cv2
import time
import threading
import numpy as np
from typing import Optional, Tuple
from collections import deque
from app.core.logger import logger

# PyAV tersedia sebagai fallback jika OpenCV tidak bisa membuka stream
try:
    import av
    HAS_PYAV = True
    logger.info("PyAV available — sebagai fallback jika OpenCV gagal connect stream")
except ImportError:
    HAS_PYAV = False
    logger.info("PyAV not installed — menggunakan OpenCV saja untuk stream")


class StreamReader:
    """
    Membaca frame dari live video stream (RTSP/RTMP/HTTP/file).
    
    Arsitektur: reader thread terpisah yang terus membaca frame
    dan menyimpan frame terbaru di buffer. Ini menghindari
    frame lag/buffering yang umum terjadi pada stream RTSP.
    """

    def __init__(self):
        self._container = None          # PyAV container
        self._cap: Optional[cv2.VideoCapture] = None
        self._use_pyav: bool = False
        self._stream_url: Optional[str] = None
        
        # Thread-safe frame buffer
        self._latest_frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._frame_count: int = 0
        self._running = False
        self._reader_thread: Optional[threading.Thread] = None
        
        # Stream info
        self.fps: float = 0.0
        self.width: int = 0
        self.height: int = 0
        self._actual_fps: float = 0.0
        self._fps_counter: int = 0
        self._fps_timer: float = 0.0
        
        # Reconnection
        self._reconnect_attempts: int = 0
        self._max_reconnect: int = 10
        self._reconnect_delay: float = 2.0
        
        # Stats
        self._start_time: float = 0.0
        self._dropped_frames: int = 0
        self._total_frames_read: int = 0

    @property
    def is_open(self) -> bool:
        return self._running

    @property
    def current_frame(self) -> int:
        return self._frame_count

    @property
    def total_frames(self) -> int:
        return 0  # Live stream has no total

    @property
    def actual_fps(self) -> float:
        return self._actual_fps

    def open(self, stream_url: str):
        """
        Buka koneksi ke stream URL.
        Supported: rtsp://, rtmp://, http://, srt://, file path
        """
        self._stream_url = stream_url
        self._running = True
        self._start_time = time.time()
        self._reconnect_attempts = 0
        
        self._connect(stream_url)
        
        # Start background reader thread
        self._reader_thread = threading.Thread(
            target=self._read_loop, daemon=True, name="stream-reader"
        )
        self._reader_thread.start()
        logger.info(f"Stream reader started: {stream_url}")

    def _connect(self, url: str):
        """
        Establish connection to stream.
        
        Prioritas: OpenCV VideoCapture (identik decoder dengan notebook)
        Fallback : PyAV (jika OpenCV gagal, misalnya untuk SRT streams)
        """
        # ── OpenCV pertama (decoder identik dengan notebook) ─────────
        try:
            self._cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer
            
            if self._cap.isOpened():
                self.fps = self._cap.get(cv2.CAP_PROP_FPS) or 30
                self.width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                self.height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                self._use_pyav = False
                
                logger.info(
                    f"Stream connected (OpenCV — identik notebook): {url} | "
                    f"{self.width}x{self.height} @ {self.fps:.1f}fps"
                )
                return
            else:
                self._cap.release()
                self._cap = None
                logger.warning(f"OpenCV gagal membuka stream, mencoba PyAV fallback...")
        except Exception as e:
            logger.warning(f"OpenCV gagal connect: {e}, mencoba PyAV fallback...")
            if self._cap is not None:
                self._cap.release()
                self._cap = None

        # ── PyAV fallback (hanya jika OpenCV gagal) ──────────────────
        if HAS_PYAV:
            try:
                options = {
                    "rtsp_transport": "tcp",        # TCP lebih stabil dari UDP
                    "stimeout": "5000000",           # 5s timeout (microseconds)
                    "max_delay": "500000",           # max 500ms delay
                    "fflags": "nobuffer",            # minimize buffering
                    "flags": "low_delay",            # low latency mode
                    "analyzeduration": "1000000",    # 1s analyze (cepat start)
                    "probesize": "1000000",          # 1MB probe
                }
                self._container = av.open(url, options=options, timeout=10.0)
                self._container.streams.video[0].thread_type = "AUTO"
                
                video_stream = self._container.streams.video[0]
                self.fps = float(video_stream.average_rate or video_stream.base_rate or 30)
                self.width = video_stream.codec_context.width
                self.height = video_stream.codec_context.height
                self._use_pyav = True
                
                logger.info(
                    f"Stream connected (PyAV fallback): {url} | "
                    f"{self.width}x{self.height} @ {self.fps:.1f}fps"
                )
                return
            except Exception as e:
                logger.warning(f"PyAV juga gagal connect: {e}")
                self._container = None
                self._use_pyav = False

        raise ConnectionError(f"Gagal membuka stream (OpenCV & PyAV gagal): {url}")

    def _read_loop(self):
        """
        Background thread: terus membaca frame dari stream.
        Hanya menyimpan frame terbaru (drop frame lama untuk latency rendah).
        """
        while self._running:
            try:
                frame = self._read_one_frame()
                if frame is not None:
                    with self._frame_lock:
                        self._latest_frame = frame
                        self._frame_count += 1
                    self._total_frames_read += 1
                    self._update_fps()
                    self._reconnect_attempts = 0
                else:
                    # Stream ended or error — try reconnect
                    if not self._running:
                        break
                    self._handle_reconnect()
            except Exception as e:
                logger.warning(f"Stream read error: {e}")
                if not self._running:
                    break
                self._handle_reconnect()

    def _read_one_frame(self) -> Optional[np.ndarray]:
        """Baca satu frame dari stream."""
        if self._use_pyav and self._container is not None:
            try:
                for packet in self._container.demux(video=0):
                    for frame in packet.decode():
                        # Convert to BGR numpy array (OpenCV format)
                        return frame.to_ndarray(format="bgr24")
            except (av.error.EOFError, StopIteration):
                return None
            except Exception as e:
                logger.debug(f"PyAV decode error: {e}")
                return None
        
        if self._cap is not None and self._cap.isOpened():
            ret, frame = self._cap.read()
            return frame if ret else None
        
        return None

    def _handle_reconnect(self):
        """Attempt reconnection to stream."""
        self._reconnect_attempts += 1
        if self._reconnect_attempts > self._max_reconnect:
            logger.error(f"Max reconnect attempts ({self._max_reconnect}) reached")
            self._running = False
            return
        
        logger.info(
            f"Reconnecting ({self._reconnect_attempts}/{self._max_reconnect}) "
            f"in {self._reconnect_delay}s..."
        )
        time.sleep(self._reconnect_delay)
        
        # Cleanup old connection
        self._close_connection()
        
        try:
            self._connect(self._stream_url)
        except Exception as e:
            logger.warning(f"Reconnect failed: {e}")

    def _close_connection(self):
        """Close current connection."""
        if self._container is not None:
            try:
                self._container.close()
            except Exception:
                pass
            self._container = None
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None

    def read_frame(self) -> Optional[Tuple[np.ndarray, int]]:
        """
        Ambil frame terbaru dari buffer.
        Thread-safe, dipanggil dari asyncio executor.
        Return: (frame_bgr, frame_index) atau None jika belum ada.
        """
        with self._frame_lock:
            if self._latest_frame is None:
                return None
            frame = self._latest_frame.copy()
            idx = self._frame_count
        return frame, idx

    def get_progress(self) -> float:
        """Live stream selalu 0 (no end)."""
        return 0.0

    def _update_fps(self):
        """Track actual FPS dari stream."""
        self._fps_counter += 1
        now = time.time()
        if now - self._fps_timer >= 1.0:
            self._actual_fps = self._fps_counter
            self._fps_counter = 0
            self._fps_timer = now

    def get_stats(self) -> dict:
        """Return stream statistics."""
        return {
            "stream_url": self._stream_url,
            "connected": self._running and (self._container is not None or (self._cap is not None and self._cap.isOpened())),
            "resolution": f"{self.width}x{self.height}",
            "stream_fps": self.fps,
            "actual_fps": self._actual_fps,
            "total_frames_read": self._total_frames_read,
            "dropped_frames": self._dropped_frames,
            "reconnect_attempts": self._reconnect_attempts,
            "uptime_seconds": round(time.time() - self._start_time, 1) if self._start_time else 0,
        }

    def release(self):
        """Stop reader thread and close connection."""
        self._running = False
        if self._reader_thread and self._reader_thread.is_alive():
            self._reader_thread.join(timeout=5.0)
        self._close_connection()
        self._latest_frame = None
        self._frame_count = 0
        logger.info("Stream reader released")
