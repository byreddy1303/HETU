from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services import recovery
from app.services.recovery_engine import Mode

router = APIRouter()


@router.get("")
async def overview(
    identity: CurrentUser,
    db: DbDep,
    mode: Mode = "minutes-20",
    subject: str | None = Query(default=None, max_length=160),
    days: int = Query(default=7, ge=1, le=30),
) -> dict:
    return await recovery.recovery_overview(
        db, owner_id=identity.user_id, mode=mode, subject=subject, days=days
    )


@router.get("/items/{item_id}")
async def item(
    item_id: str,
    identity: CurrentUser,
    db: DbDep,
    cursor: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> dict:
    return await recovery.item_detail(
        db, owner_id=identity.user_id, item_id=item_id, cursor=cursor, limit=limit
    )


@router.post("/attempts/{attempt_id}/capture")
async def capture(
    attempt_id: str, identity: CurrentUser, db: DbDep, question_id: str | None = None
) -> dict | None:
    result = await recovery.capture_attempt(
        db, owner_id=identity.user_id, attempt_id=attempt_id, question_id=question_id
    )
    await db.commit()
    return result


@router.post("/attempts/{attempt_id}/analysis")
async def analysis(attempt_id: str, identity: CurrentUser, db: DbDep) -> dict | None:
    result = await recovery.complete_analysis(db, owner_id=identity.user_id, attempt_id=attempt_id)
    await db.commit()
    return result


@router.post("/questions/{question_id}/schedule")
async def schedule(question_id: str, identity: CurrentUser, db: DbDep) -> dict:
    result = await recovery.schedule_question(
        db, owner_id=identity.user_id, question_id=question_id
    )
    await db.commit()
    return result


@router.post("/reconcile")
async def reconcile(
    identity: CurrentUser,
    db: DbDep,
    cursor: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> dict:
    result = await recovery.reconcile_recovery(
        db, owner_id=identity.user_id, cursor=cursor, limit=limit
    )
    await db.commit()
    return result


@router.post("/sessions")
async def start(
    payload: recovery.SessionStart, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await recovery.start_session(
        db, owner_id=identity.user_id, draft=payload, app_url=settings.app_url
    )
    await db.commit()
    return result


@router.get("/sessions")
async def sessions(
    identity: CurrentUser,
    db: DbDep,
    resumable_only: bool = False,
    cursor: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> dict:
    return await recovery.list_sessions(
        db, owner_id=identity.user_id, resumable_only=resumable_only, cursor=cursor, limit=limit
    )


@router.get("/sessions/{session_id}")
async def session(session_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await recovery.get_session(db, owner_id=identity.user_id, session_id=session_id)


@router.post("/sessions/{session_id}/checkpoint")
async def checkpoint(
    session_id: str, payload: recovery.SessionCheckpoint, identity: CurrentUser, db: DbDep
) -> dict:
    result = await recovery.checkpoint_session(
        db, owner_id=identity.user_id, session_id=session_id, draft=payload
    )
    await db.commit()
    return result


@router.post("/sessions/{session_id}/hint")
async def hint(
    session_id: str, payload: recovery.SessionCommand, identity: CurrentUser, db: DbDep
) -> dict:
    result = await recovery.reveal_hint(
        db, owner_id=identity.user_id, session_id=session_id, draft=payload
    )
    await db.commit()
    return result


@router.post("/sessions/{session_id}/defer")
async def defer(
    session_id: str, payload: recovery.SessionDefer, identity: CurrentUser, db: DbDep
) -> dict:
    result = await recovery.defer_item(
        db, owner_id=identity.user_id, session_id=session_id, draft=payload
    )
    await db.commit()
    return result


@router.post("/sessions/{session_id}/answers")
async def answer(
    session_id: str,
    payload: recovery.RecoveryAnswer,
    identity: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> dict:
    result = await recovery.record_answer(
        db,
        owner_id=identity.user_id,
        session_id=session_id,
        draft=payload,
        app_url=settings.app_url,
    )
    await db.commit()
    return result


@router.post("/items/{item_id}/remediation")
async def remediation(
    item_id: str, payload: recovery.RemediationDraft, identity: CurrentUser, db: DbDep
) -> dict:
    result = await recovery.remediate(db, owner_id=identity.user_id, item_id=item_id, draft=payload)
    await db.commit()
    return result


@router.post("/items/{item_id}/transfer")
async def transfer(
    item_id: str, payload: recovery.TransferDraft, identity: CurrentUser, db: DbDep
) -> dict:
    result = await recovery.assign_transfer(
        db, owner_id=identity.user_id, item_id=item_id, draft=payload
    )
    await db.commit()
    return result
