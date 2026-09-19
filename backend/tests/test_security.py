from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import SecretStr
from starlette.requests import Request

from app.core.config import Settings
from app.core.security import authenticate_http_request


@pytest.mark.asyncio
async def test_clerk_session_token_is_verified_locally() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "user_verified",
            "sid": "sess_verified",
            "azp": "https://app.example.com",
            "iat": now,
            "nbf": now - timedelta(seconds=1),
            "exp": now + timedelta(minutes=1),
        },
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

    identity = await authenticate_http_request(request, settings)

    assert identity.user_id == "user_verified"
    assert identity.session_id == "sess_verified"
