from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from mcp.server.auth.provider import AccessToken
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models import Record, User, UserIdentity
from app.mcp_server import ClerkOAuthVerifier, create_mcp_server
from app.services.records import upsert_records
from app.services.section_context import section_records


@pytest.mark.asyncio
async def test_focused_actions_through_authenticated_mcp_and_existing_app_records(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add_all([User(id="owner-a"), User(id="owner-b")])
        db.add_all(
            [
                UserIdentity(user_id="owner-a", provider="clerk", subject="user_a"),
                UserIdentity(user_id="owner-b", provider="clerk", subject="user_b"),
            ]
        )
        await db.flush()
        await upsert_records(
            db,
            collection="questions",
            owner_id="owner-a",
            items=[
                {
                    "id": "journal-q",
                    "subject": "OS",
                    "outcome": "W-C",
                    "answer_text": "B",
                    "time_spent_sec": 100,
                }
            ],
        )
        await db.commit()
    settings = Settings(
        environment="test",
        mcp_resource_url="http://testserver/mcp",
        clerk_oauth_issuer="https://clerk.example.test",
        app_url="https://hetu.test",
        mcp_allowed_client_ids="https://chatgpt.com/oauth/client.json",
    )

    async def verify(self, token):
        if token not in {"oat_write", "oat_read", "oat_other"}:
            return None
        return AccessToken(
            token=token,
            client_id="https://chatgpt.com/oauth/client.json",
            scopes=["hetu:read"] if token == "oat_read" else ["hetu:read", "hetu:write"],
            subject="user_b" if token == "oat_other" else "user_a",
            resource=settings.mcp_resource_url,
        )

    monkeypatch.setattr(ClerkOAuthVerifier, "verify_token", verify)
    monkeypatch.setattr("app.mcp_server.get_session_factory", lambda: factory)
    monkeypatch.setattr("app.mcp_study_tools.get_session_factory", lambda: factory)
    server = create_mcp_server(settings)
    transport = server.streamable_http_app(
        stateless_http=True, json_response=True, host="testserver"
    )
    drafts = {
        "save_formula": {"name": "Bayes", "subject": "Probability", "expression": "P(H|E)"},
        "save_recognition_cue": {
            "phrase": "Given evidence",
            "concept": "Bayes",
            "question_ids": ["journal-q"],
        },
        "update_journal_analysis": {
            "record_id": "journal-q",
            "expected_version": 1,
            "root_cause": "concept",
            "analysis_provenance": "assistant_hypothesis",
        },
        "set_syllabus_progress": {
            "subject": "OS",
            "topic": "Paging",
            "completed": True,
            "evidence_note": "Learner reports studying paging",
        },
        "save_weekly_review": {
            "week_start": "2026-10-12",
            "this_weeks_fix": "Unaided paging recall",
        },
        "edit_planner_day": {
            "plan_date": "2026-10-12",
            "expected_revision": 0,
            "available_min": 90,
            "protected_buffer_min": 15,
            "add_blocks": [{"subject": "OS", "duration_min": 30, "target": "Recall paging"}],
        },
    }
    try:
        async with server.session_manager.run():
            async with AsyncClient(
                transport=ASGITransport(app=transport), base_url="http://testserver"
            ) as client:
                metadata = await client.get("/.well-known/oauth-protected-resource/mcp")
                assert metadata.json()["scopes_supported"] == ["hetu:read", "hetu:write"]
                sequence = 0

                async def call(name, arguments=None, token="oat_write"):
                    nonlocal sequence
                    sequence += 1
                    response = await client.post(
                        "/mcp",
                        headers={
                            "authorization": f"Bearer {token}",
                            "accept": "application/json, text/event-stream",
                        },
                        json={
                            "jsonrpc": "2.0",
                            "id": sequence,
                            "method": "tools/call",
                            "params": {"name": name, "arguments": arguments or {}},
                        },
                    )
                    assert response.status_code == 200, response.text
                    return response.json()["result"]

                listed = await client.post(
                    "/mcp",
                    headers={
                        "authorization": "Bearer oat_write",
                        "accept": "application/json, text/event-stream",
                    },
                    json={"jsonrpc": "2.0", "id": 500, "method": "tools/list", "params": {}},
                )
                tools = {t["name"]: t for t in listed.json()["result"]["tools"]}
                for name, fields in drafts.items():
                    assert tools[name]["_meta"]["securitySchemes"][0]["scopes"] == ["hetu:write"]
                    assert tools[name]["annotations"]["idempotentHint"] is True
                    assert tools[name]["annotations"]["openWorldHint"] is False
                    draft = {"idempotency_key": f"mcp-{name}", **fields}
                    denied = await call(name, {"draft": draft}, token="oat_read")
                    assert denied["isError"] is True
                    saved = await call(name, {"draft": draft})
                    assert not saved.get("isError"), saved
                    record = saved["structuredContent"]["record"]
                    assert record["user_id"] == "owner-a"
                    replay = await call(name, {"draft": draft})
                    assert replay["structuredContent"]["idempotent_replay"] is True
                    async with factory() as db:
                        rows = await section_records(
                            db,
                            owner_id="owner-a",
                            section={
                                "save_formula": "formulas",
                                "save_recognition_cue": "trigger_drill",
                                "update_journal_analysis": "journal",
                                "set_syllabus_progress": "syllabus",
                                "save_weekly_review": "weekly_review",
                                "edit_planner_day": "planner",
                            }[name],
                            collection=saved["structuredContent"]["collection"],
                        )
                        assert any(r["id"] == record["id"] for r in rows["items"])
                capabilities = (await call("get_capabilities"))["structuredContent"]["supported"]
                assert "planner.capacity_validation" in capabilities
                assert "journal.update_analysis" in capabilities
                stale = await call(
                    "edit_planner_day",
                    {"draft": {**drafts["edit_planner_day"], "idempotency_key": "stale-planner"}},
                )
                assert stale["isError"] is True
                assert '"current_revision": 1' in stale["content"][0]["text"]
                wrong_owner = await call(
                    "update_journal_analysis",
                    {
                        "draft": {
                            "idempotency_key": "cross-account-journal",
                            "record_id": "journal-q",
                            "expected_version": 2,
                            "root_cause": "reading",
                            "analysis_provenance": "assistant_hypothesis",
                        }
                    },
                    token="oat_other",
                )
                assert wrong_owner["isError"] is True
                async with factory() as db:
                    assert (
                        await db.scalar(
                            select(func.count(Record.id)).where(Record.owner_id == "owner-b")
                        )
                        == 0
                    )
                    assert (
                        await db.scalar(
                            select(func.count(Record.id)).where(Record.collection == "pyq_attempts")
                        )
                        == 0
                    )
    finally:
        await engine.dispose()
