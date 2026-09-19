from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.db.models import Record, RecordRevision, User
from app.schemas import RecordQuery
from app.services.records import (
    delete_record,
    patch_record,
    query_records,
    restore_record,
    upsert_records,
)


@pytest.mark.asyncio
async def test_delete_restore_preserves_every_revision(db):
    owner = str(uuid4())
    db.add(User(id=owner))
    await db.flush()
    (row,) = await upsert_records(
        db, collection="sessions", owner_id=owner, items=[{"id": "s1", "minutes": 45}]
    )
    await db.commit()
    await patch_record(
        db,
        collection="sessions",
        owner_id=owner,
        external_id="s1",
        patch={"minutes": 60},
        expected_version=1,
    )
    await delete_record(
        db, collection="sessions", owner_id=owner, external_id="s1", expected_version=2
    )
    await db.commit()
    assert row.data["minutes"] == 60
    assert await db.get(Record, row.id) is not None
    assert (await query_records(db, collection="sessions", owner_id=owner, query=RecordQuery()))[
        0
    ] == []
    with pytest.raises(HTTPException) as exc:
        await upsert_records(
            db, collection="sessions", owner_id=owner, items=[{"id": "s1", "minutes": 45}]
        )
    assert exc.value.status_code == 409
    await restore_record(
        db, collection="sessions", owner_id=owner, external_id="s1", revision=1, expected_version=3
    )
    await db.commit()
    assert row.version == 4
    assert row.data == {"minutes": 45}
    assert row.deleted_at is None
    revisions = list(await db.scalars(select(RecordRevision).order_by(RecordRevision.version)))
    assert [r.version for r in revisions] == [1, 2, 3, 4]
    assert [r.snapshot["minutes"] for r in revisions] == [45, 60, 60, 45]


@pytest.mark.asyncio
async def test_blind_writes_and_cross_owner_restore_rejected(db):
    db.add_all([User(id="owner"), User(id="other")])
    await db.flush()
    await upsert_records(
        db, collection="questions", owner_id="owner", items=[{"id": "q1", "answer": "original"}]
    )
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await upsert_records(
            db, collection="questions", owner_id="owner", items=[{"id": "q1", "answer": "lost"}]
        )
    assert exc.value.status_code == 428
    with pytest.raises(HTTPException) as exc:
        await delete_record(db, collection="questions", owner_id="owner", external_id="q1")
    assert exc.value.status_code == 428
    with pytest.raises(HTTPException) as exc:
        await restore_record(
            db,
            collection="questions",
            owner_id="other",
            external_id="q1",
            revision=1,
            expected_version=1,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_rollback_retains_original_and_no_partial_history(db):
    db.add(User(id="owner"))
    await db.flush()
    (row,) = await upsert_records(
        db, collection="questions", owner_id="owner", items=[{"id": "q1", "answer": "original"}]
    )
    await db.commit()
    row_id = row.id
    await patch_record(
        db,
        collection="questions",
        owner_id="owner",
        external_id="q1",
        patch={"answer": "uncommitted"},
        expected_version=1,
    )
    await db.rollback()
    row = await db.get(Record, row_id)
    assert row.data["answer"] == "original"
    assert len(list(await db.scalars(select(RecordRevision)))) == 1
