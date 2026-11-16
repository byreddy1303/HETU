from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, DbDep
from app.api.routes.local_learning_engine import require_local_workspace
from app.services import practice_coach as service
from app.services.records import to_api
from app.services.study_memory import _owned

router = APIRouter(dependencies=[Depends(require_local_workspace)])


@router.get("")
async def overview(identity: CurrentUser, db: DbDep):
    return await service.overview(db, identity.user_id)


@router.get("/strategy")
async def strategy(identity: CurrentUser, db: DbDep, session_id: str | None = None):
    return await service.strategy(db, identity.user_id, session_id=session_id)


@router.get("/applications/{session_id}/conditions")
async def application_conditions(session_id: str, identity: CurrentUser, db: DbDep):
    return await service.application_conditions(db, identity.user_id, session_id)


@router.put("/applications/{session_id}/conditions")
async def save_application_conditions(
    session_id: str, payload: service.ApplicationConditions, identity: CurrentUser, db: DbDep
):
    result = await service.application_conditions(db, identity.user_id, session_id, payload)
    await db.commit()
    return result


@router.put("/strategy")
async def save_strategy(payload: service.Strategy, identity: CurrentUser, db: DbDep):
    result = await service.strategy(db, identity.user_id, payload)
    await db.commit()
    return result


@router.post("/prepare")
async def prepare(identity: CurrentUser, db: DbDep):
    result = await service.prepare(db, identity.user_id)
    await db.commit()
    return result


@router.put("/focus")
async def focus(payload: service.RepairFocus, identity: CurrentUser, db: DbDep):
    result = await service.save_focus(db, identity.user_id, payload)
    await db.commit()
    return result


@router.put("/packs/{key}/assessment")
async def assessment(key: str, payload: service.RepairAssessment, identity: CurrentUser, db: DbDep):
    result = await service.assess_repair(db, identity.user_id, key, payload)
    await db.commit()
    return result


@router.post("/authored-packs")
async def authored(payload: service.AuthoredPack, identity: CurrentUser, db: DbDep):
    result = await service.prepare(db, identity.user_id, payload)
    await db.commit()
    return result


@router.get("/packs/{key}")
async def pack(key: str, identity: CurrentUser, db: DbDep):
    return service.pack_view(
        await service.get_pack(db, identity.user_id, key), await service.today(db, identity.user_id)
    )


@router.put("/packs/{key}/draft")
async def draft(key: str, payload: service.PackDraft, identity: CurrentUser, db: DbDep):
    result = await service.save_pack_draft(db, identity.user_id, key, payload)
    await db.commit()
    return result


@router.post("/packs/{key}/start")
async def start(key: str, identity: CurrentUser, db: DbDep):
    result = await service.start_round(db, identity.user_id, key)
    await db.commit()
    return result


@router.post("/packs/{key}/answers")
async def answer(key: str, payload: service.Answer, identity: CurrentUser, db: DbDep):
    result = await service.submit_answer(db, identity.user_id, key, payload)
    await db.commit()
    return result


@router.put("/traps/{group_id}")
async def trap(group_id: str, payload: service.Trap, identity: CurrentUser, db: DbDep):
    result = await service.save_trap(db, identity.user_id, group_id, payload)
    await db.commit()
    return result


@router.get("/signals/{attempt_id}")
async def signal(attempt_id: str, identity: CurrentUser, db: DbDep):
    row = await _owned(
        db, identity.user_id, service.COLLECTION, service.identity("signal", attempt_id)
    )
    return to_api(row) if row else {"version": 0, "flag": "none", "note": ""}


@router.put("/signals/{attempt_id}")
async def update_signal(attempt_id: str, payload: service.Signal, identity: CurrentUser, db: DbDep):
    result = await service.save_signal(db, identity.user_id, attempt_id, payload)
    await db.commit()
    return result


@router.get("/sessions/{session_id}/review")
async def review(session_id: str, identity: CurrentUser, db: DbDep):
    return await service.review(db, identity.user_id, session_id)


@router.post("/sessions/{session_id}/review")
async def reflect(session_id: str, payload: service.Reflection, identity: CurrentUser, db: DbDep):
    result = await service.reflect(db, identity.user_id, session_id, payload)
    await db.commit()
    return result


@router.post("/batches")
async def batch(payload: service.NotebookBatch, identity: CurrentUser, db: DbDep):
    result = await service.save_batch(db, identity.user_id, payload)
    await db.commit()
    return result


@router.get("/batches/{key}")
async def saved_batch(key: str, identity: CurrentUser, db: DbDep):
    await service.ensure_no_exam(db, identity.user_id)
    row = await _owned(db, identity.user_id, service.COLLECTION, key)
    if not row or row.data.get("kind") != "batch":
        raise HTTPException(404, "Notebook session not found")
    photo = await _owned(db, identity.user_id, service.COLLECTION, service.identity("photo", key))
    return {**to_api(row), "attachment": photo.data["attachment"] if photo else None}


@router.post("/plan")
async def plan(identity: CurrentUser, db: DbDep, budget: int = Query(20)):
    result = await service.daily_plan(db, identity.user_id, budget)
    await db.commit()
    return result


class Step(BaseModel):
    step: str
    expected_version: int = Field(ge=1)


@router.put("/plan/{key}")
async def step(key: str, payload: Step, identity: CurrentUser, db: DbDep):
    result = await service.complete_plan_step(
        db, identity.user_id, key, payload.step, payload.expected_version
    )
    await db.commit()
    return result
