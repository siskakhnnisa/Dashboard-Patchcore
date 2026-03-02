from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime

class FODSnapshotSchema(BaseModel):
    id: int
    timestamp: datetime
    video_id: Optional[str]
    frame_number: int
    bbox: Dict[str, int]  # {x, y, w, h}
    image_path: str
    created_at: datetime
    label: Optional[str]
    confidence: Optional[float]

    model_config = {"from_attributes": True}
