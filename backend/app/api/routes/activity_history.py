import datetime
import glob
import os

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db_async import get_async_db
from app.models.activity_history import ActivityHistory
from app.schemas.activity_history import ActivityHistoryEntrySchema, ActivityHistoryListSchema, ActivityHistorySummarySchema


router = APIRouter(prefix="/api/activity-history", tags=["Activity History"])


@router.get("/summary", response_model=ActivityHistorySummarySchema)
async def get_activity_history_summary(db: AsyncSession = Depends(get_async_db)):
    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(days=7)

    total_uploads = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "upload"))
    total_stream_sessions = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "stream"))
    uploads_last_7d = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "upload", ActivityHistory.created_at >= cutoff))
    streams_last_7d = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "stream", ActivityHistory.created_at >= cutoff))
    active_streams = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "stream", ActivityHistory.status == "running"))
    completed_streams = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "stream", ActivityHistory.status.in_(["stopped", "finished"])))
    failed_streams = await db.scalar(select(func.count()).select_from(ActivityHistory).where(ActivityHistory.activity_type == "stream", ActivityHistory.status == "error"))

    last_upload_at = await db.scalar(select(func.max(ActivityHistory.created_at)).where(ActivityHistory.activity_type == "upload"))
    last_stream_at = await db.scalar(select(func.max(ActivityHistory.created_at)).where(ActivityHistory.activity_type == "stream"))

    return {
        "total_uploads": total_uploads or 0,
        "total_stream_sessions": total_stream_sessions or 0,
        "uploads_last_7d": uploads_last_7d or 0,
        "streams_last_7d": streams_last_7d or 0,
        "active_streams": active_streams or 0,
        "completed_streams": completed_streams or 0,
        "failed_streams": failed_streams or 0,
        "last_upload_at": last_upload_at,
        "last_stream_at": last_stream_at,
    }


@router.get("/entries", response_model=ActivityHistoryListSchema)
async def get_activity_history_entries(
    activity_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: str | None = Query(default=None, description="Format: YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="Format: YYYY-MM-DD"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = select(ActivityHistory)
    count_stmt = select(func.count()).select_from(ActivityHistory)

    filters = []
    if activity_type:
        filters.append(ActivityHistory.activity_type == activity_type)
    if status:
        filters.append(ActivityHistory.status == status)
    if search:
        q = f"%{search}%"
        filters.append(or_(
            ActivityHistory.title.ilike(q),
            ActivityHistory.filename.ilike(q),
            ActivityHistory.stream_name.ilike(q),
            ActivityHistory.video_id.ilike(q),
            ActivityHistory.stream_url.ilike(q),
        ))
    if date_from:
        try:
            dt = datetime.date.fromisoformat(date_from)
            filters.append(ActivityHistory.created_at >= datetime.datetime(dt.year, dt.month, dt.day))
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.date.fromisoformat(date_to)
            dt_end = datetime.datetime(dt.year, dt.month, dt.day) + datetime.timedelta(days=1)
            filters.append(ActivityHistory.created_at < dt_end)
        except ValueError:
            pass

    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    stmt = stmt.order_by(ActivityHistory.created_at.desc()).limit(limit).offset(offset)

    total = await db.scalar(count_stmt)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "items": [ActivityHistoryEntrySchema.model_validate(row) for row in rows],
        "total": total or 0,
        "limit": limit,
        "offset": offset,
    }


def _resolve_video_path(video_id: str) -> str | None:
    """Return absolute path of the uploaded video file, or None if not found."""
    upload_dir = os.path.realpath(settings.UPLOAD_DIR)
    pattern = os.path.join(upload_dir, f"{video_id}.*")
    matches = glob.glob(pattern)
    if not matches:
        return None
    filepath = os.path.realpath(matches[0])
    # Security: ensure the resolved path stays inside uploads/
    if not filepath.startswith(upload_dir + os.sep) and filepath != upload_dir:
        return None
    return filepath


@router.get("/{id}/video")
async def preview_video(id: int, db: AsyncSession = Depends(get_async_db)):
    """Stream video for in-browser preview (supports Range requests)."""
    row = await db.get(ActivityHistory, id)
    if not row or row.activity_type != "upload" or not row.video_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")
    filepath = _resolve_video_path(row.video_id)
    if not filepath:
        raise HTTPException(status_code=404, detail="File video tidak ada di server")
    ext = os.path.splitext(filepath)[1].lower()
    media_type_map = {
        ".mp4": "video/mp4",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".webm": "video/webm",
    }
    media_type = media_type_map.get(ext, "video/mp4")
    response = FileResponse(filepath, media_type=media_type)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@router.get("/{id}/download")
async def download_video(id: int, db: AsyncSession = Depends(get_async_db)):
    """Force-download the original uploaded video file."""
    row = await db.get(ActivityHistory, id)
    if not row or row.activity_type != "upload" or not row.video_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")
    filepath = _resolve_video_path(row.video_id)
    if not filepath:
        raise HTTPException(status_code=404, detail="File video tidak ada di server")
    download_name = row.filename or os.path.basename(filepath)
    return FileResponse(
        filepath,
        media_type="application/octet-stream",
        filename=download_name,
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            "Access-Control-Allow-Origin": "*",
        },
    )