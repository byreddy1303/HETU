"""Recall queue and explicit catch-up for locally prepared learning work."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.api.routes.local_learning_engine import require_local_workspace
from app.services.learning_concept_bridge import (
    concept_queue_review,
    concept_review_queue,
    sync_learning_concept_reviews,
)

router = APIRouter()


class SyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repair_id: str | None = Field(default=None, min_length=1, max_length=128)


@router.post("/sync", dependencies=[Depends(require_local_workspace)])
async def sync(
    payload: SyncRequest, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await sync_learning_concept_reviews(
        db, owner_id=identity.user_id, app_url=settings.app_url, repair_id=payload.repair_id
    )
    await db.commit()
    return result


@router.get("/queue")
async def queue(
    identity: CurrentUser, db: DbDep, limit: int = Query(default=100, ge=1, le=100)
) -> dict:
    return await concept_review_queue(db, owner_id=identity.user_id, limit=limit)


@router.get("/reviews/{review_id}")
async def detail(review_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await concept_queue_review(db, owner_id=identity.user_id, review_id=review_id)
