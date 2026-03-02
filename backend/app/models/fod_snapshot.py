from sqlalchemy import Column, Integer, String, DateTime, JSON, Float
from app.db import Base
import datetime


class FODSnapshot(Base):
    __tablename__ = 'fod_snapshots'

    id           = Column(Integer,  primary_key=True, autoincrement=True)
    timestamp    = Column(DateTime, nullable=False)
    video_id     = Column(String,   nullable=True)
    frame_number = Column(Integer,  nullable=False)
    bbox         = Column(JSON,     nullable=False)   # {x, y, width, height}
    image_path   = Column(String,   nullable=False)
    created_at   = Column(DateTime, default=datetime.datetime.utcnow)
    label        = Column(String,   nullable=True)
    confidence   = Column(Float,    nullable=True)

    # ── Validation ────────────────────────────────────────────────────────────
    # Status lifecycle:  pending → confirmed → resolved
    #                           ↘ rejected  (false positive, tetap di DB)
    validation_status = Column(String,   nullable=False, default='pending')
    validated_by      = Column(String,   nullable=True)    # nama staff
    validated_at      = Column(DateTime, nullable=True)
    validation_notes  = Column(String,   nullable=True)    # catatan opsional
