from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class PipelineStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int
    confidence: float          # 0.0 - 1.0
    label: str = "FOD"

class DetectionResult(BaseModel):
    frame_id: int
    timestamp: float
    anomaly_detected: bool
    anomaly_score: float       # 0.0 - 1.0
    bboxes: List[BoundingBox]
    runway_area_pct: float     # persentase area runway di frame

class StreamPayload(BaseModel):
    """
    Ini yang dikirim via WebSocket setiap frame.
    Frontend kamu akan menerima JSON ini.
    """
    type: str = "frame"              # "frame" | "alert" | "status"
    frame_b64: str                   # JPEG frame encoded base64
    frame_id: int
    timestamp: float
    fps: float
    
    # Untuk LiveMonitorPanel & DetectionInfoPanel
    anomaly_detected: bool
    anomaly_score: float
    bboxes: List[BoundingBox]
    
    # Untuk DetectionStatistic
    score_history: List[float]       # 60 frame terakhir
    
    # Untuk FODeventsTimeline
    recent_events: List[dict]        # 10 event FOD terakhir
    
    # Untuk PipelineControlPanel
    pipeline_status: PipelineStatus
    video_progress_pct: float        # 0-100
    total_frames: int
    current_frame: int

class UploadResponse(BaseModel):
    success: bool
    video_id: str
    filename: str
    duration_seconds: float
    total_frames: int
    fps: float
    resolution: str
    message: str

class PipelineControlRequest(BaseModel):
    video_id: str
    anomaly_threshold: Optional[float] = 0.5
    target_fps: Optional[int] = 15

class PipelineStatusResponse(BaseModel):
    status: PipelineStatus
    video_id: Optional[str]
    current_frame: int
    total_frames: int
    elapsed_seconds: float
    detected_fod_count: int