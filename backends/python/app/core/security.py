from __future__ import annotations

from dataclasses import dataclass

from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from fastapi import HTTPException, Request, WebSocket, status
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings


@dataclass(frozen=True, slots=True)
class Identity:
    user_id: str
    session_id: str | None = None
    expires_at: int | None = None


async def authenticate_http_request(request: Request, settings: Settings) -> Identity:
    return await _authenticate(request, settings)


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


async def _authenticate(
    request: Request | WebSocket | _WebSocketAuthRequest, settings: Settings
) -> Identity:
    secret_key = settings.clerk_secret_key.get_secret_value() if settings.clerk_secret_key else None
    jwt_key = settings.clerk_jwt_key.get_secret_value() if settings.clerk_jwt_key else None
    if not secret_key and not jwt_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )

    options = AuthenticateRequestOptions(
        secret_key=secret_key,
        jwt_key=jwt_key,
        authorized_parties=settings.authorized_parties,
        accepts_token=["session_token"],
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
    )
