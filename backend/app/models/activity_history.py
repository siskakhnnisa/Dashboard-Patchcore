from sqlalchemy import Column, Integer, String, DateTime, Float
from app.db import Base
import datetime


class ActivityHistory(Base):
    __tablename__ = "activity_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_type = Column(String, nullable=False)  # upload | stream
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")

    video_id = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    stream_name = Column(String, nullable=True)
    stream_url = Column(String, nullable=True)
    resolution = Column(String, nullable=True)
    file_extension = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    codec_name = Column(String, nullable=True)
    stored_path = Column(String, nullable=True)
    width_px = Column(Integer, nullable=True)
    height_px = Column(Integer, nullable=True)

    fps = Column(Float, nullable=True)
    total_frames = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    size_mb = Column(Float, nullable=True)
    detected_fod_count = Column(Integer, nullable=True)

    error_message = Column(String, nullable=True)

    started_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)