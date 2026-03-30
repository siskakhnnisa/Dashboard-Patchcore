# Deprecated: YOLO config telah dipindahkan ke app/config.py (Settings.YOLO_MODEL_PATH)
# File ini hanya untuk kompatibilitas mundur.
from app.config import settings

YOLO_MODEL_PATH = settings.YOLO_MODEL_PATH
YOLO_CONF_THRESHOLD = settings.YOLO_CONF_THRESHOLD
