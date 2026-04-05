from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ActivityHistoryEntrySchema(BaseModel):
    id: int
    activity_type: str
    title: str
    status: str
    video_id: Optional[str] = None
    filename: Optional[str] = None
    stream_name: Optional[str] = None
    stream_url: Optional[str] = None
    resolution: Optional[str] = None
    file_extension: Optional[str] = None
    mime_type: Optional[str] = None
    codec_name: Optional[str] = None
    stored_path: Optional[str] = None
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    duration_seconds: Optional[float] = None
    size_mb: Optional[float] = None
    detected_fod_count: Optional[int] = None
    error_message: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ActivityHistoryListSchema(BaseModel):
    items: list[ActivityHistoryEntrySchema]
    total: int
    limit: int
    offset: int


class ActivityHistorySummarySchema(BaseModel):
    total_uploads: int
    total_stream_sessions: int
    uploads_last_7d: int
    streams_last_7d: int
    active_streams: int
    completed_streams: int
    failed_streams: int
    last_upload_at: Optional[datetime] = None
    last_stream_at: Optional[datetime] = None