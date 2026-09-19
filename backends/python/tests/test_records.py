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
