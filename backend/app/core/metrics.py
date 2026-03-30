"""Prometheus metrics for FOD Detection System."""
from prometheus_client import (
    Counter, Histogram, Gauge, Info,
    generate_latest, CONTENT_TYPE_LATEST,
)

# ── Counters ────────────────────────────────────────────────
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

FOD_DETECTIONS = Counter(
    "fod_detections_total",
    "Total FOD detections",
    ["severity"],
)

FRAMES_PROCESSED = Counter(
    "frames_processed_total",
    "Total video frames processed",
)

# ── Histograms ──────────────────────────────────────────────
INFERENCE_DURATION = Histogram(
    "inference_duration_seconds",
    "ML inference latency per frame",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# ── Gauges ──────────────────────────────────────────────────
PIPELINE_FPS = Gauge(
    "pipeline_fps",
    "Current pipeline processing FPS",
)

PIPELINE_PROGRESS = Gauge(
    "pipeline_progress_percent",
    "Pipeline processing progress 0-100",
)

ACTIVE_WEBSOCKETS = Gauge(
    "active_websocket_connections",
    "Number of active WebSocket connections",
)

ANOMALY_SCORE = Gauge(
    "anomaly_score_current",
    "Current maximum anomaly score",
)

# ── Info ────────────────────────────────────────────────────
APP_INFO = Info("fod_detection", "FOD Detection System info")
APP_INFO.info({"version": "1.0.0", "framework": "FastAPI"})


def get_metrics() -> tuple[bytes, str]:
    """Return (body, content_type) for Prometheus scraping."""
    return generate_latest(), CONTENT_TYPE_LATEST
