from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from clerk_backend_api.security.types import AuthStatus, RequestState
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from pydantic import SecretStr
from starlette.requests import Request

from app.core.config import Settings
from app.core.security import authenticate_http_request


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["valid", "expired", "wrong_origin", "missing_exp", "future_nbf"])
async def test_clerk_session_token_is_verified_locally(case) -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    now = datetime.now(UTC)
    claims = {
        "sub": "user_verified",
        "sid": "sess_verified",
        "azp": "https://app.example.com",
        "iat": now,
        "nbf": now - timedelta(seconds=1),
        "exp": now + timedelta(minutes=1),
    }
    if case == "expired":
        claims["exp"] = now - timedelta(minutes=5)
    elif case == "wrong_origin":
        claims["azp"] = "https://untrusted.example"
    elif case == "missing_exp":
        del claims["exp"]
    elif case == "future_nbf":
        claims["nbf"] = now + timedelta(minutes=5)
    token = jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
    )
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/v1/me",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )
    settings = Settings(
        clerk_jwt_key=SecretStr(public_key.decode()),
        clerk_authorized_parties="https://app.example.com",
    )

    if case != "valid":
        with pytest.raises(HTTPException) as exc:
            await authenticate_http_request(request, settings)
        assert exc.value.status_code == 401
        return
    identity = await authenticate_http_request(request, settings)

    assert identity.user_id == "user_verified"
    assert identity.session_id == "sess_verified"


def _oauth_request(monkeypatch: pytest.MonkeyPatch, method: str, scope: str | None) -> Request:
    from datetime import UTC, datetime

    payload: dict = {
        "sub": "user_oauth",
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
    }
    if scope is not None:
        payload["scope"] = scope

    def fake_authenticate(request, options):  # noqa: ANN001, ANN202, ARG001
        assert "oauth_token" in options.accepts_token
        return RequestState(status=AuthStatus.SIGNED_IN, token="oat_test", payload=payload)

    import app.core.security as security

    monkeypatch.setattr(security, "authenticate_request", fake_authenticate)
    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/v1/learning/search",
            "headers": [(b"authorization", b"Bearer oat_test")],
        }
    )


@pytest.mark.asyncio
async def test_oauth_token_with_read_scope_can_read(monkeypatch: pytest.MonkeyPatch) -> None:
    request = _oauth_request(monkeypatch, "GET", "openid profile hetu:read hetu:write")
    settings = Settings(clerk_jwt_key=SecretStr("unused"))
    identity = await authenticate_http_request(request, settings)
    assert identity.user_id == "user_oauth"
    assert identity.session_id is None


@pytest.mark.asyncio
async def test_oauth_token_without_read_scope_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    request = _oauth_request(monkeypatch, "GET", "openid profile")
    settings = Settings(clerk_jwt_key=SecretStr("unused"))
    with pytest.raises(HTTPException) as exc:
        await authenticate_http_request(request, settings)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_oauth_token_needs_write_scope_for_writes(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(clerk_jwt_key=SecretStr("unused"))
    denied = _oauth_request(monkeypatch, "POST", "openid hetu:read")
    with pytest.raises(HTTPException) as exc:
        await authenticate_http_request(denied, settings)
    assert exc.value.status_code == 403
    allowed = _oauth_request(monkeypatch, "POST", "openid hetu:read hetu:write")
    identity = await authenticate_http_request(allowed, settings)
    assert identity.user_id == "user_oauth"
