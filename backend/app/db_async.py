"""
db_async.py — Async database engine for FastAPI async endpoints.

Uses aiosqlite for non-blocking DB operations.
Sync db.py is kept for backward compatibility with migration scripts.
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Convert sqlite:/// to sqlite+aiosqlite:///
_sync_url = os.environ.get("DATABASE_URL", "sqlite:///./fod.db")
ASYNC_DATABASE_URL = _sync_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_async_db():
    """FastAPI dependency: yields an async session."""
    async with AsyncSessionLocal() as session:
        yield session
