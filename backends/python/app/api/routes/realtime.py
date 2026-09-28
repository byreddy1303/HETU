from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, select

from app.core.config import get_settings
from app.core.security import authenticate_websocket
from app.db.models import Buddy, User
from app.db.session import get_session_factory
from app.services.identities import resolve_identity
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
    try:
        async with get_session_factory()() as db:
            identity = await resolve_identity(db, identity)
    except HTTPException:
        await websocket.close(code=4403, reason="Account unavailable")
        return
    if not await account_active(identity.user_id):
        await websocket.close(code=4403, reason="Account unavailable")
        return
    await broker.connect(identity.user_id, websocket)
    tracked: dict[str, set[str]] = {}
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
                continue
            topic = message.get("topic")
            if not isinstance(topic, str) or len(topic) > 180:
                continue
            recipients = await topic_recipients(topic, identity.user_id)
            if recipients is None:
                await websocket.send_json({"type": "error", "message": "Topic access denied"})
                continue
            if message.get("type") == "broadcast":
                event = message.get("event")
                payload = message.get("payload")
                if isinstance(event, str) and len(event) <= 80 and isinstance(payload, dict):
                    for recipient in recipients:
                        await broker.publish(
                            recipient,
                            {
                                "type": "broadcast",
                                "topic": topic,
                                "event": event,
                                "payload": payload,
                            },
                        )
            elif message.get("type") == "presence" and isinstance(message.get("payload"), dict):
                tracked[topic] = recipients
                await broker.track_presence(
                    topic=topic,
                    user_id=identity.user_id,
                    payload=message["payload"],
                    recipients=recipients,
                )
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        for topic, recipients in tracked.items():
            await broker.untrack_presence(
                topic=topic, user_id=identity.user_id, recipients=recipients
            )
        await broker.disconnect(identity.user_id, websocket)


async def account_active(user_id: str) -> bool:
    async with get_session_factory()() as db:
        user = await db.get(User, user_id)
        return user is not None and user.deleted_at is None


async def topic_recipients(topic: str, user_id: str) -> set[str] | None:
    if topic == f"user-sync:{user_id}":
        return {user_id}
    if topic.startswith("buddy-presence:"):
        buddy_id = topic.removeprefix("buddy-presence:")
    elif topic.startswith("buddy:"):
        buddy_id = topic.removeprefix("buddy:")
    else:
        return None
    async with get_session_factory()() as db:
        buddy = await db.scalar(
            select(Buddy).where(
                Buddy.id == buddy_id,
                Buddy.status == "active",
                or_(Buddy.user_a == user_id, Buddy.user_b == user_id),
            )
        )
        if buddy is None:
            return None
        return {buddy.user_a, buddy.user_b}
