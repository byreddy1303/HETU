from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from svix.webhooks import Webhook, WebhookVerificationError

from app.api.deps import DbDep, SettingsDep
from app.db.models import User, WebhookReceipt
from app.services.jobs import create_job, enqueue_job

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
    except WebhookVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc
    try:
        event = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc

    event_id = str(event.get("id") or headers["svix-id"])
    if await db.get(WebhookReceipt, event_id):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    event_type = str(event.get("type", "unknown"))
    data = event.get("data") or {}
    clerk_id = data.get("id")
    if event_type in {"user.created", "user.updated"} and isinstance(clerk_id, str):
        user = await db.get(User, clerk_id)
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
        user.deleted_at = None
    purge_job = None
    if event_type == "user.deleted" and isinstance(clerk_id, str):
        user = await db.get(User, clerk_id)
        if user is None:
            user = User(id=clerk_id)
            db.add(user)
            await db.flush()
        user.deleted_at = datetime.now(UTC)
        purge_job = await create_job(
            db,
            kind="purge-user",
            payload={},
            owner_id=clerk_id,
            idempotency_key=f"clerk-delete:{event_id}",
        )

    db.add(WebhookReceipt(event_id=event_id, provider="clerk", event_type=event_type))
    await db.commit()
    if purge_job is not None:
        await enqueue_job(purge_job)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
