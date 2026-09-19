from __future__ import annotations

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import authenticate_websocket
from app.services.realtime import broker

router = APIRouter()


@router.websocket("/ws")
async def realtime_socket(websocket: WebSocket) -> None:
    if get_settings().maintenance_mode:
        await websocket.close(code=1013, reason="Service is in maintenance mode")
        return
    try:
        identity = await authenticate_websocket(websocket, get_settings())
    except HTTPException:
        await websocket.close(code=4401, reason="Unauthorized")
        return
    await broker.connect(identity.user_id, websocket)
    try:
        await websocket.send_json({"type": "connected"})
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await broker.disconnect(identity.user_id, websocket)
