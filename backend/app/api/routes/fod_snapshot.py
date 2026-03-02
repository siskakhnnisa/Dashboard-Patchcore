from fastapi import APIRouter, Depends, HTTPException, Response, Request, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.models.fod_snapshot import FODSnapshot
from app.schemas.fod_snapshot import FODSnapshotSchema
from app.config import settings
from typing import List, Optional
from app.db import get_db
import os

router = APIRouter(prefix="/fod-snapshots", tags=["FOD Snapshots"])

@router.get("/", response_model=List[FODSnapshotSchema])
def get_snapshots(
    request: Request,
    video_id: Optional[str] = Query(default=None, description="Filter snapshot berdasarkan video_id sesi deteksi aktif"),
    db: Session = Depends(get_db)
):
    query = db.query(FODSnapshot).order_by(FODSnapshot.created_at.desc())
    if video_id:
        query = query.filter(FODSnapshot.video_id == video_id)
    data = query.all()
    # Convert SQLAlchemy objects to dict before passing to Pydantic
    snapshots = []
    for row in data:
        try:
            snapshots.append(FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode='json'))
        except Exception as e:
            # Log error dan skip data yang gagal divalidasi
            import logging
            logging.warning(f"Skip invalid snapshot row: {e}")
            continue
    return JSONResponse(
        content=snapshots,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

@router.get("/{snapshot_id}", response_model=FODSnapshotSchema)
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    snapshot = db.query(FODSnapshot).filter(FODSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot
