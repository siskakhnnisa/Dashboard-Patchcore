"""
Stream API Routes — REST endpoints + WebSocket for live stream detection.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.stream_pipeline import stream_pipeline
from app.core.logger import logger
import json

router = APIRouter(prefix="/api/stream", tags=["Stream"])


class StreamStartRequest(BaseModel):
    stream_url: str
    stream_name: Optional[str] = "Drone Feed"
    anomaly_threshold: Optional[float] = 0.5


class StreamTestRequest(BaseModel):
    stream_url: str


# ── REST Endpoints ─────────────────────────────────────────────────────────

@router.post("/start")
async def start_stream(request: StreamStartRequest):
    """Start live stream detection pipeline."""
    if not request.stream_url:
        raise HTTPException(status_code=400, detail="stream_url is required")

    # Update threshold
    if stream_pipeline.inference and request.anomaly_threshold:
        stream_pipeline.inference.threshold = request.anomaly_threshold

    await stream_pipeline.start_stream(request.stream_url, request.stream_name)

    return {
        "success": True,
        "message": f"Stream pipeline dimulai: {request.stream_name}",
        "stream_url": request.stream_url,
        "stream_name": request.stream_name,
        "status": "running",
    }


@router.post("/stop")
async def stop_stream():
    """Stop live stream pipeline."""
    await stream_pipeline.stop_stream()
    return {"success": True, "message": "Stream pipeline dihentikan", "status": "stopped"}


@router.post("/pause")
async def pause_stream():
    """Pause stream processing (masih membaca tapi tidak inference)."""
    stream_pipeline.pause_stream()
    return {"success": True, "paused": True}


@router.post("/resume")
async def resume_stream():
    """Resume stream processing."""
    stream_pipeline.resume_stream()
    return {"success": True, "paused": False}


@router.get("/status")
async def get_stream_status():
    """Get current stream pipeline status."""
    return stream_pipeline.get_status()


@router.post("/test")
async def test_stream_connection(request: StreamTestRequest):
    """
    Test apakah stream URL bisa diakses.
    Berguna sebelum start pipeline.
    """
    import asyncio
    loop = asyncio.get_event_loop()

    try:
        import av
        def _test():
            container = av.open(
                request.stream_url,
                options={
                    "rtsp_transport": "tcp",
                    "stimeout": "5000000",
                    "analyzeduration": "2000000",
                    "probesize": "1000000",
                },
                timeout=8.0,
            )
            stream = container.streams.video[0]
            info = {
                "success": True,
                "codec": stream.codec_context.name,
                "width": stream.codec_context.width,
                "height": stream.codec_context.height,
                "fps": float(stream.average_rate or stream.base_rate or 0),
            }
            container.close()
            return info

        result = await loop.run_in_executor(None, _test)
        return result
    except ImportError:
        # Fallback OpenCV test
        import cv2
        def _test_cv():
            cap = cv2.VideoCapture(request.stream_url)
            if not cap.isOpened():
                return {"success": False, "error": "Tidak bisa membuka stream"}
            info = {
                "success": True,
                "codec": "unknown",
                "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                "fps": cap.get(cv2.CAP_PROP_FPS),
            }
            cap.release()
            return info

        result = await loop.run_in_executor(None, _test_cv)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── WebSocket Endpoint ─────────────────────────────────────────────────────

@router.websocket("/ws")
async def stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint untuk live stream detection.
    Terpisah dari /ws/stream (file-based pipeline).
    """
    await websocket.accept()
    await stream_pipeline.add_client(websocket)
    try:
        await websocket.send_json({
            "type": "connected",
            "message": "Terhubung ke Stream Detection Server",
            "pipeline_status": stream_pipeline.status.value,
            "stream_name": stream_pipeline.stream_name,
            "stream_url": stream_pipeline.stream_url,
        })

        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except (ValueError, KeyError):
                pass
            except WebSocketDisconnect:
                break
            except Exception:
                break

    except WebSocketDisconnect:
        logger.info("Stream client disconnected")
    except Exception as e:
        logger.error(f"Stream WebSocket error: {e}")
    finally:
        await stream_pipeline.remove_client(websocket)
