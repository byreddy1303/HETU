from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.security import Identity
from app.db.models import User, UserIdentity
from app.services.identities import resolve_identity


@pytest.mark.asyncio
async def test_new_provider_subject_gets_stable_internal_user_id(db) -> None:
    external = "user_clerk_subject"

    first = await resolve_identity(db, Identity(external, provider_subject=external))
    second = await resolve_identity(db, Identity(external, provider_subject=external))

    assert first.user_id == second.user_id
    assert first.user_id != external
    mapping = await db.scalar(select(UserIdentity))
    assert mapping is not None
    assert mapping.subject == external
    assert mapping.user_id == first.user_id


@pytest.mark.asyncio
async def test_legacy_user_ownership_is_preserved_when_mapping_is_created(db) -> None:
    db.add(User(id="legacy-clerk-subject"))
    await db.commit()

    identity = await resolve_identity(
        db, Identity("legacy-clerk-subject", provider_subject="legacy-clerk-subject")
    )

    assert identity.user_id == "legacy-clerk-subject"
    mapping = await db.scalar(select(UserIdentity))
    assert mapping is not None
    assert mapping.user_id == "legacy-clerk-subject"


@pytest.mark.asyncio
async def test_deleted_mapped_user_is_rejected(db) -> None:
    user = User(id="internal", deleted_at=datetime.now(UTC))
    db.add(user)
    db.add(UserIdentity(user_id="internal", provider="clerk", subject="deleted-subject"))
    await db.commit()

    with pytest.raises(HTTPException) as exc_info:
        await resolve_identity(db, Identity("deleted-subject", provider_subject="deleted-subject"))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_identity_response_uses_internal_user_id(db) -> None:
    resolved = await resolve_identity(
        db, Identity("provider-subject", provider_subject="provider-subject")
    )

    assert resolved.provider_subject == "provider-subject"
    assert resolved.user_id != resolved.provider_subject
