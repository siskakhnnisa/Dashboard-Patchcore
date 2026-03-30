from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.pipeline_manager import pipeline_manager
from app.core.logger import logger
import asyncio

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    await pipeline_manager.add_client(websocket)
    try:
        # Kirim status awal
        await websocket.send_json({
            "type": "connected",
            "message": "Terhubung ke FOD Detection Server",
            "pipeline_status": pipeline_manager.status.value,
            "status": pipeline_manager.status.value
        })

        # Keep connection alive — receive client messages (ping/pong)
        while True:
            try:
                data = await websocket.receive_text()
                import json
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except (ValueError, KeyError):
                # Non-JSON message, ignore
                pass
            except WebSocketDisconnect:
                break
            except Exception:
                break

    except WebSocketDisconnect:
        logger.info("Client disconnect dari WebSocket")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await pipeline_manager.remove_client(websocket)