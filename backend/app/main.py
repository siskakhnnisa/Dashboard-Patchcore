from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.core.logger import logger
from app.core.pipeline_manager import pipeline_manager
from app.api.routes import video, pipeline, websocket

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

@app.get("/")
def root():
    return {"message": "FOD Detection System API", "status": "running"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "pipeline_status": pipeline_manager.status.value
    }