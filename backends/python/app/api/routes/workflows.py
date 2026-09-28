from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.workflows import (
    BriefStart,
    BriefUpdate,
    get_workflow,
    list_workflows,
    start_workflow,
    update_workflow,
)

router = APIRouter()


@router.post("")
async def create(
    payload: BriefStart, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await start_workflow(
        db, owner_id=identity.user_id, start=payload, app_url=settings.app_url
    )
    await db.commit()
    return result


@router.get("")
async def recent(
    identity: CurrentUser, db: DbDep, limit: int = Query(default=20, ge=1, le=100)
) -> list[dict]:
    return await list_workflows(db, owner_id=identity.user_id, limit=limit)


@router.get("/{workflow_id}")
async def detail(workflow_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await get_workflow(db, owner_id=identity.user_id, workflow_id=workflow_id)


@router.patch("/{workflow_id}")
async def update(workflow_id: str, payload: BriefUpdate, identity: CurrentUser, db: DbDep) -> dict:
    result = await update_workflow(
        db, owner_id=identity.user_id, workflow_id=workflow_id, update=payload
    )
    await db.commit()
    return result
