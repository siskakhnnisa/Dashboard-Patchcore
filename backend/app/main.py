from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.core.logger import logger
from app.core.pipeline_manager import pipeline_manager
from app.api.routes import video, pipeline, websocket
from app.api.routes import fod_snapshot

from app.db import Base, engine
from app.models.fod_snapshot import FODSnapshot


Base.metadata.create_all(bind=engine)
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
    
    logger.success("✅ System siap menerima koneksi")
    
    yield  # Aplikasi berjalan
    
    # ── SHUTDOWN ─────────────────────────────────────────────────
    logger.info("🛑 System shutting down...")
    await pipeline_manager.stop_pipeline()

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

# Expose snapshots folder as static
# Expose snapshots folder as static
SNAPSHOT_DIR = "snapshots"
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Hapus mount static default, ganti dengan endpoint custom agar CORS selalu dikirim
from fastapi.responses import FileResponse

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

@app.get("/")
def root():
    return {"message": "FOD Detection System API", "status": "running"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "pipeline_status": pipeline_manager.status.value
    }