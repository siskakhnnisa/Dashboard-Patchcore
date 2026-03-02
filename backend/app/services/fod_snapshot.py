import cv2
import os
from datetime import datetime
from typing import Dict

SNAPSHOT_DIR = "snapshots"
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

def save_fod_snapshot(frame, bbox: Dict, video_id: str, frame_number: int, label: str, confidence: float) -> str:
    """
    Crop frame sesuai bbox dan simpan sebagai file gambar.
    Return: path file gambar relatif ke SNAPSHOT_DIR
    """
    x, y, w, h = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
    crop = frame[y:y+h, x:x+w]
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"fod_{video_id}_{frame_number}_{timestamp}.jpg"
    filepath = os.path.join(SNAPSHOT_DIR, filename)
    cv2.imwrite(filepath, crop)
    return filename
