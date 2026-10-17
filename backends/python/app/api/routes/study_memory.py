from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep
from app.services.study_history import HistoryCollection, get_history_detail, list_history
from app.services.study_memory import (
    ExamSubmissionDraft,
    MemoryKind,
    MemoryState,
    StudyMemoryDraft,
    commit_exam,
    context_for_attempt,
    export_memory,
    get_entry,
    list_entries,
    save_entry,
)

router = APIRouter()


@router.get("/history")
async def history(
    identity: CurrentUser,
    db: DbDep,
    q: str | None = Query(default=None, max_length=300),
    subject: str | None = Query(default=None, max_length=160),
    topic: str | None = Query(default=None, max_length=300),
    question_uid: str | None = Query(default=None, max_length=300),
    session_id: str | None = Query(default=None, max_length=128),
    collection: HistoryCollection | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await list_history(
        db,
        owner_id=identity.user_id,
        q=q,
        subject=subject,
        topic=topic,
        question_uid=question_uid,
        session_id=session_id,
        collection=collection,
        limit=limit,
        offset=offset,
    )


@router.get("/history/{collection}/{record_id}")
async def history_detail(collection: str, record_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await get_history_detail(
        db, owner_id=identity.user_id, collection=collection, record_id=record_id
    )


@router.post("/exams/submit")
async def submit_exam(payload: ExamSubmissionDraft, identity: CurrentUser, db: DbDep) -> dict:
    result = await commit_exam(db, owner_id=identity.user_id, draft=payload)
    await db.commit()
    return result


@router.get("/entries")
async def entries(
    identity: CurrentUser,
    db: DbDep,
    q: str | None = Query(default=None, max_length=300),
    kind: MemoryKind | None = None,
    subject: str | None = Query(default=None, max_length=160),
    state: MemoryState | None = None,
    attempt_id: str | None = Query(default=None, max_length=128),
    session_id: str | None = Query(default=None, max_length=128),
    repair_id: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await list_entries(
        db,
        owner_id=identity.user_id,
        q=q,
        kind=kind,
        subject=subject,
        state=state,
        attempt_id=attempt_id,
        session_id=session_id,
        repair_id=repair_id,
        limit=limit,
        offset=offset,
    )


@router.get("/entries/{entry_id}")
async def detail(
    entry_id: str,
    identity: CurrentUser,
    db: DbDep,
    before_version: int | None = Query(default=None, ge=1),
) -> dict:
    return await get_entry(
        db, owner_id=identity.user_id, entry_id=entry_id, before_version=before_version
    )


@router.put("/entries/{entry_id}")
async def save(entry_id: str, payload: StudyMemoryDraft, identity: CurrentUser, db: DbDep) -> dict:
    result = await save_entry(db, owner_id=identity.user_id, entry_id=entry_id, draft=payload)
    await db.commit()
    return result


@router.get("/context")
async def context(
    identity: CurrentUser,
    db: DbDep,
    attempt_id: str = Query(min_length=1, max_length=128),
) -> dict:
    return await context_for_attempt(db, owner_id=identity.user_id, attempt_id=attempt_id)


@router.get("/export")
async def export(identity: CurrentUser, db: DbDep) -> dict:
    return await export_memory(db, owner_id=identity.user_id)
