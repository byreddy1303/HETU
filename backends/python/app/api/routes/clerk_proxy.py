"""Same-origin Clerk Frontend API proxy for hosts without custom DNS control."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from app.api.deps import SettingsDep

router = APIRouter()
UPSTREAM = "https://frontend-api.clerk.dev"
HOP_HEADERS = frozenset(
    {"host", "connection", "content-length", "transfer-encoding", "accept-encoding",
     "clerk-secret-key", "clerk-proxy-url"}
)


@router.api_route(
    "/__clerk/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
)
async def proxy_frontend_api(path: str, request: Request, settings: SettingsDep) -> Response:
    if not settings.clerk_secret_key:
        raise HTTPException(503, "Sign-in is not configured")
    # The destination is fixed. A client cannot turn this into an arbitrary proxy
    # or forward the backend secret to another host, including through redirects.
    proxy_url = settings.app_url.rstrip("/") + "/__clerk"
    headers = {key: value for key, value in request.headers.items() if key not in HOP_HEADERS}
    headers["clerk-secret-key"] = settings.clerk_secret_key.get_secret_value()
    headers["clerk-proxy-url"] = proxy_url
    headers["x-forwarded-for"] = (
        request.headers.get("x-vercel-forwarded-for")
        or request.headers.get("x-forwarded-for")
        or (request.client.host if request.client else "127.0.0.1")
    ).split(",", 1)[0].strip()
    url = httpx.URL(UPSTREAM).copy_with(
        path="/" + path, query=request.url.query.encode()
    )
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
            upstream = await client.request(
                request.method, url, headers=headers, content=await request.body()
            )
    except httpx.HTTPError:
        raise HTTPException(502, "Sign-in service is temporarily unavailable") from None
    response = Response(upstream.content, status_code=upstream.status_code)
    response.raw_headers = [
        (key, value)
        for key, value in upstream.headers.raw
        if key.lower() not in {
            b"connection", b"transfer-encoding", b"content-encoding", b"content-length",
            b"clerk-secret-key", b"clerk-proxy-url", b"cache-control"
        }
    ]
    response.headers["content-length"] = str(len(upstream.content))
    response.headers["cache-control"] = "private, no-store"
    location = response.headers.get("location")
    if location and location.startswith(UPSTREAM + "/"):
        response.headers["location"] = proxy_url + location.removeprefix(UPSTREAM)
    return response
