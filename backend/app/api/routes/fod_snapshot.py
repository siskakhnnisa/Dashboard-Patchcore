
# --- Router and imports must be at the top ---
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import JSONResponse, StreamingResponse
import datetime
import logging
import os
import io
import zipfile
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db_async import get_async_db
from app.models.fod_snapshot import FODSnapshot
from app.schemas.fod_snapshot import FODSnapshotSchema, FODSnapshotValidateSchema

router = APIRouter(prefix="/fod-snapshots", tags=["FOD Snapshots"])

SNAPSHOT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "snapshots",
)

_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

# ── DELETE /fod-snapshots/{id} ─────────────────────────────────────────────
@router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_async_db)):
    stmt = select(FODSnapshot).where(FODSnapshot.id == snapshot_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Hapus file gambar jika ada
    if row.image_path:
        img_path = os.path.join(SNAPSHOT_DIR, row.image_path)
        if os.path.isfile(img_path):
            try:
                os.remove(img_path)
            except Exception as e:
                logging.warning(f"Gagal menghapus file gambar: {img_path} | {e}")

    # Hapus dari database
    await db.delete(row)
    await db.commit()

    return JSONResponse(content={"success": True, "deleted_id": snapshot_id}, headers=_CORS)


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
async def get_snapshots(
    request: Request,
    video_id: Optional[str] = Query(
        default=None,
        description="Filter berdasarkan video_id sesi aktif"
    ),
    validation_status: Optional[str] = Query(
        default=None,
        description="Filter status validasi: pending | confirmed | rejected | resolved"
    ),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = select(FODSnapshot).order_by(FODSnapshot.created_at.desc())
    if video_id:
        stmt = stmt.where(FODSnapshot.video_id == video_id)
    if validation_status:
        stmt = stmt.where(FODSnapshot.validation_status == validation_status)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return JSONResponse(content=_serialize(rows), headers=_CORS)


# ── GET /fod-snapshots/download-zip ────────────────────────────────────────
@router.get("/download-zip")
async def download_snapshots_zip(
    validation_status: Optional[str] = Query(
        default=None,
        description="Filter status validasi: pending | confirmed | rejected"
    ),
    db: AsyncSession = Depends(get_async_db),
):
    """Download gambar snapshot sebagai file ZIP, opsional difilter berdasarkan status."""
    stmt = select(FODSnapshot).order_by(FODSnapshot.created_at.desc())
    if validation_status:
        stmt = stmt.where(FODSnapshot.validation_status == validation_status)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail="Tidak ada snapshot untuk diunduh")

    buf = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for row in rows:
            filepath = os.path.join(SNAPSHOT_DIR, row.image_path)
            if os.path.isfile(filepath):
                arcname = f"{row.validation_status or 'pending'}/{row.image_path}"
                zf.write(filepath, arcname)
                added += 1

    if added == 0:
        raise HTTPException(
            status_code=404,
            detail="File gambar snapshot tidak ditemukan di server."
        )

    buf.seek(0)
    label = validation_status or "all"
    filename = f"fod_snapshots_{label}.zip"

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── GET /fod-snapshots/{id} ────────────────────────────────────────────────
@router.get("/{snapshot_id}", response_model=FODSnapshotSchema)
async def get_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_async_db)):
    stmt = select(FODSnapshot).where(FODSnapshot.id == snapshot_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return JSONResponse(
        content=FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode="json"),
        headers=_CORS,
    )


# ── PATCH /fod-snapshots/{id}/validate ────────────────────────────────────
@router.patch("/{snapshot_id}/validate", response_model=FODSnapshotSchema)
async def validate_snapshot(
    snapshot_id: int,
    body: FODSnapshotValidateSchema,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Staff endpoint: set validation_status, validated_by, dan validation_notes.
    Nilai validation_status yang diizinkan: confirmed | rejected | resolved.

    false positive (rejected) TETAP tersimpan di DB untuk keperluan:
    - analitik presisi model
    - audit trail keselamatan runway
    - dataset retraining
    """
    stmt = select(FODSnapshot).where(FODSnapshot.id == snapshot_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    row.validation_status = body.validation_status
    row.validated_by      = body.validated_by
    row.validated_at      = datetime.datetime.utcnow()
    row.validation_notes  = body.validation_notes

    await db.commit()
    await db.refresh(row)

    return JSONResponse(
        content=FODSnapshotSchema.model_validate(row.__dict__).model_dump(mode="json"),
        headers=_CORS,
    )
