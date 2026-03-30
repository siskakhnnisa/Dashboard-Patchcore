"""
Detection Stats API — statistik agregat dari seluruh deteksi FOD.

Menyediakan data untuk halaman Detection Stats di frontend:
  - Summary overview (total, avg confidence, severity breakdown, validation breakdown)
  - Deteksi per video session
  - Distribusi confidence (histogram)
  - Timeline deteksi per jam/hari
  - Top frames dengan FOD terbanyak
"""
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db_async import get_async_db
from app.models.fod_snapshot import FODSnapshot
from app.core.pipeline_manager import pipeline_manager

router = APIRouter(prefix="/api/detection-stats", tags=["Detection Stats"])


def _severity(confidence: float) -> str:
    if confidence is None:
        return "LOW"
    if confidence >= 0.8:
        return "HIGH"
    if confidence >= 0.6:
        return "MEDIUM"
    return "LOW"


@router.get("/overview")
async def get_overview(
    video_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Summary overview: total detections, average confidence,
    severity & validation breakdowns, confirmation rate.
    """
    base = select(FODSnapshot)
    if video_id:
        base = base.where(FODSnapshot.video_id == video_id)

    # Total
    total_r = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_r.scalar() or 0

    # Avg confidence
    avg_r = await db.execute(
        select(func.avg(FODSnapshot.confidence)).select_from(base.subquery())
    )
    avg_confidence = avg_r.scalar()
    avg_confidence = round(float(avg_confidence), 4) if avg_confidence else 0.0

    # Unique video sessions
    sessions_r = await db.execute(
        select(func.count(func.distinct(FODSnapshot.video_id))).select_from(base.subquery())
    )
    total_sessions = sessions_r.scalar() or 0

    # Validation status counts
    status_counts = {}
    for status in ["pending", "confirmed", "rejected", "resolved"]:
        stmt = base.where(FODSnapshot.validation_status == status)
        r = await db.execute(select(func.count()).select_from(stmt.subquery()))
        status_counts[status] = r.scalar() or 0

    # Severity counts
    severity_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    all_r = await db.execute(select(FODSnapshot.confidence).select_from(base.subquery()))
    for (conf,) in all_r.all():
        severity_counts[_severity(conf)] += 1

    confirmed = status_counts.get("confirmed", 0)
    rejected = status_counts.get("rejected", 0)
    reviewed = confirmed + rejected
    confirmation_rate = round(confirmed / reviewed, 4) if reviewed > 0 else 0.0
    false_positive_rate = round(rejected / reviewed, 4) if reviewed > 0 else 0.0

    return JSONResponse(content={
        "total": total,
        "avg_confidence": avg_confidence,
        "total_sessions": total_sessions,
        "by_severity": severity_counts,
        "by_status": status_counts,
        "confirmation_rate": confirmation_rate,
        "false_positive_rate": false_positive_rate,
        "pipeline_status": pipeline_manager.status.value,
        "current_video_id": pipeline_manager.video_id,
    })


@router.get("/per-session")
async def get_per_session(
    db: AsyncSession = Depends(get_async_db),
):
    """
    Jumlah deteksi per video session beserta rata-rata confidence.
    Digunakan untuk Bar Chart.
    """
    stmt = (
        select(
            FODSnapshot.video_id,
            func.count(FODSnapshot.id).label("count"),
            func.avg(FODSnapshot.confidence).label("avg_confidence"),
            func.min(FODSnapshot.created_at).label("first_detection"),
        )
        .group_by(FODSnapshot.video_id)
        .order_by(func.min(FODSnapshot.created_at).desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    rows = result.all()

    sessions = []
    for row in rows:
        sessions.append({
            "video_id": row.video_id or "unknown",
            "short_id": (row.video_id or "unknown")[:8],
            "count": row.count,
            "avg_confidence": round(float(row.avg_confidence), 4) if row.avg_confidence else 0.0,
            "first_detection": row.first_detection.isoformat() if row.first_detection else None,
        })

    return JSONResponse(content={"sessions": sessions})


@router.get("/confidence-distribution")
async def get_confidence_distribution(
    video_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Histogram distribusi confidence dalam 10 bins (0-10%, 10-20%, ..., 90-100%).
    """
    stmt = select(FODSnapshot.confidence)
    if video_id:
        stmt = stmt.where(FODSnapshot.video_id == video_id)
    result = await db.execute(stmt)
    confidences = [r[0] for r in result.all() if r[0] is not None]

    bins = []
    for i in range(10):
        lo = i * 0.1
        hi = (i + 1) * 0.1
        label = f"{int(lo*100)}-{int(hi*100)}%"
        count = sum(1 for c in confidences if lo <= c < hi) if i < 9 else sum(1 for c in confidences if lo <= c <= hi)
        bins.append({"range": label, "count": count, "lo": lo, "hi": hi})

    return JSONResponse(content={"bins": bins, "total": len(confidences)})


@router.get("/timeline")
async def get_detection_timeline(
    video_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Timeline deteksi dikelompokkan per jam.
    Cocok untuk Area/Line chart trend waktu.
    """
    stmt = select(FODSnapshot.created_at, FODSnapshot.confidence)
    if video_id:
        stmt = stmt.where(FODSnapshot.video_id == video_id)
    stmt = stmt.order_by(FODSnapshot.created_at.asc())
    result = await db.execute(stmt)
    rows = result.all()

    hourly = defaultdict(lambda: {"count": 0, "sum_conf": 0.0, "high": 0, "medium": 0, "low": 0})
    for created_at, confidence in rows:
        if not created_at:
            continue
        key = created_at.strftime("%Y-%m-%d %H:00")
        hourly[key]["count"] += 1
        hourly[key]["sum_conf"] += float(confidence or 0)
        sev = _severity(confidence)
        hourly[key][sev.lower()] += 1

    timeline = []
    for key in sorted(hourly.keys()):
        d = hourly[key]
        timeline.append({
            "hour": key,
            "count": d["count"],
            "avg_confidence": round(d["sum_conf"] / d["count"], 4) if d["count"] > 0 else 0,
            "high": d["high"],
            "medium": d["medium"],
            "low": d["low"],
        })

    return JSONResponse(content={"timeline": timeline})


@router.get("/severity-by-session")
async def get_severity_by_session(
    db: AsyncSession = Depends(get_async_db),
):
    """
    Severity breakdown per video session → Stacked bar chart.
    """
    stmt = select(FODSnapshot.video_id, FODSnapshot.confidence)
    result = await db.execute(stmt)
    rows = result.all()

    sessions = defaultdict(lambda: {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "total": 0})
    for video_id, confidence in rows:
        vid = (video_id or "unknown")[:8]
        sev = _severity(confidence)
        sessions[vid][sev] += 1
        sessions[vid]["total"] += 1

    data = []
    for vid, counts in sessions.items():
        data.append({
            "session": vid,
            "high": counts["HIGH"],
            "medium": counts["MEDIUM"],
            "low": counts["LOW"],
            "total": counts["total"],
        })
    data.sort(key=lambda x: x["total"], reverse=True)

    return JSONResponse(content={"sessions": data[:20]})


@router.get("/validation-breakdown")
async def get_validation_breakdown(
    video_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Validation status distribution → Pie/Donut chart.
    """
    base = select(FODSnapshot)
    if video_id:
        base = base.where(FODSnapshot.video_id == video_id)

    status_data = []
    total = 0
    for status in ["pending", "confirmed", "rejected", "resolved"]:
        stmt = base.where(FODSnapshot.validation_status == status)
        r = await db.execute(select(func.count()).select_from(stmt.subquery()))
        count = r.scalar() or 0
        total += count
        status_data.append({"status": status, "count": count})

    for item in status_data:
        item["percentage"] = round(item["count"] / total * 100, 1) if total > 0 else 0.0

    return JSONResponse(content={"breakdown": status_data, "total": total})


@router.get("/top-frames")
async def get_top_frames(
    video_id: Optional[str] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Frame-frame dengan confidence tertinggi → tabel detail.
    """
    stmt = select(FODSnapshot).order_by(FODSnapshot.confidence.desc())
    if video_id:
        stmt = stmt.where(FODSnapshot.video_id == video_id)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    frames = []
    for row in rows:
        frames.append({
            "id": row.id,
            "frame_number": row.frame_number,
            "confidence": float(row.confidence) if row.confidence else 0.0,
            "severity": _severity(row.confidence),
            "video_id": row.video_id,
            "short_video_id": (row.video_id or "unknown")[:8],
            "label": row.label or "FOD",
            "image_path": row.image_path,
            "validation_status": row.validation_status or "pending",
            "timestamp": row.created_at.isoformat() if row.created_at else None,
        })

    return JSONResponse(content={"frames": frames})
