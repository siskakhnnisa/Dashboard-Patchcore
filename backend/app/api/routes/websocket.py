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
            "status": pipeline_manager.status.value
        })

        async def receive_loop():
            while True:
                try:
                    data = await websocket.receive_json()
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    break

        # Jalankan receive_loop di background, biarkan pipeline_manager broadcast frame
        receive_task = asyncio.create_task(receive_loop())
        await receive_task

    except WebSocketDisconnect:
        logger.info("Client disconnect dari WebSocket")
    finally:
        await pipeline_manager.remove_client(websocket)