from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db.models import User
from app.services.workflows import (
    BriefStart,
    BriefUpdate,
    get_workflow,
    list_workflows,
    start_workflow,
    update_workflow,
)


@pytest.mark.asyncio
async def test_task_brief_retains_corrections_receipts_and_retry_state(db) -> None:
    db.add_all([User(id="user-a"), User(id="user-b")])
    await db.commit()
    start = BriefStart(
        idempotency_key="work-os-week-1",
        goal="Improve OS retention before the next mock",
        constraints=["Two hours on weekdays"],
        pending_steps=["Inspect OS mistakes", "Choose review work"],
        success_criteria=["Unaided recall after a delay"],
    )
    first = await start_workflow(db, owner_id="user-a", start=start, app_url="https://hetu.test")
    await db.commit()
    retry = await start_workflow(db, owner_id="user-a", start=start, app_url="https://hetu.test")
    assert retry["idempotent_replay"] is True
    assert retry["id"] == first["id"]

    update = BriefUpdate(
        expected_version=1,
        operation_id="inspect-os-mistakes",
        correction="Focus on paging, not all of OS",
        completed_step="Inspect OS mistakes",
        remove_pending_step="Inspect OS mistakes",
        receipt={"question_ids": ["q1"], "status": "inspected"},
    )
    changed = await update_workflow(db, owner_id="user-a", workflow_id=first["id"], update=update)
    await db.commit()
    assert changed["version"] == 2
    assert changed["corrections"] == ["Focus on paging, not all of OS"]
    assert changed["pending_steps"] == ["Choose review work"]
    assert changed["receipts"][0]["result"]["question_ids"] == ["q1"]
    assert (await update_workflow(db, owner_id="user-a", workflow_id=first["id"], update=update))[
        "idempotent_replay"
    ] is True
    assert (await get_workflow(db, owner_id="user-a", workflow_id=first["id"]))["version"] == 2
    assert len(await list_workflows(db, owner_id="user-a")) == 1
    assert await list_workflows(db, owner_id="user-b") == []
    with pytest.raises(HTTPException) as stale:
        await update_workflow(
            db,
            owner_id="user-a",
            workflow_id=first["id"],
            update=BriefUpdate(
                expected_version=1, operation_id="choose-review-work", pending_step="Review paging"
            ),
        )
    assert stale.value.status_code == 409
