from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models import User
from app.mcp_local import create_local_server


@pytest.mark.asyncio
async def test_mcp_local_server_tool_registration(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add(User(id="local_user", display_name="Local Learner", username="local_learner"))
        await db.commit()

    monkeypatch.setattr("app.mcp_local.get_session_factory", lambda: factory)
    monkeypatch.setattr("app.mcp_study_tools.get_session_factory", lambda: factory)
    monkeypatch.setattr("app.mcp_test_tools.get_session_factory", lambda: factory)

    settings = Settings(
        environment="local",
        sqlalchemy_database_url="sqlite+aiosqlite://",
        app_url="https://hetu.local",
    )
    server = create_local_server(settings)
    tools = {t.name: t for t in server._tool_manager.list_tools()}

    expected_tools = {
        "get_profile",
        "get_capabilities",
        "search_knowledge",
        "get_concept",
        "save_to_hetu",
        "save_formula",
        "save_recognition_cue",
        "update_journal_analysis",
        "set_syllabus_progress",
        "save_weekly_review",
        "edit_planner_day",
        "get_planner_day",
        "save_question",
        "get_journal_question",
        "save_test_analysis",
        "list_test_analyses",
        "get_test_analysis",
    }
    assert expected_tools.issubset(set(tools.keys()))

    # Verify get_profile tool direct invocation
    profile_tool = server._tool_manager.get_tool("get_profile")
    assert profile_tool is not None
    profile_result = await profile_tool.fn()
    assert profile_result["profile_id"] == "local_user"
    assert profile_result["display_name"] == "Local Learner"

    # Verify get_capabilities tool direct invocation
    capabilities_tool = server._tool_manager.get_tool("get_capabilities")
    assert capabilities_tool is not None
    caps = await capabilities_tool.fn()
    assert caps["mode"] == "local_desktop"
    assert "learning.capture" in caps["supported"]
