import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from starlette.requests import Request

from app.api.routes import clerk_proxy
from app.core.config import Settings


def request():
    async def receive():
        return {"type": "http.request", "body": b"identifier=test", "more_body": False}

    return Request({
        "type": "http", "method": "POST", "path": "/__clerk/v1/client/sign_ins",
        "query_string": b"test=value", "scheme": "https", "server": ("testserver", 443),
        "client": ("127.0.0.1", 1234),
        "headers": [(b"host", b"testserver"), (b"clerk-secret-key", b"attacker"),
                    (b"clerk-proxy-url", b"https://attacker.invalid"),
                    (b"x-vercel-forwarded-for", b"192.0.2.1"),
                    (b"content-type", b"application/x-www-form-urlencoded")],
    }, receive)


@pytest.mark.asyncio
async def test_proxy_keeps_fixed_destination_and_preserves_body_and_cookies(monkeypatch):
    seen = []

    def handler(upstream):
        seen.append(upstream)
        return httpx.Response(302, content=b"redirect", headers=[
            ("location", "https://frontend-api.clerk.dev/v1/client"),
            ("set-cookie", "one=1; Secure; HttpOnly"),
            ("set-cookie", "two=2; Secure; HttpOnly"),
            ("clerk-secret-key", "must-not-leak"),
            ("cache-control", "public, max-age=3600"),
        ])

    original = httpx.AsyncClient
    monkeypatch.setattr(clerk_proxy.httpx, "AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(handler), **kwargs
    ))
    settings = Settings(clerk_secret_key=SecretStr("synthetic-secret"),
                        app_url="https://hetu-app.vercel.app")
    result = await clerk_proxy.proxy_frontend_api("v1/client/sign_ins", request(), settings)
    assert len(seen) == 1  # Redirects must never forward the secret to a second host.
    assert str(seen[0].url) == "https://frontend-api.clerk.dev/v1/client/sign_ins?test=value"
    assert seen[0].content == b"identifier=test"
    assert seen[0].headers["clerk-secret-key"] == "synthetic-secret"
    assert seen[0].headers["clerk-proxy-url"] == "https://hetu-app.vercel.app/__clerk"
    assert seen[0].headers["x-forwarded-for"] == "192.0.2.1"
    assert result.status_code == 302
    assert result.headers["location"] == "https://hetu-app.vercel.app/__clerk/v1/client"
    assert len(result.headers.getlist("set-cookie")) == 2
    assert "clerk-secret-key" not in result.headers
    assert result.headers["cache-control"] == "private, no-store"


@pytest.mark.asyncio
async def test_unconfigured_sign_in_fails_closed():
    with pytest.raises(HTTPException) as error:
        await clerk_proxy.proxy_frontend_api("v1/client", request(), Settings())
    assert error.value.status_code == 503
