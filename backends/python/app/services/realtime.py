from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from contextlib import suppress
from typing import Any

import httpx
import structlog
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.core.config import get_settings
from app.db.session import get_engine
from app.services.redis import get_redis

log = structlog.get_logger()
LOCAL_CHANGE_POLL_SECONDS = 1.0


class RealtimeBroker:
    def __init__(self) -> None:
        self._clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._subscriber_task: asyncio.Task[None] | None = None
        self._local_watcher_task: asyncio.Task[None] | None = None
        self._local_connection: AsyncConnection | None = None
        self._presence: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

    async def start(self) -> None:
        settings = get_settings()
        if (
            settings.environment == "local"
            and settings.sqlalchemy_database_url.startswith("sqlite")
            and self._local_watcher_task is None
        ):
            engine = get_engine()
            connection = await engine.connect()
            try:
                version = await self._local_data_version(connection)
            except BaseException:
                await connection.close()
                raise
            # Establish the baseline before startup finishes, so even a write
            # immediately after opening the app is observed on the first poll.
            self._local_connection = connection
            self._local_watcher_task = asyncio.create_task(
                self._watch_local_changes(engine, connection, version),
                name="sqlite-change-watcher",
            )
        if settings.redis_configured and self._subscriber_task is None:
            self._subscriber_task = asyncio.create_task(
                self._subscribe_forever(), name="upstash-event-subscriber"
            )

    async def stop(self) -> None:
        if self._local_watcher_task is not None:
            self._local_watcher_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._local_watcher_task
            self._local_watcher_task = None
        # stop() may run before the watcher coroutine gets its first turn.
        if self._local_connection is not None:
            await self._local_connection.close()
            self._local_connection = None
        if self._subscriber_task is not None:
            self._subscriber_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._subscriber_task
            self._subscriber_task = None

    @staticmethod
    async def _local_data_version(connection: AsyncConnection) -> int:
        try:
            result = await connection.exec_driver_sql("PRAGMA data_version")
            return int(result.scalar_one())
        finally:
            # Keep the physical connection, not a transaction/read snapshot.
            # data_version is comparable only on the same SQLite connection.
            await connection.rollback()

    async def _notify_local_change(self) -> None:
        async with self._lock:
            owners = tuple(self._clients)
        for owner in owners:
            # Reuse the client's existing reconciliation event. No row content
            # or untrusted owner ID crosses the process boundary, and a burst
            # of commits becomes one lightweight refresh of version manifests.
            await self._deliver(
                {
                    "user_id": owner,
                    "event": {
                        "type": "broadcast",
                        "topic": f"user-sync:{owner}",
                        "event": "sync_mutation",
                        "payload": {"sourceDeviceId": "local-sqlite"},
                    },
                }
            )

    async def _watch_local_changes(
        self, engine: AsyncEngine, connection: AsyncConnection | None, version: int
    ) -> None:
        try:
            while True:
                await asyncio.sleep(LOCAL_CHANGE_POLL_SECONDS)
                try:
                    if connection is None:
                        connection = await engine.connect()
                        self._local_connection = connection
                        version = await self._local_data_version(connection)
                        # A reconnected connection has a different counter.
                        # Reconcile once rather than miss writes during retry.
                        await self._notify_local_change()
                    else:
                        current = await self._local_data_version(connection)
                        if current != version:
                            version = current
                            await self._notify_local_change()
                except Exception:
                    log.exception("local_change_watcher_retry")
                    if connection is not None:
                        with suppress(Exception):
                            await connection.close()
                        connection = None
                        self._local_connection = None
        finally:
            if connection is not None:
                await connection.close()
            self._local_connection = None

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

    async def track_presence(
        self,
        *,
        topic: str,
        user_id: str,
        payload: dict[str, Any],
        recipients: set[str],
    ) -> None:
        async with self._lock:
            self._presence[topic][user_id] = payload
            state = {key: [value] for key, value in self._presence[topic].items()}
        for recipient in recipients:
            await self.publish(
                recipient,
                {"type": "presence", "topic": topic, "event": "sync", "state": state},
            )

    async def untrack_presence(self, *, topic: str, user_id: str, recipients: set[str]) -> None:
        async with self._lock:
            topic_state = self._presence.get(topic)
            if topic_state:
                topic_state.pop(user_id, None)
                if not topic_state:
                    self._presence.pop(topic, None)
            state = {key: [value] for key, value in self._presence.get(topic, {}).items()}
        for recipient in recipients:
            await self.publish(
                recipient,
                {"type": "presence", "topic": topic, "event": "sync", "state": state},
            )

    async def publish(self, user_id: str, event: dict[str, Any]) -> None:
        envelope = jsonable_encoder({"user_id": user_id, "event": event})
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
