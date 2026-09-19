"""Run only against a disposable database with migrations already applied."""

import asyncio
import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import EntityRevision, Record, RecordRevision, User
from app.services.records import patch_record, upsert_records

URL = os.getenv("HETU_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Requires disposable migrated PostgreSQL")


@pytest.mark.asyncio
async def test_concurrent_writers_and_database_guards():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
            user = await db.get(User, owner)
            user.profile = {"study_target": 120}
            await db.commit()
            history = list(
                await db.scalars(
                    select(EntityRevision)
                    .where(EntityRevision.entity == "users", EntityRevision.entity_id == owner)
                    .order_by(EntityRevision.id)
                )
            )
            assert len(history) == 2
            assert history[0].snapshot["profile"] == {}
            assert history[1].snapshot["profile"] == {"study_target": 120}

        async def create():
            async with factory() as db:
                rows = await upsert_records(
                    db,
                    collection="questions",
                    owner_id=owner,
                    items=[{"id": "q", "answer": "original"}],
                )
                await db.commit()
                return rows[0].id

        first, second = await asyncio.gather(create(), create())
        assert first == second

        async def update(value):
            async with factory() as db:
                try:
                    await patch_record(
                        db,
                        collection="questions",
                        owner_id=owner,
                        external_id="q",
                        patch={"answer": value},
                        expected_version=1,
                    )
                    await db.commit()
                    return 200
                except HTTPException as exc:
                    await db.rollback()
                    return exc.status_code

        assert sorted(await asyncio.gather(update("a"), update("b"))) == [200, 409]
        async with factory() as db:
            revisions = list(
                await db.scalars(select(RecordRevision).where(RecordRevision.record_id == first))
            )
            assert len(revisions) == 2
            assert revisions[0].snapshot["answer"] == "original"
        for sql in (
            "DELETE FROM records WHERE owner_id = :owner",
            "DELETE FROM users WHERE id = :owner",
            "DELETE FROM record_revisions WHERE owner_id = :owner",
            "UPDATE record_revisions SET version=99 WHERE owner_id = :owner",
            "UPDATE records SET data='{}'::jsonb WHERE owner_id = :owner",
            "TRUNCATE records CASCADE",
            "TRUNCATE entity_revisions",
        ):
            async with factory() as db:
                with pytest.raises(DBAPIError):
                    await db.execute(text(sql), {"owner": owner})
                await db.rollback()
        async with factory() as db:
            assert await db.scalar(select(Record).where(Record.id == first)) is not None
    finally:
        await engine.dispose()
