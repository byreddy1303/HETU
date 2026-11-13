from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbDep
from app.api.routes.local_learning_engine import require_local_workspace
from app.services import skill_coach as service
from app.services.memory_learning_engine import reconcile_engine_results

router = APIRouter(dependencies=[Depends(require_local_workspace)])


@router.get("")
async def skills(identity: CurrentUser, db: DbDep) -> dict:
    return await service.list_skills(db, owner_id=identity.user_id)


@router.get("/day/{day}")
async def day_preferences(day: date, identity: CurrentUser, db: DbDep) -> dict:
    return await service.get_day(db, identity.user_id, day)


@router.put("/day/{day}")
async def save_day(
    day: date, payload: service.DayPreferences, identity: CurrentUser, db: DbDep
) -> dict:
    result = await service.save_day(db, identity.user_id, day, payload)
    await db.commit()
    return result


@router.post("/reconcile")
async def reconcile(identity: CurrentUser, db: DbDep) -> dict:
    result = await reconcile_engine_results(db, owner_id=identity.user_id)
    await db.commit()
    return {"reconciled": result}


@router.post("/{skill_id}/diagnoses")
async def start(
    skill_id: str, payload: service.StartDiagnosis, identity: CurrentUser, db: DbDep
) -> dict:
    result = await service.start_diagnosis(
        db, owner_id=identity.user_id, skill_id=skill_id, draft=payload
    )
    await db.commit()
    return result


@router.get("/diagnoses/{entry_id}")
async def diagnosis(entry_id: str, identity: CurrentUser, db: DbDep) -> dict:
    await service.ensure_no_exam(db, identity.user_id)
    return service.diagnosis_view(await service._diagnosis(db, identity.user_id, entry_id))


@router.put("/diagnoses/{entry_id}")
async def update(
    entry_id: str, payload: service.DiagnosisDraft, identity: CurrentUser, db: DbDep
) -> dict:
    result = await service.update_diagnosis(
        db, owner_id=identity.user_id, entry_id=entry_id, draft=payload
    )
    await db.commit()
    return result


@router.post("/diagnoses/{entry_id}/confirm")
async def confirm(
    entry_id: str, payload: service.ConfirmDiagnosis, identity: CurrentUser, db: DbDep
) -> dict:
    result = await service.confirm_diagnosis(
        db, owner_id=identity.user_id, entry_id=entry_id, draft=payload
    )
    await db.commit()
    return result


@router.put("/sessions/{session_id}/conditions")
async def conditions(
    session_id: str, payload: service.SessionConditions, identity: CurrentUser, db: DbDep
) -> dict:
    result = await service.save_conditions(db, identity.user_id, session_id, payload)
    await db.commit()
    return result
