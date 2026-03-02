import datetime
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.fod_snapshot import FODSnapshot
from app.schemas.fod_snapshot import FODSnapshotSchema, FODSnapshotValidateSchema

router = APIRouter(prefix="/fod-snapshots", tags=["FOD Snapshots"])

_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


def _serialize(rows) -> list:
    """Konversi list SQLAlchemy row → list dict yang sudah divalidasi Pydantic."""
    result = []
    for row in rows:
        try:
            result.append(
                FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode="json")
            )
        except Exception as e:
            logging.warning(f"Skip invalid snapshot row id={getattr(row,'id','?')}: {e}")
    return result


# ── GET /fod-snapshots/ ────────────────────────────────────────────────────
@router.get("/", response_model=List[FODSnapshotSchema])
def get_snapshots(
    request: Request,
    video_id: Optional[str] = Query(
        default=None,
        description="Filter berdasarkan video_id sesi aktif"
    ),
    validation_status: Optional[str] = Query(
        default=None,
        description="Filter status validasi: pending | confirmed | rejected | resolved"
    ),
    db: Session = Depends(get_db),
):
    query = db.query(FODSnapshot).order_by(FODSnapshot.created_at.desc())
    if video_id:
        query = query.filter(FODSnapshot.video_id == video_id)
    if validation_status:
        query = query.filter(FODSnapshot.validation_status == validation_status)
    return JSONResponse(content=_serialize(query.all()), headers=_CORS)


# ── GET /fod-snapshots/{id} ────────────────────────────────────────────────
@router.get("/{snapshot_id}", response_model=FODSnapshotSchema)
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    row = db.query(FODSnapshot).filter(FODSnapshot.id == snapshot_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return JSONResponse(
        content=FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode="json"),
        headers=_CORS,
    )


# ── PATCH /fod-snapshots/{id}/validate ────────────────────────────────────
@router.patch("/{snapshot_id}/validate", response_model=FODSnapshotSchema)
def validate_snapshot(
    snapshot_id: int,
    body: FODSnapshotValidateSchema,
    db: Session = Depends(get_db),
):
    """
    Staff endpoint: set validation_status, validated_by, dan validation_notes.
    Nilai validation_status yang diizinkan: confirmed | rejected | resolved.

    false positive (rejected) TETAP tersimpan di DB untuk keperluan:
    - analitik presisi model
    - audit trail keselamatan runway
    - dataset retraining
    """
    row = db.query(FODSnapshot).filter(FODSnapshot.id == snapshot_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    row.validation_status = body.validation_status
    row.validated_by      = body.validated_by
    row.validated_at      = datetime.datetime.utcnow()
    row.validation_notes  = body.validation_notes

    db.commit()
    db.refresh(row)

    return JSONResponse(
        content=FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode="json"),
        headers=_CORS,
    )
