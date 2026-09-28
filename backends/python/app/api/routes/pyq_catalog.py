from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.db.models import PyqCatalogQuestion
from app.services.pyq_catalog import active_bank, question_payload

router = APIRouter()


@router.get("/manifest")
async def get_manifest(identity: CurrentUser, db: DbDep) -> dict:
    del identity
    return (await active_bank(db)).manifest


@router.get("/subjects/{subject_slug}")
async def get_subject(
    subject_slug: str,
    identity: CurrentUser,
    db: DbDep,
    bank_version: str | None = Query(default=None),
) -> dict:
    del identity
    bank = await active_bank(db)
    if bank_version and bank_version != bank.version:
        raise HTTPException(status_code=409, detail="The PYQ catalog version has changed")
    questions = list(
        await db.scalars(
            select(PyqCatalogQuestion)
            .where(
                PyqCatalogQuestion.bank_version == bank.version,
                PyqCatalogQuestion.subject_slug == subject_slug,
            )
            .order_by(
                PyqCatalogQuestion.year,
                PyqCatalogQuestion.paper_label,
                PyqCatalogQuestion.id,
            )
        )
    )
    if not questions:
        raise HTTPException(status_code=404, detail="Unknown PYQ subject")
    return {
        "bankVersion": bank.version,
        "subject": questions[0].subject,
        "questions": [question_payload(question) for question in questions],
    }


@router.get("/questions/{question_uid:path}")
async def get_question(question_uid: str, identity: CurrentUser, db: DbDep) -> dict:
    del identity
    bank = await active_bank(db)
    question = await db.scalar(
        select(PyqCatalogQuestion).where(
            PyqCatalogQuestion.bank_version == bank.version,
            PyqCatalogQuestion.question_uid == question_uid,
        )
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Unknown PYQ question")
    return question_payload(question)
