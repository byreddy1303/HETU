from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.concept_review import (
    ReviewDraft,
    ReviewResponse,
    create_review,
    get_review,
    list_reviews,
    record_review_response,
)

router = APIRouter()


@router.post("")
async def create(
    payload: ReviewDraft, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await create_review(
        db, owner_id=identity.user_id, draft=payload, app_url=settings.app_url
    )
    await db.commit()
    return result


@router.get("")
async def recent(
    identity: CurrentUser,
    db: DbDep,
    concept_id: str | None = None,
    due_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[dict]:
    return await list_reviews(
        db,
        owner_id=identity.user_id,
        concept_id=concept_id,
        due_only=due_only,
        limit=limit,
    )


@router.get("/{review_id}")
async def detail(review_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await get_review(db, owner_id=identity.user_id, review_id=review_id)


@router.post("/{review_id}/responses")
async def respond(
    review_id: str, payload: ReviewResponse, identity: CurrentUser, db: DbDep
) -> dict:
    result = await record_review_response(
        db, owner_id=identity.user_id, review_id=review_id, response=payload
    )
    await db.commit()
    return result
