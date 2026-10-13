from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, Request

from app.core.config import Settings
from app.core.security import authenticate_http_request

RateLimitScope = Literal["interactive", "background", "ip", "mcp"]
_BACKGROUND_QUERY = re.compile(r"/compat/tables/[^/]+/query\Z")


@dataclass(frozen=True, slots=True)
class RateLimitBucket:
    identifier: str
    scope: RateLimitScope


async def request_rate_limit_bucket(request: Request, settings: Settings) -> RateLimitBucket:
    """Isolate verified accounts and hydration without trusting proxy IPs or JWT claims."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    ip = forwarded or (request.client.host if request.client else "unknown")
    path = request.url.path
    if path.startswith("/mcp"):
        return RateLimitBucket(ip, "mcp")
    if not path.startswith(f"{settings.api_prefix}/"):
        return RateLimitBucket(ip, "ip")
    relative_path = path[len(settings.api_prefix) :]
    # Public enrollment endpoints keep their IP budget even when a caller
    # includes valid credentials. Authentication never provisions an account.
    if relative_path in {"/access/request", "/access/signup"} or relative_path.startswith(
        "/access/invites/"
    ):
        return RateLimitBucket(ip, "ip")
    try:
        identity = await authenticate_http_request(request, settings)
    except HTTPException:
        # Let the endpoint report its normal auth failure after IP accounting.
        return RateLimitBucket(ip, "ip")

    subject = identity.provider_subject or identity.user_id
    account = hashlib.sha256(f"{identity.provider}\0{subject}".encode()).hexdigest()
    scope: RateLimitScope = (
        "background"
        if request.method == "POST" and _BACKGROUND_QUERY.fullmatch(relative_path)
        else "interactive"
    )
    return RateLimitBucket(f"account:{account}:{scope}", scope)
