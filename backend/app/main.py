from contextlib import asynccontextmanager
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.core.logger import logger
from app.core.pipeline_manager import pipeline_manager
from app.core.db_migrations import run_migrations
from app.core.metrics import (
    REQUEST_COUNT, REQUEST_DURATION, get_metrics,
)
from app.api.routes import video, pipeline, websocket
from app.api.routes import fod_snapshot
from app.api.routes import inspection_log
from app.api.routes import detection_stats
from app.api.routes import stream
from app.core.stream_pipeline import stream_pipeline

from app.db import Base, engine
from app.models.fod_snapshot import FODSnapshot


# ── Buat tabel baru & jalankan migrasi ─────────────────────────────────────
Base.metadata.create_all(bind=engine)
run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: load semua model ke memori.
    Shutdown: cleanup resources.
    """
    # ── STARTUP ──────────────────────────────────────────────────
    logger.info("🚀 FOD Detection System starting up...")
    
    # Buat folder yang dibutuhkan
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    
    # Load model ke memori (sekali saat startup)
    pipeline_manager.initialize_models()
    
    # Share inference model with stream pipeline
    stream_pipeline.initialize(pipeline_manager.inference)
    
    logger.success("✅ System siap menerima koneksi")
    
    yield  # Aplikasi berjalan
    
    # ── SHUTDOWN ─────────────────────────────────────────────────
    logger.info("🛑 System shutting down...")
    await pipeline_manager.stop_pipeline()
    await stream_pipeline.stop_stream()

app = FastAPI(
    title="FOD Detection System",
    description="Runway Foreign Object Debris Detection API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — izinkan frontend React mengakses backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register semua routes

app.include_router(video.router)
app.include_router(pipeline.router)
app.include_router(websocket.router)
app.include_router(fod_snapshot.router)
app.include_router(inspection_log.router)
app.include_router(detection_stats.router)
app.include_router(stream.router)

# Expose snapshots folder as static
# Expose snapshots folder as static
SNAPSHOT_DIR = "snapshots"
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Hapus mount static default, ganti dengan endpoint custom agar CORS selalu dikirim

@app.get("/snapshots/{filename}")
def get_snapshot(filename: str):
    filepath = os.path.join(SNAPSHOT_DIR, filename)
    if not os.path.isfile(filepath):
        return Response(status_code=404)
    response = FileResponse(filepath)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Tambahkan middleware CORS untuk static files /snapshots
class CORSMiddlewareForStatic(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/snapshots"):
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.add_middleware(CORSMiddlewareForStatic)

# ── Prometheus request metrics middleware ─────────────────────
class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start
        endpoint = request.url.path
        method = request.method
        REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=response.status_code).inc()
        REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)
        return response

app.add_middleware(MetricsMiddleware)

@app.get("/")
def root():
    return {"message": "FOD Detection System API", "status": "running"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "pipeline_status": pipeline_manager.status.value
    }

@app.get("/metrics")
def metrics():
    body, content_type = get_metrics()
    return Response(content=body, media_type=content_type)