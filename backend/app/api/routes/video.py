from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.video_reader import save_uploaded_video
from app.services.activity_history import record_upload_history
from app.schemas.detection import UploadResponse
from app.config import settings

router = APIRouter(prefix="/api/video", tags=["video"])

@router.post("/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    """
    Upload video file dari frontend.
    Frontend: PipelineControlPanel memanggil endpoint ini.
    """
    # Validasi berdasarkan ekstensi file (lebih reliable dari MIME type
    # karena browser bisa kirim MIME type berbeda-beda untuk file yang sama,
    # misal: video/mp4, video/mpeg, application/octet-stream, dsb.)
    allowed_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    filename_lower = (file.filename or "").lower()
    import os as _os
    _, ext = _os.path.splitext(filename_lower)
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Format file tidak didukung: '{ext or '(tidak ada ekstensi)'}'. "
                   f"Format yang diterima: {', '.join(sorted(allowed_extensions))}"
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
    metadata = await save_uploaded_video(content, file.filename, file.content_type)
    record_upload_history(metadata, size_mb=size_mb)
    
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