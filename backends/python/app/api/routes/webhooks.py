from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from svix.webhooks import Webhook, WebhookVerificationError

from app.api.deps import DbDep, SettingsDep
from app.db.models import User, WebhookReceipt
from app.services.records import lock_identity

router = APIRouter()


@router.post("/clerk", status_code=status.HTTP_204_NO_CONTENT)
async def clerk_webhook(
    request: Request,
    db: DbDep,
    settings: SettingsDep,
) -> Response:
    if not settings.clerk_webhook_secret:
        raise HTTPException(status_code=503, detail="Clerk webhooks are not configured")
    payload = await request.body()
    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    try:
        Webhook(settings.clerk_webhook_secret.get_secret_value()).verify(payload, headers)
    except (WebhookVerificationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc
    try:
        event = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc

    if not isinstance(event, dict) or not isinstance(event.get("data"), dict):
        raise HTTPException(status_code=400, detail="Invalid webhook event")
    event_id = headers["svix-id"]
    await lock_identity(db, "webhooks", "clerk", event_id)
    if await db.get(WebhookReceipt, event_id):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    event_type = str(event.get("type", "unknown"))
    data = event.get("data") or {}
    clerk_id = data.get("id")
    if isinstance(clerk_id, str):
        await lock_identity(db, "users", clerk_id, "identity")
    if event_type in {"user.created", "user.updated"} and isinstance(clerk_id, str):
        user = await db.get(User, clerk_id)
        if user is not None and user.deleted_at is not None:
            db.add(WebhookReceipt(event_id=event_id, provider="clerk", event_type=event_type))
            await db.commit()
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        if user is None:
            user = User(id=clerk_id)
            db.add(user)
        primary_email_id = data.get("primary_email_address_id")
        email_addresses = data.get("email_addresses") or []
        primary_email = next(
            (
                item.get("email_address")
                for item in email_addresses
                if item.get("id") == primary_email_id
            ),
            None,
        )
        user.email = primary_email
        user.username = data.get("username")
        names = [data.get("first_name"), data.get("last_name")]
        user.display_name = " ".join(name for name in names if name) or None
        # A delayed update must never resurrect a deleted identity.
    if event_type == "user.deleted" and isinstance(clerk_id, str):
        user = await db.get(User, clerk_id)
        if user is None:
            user = User(id=clerk_id)
            db.add(user)
            await db.flush()
        user.deleted_at = datetime.now(UTC)
        # Disable access, retain learning data and attachments. Erasure is a
        # separate reviewed operator workflow, never a webhook side effect.

    db.add(WebhookReceipt(event_id=event_id, provider="clerk", event_type=event_type))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
