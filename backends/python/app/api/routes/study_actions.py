from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.core.config import get_settings
from app.services.realtime import broker
from app.services.study_actions import StudyAction, execute_action

router = APIRouter()


@router.post("")
async def study_action(draft: StudyAction, identity: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await execute_action(
        db,
        owner_id=identity.user_id,
        draft=draft,
        app_url=get_settings().app_url,
    )
    await db.commit()
    if result.get("record") and not result["idempotent_replay"]:
        record = result["record"]
        event = (
            {"type": "record.deleted", "collection": result["collection"], "id": record["id"]}
            if record.get("deleted_at")
            else {
                "type": "record.updated",
                "collection": result["collection"],
                "record": record,
            }
        )
        await broker.publish(identity.user_id, event)
    return result
