from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.core.config import Settings
from app.core.security import authenticate_http_request
from app.db.models import User, UserIdentity
from app.services.desktop_static import desktop_static_router
from app.services.local_workspace import ensure_local_workspace


@pytest.mark.asyncio
async def test_personalize_existing_owner_without_losing_profile_or_identity(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path / 'workspace.db'}"
    settings = Settings(
        _env_file=None,
        environment="local",
        database_url=url,
        local_display_name="Kalyan",
        local_username="kalyan",
    )
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        await ensure_local_workspace(settings, engine=engine, session_factory=factory)
        async with factory() as db:
            user = await db.get(User, "local_user")
            user.display_name = "Local Learner"
            user.username = "local_learner"
            user.profile = {"name": "Local Learner", "target_rank": 100, "welcome_seen_at": "saved"}
            await db.commit()
        await ensure_local_workspace(settings, engine=engine, session_factory=factory)
        async with factory() as db:
            user = await db.get(User, "local_user")
            assert user.display_name == "Kalyan"
            assert user.username == "kalyan"
            assert user.profile["name"] == "Kalyan"
            assert user.profile["target_rank"] == 100
            assert user.profile["welcome_seen_at"] == "saved"
            assert await db.scalar(select(func.count()).select_from(User)) == 1
            assert await db.scalar(select(func.count()).select_from(UserIdentity)) == 1
            user.display_name = "My chosen name"
            user.username = "chosen"
            await db.commit()
        await ensure_local_workspace(settings, engine=engine, session_factory=factory)
        async with factory() as db:
            assert (await db.get(User, "local_user")).display_name == "My chosen name"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "client,origin,allowed",
    [
        ("127.0.0.1", None, True),
        ("::1", "http://localhost:5173", True),
        ("127.0.0.1", "https://untrusted.example", False),
        ("127.0.0.1", "null", False),
        ("192.168.1.5", None, False),
    ],
)
async def test_personal_workspace_requires_loopback_client_and_trusted_origin(
    client, origin, allowed
):
    settings = Settings(_env_file=None, environment="local", database_url="sqlite+aiosqlite://")
    headers = [] if origin is None else [(b"origin", origin.encode())]
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/v1/me",
            "client": (client, 1234),
            "headers": headers,
        }
    )
    if allowed:
        assert (await authenticate_http_request(request, settings)).user_id == "local_user"
    else:
        with pytest.raises(HTTPException) as error:
            await authenticate_http_request(request, settings)
        assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_local_postgres_does_not_bypass_hosted_auth():
    settings = Settings(
        _env_file=None, environment="local", database_url="postgresql://localhost/hetu"
    )
    request = Request({"type": "http", "method": "GET", "path": "/v1/me", "headers": []})
    with pytest.raises(HTTPException) as error:
        await authenticate_http_request(request, settings)
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_desktop_static_serves_deep_links_but_never_secrets_or_missing_apis(tmp_path):
    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("<html>HETU</html>")
    (root / "logo.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("secret")
    (root / ".env").write_text("SECRET=value")
    (root / "escape.txt").symlink_to(tmp_path / "secret.txt")
    app = FastAPI()
    app.include_router(desktop_static_router(str(root)))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://local") as client:
        assert (await client.get("/journal")).text == "<html>HETU</html>"
        assert (await client.get("/library/concepts/123")).status_code == 200
        assert (await client.get("/logo.svg")).text == "<svg/>"
        for path in [
            "/v1/missing",
            "/mcp",
            "/api/missing",
            "/assets/missing.js",
            "/missing.png",
            "/.env",
            "/escape.txt",
            "/%2e%2e/secret.txt",
        ]:
            response = await client.get(path)
            assert response.status_code == 404, path
            assert "secret" not in response.text
