from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.db.base import Base
from app.db.models import Record, User
from app.services import realtime
from app.services.study_actions import FormulaDraft, execute_action


@pytest.mark.asyncio
async def test_external_mcp_commits_refresh_connected_app_without_focus(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'shared.db'}"
    # Separate pools reproduce the desktop API and stdio MCP process boundary.
    api_engine = create_async_engine(url)
    mcp_engine = create_async_engine(url)
    async with api_engine.begin() as connection:
        await connection.exec_driver_sql("PRAGMA journal_mode=WAL")
        await connection.run_sync(Base.metadata.create_all)
    api_sessions = async_sessionmaker(api_engine, expire_on_commit=False)
    mcp_sessions = async_sessionmaker(mcp_engine, expire_on_commit=False)
    async with api_sessions() as db:
        db.add(User(id="local_user"))
        await db.commit()
    settings = Settings(_env_file=None, environment="local", database_url=url)
    monkeypatch.setattr(realtime, "get_settings", lambda: settings)
    monkeypatch.setattr(realtime, "get_engine", lambda: api_engine)
    monkeypatch.setattr(realtime, "LOCAL_CHANGE_POLL_SECONDS", 0.01)
    received: asyncio.Queue[dict] = asyncio.Queue()
    socket = AsyncMock()
    socket.send_json.side_effect = received.put_nowait
    broker = realtime.RealtimeBroker()
    try:
        await broker.start()
        first_task = broker._local_watcher_task
        await broker.start()
        assert broker._local_watcher_task is first_task
        await broker.connect("local_user", socket)
        async with mcp_sessions() as db:
            # This is the same domain service and transaction used by save_formula.
            result = await execute_action(
                db,
                owner_id="local_user",
                draft=FormulaDraft(
                    name="Bayes",
                    subject="Probability",
                    expression="P(H|E)",
                    idempotency_key="local-mcp-formula-create",
                ),
                origin="chatgpt",
                app_url="http://127.0.0.1:8765",
            )
            # Readers must not be notified about uncommitted or rolled-back work.
            await asyncio.sleep(0.04)
            assert received.empty()
            await db.commit()

        frame = await asyncio.wait_for(received.get(), timeout=2)
        assert frame == {
            "type": "broadcast",
            "topic": "user-sync:local_user",
            "event": "sync_mutation",
            "payload": {"sourceDeviceId": "local-sqlite"},
        }
        formula_id = result["record"]["id"]
        async with api_sessions() as db:
            row = await db.scalar(select(Record).where(Record.external_id == formula_id))
            assert row.data["expression"] == "P(H|E)"

        async with mcp_sessions() as db:
            await execute_action(
                db,
                owner_id="local_user",
                draft=FormulaDraft(
                    record_id=formula_id,
                    expected_version=1,
                    name="Bayes",
                    subject="Probability",
                    expression="P(E|H)P(H)/P(E)",
                    idempotency_key="local-mcp-formula-update",
                ),
                origin="chatgpt",
                app_url="http://127.0.0.1:8765",
            )
            await db.commit()
        assert await asyncio.wait_for(received.get(), timeout=2) == frame
        async with api_sessions() as db:
            row = await db.scalar(select(Record).where(Record.external_id == formula_id))
            assert row.version == 2
            assert row.data["expression"] == "P(E|H)P(H)/P(E)"
        await asyncio.sleep(0.04)
        assert received.empty(), "An unchanged database must not trigger repeated refreshes"
    finally:
        await broker.stop()
        assert api_engine.pool.checkedout() == 0
        await api_engine.dispose()
        await mcp_engine.dispose()


@pytest.mark.asyncio
async def test_watcher_releases_connection_even_when_stopped_immediately(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'immediate-stop.db'}"
    engine = create_async_engine(url)
    monkeypatch.setattr(
        realtime,
        "get_settings",
        lambda: Settings(_env_file=None, environment="local", database_url=url),
    )
    monkeypatch.setattr(realtime, "get_engine", lambda: engine)
    broker = realtime.RealtimeBroker()
    try:
        await broker.start()
        await broker.stop()
        assert broker._local_watcher_task is None
        assert engine.pool.checkedout() == 0
        await broker.start()
        await broker.stop()
        assert engine.pool.checkedout() == 0
    finally:
        await broker.stop()
        await engine.dispose()


@pytest.mark.asyncio
async def test_hosted_broker_never_opens_a_local_watcher(monkeypatch):
    monkeypatch.setattr(
        realtime,
        "get_settings",
        lambda: Settings(_env_file=None, environment="test", database_url="sqlite+aiosqlite://"),
    )
    engine = AsyncMock()
    monkeypatch.setattr(realtime, "get_engine", engine)
    broker = realtime.RealtimeBroker()
    await broker.start()
    await broker.stop()
    engine.assert_not_called()
