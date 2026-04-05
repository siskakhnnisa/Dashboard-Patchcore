"""
db_migrations.py — Migrasi DB ringan untuk SQLite.

Dipanggil sekali saat startup dari main.py.
Hanya menambah kolom baru jika belum ada (safe for existing data).
"""

from sqlalchemy import text
from app.db import engine
from app.core.logger import logger


def run_migrations():
    """Jalankan semua migrasi yang tertunda."""
    _migrate_fod_snapshots()
    _migrate_activity_history()


def _migrate_fod_snapshots():
    """
    Tambah kolom validasi ke tabel fod_snapshots yang sudah ada.
    SQLite mendukung ALTER TABLE ADD COLUMN tapi tidak DROP/MODIFY,
    sehingga kita cukup cek keberadaan kolom lalu tambahkan jika belum ada.
    """
    new_columns = [
        ("validation_status", "VARCHAR NOT NULL DEFAULT 'pending'"),
        ("validated_by",      "VARCHAR"),
        ("validated_at",      "DATETIME"),
        ("validation_notes",  "VARCHAR"),
    ]
    with engine.connect() as conn:
        result   = conn.execute(text("PRAGMA table_info(fod_snapshots)"))
        existing = {row[1] for row in result.fetchall()}
        for col_name, col_def in new_columns:
            if col_name not in existing:
                conn.execute(
                    text(f"ALTER TABLE fod_snapshots ADD COLUMN {col_name} {col_def}")
                )
                logger.info(f"DB migration: kolom '{col_name}' ditambahkan ke fod_snapshots")
        conn.commit()


def _migrate_activity_history():
    """Tambah kolom metadata upload ke activity_history untuk database lama."""
    new_columns = [
        ("file_extension", "VARCHAR"),
        ("mime_type", "VARCHAR"),
        ("codec_name", "VARCHAR"),
        ("stored_path", "VARCHAR"),
        ("width_px", "INTEGER"),
        ("height_px", "INTEGER"),
    ]
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(activity_history)"))
        existing = {row[1] for row in result.fetchall()}
        for col_name, col_def in new_columns:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE activity_history ADD COLUMN {col_name} {col_def}"))
                logger.info(f"DB migration: kolom '{col_name}' ditambahkan ke activity_history")
        conn.commit()
