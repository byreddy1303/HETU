from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings

CLERK_API = "https://api.clerk.com/v1"
RESEND_API = "https://api.resend.com/emails"


def clerk_password(pin: str) -> str:
    """Map the legacy six-digit UI credential into Clerk's password shape.

    This preserves the existing product UI during the provider migration. It
    does not add entropy; Clerk-side rate limiting and breached-password checks
    remain mandatory, and a future UI should collect a full passphrase.
    """

    return f"H3tu!{pin}#rank"


async def clerk_create_user(
    settings: Settings, *, username: str, email: str, name: str, pin: str
) -> dict[str, Any]:
    payload = {
        "username": username,
        "email_address": [email],
        "password": clerk_password(pin),
        "first_name": name,
        "public_metadata": {"hetu_auth_version": 1},
    }
    return await _clerk_request(settings, "POST", "/users", json=payload)


async def clerk_update_password(settings: Settings, *, user_id: str, pin: str) -> None:
    await _clerk_request(
        settings,
        "PATCH",
        f"/users/{user_id}",
        json={"password": clerk_password(pin), "sign_out_of_other_sessions": True},
    )


async def clerk_delete_user(settings: Settings, user_id: str) -> None:
    try:
        await _clerk_request(settings, "DELETE", f"/users/{user_id}")
    except HTTPException:
        pass


async def _clerk_request(
    settings: Settings, method: str, path: str, *, json: dict[str, Any] | None = None
) -> dict[str, Any]:
    if not settings.clerk_secret_key:
        raise HTTPException(status_code=503, detail="Clerk is not configured")
    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(
                method, f"{CLERK_API}{path}", headers=headers, json=json
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Clerk is temporarily unavailable") from exc
    if response.is_success:
        return response.json() if response.content else {}
    try:
        body = response.json()
        errors = body.get("errors") or []
        detail = errors[0].get("long_message") or errors[0].get("message") if errors else None
    except (ValueError, AttributeError, IndexError):
        detail = None
    code = status.HTTP_409_CONFLICT if response.status_code in {409, 422} else 502
    raise HTTPException(status_code=code, detail=detail or "Clerk rejected the request")


def create_reset_token(settings: Settings, *, user_id: str, ttl_seconds: int = 3600) -> str:
    secret = _token_secret(settings)
    payload = {"sub": user_id, "exp": int(time.time()) + ttl_seconds, "purpose": "pin-reset"}
    encoded = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64(hmac.new(secret, encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def verify_reset_token(settings: Settings, token: str) -> str:
    secret = _token_secret(settings)
    try:
        encoded, signature = token.split(".", 1)
        expected = _b64(hmac.new(secret, encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(_unb64(encoded))
        if payload.get("purpose") != "pin-reset" or int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError
        return user_id
    except (ValueError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired") from None


async def send_email(
    settings: Settings, *, to: str, subject: str, html: str, text: str
) -> tuple[bool, str | None]:
    if not settings.resend_api_key or not settings.mail_from:
        return False, "Email delivery is not configured"
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": settings.mail_from,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(RESEND_API, headers=headers, json=payload)
        if response.is_success:
            return True, None
        return False, f"Resend returned {response.status_code}"
    except httpx.HTTPError as exc:
        return False, str(exc)


def _token_secret(settings: Settings) -> bytes:
    if not settings.auth_token_secret:
        raise HTTPException(status_code=503, detail="Authentication tokens are not configured")
    return settings.auth_token_secret.get_secret_value().encode()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _unb64(value: str) -> str:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded).decode()
