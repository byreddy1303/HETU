from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import Identity
from app.db.models import User, UserIdentity
from app.services.identities import resolve_identity
from app.services.records import lock_identity


@pytest.mark.asyncio
async def test_mapped_account_reads_do_not_wait_for_identity_write_lock() -> None:
    url = os.getenv("HETU_TEST_DATABASE_URL")
    if not url:
        pytest.skip("HETU_TEST_DATABASE_URL is required for the PostgreSQL concurrency check")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    subject = "identity-concurrency-" + uuid4().hex
    user_id = str(uuid4())
    try:
        async with sessions() as setup:
            setup.add(User(id=user_id))
            setup.add(UserIdentity(user_id=user_id, provider="clerk", subject=subject))
            await setup.commit()
        async with sessions() as writer, sessions() as reader:
            await lock_identity(writer, "user_identities", "clerk", subject)
            resolved = await asyncio.wait_for(
                resolve_identity(reader, Identity(subject, provider_subject=subject)),
                timeout=2,
            )
            assert resolved.user_id == user_id
            assert resolved.provider_subject == subject
            await writer.rollback()
    finally:
        await engine.dispose()
