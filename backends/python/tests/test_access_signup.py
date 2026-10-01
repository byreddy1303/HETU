from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.routes import access
from app.core.config import Settings
from app.db.models import Invite, User, UserIdentity
from app.schemas import SignupRequest


@pytest.mark.asyncio
async def test_invite_signup_creates_clerk_mapping_and_consumes_invite(db, monkeypatch) -> None:
    db.add(User(id="owner"))
    invite = Invite(
        id="invite-id",
        token="a" * 32,
        issued_by="owner",
        email="student@example.com",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    db.add(invite)
    await db.commit()

    calls: list[dict[str, object]] = []

    async def create_user(settings: Settings, **values: object) -> dict[str, str]:
        calls.append(values)
        return {"id": "clerk-new-user"}

    async def delete_user(settings: Settings, user_id: str) -> None:
        raise AssertionError("a successful signup must not be rolled back")

    monkeypatch.setattr(access, "clerk_create_user", create_user)
    monkeypatch.setattr(access, "clerk_delete_user", delete_user)

    preview = await access.inspect_invite(invite.token, db)
    result = await access.signup_from_invite(
        SignupRequest(
            invite_token=invite.token,
            email="STUDENT@example.com",
            name="Student Name",
            username="student_1",
            password="a-long-test-password",
        ),
        db,
        Settings(),
    )

    assert preview == {"valid": True, "email": invite.email}
    user = await db.get(User, result["user_id"])
    mapping = await db.scalar(select(UserIdentity).where(UserIdentity.subject == "clerk-new-user"))
    await db.refresh(invite)
    assert user is not None
    assert (user.email, user.username, user.display_name) == (
        "student@example.com",
        "student_1",
        "Student Name",
    )
    assert mapping is not None and mapping.user_id == user.id
    assert invite.used_by == user.id and invite.used_at is not None
    assert calls == [
        {
            "user_id": user.id,
            "username": "student_1",
            "email": "student@example.com",
            "name": "Student Name",
            "password": "a-long-test-password",
            "email_verified": True,
        }
    ]


@pytest.mark.asyncio
async def test_invite_signup_rejects_wrong_email_and_reuse(db, monkeypatch) -> None:
    db.add(User(id="owner"))
    invite = Invite(
        id="invite-id",
        token="b" * 32,
        issued_by="owner",
        email="right@example.com",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    db.add(invite)
    await db.commit()

    async def unused_create_user(*args: object, **kwargs: object) -> dict[str, str]:
        raise AssertionError("Clerk must not be called for a mismatched invite")

    monkeypatch.setattr(access, "clerk_create_user", unused_create_user)
    payload = SignupRequest(
        invite_token=invite.token,
        email="wrong@example.com",
        name="Student",
        username="student_2",
        password="a-long-test-password",
    )

    with pytest.raises(HTTPException) as mismatch:
        await access.signup_from_invite(payload, db, Settings())
    assert mismatch.value.status_code == 400

    invite.used_by = "already-used"
    await db.commit()
    with pytest.raises(HTTPException) as reused:
        await access.inspect_invite(invite.token, db)
    assert reused.value.status_code == 404


@pytest.mark.asyncio
async def test_expired_invite_is_not_revealed_or_accepted(db) -> None:
    db.add(User(id="owner"))
    invite = Invite(
        id="expired-id",
        token="c" * 32,
        issued_by="owner",
        email="student@example.com",
        expires_at=datetime.now(UTC) - timedelta(seconds=1),
    )
    db.add(invite)
    await db.commit()

    with pytest.raises(HTTPException) as exc_info:
        await access.inspect_invite(invite.token, db)
    assert exc_info.value.status_code == 404
