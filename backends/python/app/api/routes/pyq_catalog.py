from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.pyq_catalog import (
    active_bank,
    catalog_question,
    catalog_subject,
    question_payload,
    search_catalog,
)
from app.services.pyq_practice import PyqAttemptDraft, submit_pyq_attempt

router = APIRouter()


@router.post("/attempts")
async def submit_answer(
    payload: PyqAttemptDraft, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await submit_pyq_attempt(
        db, owner_id=identity.user_id, draft=payload, app_url=settings.app_url
    )
    await db.commit()
    return result


@router.get("/search")
async def search_questions(
    identity: CurrentUser,
    subject_slug: str | None = None,
    topic_slug: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    text: str = Query(default="", max_length=200),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    del identity
    return search_catalog(
        subject_slug=subject_slug,
        topic_slug=topic_slug,
        year_from=year_from,
        year_to=year_to,
        text=text,
        limit=limit,
        offset=offset,
    )


@router.get("/manifest")
async def get_manifest(identity: CurrentUser) -> dict:
    del identity
    return active_bank().manifest


@router.get("/subjects/{subject_slug}")
async def get_subject(
    subject_slug: str,
    identity: CurrentUser,
    bank_version: str | None = Query(default=None),
) -> dict:
    del identity
    bank = active_bank()
    if bank_version and bank_version != bank.version:
        raise HTTPException(status_code=409, detail="The PYQ catalog version has changed")
    questions = catalog_subject(subject_slug)
    return {
        "bankVersion": bank.version,
        "subject": questions[0].subject,
        "questions": [question_payload(question) for question in questions],
    }


@router.get("/questions/{question_uid:path}")
async def get_question(question_uid: str, identity: CurrentUser) -> dict:
    del identity
    payload = catalog_question(question_uid)
    payload.pop("bank_version")
    return payload
