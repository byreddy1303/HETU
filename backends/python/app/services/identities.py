from __future__ import annotations

from dataclasses import replace

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Identity
from app.db.models import User, UserIdentity
from app.services.records import lock_identity


async def resolve_identity(db: AsyncSession, identity: Identity) -> Identity:
    """Resolve an external login subject to Hetu's permanent database user ID."""
    subject = identity.provider_subject or identity.user_id
    provider = identity.provider.strip().lower()
    if not provider or not subject:
        raise HTTPException(status_code=401, detail="Authentication identity missing")

    await lock_identity(db, "user_identities", provider, subject)
    mapping = await db.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == provider,
            UserIdentity.subject == subject,
        )
    )
    if mapping is None:
        # Preserve legacy rows that used the provider subject as the user id, but
        # never provision a new HETU account just because a provider session exists.
        user = await db.get(User, subject)
        if user is None:
            raise HTTPException(status_code=403, detail="This account is not authorized")
        mapping = UserIdentity(user_id=user.id, provider=provider, subject=subject)
        db.add(mapping)
    else:
        user = await db.get(User, mapping.user_id)
        if user is None:
            raise HTTPException(status_code=409, detail="Authentication mapping is invalid")

    if user.deleted_at is not None:
        await db.rollback()
        raise HTTPException(status_code=403, detail="This account has been deleted")

    # Assigning the SQL expression keeps the database clock authoritative.
    mapping.last_seen_at = func.now()
    await db.commit()
    return replace(
        identity,
        user_id=user.id,
        provider=provider,
        provider_subject=subject,
    )
