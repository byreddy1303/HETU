"""Practical repair outcomes, using only disposable study records."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from test_memory_learning_engine import receipt
from test_practice_coach import seed

from app.db.models import Record
from app.services import memory_learning_engine as engine
from app.services import practice_coach as coach
from app.services.pyq_catalog import active_bank


async def completed_pack(db, assistance="without-help"):
    await seed(db)
    source = await coach._owned(db, "owner", "pyq_attempts", "attempt-0")
    source.data = {
        **source.data,
        "subject": active_bank().by_uid[source.data["question_uid"]].subject,
    }
    await db.flush()
    key = (await coach.prepare(db, "owner"))["created"][0]
    row = await coach.get_pack(db, "owner", key)
    # Old unqualified streaks must never grant an independent interval.
    await coach.write(db, "owner", key, {**row.data, "streak": 20})
    for index, question in enumerate(row.data["questions"]):
        view = await coach.submit_answer(
            db,
            "owner",
            key,
            coach.Answer(
                round=0,
                index=index,
                choice=question["answer"],
                assistance=assistance,
            ),
        )
    return view


@pytest.mark.asyncio
@pytest.mark.parametrize("assistance", ["with-help", "unknown", "without-help"])
async def test_only_independent_rounds_extend_interval_or_create_application(db, assistance):
    view = await completed_pack(db, assistance)
    independent = assistance == "without-help"
    assert (
        view["due_date"]
        == ((await coach.today(db, "owner")) + timedelta(days=3 if independent else 1)).isoformat()
    )
    assert view["round_outcome"] == ("independent" if independent else "needs-independent-check")
    assert view["independent_rounds"] == int(independent)
    assert bool(view["transfer_id"]) == independent
    if not independent:
        row = await coach.get_pack(db, "owner", view["id"])
        await coach.write(
            db,
            "owner",
            row.external_id,
            {**row.data, "due_date": (await coach.today(db, "owner")).isoformat()},
        )
        await coach.start_round(db, "owner", row.external_id)
        for index, question in enumerate(row.data["questions"]):
            view = await coach.submit_answer(
                db,
                "owner",
                row.external_id,
                coach.Answer(
                    round=1,
                    index=index,
                    choice=question["answer"],
                    assistance="without-help",
                ),
            )
        assert view["independent_rounds"] == 1
        assert (
            view["due_date"] == ((await coach.today(db, "owner")) + timedelta(days=3)).isoformat()
        )


@pytest.mark.asyncio
async def test_focus_is_small_owned_versioned_and_preserves_pack_dates(db):
    await seed(db)
    key = (await coach.prepare(db, "owner"))["created"][0]
    before = deepcopy((await coach.get_pack(db, "owner", key)).data)
    view = await coach.save_focus(
        db, "owner", coach.RepairFocus(expected_version=0, pack_ids=[key])
    )
    assert view["focus"] == {"version": 1, "pack_ids": [key], "suggested": False}
    assert (await coach.get_pack(db, "owner", key)).data == before
    assert (await coach.daily_plan(db, "owner", 10))["fresh_count"] == 0
    plan = await coach.daily_plan(db, "owner", 10)
    assert len(plan["steps"]) == 1 and plan["steps"][0]["id"] == "repair"
    assert plan["focus_pack_ids"] == [key]
    with pytest.raises(HTTPException) as stale:
        await coach.save_focus(db, "owner", coach.RepairFocus(expected_version=0, pack_ids=[]))
    assert stale.value.status_code == 409
    with pytest.raises(HTTPException):
        await coach.save_focus(db, "other", coach.RepairFocus(expected_version=0, pack_ids=[key]))
    with pytest.raises(HTTPException):
        await coach.save_focus(
            db, "owner", coach.RepairFocus(expected_version=1, pack_ids=[key, key])
        )
    with pytest.raises(ValidationError):
        coach.RepairFocus(expected_version=1, pack_ids=["a", "b", "c", "d"])
    await coach.save_focus(db, "owner", coach.RepairFocus(expected_version=1, pack_ids=[]))
    assert (await coach.overview(db, "owner"))["focus"]["pack_ids"] == []
    assert (await coach.daily_plan(db, "owner", 10))["steps"][0]["id"] == "fresh"


@pytest.mark.asyncio
async def test_assessment_retries_preserve_uncertainty_receipts_and_schedule(db):
    view = await completed_pack(db, "with-help")
    before = deepcopy((await coach.get_pack(db, "owner", view["id"])).data)
    draft = coach.RepairAssessment(
        expected_version=view["version"], difficulty="uncertain", next_action="Check one assumption"
    )
    saved = await coach.assess_repair(db, "owner", view["id"], draft)
    assert await coach.assess_repair(db, "owner", view["id"], draft) == saved
    after = (await coach.get_pack(db, "owner", view["id"])).data
    assert {k: v for k, v in after.items() if k != "assessment"} == before
    assert after["assessment"]["basis"] == "learner assessment"
    with pytest.raises(HTTPException) as stale:
        await coach.assess_repair(
            db, "owner", view["id"], draft.model_copy(update={"difficulty": "time"})
        )
    assert stale.value.status_code == 409


async def bank_application(db, repair, session_id="application", *, age=0):
    planned = repair.data["data"]["question_uids"]
    assert planned
    if age:
        repair.created_at = datetime.now(UTC) - timedelta(days=age, hours=1)
        repair.data = {**repair.data, "data": {**repair.data["data"], "interval_days": age}}
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_sessions",
            external_id=session_id,
            data={
                "status": "completed",
                "question_uids": planned,
                "config": {"mode": "practice", "memoryRepairId": repair.external_id},
            },
        )
    )
    for index, uid in enumerate(planned):
        db.add(
            Record(
                owner_id="owner",
                collection="pyq_attempts",
                external_id=f"{session_id}-{index}",
                data=receipt(uid, active_bank().by_uid[uid].answer, session_id),
            )
        )
    await db.flush()
    return planned


@pytest.mark.asyncio
@pytest.mark.parametrize("assistance", ["with-help", "unknown", "without-help"])
async def test_application_waits_for_conditions_preserves_receipts_and_schedules_once(
    db, assistance
):
    pack = await completed_pack(db)
    repair = await coach._owned(db, "owner", "study_memory", pack["transfer_id"])
    planned = await bank_application(db, repair, age=3)
    before = deepcopy((await coach._owned(db, "owner", "pyq_attempts", "application-0")).data)
    assert await engine.reconcile_engine_results(db, owner_id="owner") == 0
    view = await coach.overview(db, "owner")
    assert view["applications"]["items"][0]["assistance"] == "unreported"
    assert view["applications"]["items"][0]["fresh_count"] == 0
    draft = coach.ApplicationConditions(expected_version=0, assistance=assistance)
    saved = await coach.application_conditions(db, "owner", "application", draft)
    assert await coach.application_conditions(db, "owner", "application", draft) == saved
    assert await engine.reconcile_engine_results(db, owner_id="owner") == 0
    assert (await coach._owned(db, "owner", "pyq_attempts", "application-0")).data == before
    followup = await coach._owned(
        db, "owner", "study_memory", repair.data["data"]["next_review_entry_id"]
    )
    independent = assistance == "without-help"
    assert followup.data["data"]["interval_days"] == (3 if independent else 1)
    assert followup.data["data"]["practice_pack_id"] == pack["id"]
    assert not followup.data["data"]["needs_local_review"]
    if not independent:
        assert set(followup.data["data"]["question_uids"]) <= set(planned)
    evidence = (await coach.overview(db, "owner"))["applications"]["items"][0]
    assert evidence["fresh_count"] == (len(planned) if independent else 0)
    assert evidence["delayed_count"] == evidence["fresh_count"]
    assert evidence["fresh_correct"] == evidence["fresh_count"]
    with pytest.raises(HTTPException):
        await coach.application_conditions(db, "other", "application", draft)
    with pytest.raises(HTTPException) as changed:
        await coach.application_conditions(
            db,
            "owner",
            "application",
            draft.model_copy(update={"assistance": "with-help" if independent else "without-help"}),
        )
    assert changed.value.status_code == 409


@pytest.mark.asyncio
async def test_prior_exposure_disqualifies_fresh_application_even_when_correct(db):
    pack = await completed_pack(db)
    repair = await coach._owned(db, "owner", "study_memory", pack["transfer_id"])
    uid = repair.data["data"]["question_uids"][0]
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="prior",
            created_at=datetime.now(UTC) - timedelta(days=1),
            data=receipt(uid, active_bank().by_uid[uid].answer),
        )
    )
    planned = await bank_application(db, repair)
    await coach.application_conditions(
        db,
        "owner",
        "application",
        coach.ApplicationConditions(expected_version=0, assistance="without-help"),
    )
    evidence = (await coach.overview(db, "owner"))["applications"]["items"][0]
    assert evidence["fresh_count"] == len(planned) - 1
    assert evidence["delayed_count"] == 0


@pytest.mark.asyncio
async def test_corrected_second_answer_does_not_erase_first_application_error(db):
    pack = await completed_pack(db)
    repair = await coach._owned(db, "owner", "study_memory", pack["transfer_id"])
    planned = await bank_application(db, repair)
    first = await coach._owned(db, "owner", "pyq_attempts", "application-0")
    correct = deepcopy(first.data)
    first.data = next(
        raw
        for answer in ["0", "1", "2", "A", "B", "C", "D"]
        if (raw := receipt(planned[0], answer, "application"))["mark_correct"] is False
        and engine._frozen_score(raw) is not None
    )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="corrected",
            created_at=datetime.now(UTC) + timedelta(seconds=1),
            data=correct,
        )
    )
    await db.flush()
    await coach.application_conditions(
        db,
        "owner",
        "application",
        coach.ApplicationConditions(expected_version=0, assistance="without-help"),
    )
    followup = await coach._owned(
        db, "owner", "study_memory", repair.data["data"]["next_review_entry_id"]
    )
    assert followup.data["data"]["interval_days"] == 1
    evidence = (await coach.overview(db, "owner"))["applications"]["items"][0]
    assert evidence["fresh_correct"] == len(planned) - 1


@pytest.mark.asyncio
async def test_skipped_fresh_question_stays_in_application_denominator(db):
    from app.services.pyq_practice import score_question

    pack = await completed_pack(db)
    repair = await coach._owned(db, "owner", "study_memory", pack["transfer_id"])
    planned = await bank_application(db, repair)
    first = await coach._owned(db, "owner", "pyq_attempts", "application-0")
    first.data = {
        **first.data,
        **score_question(active_bank().by_uid[planned[0]], "SKIP", None),
        "selected_answer": None,
        "mark_decision": "SKIP",
    }
    await db.flush()
    await coach.application_conditions(
        db,
        "owner",
        "application",
        coach.ApplicationConditions(expected_version=0, assistance="without-help"),
    )
    evidence = (await coach.overview(db, "owner"))["applications"]["items"][0]
    assert evidence["fresh_count"] == len(planned)
    assert evidence["fresh_correct"] == len(planned) - 1
