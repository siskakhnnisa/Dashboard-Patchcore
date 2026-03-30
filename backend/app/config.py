from pydantic_settings import BaseSettings


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
    YOLO_MODEL_PATH: str = "models_weights/binary_yolo.pt"

    # Video
    UPLOAD_DIR: str = "uploads"
    MAX_VIDEO_SIZE_MB: int = 500

    # Detection
    ANOMALY_THRESHOLD: float = 0.5
    YOLO_CONF_THRESHOLD: float = 0.35
    TARGET_FPS: int = 15
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720

    # PatchCore dual-scale inference
    IMG_PC_MAIN:  int = 384   # resolusi utama (sama dengan training)
    IMG_PC_MICRO: int = 768   # resolusi micro untuk deteksi objek kecil

    # Dual-region detection thresholds
    MAX_BLUE_AREA: int = 2000  # batas max pixel untuk blue region (objek kecil)
    MIN_RED_AREA:  int = 2000  # batas min pixel untuk red  region (objek besar)

    # Inference
    DEVICE: str = "cuda"

    class Config:
        env_file = ".env"


settings = Settings()