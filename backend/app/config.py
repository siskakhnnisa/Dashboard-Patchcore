from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    
    # Model Paths
    PATCHCORE_MODEL_PATH: str = "models_weights/patchcore_model_30000.pkl"
    SEGMENTATION_MODEL_PATH: str = "models_weights/runway_segmentation.pth"
    
    # Video
    UPLOAD_DIR: str = "uploads"
    MAX_VIDEO_SIZE_MB: int = 500
    
    # Detection
    ANOMALY_THRESHOLD: float = 0.5
    TARGET_FPS: int = 15
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720
    
    # Inference
    DEVICE: str = "cuda"
    
    class Config:
        env_file = ".env"

settings = Settings()