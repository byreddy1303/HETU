from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.learning_library import (
    CaptureRequest,
    InsightRevision,
    capture_learning,
    learning_detail,
    revise_insight,
    search_learning,
)

router = APIRouter()


@router.post("/captures")
async def save_capture(
    payload: CaptureRequest, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await capture_learning(
        db, owner_id=identity.user_id, request=payload, app_url=settings.app_url
    )
    await db.commit()
    return result


@router.get("/search")
async def search(
    identity: CurrentUser,
    db: DbDep,
    q: str = Query(default="", max_length=300),
    subject: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await search_learning(
        db, owner_id=identity.user_id, text=q, subject=subject, limit=limit, offset=offset
    )


@router.get("/concepts/{concept_id}")
async def concept(
    concept_id: str,
    identity: CurrentUser,
    db: DbDep,
    include_history: bool = False,
) -> dict:
    return await learning_detail(
        db, owner_id=identity.user_id, concept_id=concept_id, include_history=include_history
    )


@router.patch("/insights/{insight_id}")
async def edit_insight(
    insight_id: str, payload: InsightRevision, identity: CurrentUser, db: DbDep
) -> dict:
    result = await revise_insight(
        db, owner_id=identity.user_id, insight_id=insight_id, revision=payload
    )
    await db.commit()
    return result
