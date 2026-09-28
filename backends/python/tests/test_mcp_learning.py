from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from mcp.server.auth.provider import AccessToken
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.core.config import Settings
from app.core.security import Identity
from app.db.base import Base
from app.db.models import User, UserIdentity
from app.db.session import get_db
from app.main import app
from app.mcp_server import ClerkOAuthVerifier, create_mcp_server
from tests.test_learning_library import capture


@pytest.mark.asyncio
async def test_oauth_mcp_transport_exposes_and_executes_learning_workflow(monkeypatch) -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add_all([User(id="internal_user"), User(id="user_other")])
        db.add(UserIdentity(user_id="internal_user", provider="clerk", subject="user_mcp"))
        await db.commit()

    settings = Settings(
        environment="test",
        mcp_resource_url="http://testserver/mcp",
        clerk_oauth_issuer="https://clerk.example.test",
        mcp_allowed_client_ids="https://chatgpt.com/oauth/client.json",
        app_url="https://hetu.example.test",
    )

    async def fake_verify(self, token: str):
        if token not in {"oat_one", "oat_other", "oat_read"}:
            return None
        return AccessToken(
            token=token,
            client_id="https://chatgpt.com/oauth/client.json",
            subject="user_other" if token == "oat_other" else "user_mcp",
            scopes=["hetu:read"] if token == "oat_read" else ["hetu:read", "hetu:write"],
            resource=settings.mcp_resource_url,
        )

    monkeypatch.setattr(ClerkOAuthVerifier, "verify_token", fake_verify)
    monkeypatch.setattr("app.mcp_server.get_session_factory", lambda: factory)
    server = create_mcp_server(settings)
    transport = server.streamable_http_app(
        stateless_http=True, json_response=True, host="testserver"
    )
    async with server.session_manager.run():
        async with AsyncClient(
            transport=ASGITransport(app=transport), base_url="http://testserver"
        ) as client:
            metadata = await client.get("/.well-known/oauth-protected-resource/mcp")
            assert metadata.status_code == 200
            assert metadata.json()["authorization_servers"] == ["https://clerk.example.test/"]

            async def call(token: str | None, method: str, params: dict, id_: int):
                headers = {"accept": "application/json, text/event-stream"}
                if token:
                    headers["authorization"] = f"Bearer {token}"
                return await client.post(
                    "/mcp",
                    json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params},
                    headers=headers,
                )

            anonymous = await call(None, "tools/list", {}, 1)
            assert anonymous.status_code == 401
            assert "resource_metadata=" in anonymous.headers["www-authenticate"]
            listed = await call("oat_one", "tools/list", {}, 2)
            assert listed.status_code == 200
            tools = {item["name"]: item for item in listed.json()["result"]["tools"]}
            assert "save_to_hetu" in tools
            assert tools["save_to_hetu"]["_meta"]["securitySchemes"][0]["scopes"] == ["hetu:write"]
            assert tools["get_profile"]["_meta"]["openai/profile"] is True

            saved = await call(
                "oat_one",
                "tools/call",
                {"name": "save_to_hetu", "arguments": {"request": capture()}},
                3,
            )
            assert saved.status_code == 200, saved.text
            assert saved.json()["result"].get("isError") is not True
            concept_id = saved.json()["result"]["structuredContent"]["concept_ids"][0]

            async def api_db():
                async with factory() as db:
                    yield db

            async def api_identity():
                return Identity(user_id="internal_user")

            app.dependency_overrides[get_db] = api_db
            app.dependency_overrides[get_current_user] = api_identity
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://testserver"
                ) as api_client:
                    displayed = await api_client.get(f"/v1/learning/concepts/{concept_id}")
                    assert displayed.status_code == 200, displayed.text
                    assert displayed.json()["page"]["id"] == concept_id
                    assert displayed.json()["insights"][0]["full_explanation"]
            finally:
                app.dependency_overrides.clear()

            found = await call(
                "oat_one",
                "tools/call",
                {"name": "search_knowledge", "arguments": {"query": "Bayes"}},
                4,
            )
            assert found.json()["result"]["structuredContent"]["items"][0]["id"] == concept_id

            other = await call(
                "oat_other",
                "tools/call",
                {"name": "search_knowledge", "arguments": {"query": "Bayes"}},
                5,
            )
            assert other.json()["result"]["structuredContent"]["items"] == []

            denied = await call(
                "oat_read",
                "tools/call",
                {"name": "save_to_hetu", "arguments": {"request": capture("read-only-save")}},
                6,
            )
            assert denied.json()["result"]["isError"] is True
    await engine.dispose()


@pytest.mark.asyncio
async def test_clerk_verifier_requires_allowed_client_and_user_subject(monkeypatch) -> None:
    from types import SimpleNamespace

    from pydantic import SecretStr

    settings = Settings(
        mcp_resource_url="https://api.example.test/mcp",
        clerk_oauth_issuer="https://clerk.example.test",
        clerk_secret_key=SecretStr("sk_test"),
        mcp_allowed_client_ids="https://chatgpt.com/oauth/client.json",
    )
    payload = {
        "subject": "user_one",
        "client_id": "https://chatgpt.com/oauth/client.json",
        "scopes": ["hetu:read", "hetu:write"],
        "aud": "https://api.example.test/mcp",
    }
    monkeypatch.setattr(
        "app.mcp_server.authenticate_request",
        lambda request, options: SimpleNamespace(is_signed_in=True, payload=payload),
    )
    verifier = ClerkOAuthVerifier(settings)
    assert (await verifier.verify_token("oat_123")).subject == "user_one"
    payload["client_id"] = "https://untrusted.example/client.json"
    assert await verifier.verify_token("oat_123") is None
    payload["client_id"] = "https://chatgpt.com/oauth/client.json"
    payload["aud"] = "https://other.example/mcp"
    assert await verifier.verify_token("oat_123") is None
    payload.pop("aud")
    assert await verifier.verify_token("oat_123") is None
