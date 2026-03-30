"""
Inspection Log API — log lengkap proses deteksi FOD.

Menggabungkan:
  1. Real-time events dari pipeline (in-memory, hilang saat restart)
  2. Persisted FOD snapshots dari database (permanen)
"""
import datetime
from typing import Optional, List
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db_async import get_async_db
from app.models.fod_snapshot import FODSnapshot
from app.core.pipeline_manager import pipeline_manager
from app.core.stream_pipeline import stream_pipeline

router = APIRouter(prefix="/api/inspection-logs", tags=["Inspection Log"])


def _severity(confidence: float) -> str:
    if confidence is None:
        return "LOW"
    if confidence >= 0.8:
        return "HIGH"
    if confidence >= 0.6:
        return "MEDIUM"
    return "LOW"


def _apply_time_filter(stmt, days: Optional[int]):
    """Apply created_at time filter if days is specified."""
    if days and days > 0:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        stmt = stmt.where(FODSnapshot.created_at >= cutoff)
    return stmt


# ── GET /api/inspection-logs/ ──────────────────────────────────────────────
@router.get("/")
async def get_inspection_logs(
    video_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    validation_status: Optional[str] = Query(default=None),
    label: Optional[str] = Query(default=None),
    days: Optional[int] = Query(default=None, ge=1, le=365),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Return log deteksi FOD yang sudah tersimpan di DB.
    Setiap FODSnapshot = 1 log entry.
    """
    stmt = select(FODSnapshot).order_by(FODSnapshot.created_at.desc())

    if video_id:
        stmt = stmt.where(FODSnapshot.video_id == video_id)
    if validation_status:
        stmt = stmt.where(FODSnapshot.validation_status == validation_status)
    if label:
        stmt = stmt.where(FODSnapshot.label == label)
    stmt = _apply_time_filter(stmt, days)

    # Count total (before pagination)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Apply pagination
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    logs = []
    for row in rows:
        sev = _severity(row.confidence)
        if severity and sev.upper() != severity.upper():
            continue
        logs.append({
            "id": row.id,
            "type": "fod_detection",
            "timestamp": row.timestamp.isoformat() if row.timestamp else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "video_id": row.video_id,
            "frame_number": row.frame_number,
            "label": row.label or "FOD",
            "confidence": row.confidence,
            "severity": sev,
            "bbox": row.bbox,
            "image_path": row.image_path,
            "validation_status": row.validation_status or "pending",
            "validated_by": row.validated_by,
            "validated_at": row.validated_at.isoformat() if row.validated_at else None,
            "validation_notes": row.validation_notes,
        })

    return JSONResponse(content={
        "logs": logs,
        "total": total,
        "limit": limit,
        "offset": offset,
    })


# ── GET /api/inspection-logs/realtime ──────────────────────────────────────
@router.get("/realtime")
async def get_realtime_events():
    """
    Return real-time events dari KEDUA pipeline (file + stream) yang sedang berjalan.
    Data ini in-memory dan hilang saat pipeline di-restart.
    """
    # Gabungkan events dari file-based pipeline dan stream pipeline
    file_events = pipeline_manager.event_logger.get_recent_events(50)
    stream_events = stream_pipeline.event_logger.get_recent_events(50)

    # Tag sumber agar frontend tahu asal event
    for evt in file_events:
        evt["source"] = "file"
    for evt in stream_events:
        evt["source"] = "stream"

    # Gabungkan dan urutkan berdasarkan timestamp (terbaru dulu)
    merged = sorted(
        file_events + stream_events,
        key=lambda e: e.get("timestamp", 0),
        reverse=True,
    )[:50]

    file_status = pipeline_manager.status.value
    stream_status = stream_pipeline.status.value

    # pipeline_active jika salah satu running
    any_running = file_status == "running" or stream_status == "running"

    return JSONResponse(content={
        "events": merged,
        "total_fod_count": (
            pipeline_manager.event_logger.total_fod_count
            + stream_pipeline.event_logger.total_fod_count
        ),
        "pipeline_status": file_status,
        "stream_status": stream_status,
        "any_running": any_running,
        "video_id": pipeline_manager.video_id,
        "stream_name": stream_pipeline.stream_name,
    })


# ── GET /api/inspection-logs/summary ───────────────────────────────────────
@router.get("/summary")
async def get_log_summary(
    video_id: Optional[str] = Query(default=None),
    label: Optional[str] = Query(default=None),
    days: Optional[int] = Query(default=None, ge=1, le=365),
    db: AsyncSession = Depends(get_async_db),
):
    """Return summary counts for the inspection log dashboard."""
    base = select(FODSnapshot)
    if video_id:
        base = base.where(FODSnapshot.video_id == video_id)
    if label:
        base = base.where(FODSnapshot.label == label)
    base = _apply_time_filter(base, days)

    # Total
    total_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = total_result.scalar() or 0

    # Avg confidence
    avg_result = await db.execute(
        select(func.avg(FODSnapshot.confidence)).select_from(base.subquery())
    )
    avg_confidence = avg_result.scalar()
    avg_confidence = round(float(avg_confidence) * 100, 1) if avg_confidence else 0.0

    # By validation status
    status_counts = {}
    for status in ["pending", "confirmed", "rejected", "resolved"]:
        stmt = base.where(FODSnapshot.validation_status == status)
        count_result = await db.execute(
            select(func.count()).select_from(stmt.subquery())
        )
        status_counts[status] = count_result.scalar() or 0

    # Severity counts + label counts
    severity_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    label_counts = defaultdict(int)
    all_result = await db.execute(base)
    for row in all_result.scalars().all():
        sev = _severity(row.confidence)
        severity_counts[sev] += 1
        lbl = row.label or "FOD"
        label_counts[lbl] += 1

    # Sort labels by count desc
    by_label = [{"label": k, "count": v} for k, v in
                sorted(label_counts.items(), key=lambda x: x[1], reverse=True)]

    # Avg per day
    effective_days = days or 7
    avg_per_day = round(total / effective_days, 1) if total > 0 else 0.0

    return JSONResponse(content={
        "total": total,
        "avg_confidence": avg_confidence,
        "avg_per_day": avg_per_day,
        "days": effective_days,
        "by_status": status_counts,
        "by_severity": severity_counts,
        "by_label": by_label,
        "pipeline_status": pipeline_manager.status.value,
        "video_id": video_id,
    })
