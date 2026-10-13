from __future__ import annotations

import time
from collections import Counter
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select

from app import main
from app.core import security
from app.core.config import Settings, get_settings
from app.db.models import User, UserIdentity
from app.db.session import get_db
from app.services.redis import RateLimitResult

PROXY_IP = "192.0.2.50"


@pytest_asyncio.fixture
async def rate_api(db, monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    settings = Settings(
        clerk_jwt_key=SecretStr(public_key.decode()),
        clerk_authorized_parties="https://app.example.com",
    )
    monkeypatch.setattr(main, "settings", settings)
    for name in ("a", "b"):
        db.add(User(id=f"internal-{name}"))
        db.add(UserIdentity(user_id=f"internal-{name}", provider="clerk", subject=f"clerk-{name}"))
    await db.commit()

    def token(name: str, session: str = "first") -> str:
        now = datetime.now(UTC)
        return jwt.encode(
            {
                "sub": f"clerk-{name}",
                "sid": session,
                "azp": "https://app.example.com",
                "iat": now,
                "nbf": now - timedelta(seconds=1),
                "exp": now + timedelta(minutes=1),
            },
            private_key,
            algorithm="RS256",
        )

    harness = SimpleNamespace(
        limit=2, counters=Counter(), keys=[], verifications=0, token=token, warnings=[]
    )
    verify = security.authenticate_request

    def counted_verification(*args, **kwargs):
        harness.verifications += 1
        return verify(*args, **kwargs)

    async def check_budget(identifier: str) -> RateLimitResult:
        harness.keys.append(identifier)
        harness.counters[identifier] += 1
        count = harness.counters[identifier]
        return RateLimitResult(
            count <= harness.limit,
            harness.limit,
            max(harness.limit - count, 0),
            int(time.time()) + 5,
        )

    async def override_db():
        yield db

    monkeypatch.setattr(security, "authenticate_request", counted_verification)
    monkeypatch.setattr(main, "check_rate_limit", check_budget)
    monkeypatch.setattr(
        main,
        "log",
        SimpleNamespace(
            info=lambda *args, **kwargs: None,
            warning=lambda event, **fields: harness.warnings.append((event, fields)),
        ),
    )
    main.app.dependency_overrides[get_db] = override_db
    main.app.dependency_overrides[get_settings] = lambda: settings
    try:
        async with AsyncClient(
            transport=ASGITransport(app=main.app),
            base_url="http://testserver",
            headers={"x-forwarded-for": PROXY_IP},
        ) as client:
            harness.client = client
            yield harness
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verified_users_do_not_share_a_proxy_budget_and_auth_is_reused(rate_api):
    a = {"Authorization": f"Bearer {rate_api.token('a')}"}
    b = {"Authorization": f"Bearer {rate_api.token('b')}"}
    assert (await rate_api.client.get("/v1/workflows", headers=a)).status_code == 200
    assert (await rate_api.client.get("/v1/concept-reviews", headers=a)).status_code == 200
    exhausted = await rate_api.client.get("/v1/workflows", headers=a)
    assert exhausted.status_code == 429
    assert exhausted.headers["x-ratelimit-scope"] == "interactive"
    independent = await rate_api.client.get("/v1/workflows", headers=b)
    assert independent.status_code == 200
    assert independent.headers["x-ratelimit-remaining"] == "1"
    assert rate_api.keys[0] == rate_api.keys[1] == rate_api.keys[2]
    assert rate_api.keys[3] != rate_api.keys[0]
    assert rate_api.verifications == 4  # One verification per HTTP request, not per dependency.


@pytest.mark.asyncio
async def test_token_rotation_preserves_subject_budget(rate_api):
    rate_api.limit = 1
    first = await rate_api.client.get(
        "/v1/workflows", headers={"Authorization": f"Bearer {rate_api.token('a', 'first')}"}
    )
    rotated = await rate_api.client.get(
        "/v1/concept-reviews", headers={"Authorization": f"Bearer {rate_api.token('a', 'rotated')}"}
    )
    assert first.status_code == 200
    assert rotated.status_code == 429
    assert rate_api.keys[0] == rate_api.keys[1]
    assert rate_api.verifications == 2


@pytest.mark.asyncio
async def test_background_queries_do_not_starve_pages_or_grant_writes_another_budget(rate_api):
    rate_api.limit = 1
    headers = {"Authorization": f"Bearer {rate_api.token('a')}"}
    loaded = await rate_api.client.post(
        "/v1/compat/tables/questions/query", json={}, headers=headers
    )
    assert loaded.status_code == 200
    assert loaded.headers["x-ratelimit-scope"] == "background"
    exhausted = await rate_api.client.post(
        "/v1/compat/tables/sessions/query", json={}, headers=headers
    )
    assert exhausted.status_code == 429
    assert exhausted.headers["x-ratelimit-scope"] == "background"
    page = await rate_api.client.get("/v1/workflows", headers=headers)
    assert page.status_code == 200
    assert page.headers["x-ratelimit-scope"] == "interactive"
    write = await rate_api.client.post(
        "/v1/compat/tables/questions/insert", json={}, headers=headers
    )
    assert write.status_code == 429
    assert write.headers["x-ratelimit-scope"] == "interactive"
    assert rate_api.keys[0] == rate_api.keys[1]
    assert rate_api.keys[2] == rate_api.keys[3]
    assert rate_api.keys[0] != rate_api.keys[2]


@pytest.mark.asyncio
async def test_invalid_and_missing_tokens_cannot_mint_budgets_or_bypass_public_limit(rate_api, db):
    forged = jwt.encode(
        {"sub": "invented-account"}, "untrusted-secret-that-is-at-least-32-bytes", algorithm="HS256"
    )
    denied = await rate_api.client.get(
        "/v1/workflows", headers={"Authorization": f"Bearer {forged}"}
    )
    missing = await rate_api.client.get("/v1/concept-reviews")
    assert denied.status_code == missing.status_code == 401
    assert denied.headers["x-ratelimit-scope"] == missing.headers["x-ratelimit-scope"] == "ip"
    assert rate_api.verifications == 2
    public = await rate_api.client.post(
        "/v1/access/request", json={}, headers={"Authorization": f"Bearer {rate_api.token('b')}"}
    )
    assert public.status_code == 429
    assert public.headers["x-ratelimit-scope"] == "ip"
    assert rate_api.keys == [PROXY_IP, PROXY_IP, PROXY_IP]
    assert await db.scalar(select(func.count()).select_from(User)) == 2
    assert await db.scalar(select(func.count()).select_from(UserIdentity)) == 2


@pytest.mark.asyncio
async def test_valid_but_unenrolled_subject_is_denied_without_creating_an_account(rate_api, db):
    response = await rate_api.client.get(
        "/v1/workflows", headers={"Authorization": f"Bearer {rate_api.token('unknown')}"}
    )
    assert response.status_code == 403
    assert await db.scalar(select(func.count()).select_from(User)) == 2
    assert await db.scalar(select(func.count()).select_from(UserIdentity)) == 2


@pytest.mark.asyncio
async def test_mcp_webhook_health_and_preflight_keep_their_accounting(rate_api):
    token = {"Authorization": f"Bearer {rate_api.token('a')}"}
    mcp = await rate_api.client.get("/mcp", headers=token)
    assert mcp.headers["x-ratelimit-scope"] == "mcp"
    assert rate_api.keys == [PROXY_IP]
    assert rate_api.verifications == 0
    await rate_api.client.post("/v1/webhooks/clerk", json={})
    assert (await rate_api.client.get("/health/live")).status_code == 200
    preflight = await rate_api.client.options(
        "/v1/workflows",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert preflight.status_code == 200
    assert rate_api.keys == [PROXY_IP]


@pytest.mark.asyncio
async def test_429_exposes_scope_and_retry_headers_and_logs_no_identity(rate_api):
    rate_api.limit = 1
    headers = {
        "Authorization": f"Bearer {rate_api.token('a')}",
        "Origin": "http://localhost:5173",
        "X-Request-ID": "rate-test-request",
    }
    await rate_api.client.get("/v1/workflows", headers=headers)
    response = await rate_api.client.get("/v1/concept-reviews", headers=headers)
    assert response.status_code == 429
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "X-RateLimit-Scope" in response.headers["access-control-expose-headers"]
    assert int(response.headers["retry-after"]) > 0
    assert response.headers["x-ratelimit-limit"] == "1"
    assert response.headers["x-ratelimit-remaining"] == "0"
    assert response.headers["x-request-id"] == "rate-test-request"
    event, fields = rate_api.warnings[0]
    assert event == "request_rate_limited"
    assert fields["request_id"] == "rate-test-request"
    assert fields["scope"] == "interactive"
    assert set(fields) == {"request_id", "method", "scope", "status", "limit", "reset_epoch"}
