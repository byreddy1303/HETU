from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from contextlib import suppress
from typing import Any

import httpx
import structlog
from fastapi import WebSocket

from app.core.config import get_settings
from app.services.redis import get_redis

log = structlog.get_logger()


class RealtimeBroker:
    def __init__(self) -> None:
        self._clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._subscriber_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if get_settings().redis_configured and self._subscriber_task is None:
            self._subscriber_task = asyncio.create_task(
                self._subscribe_forever(), name="upstash-event-subscriber"
            )

    async def stop(self) -> None:
        if self._subscriber_task is not None:
            self._subscriber_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._subscriber_task
            self._subscriber_task = None

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept(subprotocol=getattr(websocket.state, "accept_subprotocol", None))
        async with self._lock:
            self._clients[user_id].add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._clients.get(user_id)
            if not clients:
                return
            clients.discard(websocket)
            if not clients:
                self._clients.pop(user_id, None)

    async def publish(self, user_id: str, event: dict[str, Any]) -> None:
        envelope = {"user_id": user_id, "event": event}
        redis = get_redis()
        if redis is not None:
            try:
                await redis.publish(get_settings().redis_events_channel, json.dumps(envelope))
                return
            except Exception:
                log.exception("realtime_publish_failed")
        await self._deliver(envelope)

    async def _deliver(self, envelope: dict[str, Any]) -> None:
        user_id = envelope.get("user_id")
        if not isinstance(user_id, str):
            return
        async with self._lock:
            clients = tuple(self._clients.get(user_id, ()))
        stale: list[WebSocket] = []
        for websocket in clients:
            try:
                await websocket.send_json(envelope["event"])
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            await self.disconnect(user_id, websocket)

    async def _subscribe_forever(self) -> None:
        settings = get_settings()
        assert settings.upstash_redis_rest_url and settings.upstash_redis_rest_token
        url = (
            f"{settings.upstash_redis_rest_url.rstrip('/')}/subscribe/"
            f"{settings.redis_events_channel}"
        )
        headers = {
            "Authorization": f"Bearer {settings.upstash_redis_rest_token.get_secret_value()}",
            "Accept": "text/event-stream",
        }
        delay = 1.0
        while True:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("POST", url, headers=headers) as response:
                        response.raise_for_status()
                        delay = 1.0
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            raw = line.removeprefix("data:").strip()
                            parts = raw.split(",", 2)
                            if len(parts) != 3 or parts[0].strip('"') != "message":
                                continue
                            payload = parts[2]
                            with suppress(json.JSONDecodeError):
                                decoded = json.loads(payload)
                                if isinstance(decoded, str):
                                    decoded = json.loads(decoded)
                                if isinstance(decoded, dict):
                                    await self._deliver(decoded)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("realtime_subscription_disconnected", retry_seconds=delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)


broker = RealtimeBroker()
