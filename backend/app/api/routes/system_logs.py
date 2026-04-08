"""
System Log API — membaca dan mem-filter file log sistem (loguru).

Format log: "YYYY-MM-DD HH:MM:SS.mmm | LEVEL    | source:func:line - message"
Menyediakan REST endpoints + WebSocket live tail.
"""
import asyncio
import os
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/system-logs", tags=["System Logs"])

LOG_FILE = os.path.join("logs", "fod_system.log")

# Regex untuk parsing baris log loguru
_LOG_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)"
    r"\s*\|\s*(?P<level>\w+)\s*\|"
    r"\s*(?P<source>[^|]+?)\s*-\s*(?P<message>.*)$"
)

# ── In-memory cache untuk parsed log entries ──────────────────────────────
_log_cache: dict = {
    "entries": [],
    "mtime": 0.0,
    "size": 0,
    "ts": 0.0,
}
_CACHE_TTL = 5.0  # detik


def _get_cached_entries() -> list[dict]:
    """Return parsed entries dari cache. Parse ulang hanya jika file berubah atau cache expired."""
    now = time.monotonic()

    # Cek file mtime/size untuk invalidate cache lebih cepat dari TTL
    try:
        stat = os.stat(LOG_FILE)
        current_mtime = stat.st_mtime
        current_size = stat.st_size
    except FileNotFoundError:
        return []

    cache_valid = (
        _log_cache["entries"]
        and _log_cache["mtime"] == current_mtime
        and _log_cache["size"] == current_size
        and (now - _log_cache["ts"]) < _CACHE_TTL
    )

    if cache_valid:
        return _log_cache["entries"]

    # Cache miss — baca & parse ulang
    raw_lines = _read_tail(LOG_FILE)
    entries = _parse_log_lines(raw_lines)

    _log_cache["entries"] = entries
    _log_cache["mtime"] = current_mtime
    _log_cache["size"] = current_size
    _log_cache["ts"] = now

    return entries


def _parse_log_lines(raw_lines: list[str]) -> list[dict]:
    """Parse baris-baris log menjadi list dict. Baris continuation di-append ke entry terakhir."""
    entries: list[dict] = []
    for line in raw_lines:
        line = line.rstrip("\n\r")
        if not line:
            continue
        m = _LOG_RE.match(line)
        if m:
            entries.append({
                "timestamp": m.group("timestamp"),
                "level": m.group("level").strip(),
                "source": m.group("source").strip(),
                "message": m.group("message").strip(),
            })
        elif entries:
            # continuation line — append ke message terakhir
            entries[-1]["message"] += "\n" + line
    return entries


def _read_tail(path: str, max_bytes: int = 2 * 1024 * 1024) -> list[str]:
    """Baca max_bytes terakhir dari file untuk performa."""
    if not os.path.isfile(path):
        return []
    size = os.path.getsize(path)
    offset = max(0, size - max_bytes)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        if offset > 0:
            f.seek(offset)
            f.readline()  # buang baris terpotong
        return f.readlines()


@router.get("/")
async def get_system_logs(
    level: Optional[str] = Query(default=None, description="Filter level: DEBUG, INFO, SUCCESS, WARNING, ERROR"),
    search: Optional[str] = Query(default=None, description="Search text dalam message/source"),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    """
    Baca system log terbaru dari file.
    Return terbaru dulu (descending).
    """
    entries = list(_get_cached_entries())

    # Filter level
    if level:
        level_upper = level.upper()
        if level_upper == "IMPORTANT":
            entries = [e for e in entries if e["level"] in ("ERROR", "WARNING")]
        else:
            entries = [e for e in entries if e["level"] == level_upper]

    # Filter search text (case-insensitive)
    if search:
        search_lower = search.lower()
        entries = [
            e for e in entries
            if search_lower in e["message"].lower()
            or search_lower in e["source"].lower()
        ]

    total = len(entries)

    # Terbaru dulu
    entries.reverse()

    # Paginate
    page = entries[offset : offset + limit]

    return JSONResponse(content={
        "logs": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@router.get("/levels")
async def get_log_levels():
    """Return daftar level unik yang ada di log file."""
    entries = _get_cached_entries()
    levels = sorted({e["level"] for e in entries})
    return JSONResponse(content={"levels": levels})


@router.get("/stats")
async def get_log_stats():
    """Return ringkasan statistik log + operational insights untuk admin."""
    entries = list(_get_cached_entries())

    level_counts: dict[str, int] = {}
    for e in entries:
        lvl = e["level"]
        level_counts[lvl] = level_counts.get(lvl, 0) + 1

    file_size = 0
    if os.path.isfile(LOG_FILE):
        file_size = os.path.getsize(LOG_FILE)

    # ── Operational insights ──────────────────────────────────────────
    now = datetime.now()
    cutoff_24h = (now - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

    recent_errors: list[dict] = []
    recent_warnings: list[dict] = []
    restarts: list[str] = []
    last_error_time: str | None = None
    last_startup_time: str | None = None

    for e in entries:
        ts = e["timestamp"]
        lvl = e["level"]

        # Deteksi system restart
        if "starting up" in e["message"].lower() or "System starting" in e["message"]:
            restarts.append(ts)
            last_startup_time = ts

        # Kumpulkan error & warning 24 jam terakhir
        if ts >= cutoff_24h:
            if lvl == "ERROR":
                recent_errors.append(e)
                if last_error_time is None or ts > last_error_time:
                    last_error_time = ts
            elif lvl == "WARNING":
                recent_warnings.append(e)

    # Deduplikasi error berdasarkan pola pesan (ambil pesan unik)
    unique_errors: list[dict] = []
    seen_msgs: set[str] = set()
    for e in reversed(recent_errors):  # terbaru dulu
        # Ambil 80 karakter pertama sebagai key
        key = e["message"][:80]
        if key not in seen_msgs:
            seen_msgs.add(key)
            unique_errors.append(e)
        if len(unique_errors) >= 10:
            break

    unique_warnings: list[dict] = []
    seen_warn: set[str] = set()
    for e in reversed(recent_warnings):
        key = e["message"][:80]
        if key not in seen_warn:
            seen_warn.add(key)
            unique_warnings.append(e)
        if len(unique_warnings) >= 5:
            break

    # Hitung uptime sejak startup terakhir
    uptime_str = None
    if last_startup_time:
        try:
            startup_dt = datetime.strptime(last_startup_time[:19], "%Y-%m-%d %H:%M:%S")
            delta = now - startup_dt
            days = delta.days
            hours, rem = divmod(delta.seconds, 3600)
            mins, _ = divmod(rem, 60)
            parts = []
            if days > 0:
                parts.append(f"{days}h")  # hari
            parts.append(f"{hours}j {mins}m")
            uptime_str = " ".join(parts)
        except ValueError:
            pass

    return JSONResponse(content={
        "total_entries": len(entries),
        "by_level": level_counts,
        "file_size_bytes": file_size,
        "file_size_mb": round(file_size / (1024 * 1024), 2),
        # Operational insights
        "errors_24h": len(recent_errors),
        "warnings_24h": len(recent_warnings),
        "recent_errors": unique_errors,
        "recent_warnings": unique_warnings,
        "last_error_time": last_error_time,
        "last_startup_time": last_startup_time,
        "total_restarts": len(restarts),
        "uptime": uptime_str,
    })


# ── WebSocket: Live log tail ──────────────────────────────────────────────

@router.websocket("/ws")
async def system_log_ws(websocket: WebSocket):
    """
    WebSocket endpoint yang mem-stream baris log baru secara real-time.
    Seperti `tail -f` — kirim 20 baris terakhir saat connect, lalu push baris baru.
    """
    await websocket.accept()

    try:
        # Kirim konfirmasi koneksi
        await websocket.send_json({"type": "connected", "message": "Live log stream aktif"})

        if not os.path.isfile(LOG_FILE):
            await websocket.send_json({"type": "error", "message": "Log file tidak ditemukan"})
            await websocket.close()
            return

        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            # Kirim 30 baris terakhir sebagai konteks awal
            f.seek(0, 2)  # seek to end
            file_size = f.tell()
            # Baca ~8KB terakhir untuk mendapat ~30 baris
            read_pos = max(0, file_size - 8192)
            f.seek(read_pos)
            if read_pos > 0:
                f.readline()  # buang baris terpotong
            tail_lines = f.readlines()
            initial_entries = _parse_log_lines(tail_lines[-30:])

            if initial_entries:
                await websocket.send_json({
                    "type": "initial",
                    "logs": initial_entries,
                })

            # Sekarang posisi f ada di akhir file. Terus polling baris baru.
            # Simpan posisi saat ini
            current_pos = f.tell()

        # Loop: cek baris baru setiap 1 detik
        pending_lines: list[str] = []
        while True:
            try:
                # Non-blocking receive untuk mendeteksi disconnect & ping
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    import json
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                    continue
                except asyncio.TimeoutError:
                    pass  # normal — lanjut cek file

                # Cek apakah file bertambah
                if not os.path.isfile(LOG_FILE):
                    continue

                new_size = os.path.getsize(LOG_FILE)

                # File di-rotate (ukuran mengecil) — reset posisi
                if new_size < current_pos:
                    current_pos = 0

                if new_size > current_pos:
                    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                        f.seek(current_pos)
                        new_lines = f.readlines()
                        current_pos = f.tell()

                    if new_lines:
                        pending_lines.extend(new_lines)
                        new_entries = _parse_log_lines(pending_lines)
                        if new_entries:
                            # Cek apakah baris terakhir lengkap (berakhir newline)
                            last_raw = pending_lines[-1]
                            if last_raw.endswith("\n"):
                                pending_lines.clear()
                            else:
                                # Baris terakhir mungkin belum lengkap, simpan
                                pending_lines = [last_raw]
                                new_entries = _parse_log_lines(pending_lines[:-1]) if len(pending_lines) > 1 else new_entries

                            await websocket.send_json({
                                "type": "new",
                                "logs": new_entries,
                            })

            except WebSocketDisconnect:
                break
            except Exception:
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
