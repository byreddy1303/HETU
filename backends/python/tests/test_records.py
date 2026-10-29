from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db.models import User
from app.schemas import QueryFilter, RecordQuery
from app.services.records import (
    delete_record,
    patch_record,
    query_records,
    to_api,
    upsert_records,
)


@pytest.mark.asyncio
async def test_records_are_owner_scoped_and_versioned(db) -> None:
    db.add_all([User(id="user_a"), User(id="user_b")])
    await db.flush()
    rows = await upsert_records(
        db,
        collection="sessions",
        owner_id="user_a",
        items=[{"id": "session-1", "subject": "Algorithms", "minutes": 45}],
    )
    await db.commit()
    assert to_api(rows[0])["version"] == 1

    own, _ = await query_records(
        db,
        collection="sessions",
        owner_id="user_a",
        query=RecordQuery(filters=[QueryFilter(field="subject", value="Algorithms")]),
    )
    other, _ = await query_records(
        db, collection="sessions", owner_id="user_b", query=RecordQuery()
    )
    assert [row.external_id for row in own] == ["session-1"]
    assert other == []

    updated = await patch_record(
        db,
        collection="sessions",
        owner_id="user_a",
        external_id="session-1",
        patch={"minutes": 50},
        expected_version=1,
    )
    await db.commit()
    assert updated.version == 2
    assert updated.data["minutes"] == 50

    with pytest.raises(HTTPException) as conflict:
        await patch_record(
            db,
            collection="sessions",
            owner_id="user_a",
            external_id="session-1",
            patch={"minutes": 60},
            expected_version=1,
        )
    assert conflict.value.status_code == 409


@pytest.mark.asyncio
async def test_append_only_evidence_rejects_mutation(db) -> None:
    db.add(User(id="user_a"))
    await db.flush()
    await upsert_records(
        db,
        collection="learning_events",
        owner_id="user_a",
        items=[{"id": "event-1", "event_type": "created"}],
    )
    await db.commit()

    with pytest.raises(HTTPException) as conflict:
        await upsert_records(
            db,
            collection="learning_events",
            owner_id="user_a",
            items=[{"id": "event-1", "event_type": "mastered"}],
        )
    assert conflict.value.status_code == 409

    with pytest.raises(HTTPException) as conflict:
        await delete_record(
            db,
            collection="learning_events",
            owner_id="user_a",
            external_id="event-1",
        )
    assert conflict.value.status_code == 409


@pytest.mark.asyncio
async def test_soft_deleted_record_restored_on_upsert(db) -> None:
    db.add(User(id="user_c"))
    await db.flush()
    # 1. Insert initial record
    rows = await upsert_records(
        db,
        collection="topic_progress",
        owner_id="user_c",
        items=[{"id": "topic-1", "subject": "TOC", "topic": "DFA / NFA"}],
    )
    await db.commit()
    assert rows[0].deleted_at is None
    assert rows[0].version == 1

    # 2. Delete the record (soft delete)
    await delete_record(
        db,
        collection="topic_progress",
        owner_id="user_c",
        external_id="topic-1",
        expected_version=1,
    )
    await db.commit()

    # Query should return nothing
    active, _ = await query_records(
        db, collection="topic_progress", owner_id="user_c", query=RecordQuery()
    )
    assert active == []

    # 3. Upsert again (re-ticking topic) - should restore cleanly without 409
    restored = await upsert_records(
        db,
        collection="topic_progress",
        owner_id="user_c",
        items=[
            {
                "id": "topic-1",
                "subject": "TOC",
                "topic": "DFA / NFA",
                "completed_at": "2026-10-15T00:00:00Z",
            }
        ],
    )
    await db.commit()
    assert len(restored) == 1
    assert restored[0].deleted_at is None
    assert restored[0].version == 3  # v1 insert, v2 delete, v3 restore
    assert restored[0].data["completed_at"] == "2026-10-15T00:00:00Z"

    # Query now returns restored record
    active_again, _ = await query_records(
        db, collection="topic_progress", owner_id="user_c", query=RecordQuery()
    )
    assert len(active_again) == 1
    assert active_again[0].external_id == "topic-1"
