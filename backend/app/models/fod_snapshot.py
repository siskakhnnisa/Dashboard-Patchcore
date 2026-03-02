from sqlalchemy import Column, Integer, String, DateTime, JSON
from app.db import Base
import datetime

class FODSnapshot(Base):
    __tablename__ = 'fod_snapshots'

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, nullable=False)
    video_id = Column(String, nullable=True)
    frame_number = Column(Integer, nullable=False)
    bbox = Column(JSON, nullable=False)  # {x, y, w, h}
    image_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    label = Column(String, nullable=True)
    confidence = Column(String, nullable=True)
