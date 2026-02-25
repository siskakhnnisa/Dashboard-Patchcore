from fastapi import APIRouter, HTTPException
from pathlib import Path
from app.core.pipeline_manager import pipeline_manager
from app.schemas.detection import PipelineControlRequest, PipelineStatusResponse, PipelineStatus
from app.config import settings

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

@router.post("/start")
async def start_pipeline(request: PipelineControlRequest):
    """
    Start deteksi pipeline.
    Frontend: PipelineControlPanel memanggil ini setelah upload.
    """
    # Cari video file berdasarkan video_id
    upload_dir = Path(settings.UPLOAD_DIR)
    video_files = list(upload_dir.glob(f"{request.video_id}*"))
    
    if not video_files:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")
    
    video_path = str(video_files[0])
    
    # Update threshold jika ada
    if request.anomaly_threshold:
        pipeline_manager.inference.threshold = request.anomaly_threshold
    
    # Start pipeline
    await pipeline_manager.start_pipeline(video_path, request.video_id)
    
    return {
        "success": True,
        "message": "Pipeline dimulai",
        "video_id": request.video_id,
        "status": "running"
    }

@router.post("/stop")
async def stop_pipeline():
    """
    Stop pipeline yang sedang berjalan.
    Frontend: PipelineControlPanel — tombol Stop.
    """
    await pipeline_manager.stop_pipeline()
    return {"success": True, "message": "Pipeline dihentikan"}

@router.get("/status", response_model=PipelineStatusResponse)
async def get_status():
    """
    Cek status pipeline saat ini.
    """
    status = pipeline_manager.get_status()
    return PipelineStatusResponse(
        status=PipelineStatus(status["status"]),
        video_id=status["video_id"],
        current_frame=status["current_frame"],
        total_frames=status["total_frames"],
        elapsed_seconds=status["elapsed_seconds"],
        detected_fod_count=status["detected_fod_count"]
    )

@router.post("/threshold")
async def update_threshold(threshold: float):
    """Update anomaly threshold secara real-time"""
    if not 0.0 <= threshold <= 1.0:
        raise HTTPException(status_code=400, detail="Threshold harus 0.0 - 1.0")
    pipeline_manager.inference.threshold = threshold
    return {"success": True, "threshold": threshold}