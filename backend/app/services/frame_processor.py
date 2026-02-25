import cv2
import base64
import numpy as np
from app.schemas.detection import DetectionResult, BoundingBox

class FrameProcessor:
    """Utility untuk encode frame dan render overlay"""
    
    @staticmethod
    def encode_frame(frame: np.ndarray, quality: int = 80) -> str:
        """Encode frame ke base64 JPEG string"""
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        _, buffer = cv2.imencode(".jpg", frame, encode_params)
        return base64.b64encode(buffer).decode("utf-8")
    
    @staticmethod
    def draw_detection_overlay(
        frame: np.ndarray,
        result: DetectionResult
    ) -> np.ndarray:
        """
        Gambar bounding box dan label di atas frame.
        Return: frame dengan overlay.
        """
        output = frame.copy()
        
        for bbox in result.bboxes:
            # Warna berdasarkan confidence
            if bbox.confidence >= 0.8:
                color = (0, 0, 255)      # Merah — high confidence
            elif bbox.confidence >= 0.6:
                color = (0, 100, 255)    # Orange — medium
            else:
                color = (0, 200, 255)    # Kuning — low
            
            # Gambar bounding box
            cv2.rectangle(
                output,
                (bbox.x, bbox.y),
                (bbox.x + bbox.width, bbox.y + bbox.height),
                color, 2
            )
            
            # Background label
            label = f"FOD {bbox.confidence*100:.0f}%"
            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(
                output,
                (bbox.x, bbox.y - lh - 8),
                (bbox.x + lw + 4, bbox.y),
                color, -1
            )
            
            # Text label
            cv2.putText(
                output, label,
                (bbox.x + 2, bbox.y - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2
            )
        
        # Status banner kiri atas
        if result.anomaly_detected:
            banner_color = (0, 0, 200)
            status_text = f"[!] FOD DETECTED  Score: {result.anomaly_score*100:.1f}%"
        else:
            banner_color = (0, 150, 0)
            status_text = "[OK] RUNWAY CLEAR"
        
        cv2.rectangle(output, (0, 0), (500, 45), banner_color, -1)
        cv2.putText(
            output, status_text,
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
            0.8, (255, 255, 255), 2
        )
        
        return output