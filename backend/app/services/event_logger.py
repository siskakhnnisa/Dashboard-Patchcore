import time
from collections import deque
from typing import List
from app.schemas.detection import DetectionResult

class FODEventLogger:
    """
    Menyimpan history score dan event FOD untuk dikirim ke frontend.
    """
    
    SCORE_HISTORY_SIZE = 60    # 60 frame terakhir untuk chart
    EVENT_HISTORY_SIZE = 50    # 50 event FOD terakhir untuk timeline
    
    def __init__(self):
        self._score_history: deque = deque(maxlen=self.SCORE_HISTORY_SIZE)
        self._events: deque = deque(maxlen=self.EVENT_HISTORY_SIZE)
        self._total_fod_count = 0
    
    def record(self, result: DetectionResult):
        """Catat hasil deteksi satu frame"""
        self._score_history.append(result.anomaly_score)
        
        if result.anomaly_detected:
            self._total_fod_count += len(result.bboxes)
            event = {
                "event_id": f"evt_{int(result.timestamp*1000)}",
                "timestamp": result.timestamp,
                "time_str": self._format_time(result.timestamp),
                "frame_id": result.frame_id,
                "fod_count": len(result.bboxes),
                "max_score": result.anomaly_score,
                "severity": self._get_severity(result.anomaly_score),
                "bboxes": [
                    {
                        "x": b.x, "y": b.y,
                        "w": b.width, "h": b.height,
                        "confidence": b.confidence
                    }
                    for b in result.bboxes
                ]
            }
            self._events.appendleft(event)  # terbaru di depan
    
    def get_score_history(self) -> List[float]:
        return list(self._score_history)
    
    def get_recent_events(self, limit: int = 10) -> List[dict]:
        return list(self._events)[:limit]
    
    @property
    def total_fod_count(self) -> int:
        return self._total_fod_count
    
    def reset(self):
        self._score_history.clear()
        self._events.clear()
        self._total_fod_count = 0
    
    def _get_severity(self, score: float) -> str:
        if score >= 0.8:
            return "HIGH"
        elif score >= 0.6:
            return "MEDIUM"
        return "LOW"
    
    def _format_time(self, timestamp: float) -> str:
        import datetime
        return datetime.datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")