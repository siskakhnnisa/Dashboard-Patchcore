import datetime
from urllib.parse import urlsplit, urlunsplit

from app.db import SessionLocal
from app.models.activity_history import ActivityHistory


def _sanitize_stream_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        netloc = f"{host}{port}" if host else parsed.netloc
        return urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))
    except Exception:
        return url


def record_upload_history(metadata: dict, size_mb: float | None = None) -> int | None:
    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow()
        entry = ActivityHistory(
            activity_type="upload",
            title=metadata.get("filename") or metadata.get("video_id") or "Uploaded Video",
            status="uploaded",
            video_id=metadata.get("video_id"),
            filename=metadata.get("filename"),
            resolution=metadata.get("resolution"),
            file_extension=metadata.get("file_extension"),
            mime_type=metadata.get("mime_type"),
            codec_name=metadata.get("codec_name"),
            stored_path=metadata.get("stored_path"),
            width_px=metadata.get("width_px"),
            height_px=metadata.get("height_px"),
            fps=metadata.get("fps"),
            total_frames=metadata.get("total_frames"),
            duration_seconds=metadata.get("duration_seconds"),
            size_mb=size_mb,
            started_at=now,
            ended_at=now,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry.id
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


def record_stream_start(stream_name: str | None, stream_url: str | None) -> int | None:
    db = SessionLocal()
    try:
        entry = ActivityHistory(
            activity_type="stream",
            title=stream_name or "Live Stream",
            status="running",
            stream_name=stream_name,
            stream_url=_sanitize_stream_url(stream_url),
            started_at=datetime.datetime.utcnow(),
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry.id
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


def finalize_stream_history(history_id: int | None, status: str, stats: dict | None = None, error_message: str | None = None):
    if not history_id:
        return

    db = SessionLocal()
    try:
        row = db.get(ActivityHistory, history_id)
        if not row:
            return

        now = datetime.datetime.utcnow()
        row.status = status
        row.ended_at = now
        row.updated_at = now
        row.error_message = error_message

        if stats:
          row.resolution = stats.get("resolution") or row.resolution
          row.fps = stats.get("actual_fps") or stats.get("stream_fps") or row.fps
          row.duration_seconds = stats.get("uptime_seconds") or stats.get("elapsed_seconds") or row.duration_seconds
          row.detected_fod_count = stats.get("total_fod_detected") or row.detected_fod_count

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()