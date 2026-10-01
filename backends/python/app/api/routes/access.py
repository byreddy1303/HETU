from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from secrets import token_hex
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.db.models import AccessRequest, Invite, User, UserIdentity
from app.schemas import AccessRequestCreate, SignupRequest
from app.services.compat import is_owner
from app.services.integrations import clerk_create_user, clerk_delete_user, send_email

router = APIRouter()


async def _active_invite(db: DbDep, token: str, *, lock: bool = False) -> Invite:
    statement = select(Invite).where(Invite.token == token)
    if lock:
        statement = statement.with_for_update()
    invite = await db.scalar(statement)
    expires_at = invite.expires_at if invite else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if invite is None or invite.used_by or expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=404, detail="Invite is invalid, expired, or already used")
    return invite


@router.get("/invites/{token}")
async def inspect_invite(token: str, db: DbDep) -> dict[str, object]:
    invite = await _active_invite(db, token)
    return {"valid": True, "email": invite.email}


@router.post("/signup")
async def signup_from_invite(
    payload: SignupRequest, db: DbDep, settings: SettingsDep
) -> dict[str, object]:
    invite = await _active_invite(db, payload.invite_token, lock=True)
    email = payload.email.strip().lower()
    username = payload.username.strip().lower()
    if invite.email and invite.email.strip().lower() != email:
        raise HTTPException(
            status_code=400, detail="This invite belongs to a different email address"
        )
    if await db.scalar(select(User.id).where(func.lower(User.username) == username)):
        raise HTTPException(status_code=409, detail="That username is already in use")
    if await db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=409, detail="An account already uses that email address")

    user = User(
        id=str(uuid4()),
        email=email,
        username=username,
        display_name=payload.name.strip(),
    )
    db.add(user)
    await db.flush()
    clerk_user_id: str | None = None
    try:
        clerk_user = await clerk_create_user(
            settings,
            user_id=user.id,
            username=username,
            email=email,
            name=payload.name.strip(),
            password=payload.password,
            email_verified=bool(invite.email),
        )
        clerk_user_id = clerk_user.get("id")
        if not isinstance(clerk_user_id, str) or not clerk_user_id:
            raise HTTPException(status_code=502, detail="Clerk returned an invalid account")
        db.add(UserIdentity(user_id=user.id, provider="clerk", subject=clerk_user_id))
        invite.used_by = user.id
        invite.used_at = datetime.now(UTC)
        await db.commit()
    except Exception:
        await db.rollback()
        if clerk_user_id:
            await clerk_delete_user(settings, clerk_user_id)
        raise
    return {"ok": True, "user_id": user.id}


@router.post("/request")
async def create_access_request(
    payload: AccessRequestCreate, request: Request, db: DbDep, settings: SettingsDep
) -> dict[str, object]:
    if payload.website:
        return {"ok": True, "dedup": True}
    email = payload.email.strip().lower()
    since = datetime.now(UTC) - timedelta(hours=24)
    existing = await db.scalar(
        select(AccessRequest).where(
            func.lower(AccessRequest.email) == email,
            AccessRequest.status == "pending",
            AccessRequest.created_at >= since,
        )
    )
    if existing:
        return {"ok": True, "id": existing.id, "dedup": True}
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    ip = forwarded or (request.client.host if request.client else "unknown")
    row = AccessRequest(
        id=str(uuid4()),
        name=payload.name.strip(),
        email=email,
        purpose=payload.purpose.strip(),
        ip_hash=hashlib.sha256(ip.encode()).hexdigest(),
        user_agent=request.headers.get("user-agent", "")[:512],
    )
    db.add(row)
    await db.commit()
    if settings.owner_email:
        await send_email(
            settings,
            to=settings.owner_email,
            subject="New HETU access request",
            html=f"<p>{row.name} ({row.email}) requested access.</p><p>{row.purpose}</p>",
            text=f"{row.name} ({row.email}) requested access.\n\n{row.purpose}",
        )
    return {"ok": True, "id": row.id, "dedup": False}


@router.post("/{request_id}/approve")
async def approve_access_request(
    request_id: str, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict[str, object]:
    if not await is_owner(db, identity.user_id, settings):
        raise HTTPException(status_code=403, detail="Owner access required")
    row = await db.scalar(
        select(AccessRequest).where(AccessRequest.id == request_id).with_for_update()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {row.status}")
    invite = Invite(
        id=str(uuid4()),
        token=token_hex(16),
        issued_by=identity.user_id,
        email=row.email,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)
    row.status = "approved"
    row.invite_id = invite.id
    row.decided_by = identity.user_id
    row.decided_at = datetime.now(UTC)
    await db.commit()
    url = f"{settings.app_url.rstrip('/')}/signup?invite={invite.token}"
    sent, mail_error = await send_email(
        settings,
        to=row.email,
        subject="Your HETU invitation",
        html=(
            "<p>Your access request was approved.</p>"
            f'<p><a href="{url}">Create your account</a></p>'
        ),
        text=f"Your HETU access request was approved: {url}",
    )
    return {
        "ok": True,
        "invite_id": invite.id,
        "invite_url": url,
        "mail_sent": sent,
        "mail_error": mail_error,
    }


@router.post("/{request_id}/decline")
async def decline_access_request(
    request_id: str,
    payload: dict[str, object],
    identity: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> dict[str, object]:
    if not await is_owner(db, identity.user_id, settings):
        raise HTTPException(status_code=403, detail="Owner access required")
    row = await db.scalar(
        select(AccessRequest).where(AccessRequest.id == request_id).with_for_update()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {row.status}")
    reason = payload.get("reason")
    row.status = "declined"
    row.notes = str(reason)[:1000] if reason else row.notes
    row.decided_by = identity.user_id
    row.decided_at = datetime.now(UTC)
    await db.commit()
    sent = False
    mail_error = None
    if payload.get("notify", True):
        sent, mail_error = await send_email(
            settings,
            to=row.email,
            subject="HETU access request update",
            html="<p>Your HETU access request could not be approved at this time.</p>",
            text="Your HETU access request could not be approved at this time.",
        )
    return {"ok": True, "mail_sent": sent, "mail_error": mail_error}
