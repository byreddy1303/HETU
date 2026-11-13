from dataclasses import replace
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import HTTPException
from test_memory_learning_engine import receipt

from app.db.models import Record, User
from app.services import skill_coach as coach
from app.services.memory_learning_engine import (
    _owned,
    prepare_engine_activity,
    reconcile_engine_results,
)
from app.services.pyq_catalog import active_bank
from app.services.skill_curriculum import (
    curriculum,
    mapped_uids,
    select_skill_questions,
    skill_by_id,
)
from app.services.study_memory import StudyMemoryDraft, save_entry


async def start(db, skill="cache-address-fields", request="first"):
    if not await db.get(User, "owner"):
        db.add_all([User(id="owner"), User(id="other")])
        await db.flush()
    return await coach.start_diagnosis(
        db, owner_id="owner", skill_id=skill, draft=coach.StartDiagnosis(request_id=request)
    )


async def completed(db, request="first"):
    view = await start(db, request=request)
    return await coach.update_diagnosis(
        db,
        owner_id="owner",
        entry_id=view["entry"]["id"],
        draft=coach.DiagnosisDraft(
            expected_version=view["entry"]["version"],
            answers={p["id"]: p["answer"] for p in skill_by_id("cache-address-fields")["probes"]},
            reasoning="The number of sets changes.",
            confidence="high",
            submit=True,
        ),
    )


async def repair(db):
    view = await completed(db)
    return await coach.confirm_diagnosis(
        db,
        owner_id="owner",
        entry_id=view["entry"]["id"],
        draft=coach.ConfirmDiagnosis(
            expected_version=view["entry"]["version"], cause="recognition"
        ),
    )


@pytest.mark.asyncio
async def test_blind_draft_resume_commit_replay_conflict_and_owner(db):
    view = await start(db)
    assert all("answer" not in p and "explanation" not in p for p in view["skill"]["probes"])
    assert "principle" not in view["skill"]
    assert (await start(db, request="new-request-after-reload"))["entry"]["id"] == view["entry"][
        "id"
    ]
    draft = coach.DiagnosisDraft(
        expected_version=1, answers={"direct": 0}, reasoning="work in progress"
    )
    saved = await coach.update_diagnosis(
        db, owner_id="owner", entry_id=view["entry"]["id"], draft=draft
    )
    replay = await coach.update_diagnosis(
        db, owner_id="owner", entry_id=view["entry"]["id"], draft=draft
    )
    assert replay["entry"]["version"] == saved["entry"]["version"]
    with pytest.raises(HTTPException) as conflict:
        await coach.update_diagnosis(
            db,
            owner_id="owner",
            entry_id=view["entry"]["id"],
            draft=draft.model_copy(update={"reasoning": "changed"}),
        )
    assert conflict.value.status_code == 409
    with pytest.raises(HTTPException):
        await coach._diagnosis(db, "other", view["entry"]["id"])
    done = await completed(db)
    assert done["entry"]["data"]["correct"] == 2
    assert all("answer" in p for p in done["skill"]["probes"])
    with pytest.raises(HTTPException):
        await coach.update_diagnosis(
            db,
            owner_id="owner",
            entry_id=done["entry"]["id"],
            draft=coach.DiagnosisDraft(
                expected_version=done["entry"]["version"],
                answers={"direct": 1, "four-way": 1},
                submit=True,
            ),
        )


@pytest.mark.asyncio
async def test_confirmation_reuses_one_repair_and_generic_write_cannot_forge_evidence(db):
    result = await repair(db)
    view = result["diagnosis"]
    entry = result["repair"]
    replay = await coach.confirm_diagnosis(
        db,
        owner_id="owner",
        entry_id=view["entry"]["id"],
        draft=coach.ConfirmDiagnosis(expected_version=1, cause="recognition"),
    )
    assert replay["repair"]["id"] == entry["id"]
    second = await completed(db, request="second")
    another = await coach.confirm_diagnosis(
        db,
        owner_id="owner",
        entry_id=second["entry"]["id"],
        draft=coach.ConfirmDiagnosis(
            expected_version=second["entry"]["version"], cause="uncertain"
        ),
    )
    assert another["repair"]["id"] == entry["id"]
    with pytest.raises(HTTPException):
        await save_entry(
            db,
            owner_id="owner",
            entry_id="forged",
            draft=StudyMemoryDraft(
                kind="verification",
                title="fake",
                data={"skill_id": "cache-address-fields", "fresh_question_check": True},
                expected_version=0,
            ),
        )


@pytest.mark.asyncio
async def test_exam_hold_and_day_choices_are_persistent_and_versioned(db):
    await start(db)
    db.add_all(
        [
            Record(
                owner_id="owner",
                collection="pyq_sessions",
                external_id="exam",
                data={"status": "paused", "config": {"mode": "exam"}},
            ),
            Record(
                owner_id="owner",
                collection="pyq_sessions",
                external_id="practice",
                data={"status": "paused", "config": {"mode": "practice"}},
            ),
        ]
    )
    await db.flush()
    with pytest.raises(HTTPException) as hold:
        await coach.list_skills(db, owner_id="owner")
    assert hold.value.status_code == 409
    with pytest.raises(HTTPException):
        await coach.save_day(
            db,
            "owner",
            date(2026, 11, 13),
            coach.DayPreferences(expected_version=0, parked_action_ids=["resume-practice:exam"]),
        )
    value = await coach.save_day(
        db,
        "owner",
        date(2026, 11, 13),
        coach.DayPreferences(
            expected_version=0, budget=60, parked_action_ids=["resume-practice:practice"]
        ),
    )
    assert value["budget"] == 60 and value["version"] == 1
    assert (await coach.get_day(db, "other", date(2026, 11, 13)))["parked_action_ids"] == []
    with pytest.raises(HTTPException):
        await coach.save_day(
            db, "owner", date(2026, 11, 13), coach.DayPreferences(expected_version=0, budget=45)
        )


def test_reviewed_curriculum_maps_thirty_questions_and_protects_exposure(monkeypatch):
    bank = active_bank()
    assert sum(len(s["questions"]) for s in curriculum()["skills"]) == 30
    for skill in curriculum()["skills"]:
        assert len(mapped_uids(skill["id"])) == len(skill["questions"])
        first = select_skill_questions(skill["id"], set())
        assert len(first) == 3
        assert not set(first) & set(select_skill_questions(skill["id"], set(first)))
    uid = curriculum()["skills"][0]["questions"][0]["uid"]
    monkeypatch.setitem(bank.by_uid, uid, replace(bank.by_uid[uid], source_hash="changed"))
    assert uid not in mapped_uids("cache-address-fields")


@pytest.mark.asyncio
async def test_completed_practice_reconciles_once_and_conditions_gate_independence(db):
    created = await repair(db)
    activity = created["repair"]
    selected = activity["data"]["question_uids"]
    session = Record(
        owner_id="owner",
        collection="pyq_sessions",
        external_id="practice",
        data={
            "status": "completed",
            "config": {"mode": "practice", "memoryRepairId": activity["id"]},
            "question_uids": selected,
        },
    )
    db.add(session)
    await db.flush()
    for i, uid in enumerate(selected):
        db.add(
            Record(
                owner_id="owner",
                collection="pyq_attempts",
                external_id=f"a{i}",
                data=receipt(uid, active_bank().by_uid[uid].answer, "practice"),
            )
        )
    await db.flush()
    assert await reconcile_engine_results(db, owner_id="owner") == 1
    assert await reconcile_engine_results(db, owner_id="owner") == 0
    original = await _owned(db, "owner", "study_memory", activity["id"])
    followup = await _owned(
        db, "owner", "study_memory", original.data["data"]["next_review_entry_id"]
    )
    assert followup.data["data"]["skill_id"] == "cache-address-fields"
    assert not set(selected) & set(followup.data["data"]["question_uids"])
    with pytest.raises(HTTPException) as early:
        await prepare_engine_activity(db, owner_id="owner", entry_id=followup.external_id)
    assert early.value.status_code == 409
    assert (await coach.list_skills(db, owner_id="owner"))["items"][0]["evidence"][
        "fresh_checks"
    ] == 0
    await coach.save_conditions(
        db, "owner", "practice", coach.SessionConditions(expected_version=0, assisted=False)
    )
    evidence = (await coach.list_skills(db, owner_id="owner"))["items"][0]["evidence"]
    assert evidence["fresh_checks"] == 1 and evidence["accurate_fresh_checks"] == 1
    assert evidence["delayed_checks"] == 0
    await coach.save_conditions(
        db, "owner", "practice", coach.SessionConditions(expected_version=1, assisted=True)
    )
    assert (await coach.list_skills(db, owner_id="owner"))["items"][0]["evidence"][
        "fresh_checks"
    ] == 0


@pytest.mark.asyncio
async def test_delay_requires_real_elapsed_time_and_repeated_work_is_not_fresh(db):
    created = await repair(db)
    entry = created["repair"]
    uids = entry["data"]["question_uids"]
    now = datetime.now(UTC)
    session = Record(
        owner_id="owner",
        collection="pyq_sessions",
        external_id="check",
        created_at=now,
        data={"question_uids": uids},
    )
    db.add(session)
    await db.flush()
    entry["data"]["interval_days"] = 3
    entry["created_at"] = now - timedelta(days=2)
    assert not (await coach.result_conditions(db, "owner", entry, session, []))["delay_satisfied"]
    entry["created_at"] = now - timedelta(days=4)
    assert (await coach.result_conditions(db, "owner", entry, session, []))["delay_satisfied"]
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="previous",
            created_at=now - timedelta(hours=1),
            data=receipt(uids[0], active_bank().by_uid[uids[0]].answer),
        )
    )
    await db.flush()
    assert not (await coach.result_conditions(db, "owner", entry, session, []))[
        "fresh_question_check"
    ]


@pytest.mark.asyncio
async def test_skill_session_is_bound_atomically_and_rejects_duplicate_and_changed_questions(db):
    from app.services.records import patch_record, upsert_records

    created = await repair(db)
    entry = created["repair"]
    payload = {
        "id": "session",
        "status": "active",
        "config": {"mode": "practice", "memoryRepairId": entry["id"]},
        "question_uids": entry["data"]["question_uids"],
    }
    rows = await upsert_records(db, collection="pyq_sessions", owner_id="owner", items=[payload])
    bound = await _owned(db, "owner", "study_memory", entry["id"])
    assert bound.data["data"]["active_session_id"] == "session"
    with pytest.raises(HTTPException) as duplicate:
        await upsert_records(
            db, collection="pyq_sessions", owner_id="owner", items=[{**payload, "id": "duplicate"}]
        )
    assert duplicate.value.status_code == 409
    with pytest.raises(HTTPException):
        await patch_record(
            db,
            collection="pyq_sessions",
            owner_id="owner",
            external_id="session",
            patch={"question_uids": []},
            expected_version=rows[0].version,
        )
    saved = await patch_record(
        db,
        collection="pyq_sessions",
        owner_id="owner",
        external_id="session",
        patch={"status": "paused"},
        expected_version=rows[0].version,
    )
    assert saved.data["status"] == "paused"


@pytest.mark.asyncio
async def test_recent_results_do_not_hide_unfinished_repair(db):
    from app.services.memory_learning_engine import AUTOMATION, list_engine_actions

    created = await repair(db)
    db.add_all(
        [
            Record(
                owner_id="owner",
                collection="study_memory",
                external_id=f"history-{i}",
                data={
                    "kind": "verification",
                    "state": "completed",
                    "data": {"automation": AUTOMATION},
                },
            )
            for i in range(105)
        ]
    )
    await db.flush()
    result = await list_engine_actions(db, owner_id="owner")
    assert [row["id"] for row in result["items"]] == [created["repair"]["id"]]
    assert len(result["latest_results"]) == 10


@pytest.mark.asyncio
async def test_parallel_local_starts_resume_one_draft(tmp_path):
    import asyncio

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.models import Base

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'parallel.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(User(id="owner"))
        await session.commit()

    async def create(request):
        async with factory() as session:
            result = await coach.start_diagnosis(
                session,
                owner_id="owner",
                skill_id="cache-address-fields",
                draft=coach.StartDiagnosis(request_id=request),
            )
            await session.commit()
            return result["entry"]["id"]

    try:
        ids = await asyncio.gather(create("one"), create("two"), create("three"))
        assert len(set(ids)) == 1
    finally:
        await engine.dispose()
