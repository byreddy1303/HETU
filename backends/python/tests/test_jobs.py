from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.db.models import BackgroundJob, FileObject, Record, User
from app.services.jobs import execute_job


@pytest.mark.asyncio
async def test_legacy_purge_job_cannot_destroy_data(db, monkeypatch) -> None:
    user = User(
        id="user_deleted",
        email="person@example.com",
        username="person",
        display_name="Person",
        profile={"timezone": "Asia/Kolkata"},
        deleted_at=datetime.now(UTC),
    )
    other = User(id="user_other")
    db.add_all([user, other])
    await db.flush()
    db.add_all(
        [
            Record(
                collection="sessions",
                owner_id=user.id,
                external_id="delete-me",
                data={},
            ),
            Record(
                collection="sessions",
                owner_id=other.id,
                external_id="keep-me",
                data={},
            ),
            FileObject(
                id="00000000-0000-4000-8000-000000000001",
                owner_id=user.id,
                object_key="users/user_deleted/file.png",
                original_name="file.png",
                content_type="image/png",
                status="ready",
            ),
        ]
    )
    job = BackgroundJob(
        id="00000000-0000-4000-8000-000000000002",
        kind="purge-user",
        owner_id=user.id,
        payload={},
        status="running",
        attempts=1,
    )
    db.add(job)
    await db.commit()

    delete_mock = AsyncMock()
    monkeypatch.setattr("app.services.storage.delete_object", delete_mock)
    await execute_job(db, job)

    assert await db.scalar(select(Record).where(Record.external_id == "delete-me")) is not None
    assert await db.scalar(select(Record).where(Record.external_id == "keep-me")) is not None
    assert await db.get(FileObject, "00000000-0000-4000-8000-000000000001") is not None
    delete_mock.assert_not_awaited()
    await db.refresh(user)
    assert user.email == "person@example.com"
    assert user.profile == {"timezone": "Asia/Kolkata"}
    assert user.deleted_at is not None
