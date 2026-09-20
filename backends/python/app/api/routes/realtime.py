from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import authenticate_websocket
from app.db.models import User
from app.db.session import get_session_factory
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
    if not await account_active(identity.user_id):
        await websocket.close(code=4403, reason="Account unavailable")
        return
    await broker.connect(identity.user_id, websocket)
    try:
        await websocket.send_json({"type": "connected"})
        next_account_check = time.monotonic() + 15
        while True:
            if time.monotonic() >= next_account_check:
                if not await account_active(identity.user_id):
                    await websocket.close(code=4403, reason="Account unavailable")
                    break
                next_account_check = time.monotonic() + 15
            remaining = (identity.expires_at or 0) - time.time()
            if remaining <= 0:
                await websocket.close(
                    code=4401, reason="Token expired; reconnect with a fresh token"
                )
                break
            try:
                message = await asyncio.wait_for(websocket.receive_json(), min(15, remaining))
            except TimeoutError:
                continue
            if not isinstance(message, dict):
                await websocket.close(code=4400, reason="Expected JSON object")
                break
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await broker.disconnect(identity.user_id, websocket)


async def account_active(user_id: str) -> bool:
    async with get_session_factory()() as db:
        user = await db.get(User, user_id)
        return user is not None and user.deleted_at is None
