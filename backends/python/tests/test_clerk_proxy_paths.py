"""CIMD client URLs must remain one encoded path segment through the proxy."""

from urllib.parse import unquote

import httpx
import pytest
from pydantic import SecretStr
from starlette.requests import Request

from app.api.routes import clerk_proxy
from app.core.config import Settings

CLIENT_PATH = b"/v1/me/oauth/consent/https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json"
QUERY = b"scope=openid%20hetu%3Aread&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback"


def proxy_request(raw_path: bytes, method: str = "GET", query: bytes = QUERY) -> Request:
    async def receive():
        return {"type": "http.request", "body": b"consented=false", "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": unquote(raw_path.decode()),
            "raw_path": raw_path,
            "query_string": query,
            "scheme": "https",
            "server": ("testserver", 443),
            "client": ("127.0.0.1", 1234),
            "headers": [(b"host", b"testserver")],
        },
        receive,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_consent_for_a_url_client_reaches_clerks_json_route(monkeypatch, method):
    seen = []

    def handler(upstream):
        seen.append(upstream)
        if upstream.url.raw_path == CLIENT_PATH + b"?" + QUERY:
            return httpx.Response(401, json={"errors": [{"code": "authentication_required"}]})
        return httpx.Response(404, text="404 page not found\n")

    original = httpx.AsyncClient
    monkeypatch.setattr(
        clerk_proxy.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    request = proxy_request(b"/__clerk" + CLIENT_PATH, method)
    settings = Settings(clerk_secret_key=SecretStr("synthetic-secret"))
    response = await clerk_proxy.proxy_frontend_api(
        request.url.path.removeprefix("/__clerk/"), request, settings, None
    )

    assert response.status_code == 401
    assert response.headers["content-type"] == "application/json"
    assert seen[0].url.host == "frontend-api.clerk.dev"
    assert seen[0].method == method
    assert seen[0].content == b"consented=false"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        b"/npm/%40clerk/clerk-js%406/dist/clerk.browser.js",
        b"/v1/me/oauth/consent/https%3a%2f%2fexample.test%2fclient%252Fid",
    ],
)
async def test_proxy_keeps_path_encoding_and_query_bytes_exactly(monkeypatch, path):
    seen = []

    def handler(upstream):
        seen.append(upstream)
        return httpx.Response(200, json={"ok": True})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        clerk_proxy.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    query = b"value=a%2Fb%252F%2B+space"
    request = proxy_request(b"/__clerk" + path, query=query)
    settings = Settings(clerk_secret_key=SecretStr("synthetic-secret"))
    await clerk_proxy.proxy_frontend_api(
        request.url.path.removeprefix("/__clerk/"), request, settings, None
    )

    assert seen[0].url.raw_path == path + b"?" + query
    assert seen[0].url.scheme == "https"
    assert seen[0].url.host == "frontend-api.clerk.dev"
