import time
from unittest.mock import AsyncMock

import pytest

from app.api.routes.realtime import realtime_socket
from app.core.security import Identity


@pytest.mark.asyncio
async def test_deleted_account_cannot_open_socket(monkeypatch):
    socket = AsyncMock()
    monkeypatch.setattr(
        "app.api.routes.realtime.authenticate_websocket",
        AsyncMock(return_value=Identity("deleted", expires_at=int(time.time()) + 60)),
    )
    monkeypatch.setattr("app.api.routes.realtime.account_active", AsyncMock(return_value=False))
    connect = AsyncMock()
    monkeypatch.setattr("app.api.routes.realtime.broker.connect", connect)
    await realtime_socket(socket)
    socket.close.assert_awaited_once_with(code=4403, reason="Account unavailable")
    connect.assert_not_awaited()


@pytest.mark.asyncio
async def test_expired_socket_is_closed_and_unsubscribed(monkeypatch):
    socket = AsyncMock()
    monkeypatch.setattr(
        "app.api.routes.realtime.authenticate_websocket",
        AsyncMock(return_value=Identity("owner", expires_at=int(time.time()) - 1)),
    )
    monkeypatch.setattr("app.api.routes.realtime.account_active", AsyncMock(return_value=True))
    monkeypatch.setattr("app.api.routes.realtime.broker.connect", AsyncMock())
    disconnect = AsyncMock()
    monkeypatch.setattr("app.api.routes.realtime.broker.disconnect", disconnect)
    await realtime_socket(socket)
    assert socket.close.call_args.kwargs["code"] == 4401
    disconnect.assert_awaited_once_with("owner", socket)
