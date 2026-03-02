from pydantic import BaseModel, field_validator
from typing import Literal, Optional, Dict
from datetime import datetime


# ── Read schema (response) ─────────────────────────────────────────────────
class FODSnapshotSchema(BaseModel):
    id:           int
    timestamp:    datetime
    video_id:     Optional[str]   = None
    frame_number: int
    bbox:         Dict[str, int]  # {x, y, width, height}
    image_path:   str
    created_at:   datetime
    label:        Optional[str]   = None
    confidence:   Optional[float] = None

    # Validation fields — default 'pending' untuk data lama yang belum punya kolom ini
    validation_status: str                = 'pending'
    validated_by:      Optional[str]      = None
    validated_at:      Optional[datetime] = None
    validation_notes:  Optional[str]      = None

    model_config = {"from_attributes": True}

    @field_validator('confidence', mode='before')
    @classmethod
    def coerce_confidence(cls, v):
        """Toleransi data lama yang tersimpan sebagai string."""
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    @field_validator('validation_status', mode='before')
    @classmethod
    def default_pending(cls, v):
        """Data lama tidak punya kolom ini — fallback ke 'pending'."""
        if v is None:
            return 'pending'
        return v


# ── Write schema (request body untuk PATCH /fod-snapshots/{id}/validate) ──
VALID_STATUSES = Literal['confirmed', 'rejected', 'resolved']

class FODSnapshotValidateSchema(BaseModel):
    validation_status: VALID_STATUSES
    validated_by:      str                # wajib — nama / username staff
    validation_notes:  Optional[str] = None
