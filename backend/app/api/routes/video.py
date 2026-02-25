from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.video_reader import save_uploaded_video
from app.schemas.detection import UploadResponse
from app.config import settings

router = APIRouter(prefix="/api/video", tags=["video"])

@router.post("/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    """
    Upload video file dari frontend.
    Frontend: PipelineControlPanel memanggil endpoint ini.
    """
    # Validasi tipe file
    allowed_types = ["video/mp4", "video/avi", "video/x-msvideo", "video/quicktime"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipe file tidak didukung: {file.content_type}"
        )
    
    # Validasi ukuran file
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_VIDEO_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File terlalu besar: {size_mb:.1f}MB (max {settings.MAX_VIDEO_SIZE_MB}MB)"
        )
    
    # Simpan file
    metadata = await save_uploaded_video(content, file.filename)
    
    return UploadResponse(
        success=True,
        video_id=metadata["video_id"],
        filename=metadata["filename"],
        duration_seconds=metadata["duration_seconds"],
        total_frames=metadata["total_frames"],
        fps=metadata["fps"],
        resolution=metadata["resolution"],
        message="Video berhasil diupload"
    )