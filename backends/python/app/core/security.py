from __future__ import annotations

from dataclasses import dataclass

from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from clerk_backend_api.security.machine import get_token_type
from clerk_backend_api.security.types import TokenType
from fastapi import HTTPException, Request, WebSocket, status
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings

# OAuth scopes mirror the MCP scopes so connected clients (MCP or GPT Actions)
# get the same read/write boundary on the REST API.
OAUTH_READ_SCOPE = "hetu:read"
OAUTH_WRITE_SCOPE = "hetu:write"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


@dataclass(frozen=True, slots=True)
class Identity:
    user_id: str
    session_id: str | None = None
    expires_at: int | None = None
    provider: str = "clerk"
    provider_subject: str | None = None


async def authenticate_http_request(request: Request, settings: Settings) -> Identity:
    # Middleware uses the same verified identity as the endpoint dependency.
    # Cache only within this request; refreshed tokens are verified anew.
    cached = getattr(request.state, "http_auth_result", None)
    if getattr(request.state, "http_auth_settings", None) is settings:
        if isinstance(cached, Identity):
            return cached
        if isinstance(cached, HTTPException):
            raise cached
    try:
        identity = await _authenticate(request, settings)
    except HTTPException as exc:
        request.state.http_auth_result = exc
        request.state.http_auth_settings = settings
        raise
    request.state.http_auth_result = identity
    request.state.http_auth_settings = settings
    return identity


async def authenticate_websocket(websocket: WebSocket, settings: Settings) -> Identity:
    authorization = websocket.headers.get("authorization")
    protocols = [
        item.strip()
        for item in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if item.strip()
    ]
    if not authorization and len(protocols) >= 2 and protocols[0] == "clerk-session":
        authorization = f"Bearer {protocols[1]}"
        websocket.state.accept_subprotocol = "clerk-session"
    if not authorization:
        return await _authenticate(websocket, settings)
    adapter = _WebSocketAuthRequest(websocket, authorization)
    return await _authenticate(adapter, settings)


class _WebSocketAuthRequest:
    def __init__(self, websocket: WebSocket, authorization: str) -> None:
        self.headers = dict(websocket.headers)
        self.headers["Authorization"] = authorization
        self.url = websocket.url


def _enforce_oauth_scopes(
    request: Request | WebSocket | _WebSocketAuthRequest, payload: dict[str, object]
) -> None:
    """Require hetu:read on OAuth tokens, plus hetu:write for unsafe methods."""
    raw_scope = payload.get("scope")
    if isinstance(raw_scope, str):
        scopes = set(raw_scope.split())
    elif isinstance(raw_scope, list) and all(isinstance(item, str) for item in raw_scope):
        scopes = set(raw_scope)
    else:
        scopes = set()
    if OAUTH_READ_SCOPE not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{OAUTH_READ_SCOPE} scope required",
        )
    method = getattr(request, "method", None)
    if not isinstance(method, str):
        # Realtime transports stay session-only; OAuth tokens use HTTP.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OAuth tokens are not accepted on this transport",
        )
    if method.upper() not in _SAFE_METHODS and OAUTH_WRITE_SCOPE not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{OAUTH_WRITE_SCOPE} scope required",
        )


async def _authenticate(
    request: Request | WebSocket | _WebSocketAuthRequest, settings: Settings
) -> Identity:
    secret_key = settings.clerk_secret_key.get_secret_value() if settings.clerk_secret_key else None
    jwt_key = settings.clerk_jwt_key.get_secret_value() if settings.clerk_jwt_key else None
    if not secret_key and not jwt_key:
        if settings.environment == "local":
            return Identity(
                user_id="local_user",
                session_id="local_session",
                expires_at=2147483647,
                provider="local",
                provider_subject="local_user",
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )

    options = AuthenticateRequestOptions(
        secret_key=secret_key,
        jwt_key=jwt_key,
        authorized_parties=settings.authorized_parties,
        accepts_token=["session_token", "oauth_token"],
    )
    try:
        state = await run_in_threadpool(authenticate_request, request, options)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if not state.is_signed_in:
        reason = getattr(getattr(state, "reason", None), "name", None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=reason or "Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = state.payload or {}
    if state.token and get_token_type(state.token) is TokenType.OAUTH_TOKEN:
        _enforce_oauth_scopes(request, payload)
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token subject missing"
        )
    session_id = payload.get("sid")
    expires_at = payload.get("exp")
    if type(expires_at) is not int:
        raise HTTPException(status_code=401, detail="Token expiration missing")
    return Identity(
        user_id=user_id,
        session_id=session_id if isinstance(session_id, str) else None,
        expires_at=expires_at,
        provider_subject=user_id,
    )
