import cv2
import uuid
import aiofiles
import os
import mimetypes
import numpy as np
from pathlib import Path
from typing import Optional
from app.config import settings
from app.core.logger import logger

# Try to use Decord for faster video decoding (2-3x faster than OpenCV)
try:
    from decord import VideoReader as DecordReader, cpu, gpu
    HAS_DECORD = True
    logger.info("Decord available — using hardware-accelerated video decoding")
except ImportError:
    HAS_DECORD = False
    logger.info("Decord not installed — falling back to OpenCV VideoCapture")


class VideoReader:
    """Kelola pembacaan frame dari video file (Decord with OpenCV fallback)"""
    
    def __init__(self):
        self._decord_reader: Optional[object] = None
        self.cap: Optional[cv2.VideoCapture] = None
        self.video_id: Optional[str] = None
        self.video_path: Optional[str] = None
        self.total_frames: int = 0
        self.fps: float = 0.0
        self.width: int = 0
        self.height: int = 0
        self._current_frame: int = 0
        self._use_decord: bool = False
    
    def open(self, video_path: str):
        """Buka video file untuk dibaca"""
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video tidak ditemukan: {video_path}")
        
        if HAS_DECORD:
            try:
                self._decord_reader = DecordReader(video_path, ctx=cpu(0))
                self._use_decord = True
                self.total_frames = len(self._decord_reader)
                self.fps = self._decord_reader.get_avg_fps()
                # Get resolution from first frame shape
                sample = self._decord_reader[0].asnumpy()
                self.height, self.width = sample.shape[:2]
                self.video_path = video_path
                self._current_frame = 0
                logger.info(f"Video dibuka (Decord): {video_path} | "
                           f"{self.total_frames} frames | {self.fps:.1f} FPS | "
                           f"{self.width}x{self.height}")
                return
            except Exception as e:
                logger.warning(f"Decord gagal membuka video, fallback ke OpenCV: {e}")
                self._decord_reader = None
                self._use_decord = False

        # OpenCV fallback
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Tidak bisa membuka video: {video_path}")
        
        self.video_path = video_path
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._current_frame = 0
        
        logger.info(f"Video dibuka (OpenCV): {video_path} | "
                   f"{self.total_frames} frames | {self.fps:.1f} FPS | "
                   f"{self.width}x{self.height}")
    
    def read_frame(self) -> Optional[tuple]:
        """
        Baca satu frame berikutnya.
        Return: (frame_numpy_bgr, frame_index) atau None jika sudah selesai
        """
        if self._use_decord and self._decord_reader is not None:
            if self._current_frame >= self.total_frames:
                return None
            # Decord returns RGB; convert to BGR for OpenCV compatibility
            frame_rgb = self._decord_reader[self._current_frame].asnumpy()
            frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            self._current_frame += 1
            return frame_bgr, self._current_frame

        if not self.cap or not self.cap.isOpened():
            return None
        
        ret, frame = self.cap.read()
        if not ret:
            return None
        
        self._current_frame += 1
        return frame, self._current_frame
    
    def get_progress(self) -> float:
        """Return progress 0-100"""
        if self.total_frames == 0:
            return 0.0
        return (self._current_frame / self.total_frames) * 100
    
    def release(self):
        if self._decord_reader is not None:
            self._decord_reader = None
        if self.cap:
            self.cap.release()
            self.cap = None
        self._use_decord = False
        logger.info("Video reader dirilis")
    
    @property
    def is_finished(self) -> bool:
        return self._current_frame >= self.total_frames
    
    @property
    def current_frame(self) -> int:
        return self._current_frame


def _decode_fourcc(value: int) -> str | None:
    if not value or value < 0:
        return None
    chars = [chr((int(value) >> shift) & 0xFF) for shift in (0, 8, 16, 24)]
    codec = "".join(ch for ch in chars if ch.isprintable()).strip()
    return codec or None


async def save_uploaded_video(file_content: bytes, filename: str, content_type: str | None = None) -> dict:
    """
    Simpan video yang diupload ke folder uploads/.
    Return: metadata video
    """
    video_id = str(uuid.uuid4())
    ext = Path(filename).suffix
    save_path = Path(settings.UPLOAD_DIR) / f"{video_id}{ext}"
    
    # Simpan file
    async with aiofiles.open(save_path, "wb") as f:
        await f.write(file_content)
    
    # Baca metadata
    cap = cv2.VideoCapture(str(save_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    codec_name = _decode_fourcc(int(cap.get(cv2.CAP_PROP_FOURCC)))
    duration = total_frames / fps if fps > 0 else 0
    cap.release()

    mime_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    file_extension = Path(filename).suffix.lower() or None
    
    logger.info(f"Video disimpan: {save_path} | ID: {video_id}")
    
    return {
        "video_id": video_id,
        "filename": filename,
        "path": str(save_path),
        "stored_path": str(save_path),
        "file_extension": file_extension,
        "mime_type": mime_type,
        "codec_name": codec_name,
        "width_px": width,
        "height_px": height,
        "total_frames": total_frames,
        "fps": fps,
        "duration_seconds": duration,
        "resolution": f"{width}x{height}"
    }