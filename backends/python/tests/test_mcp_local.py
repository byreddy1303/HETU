from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest
import pytest_asyncio
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models import Record, User
from app.mcp_local import create_local_server, init_local_db
from app.mcp_server import create_mcp_server
from app.services.learning_library import CaptureRequest, capture_learning
from tests.test_learning_library import capture

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest_asyncio.fixture
async def local_workspace(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add_all(
            [
                User(id="local_user", display_name="Kalyan", username="kalyan"),
                User(id="another-owner"),
            ]
        )
        await db.commit()
    for module in ("app.mcp_server", "app.mcp_study_tools", "app.mcp_test_tools"):
        monkeypatch.setattr(f"{module}.get_session_factory", lambda: factory)
    settings = Settings(
        environment="local",
        database_url="sqlite+aiosqlite://",
        app_url="http://127.0.0.1:8765",
        _env_file=None,
    )
    try:
        yield create_local_server(settings), factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_local_mcp_has_every_hosted_tool_with_matching_input_schemas(local_workspace):
    server, _ = local_workspace
    hosted = create_mcp_server(
        Settings(
            environment="test",
            mcp_resource_url="http://testserver/mcp",
            clerk_oauth_issuer="https://clerk.example.test",
            mcp_allowed_client_ids="https://chatgpt.com/oauth/client.json",
            _env_file=None,
        )
    )
    local_tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
    hosted_tools = {tool.name: tool for tool in hosted._tool_manager.list_tools()}
    assert local_tools.keys() == hosted_tools.keys()
    assert len(local_tools) >= 53
    for name, tool in local_tools.items():
        assert tool.parameters == hosted_tools[name].parameters
        assert tool.meta["securitySchemes"] == [{"type": "noauth"}]
        assert hosted_tools[name].meta["securitySchemes"][0]["type"] == "oauth2"

    profile = await server.call_tool("get_profile", {})
    assert profile.is_error is False
    assert profile.structured_content == {
        "profile_id": "local_user",
        "display_name": "Kalyan",
        "email": None,
    }
    result = await server.call_tool("get_capabilities", {})
    caps = result.structured_content
    assert caps["mode"] == "local_desktop"
    assert {
        "learning.capture",
        "workflow.start",
        "recovery.overview",
        "tests.save_analysis",
    } <= set(caps["supported"])


@pytest.mark.asyncio
async def test_local_tools_persist_retry_safely_and_keep_other_owner_private(local_workspace):
    server, factory = local_workspace
    payload = capture("local-capture-1")
    # Flat model arguments are accepted by both transports.
    saved = await server.call_tool("save_to_hetu", payload)
    assert saved.is_error is False
    receipt = saved.structured_content
    assert receipt["links"][0].startswith("http://127.0.0.1:8765/")
    replay = await server.call_tool("save_to_hetu", payload)
    assert replay.structured_content["idempotent_replay"] is True
    assert replay.structured_content["concept_ids"] == receipt["concept_ids"]

    private_payload = capture("private-capture-1")
    private_payload["insights"][0]["concept"] = "Private posterior insight"
    async with factory() as db:
        private = await capture_learning(
            db,
            owner_id="another-owner",
            request=CaptureRequest.model_validate(private_payload),
            app_url="https://other.invalid",
        )
        await db.commit()
    search = await server.call_tool("search_knowledge", {"query": "Bayes"})
    assert [row["id"] for row in search.structured_content["items"]] == receipt["concept_ids"]
    with pytest.raises(ToolError):
        await server.call_tool("get_concept", {"concept_id": private["concept_ids"][0]})

    formula = {
        "idempotency_key": "local-formula-1",
        "name": "Bayes normalization",
        "subject": "Probability",
        "expression": "P(H|E) = P(E|H)P(H)/P(E)",
    }
    saved_formula = await server.call_tool("save_formula", formula)
    assert saved_formula.is_error is False
    assert saved_formula.structured_content["href"].startswith("http://127.0.0.1:8765/")
    replay_formula = await server.call_tool("save_formula", formula)
    assert replay_formula.structured_content["idempotent_replay"] is True
    async with factory() as db:
        records = list(
            await db.scalars(
                select(Record).where(
                    Record.collection == "formulas", Record.owner_id == "local_user"
                )
            )
        )
        assert len(records) == 1
        assert records[0].data["expression"] == formula["expression"]
    workflow = await server.call_tool(
        "start_task_brief",
        {"start": {"idempotency_key": "local-workflow-1", "goal": "Review Bayes unaided"}},
    )
    assert workflow.is_error is False
    detail = await server.call_tool(
        "get_task_brief", {"workflow_id": workflow.structured_content["id"]}
    )
    assert detail.structured_content["goal"] == "Review Bayes unaided"
    pack = await server.call_tool("build_revision_pack", {"subject": "Probability"})
    assert pack.is_error is False


@pytest.mark.asyncio
@pytest.mark.parametrize("deleted", [False, True])
async def test_local_tools_reject_missing_or_deleted_workspace(local_workspace, deleted):
    server, factory = local_workspace
    async with factory() as db:
        user = await db.get(User, "local_user")
        if deleted:
            user.deleted_at = datetime.now(UTC)
        else:
            await db.delete(user)
        await db.commit()
    for name in ("get_profile", "get_capabilities", "list_sections"):
        with pytest.raises(ToolError, match="unavailable"):
            await server.call_tool(name, {})


@pytest.mark.parametrize(
    ("environment", "database_url"),
    [
        ("production", "sqlite+aiosqlite://"),
        ("test", "sqlite+aiosqlite://"),
        ("local", "postgresql+asyncpg://localhost/hetu"),
    ],
)
@pytest.mark.asyncio
async def test_local_server_refuses_hosted_or_non_sqlite_database(environment, database_url):
    settings = Settings(environment=environment, database_url=database_url, _env_file=None)
    with pytest.raises(ValueError, match="Local MCP requires"):
        create_local_server(settings)
    with pytest.raises(ValueError, match="Local MCP requires"):
        await init_local_db(settings)


@pytest.mark.asyncio
async def test_stdio_protocol_with_real_client_and_isolated_database(tmp_path):
    database = tmp_path / "personal-workspace.db"
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "app.mcp_local"],
        cwd=BACKEND_DIR,
        env={
            **os.environ,
            "ENVIRONMENT": "local",
            "DATABASE_URL": f"sqlite+aiosqlite:///{database}",
            "APP_URL": "http://127.0.0.1:8765",
            "LOCAL_DISPLAY_NAME": "Personal MCP Test",
            "LOCAL_USERNAME": "mcp_test",
            "MAINTENANCE_MODE": "false",
        },
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=15) as client:
            initialized = await client.initialize()
            assert initialized.server_info.name == "HETU"
            tools = await client.list_tools()
            assert len(tools.tools) >= 53
            profile = await client.call_tool("get_profile")
            assert profile.structured_content["display_name"] == "Personal MCP Test"
            saved = await client.call_tool("save_to_hetu", capture("stdio-capture-1"))
            assert saved.is_error is False
            concept_id = saved.structured_content["concept_ids"][0]
            detail = await client.call_tool("get_concept", {"concept_id": concept_id})
            assert detail.is_error is False
    assert database.is_file()


@pytest.mark.asyncio
async def test_direct_stdio_requires_explicit_database_instead_of_creating_cwd_db(tmp_path):
    environment = {**os.environ, "ENVIRONMENT": "local", "PYTHONPATH": str(BACKEND_DIR)}
    environment.pop("DATABASE_URL", None)
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.mcp_local",
        cwd=tmp_path,
        env=environment,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=15)
    assert process.returncode != 0
    assert stdout == b""
    assert b"refusing to create a separate database" in stderr
    assert not (tmp_path / "hetu.db").exists()
