import copy

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import Record, User
from app.services import memory_learning_engine as engine
from app.services.pyq_catalog import active_bank
from app.services.pyq_practice import evaluate_answer, question_snapshot, score_question


def receipt(uid="go:460036", answer="2", session="set"):
    question = active_bank().by_uid[uid]
    score = score_question(question, "MARK", evaluate_answer(question, answer))
    return {
        **score,
        "question_uid": uid,
        "pyq_session_id": session,
        "selected_answer": answer,
        "correct_answer": question.answer,
        "capture_version": 3,
        "question_snapshot": question_snapshot(question),
        "answer_status": "available",
        "question_marks": question.marks,
        "mark_decision": "MARK",
        "time_spent_sec": 12,
        "time_spent_ms": 12000,
        "confidence": "high",
    }


async def seed(db):
    db.add_all([User(id="owner"), User(id="other")])
    await db.flush()
    for owner in ["owner", "other"]:
        db.add(
            Record(
                owner_id=owner,
                collection="pyq_sessions",
                external_id="set",
                data={
                    "status": "completed",
                    "config": {"mode": "practice"},
                    "question_uids": ["go:460036"],
                },
            )
        )
        db.add(
            Record(owner_id=owner, collection="pyq_attempts", external_id="attempt", data=receipt())
        )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_sessions",
            external_id="exam",
            data={
                "status": "active",
                "config": {"mode": "practice"},
                "question_uids": ["go:422790"],
            },
        )
    )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="hidden",
            data=receipt("go:422790", "4096", "exam"),
        )
    )
    await engine.update_engine_config(
        db, owner_id="owner", config=engine.EngineConfig(enabled=True, model="qwen3:8b")
    )
    await db.commit()


def plan(ids=None):
    return engine.LearningPlan(
        summary="Check how initial loads are counted.",
        activities=[
            engine.ActivityProposal(
                title="Count initial page loads",
                source_attempt_ids=ids or ["attempt"],
                observation="The submitted page-fault count differed from the frozen key.",
                possible_explanation="The reason is uncertain until the learner traces the frames.",
                target="Trace each request; distinguish faults from replacements.",
                success_criteria="Count absent pages, including initial loads into free frames.",
                activity="retry",
                duration_min=10,
            )
        ],
    )


@pytest.mark.asyncio
async def test_owned_completed_receipts_create_replay_safe_active_work(db, monkeypatch):
    await seed(db)
    calls = []

    async def generate(snapshot):
        calls.append(snapshot)
        assert [row["attempt_id"] for row in snapshot["sources"]] == ["attempt"]
        assert snapshot["owner_id"] == "owner"
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    factory = async_sessionmaker(db.bind, expire_on_commit=False)
    result = await engine.run_engine_cycle(factory, owner_id="owner")
    assert result["state"] == "idle" and result["pending_count"] == 1
    actions = await engine.list_engine_actions(db, owner_id="owner")
    activity = actions["items"][0]
    assert activity["state"] == "open" and activity["data"]["question_uids"] == ["go:460036"]
    assert activity["data"]["mastery_claim"] is False
    assert not (await engine.list_engine_actions(db, owner_id="other"))["items"]
    await engine.run_engine_cycle(factory, owner_id="owner")
    assert len(calls) == 1
    assert len((await engine.list_engine_actions(db, owner_id="owner"))["items"]) == 1


@pytest.mark.asyncio
async def test_unknown_model_source_rejected_atomically(db, monkeypatch):
    await seed(db)

    async def generate(snapshot):
        return plan(["foreign-attempt"])

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    state = await engine.run_engine_cycle(
        async_sessionmaker(db.bind, expire_on_commit=False), owner_id="owner"
    )
    assert state["state"] == "error" and state["error_code"] == "invalid_evidence"
    assert not (await engine.list_engine_actions(db, owner_id="owner"))["items"]


@pytest.mark.asyncio
async def test_pausing_during_generation_discards_the_response(db, monkeypatch):
    await seed(db)
    factory = async_sessionmaker(db.bind, expire_on_commit=False)

    async def generate(snapshot):
        async with factory() as connection:
            await engine.update_engine_config(
                connection,
                owner_id="owner",
                config=engine.EngineConfig(enabled=False, model="qwen3:8b"),
            )
            await connection.commit()
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    state = await engine.run_engine_cycle(factory, owner_id="owner")
    assert state["state"] == "disabled"
    assert not (await engine.list_engine_actions(db, owner_id="owner"))["items"]


@pytest.mark.asyncio
@pytest.mark.parametrize("answer,clean", [("6", True), ("2", False)])
async def test_finished_linked_practice_reconciles_and_schedules_without_button(
    db, monkeypatch, answer, clean
):
    await seed(db)

    async def generate(snapshot):
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    factory = async_sessionmaker(db.bind, expire_on_commit=False)
    await engine.run_engine_cycle(factory, owner_id="owner")
    original = (await engine.list_engine_actions(db, owner_id="owner"))["items"][0]
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_sessions",
            external_id="retry",
            data={
                "status": "completed",
                "config": {"mode": "practice", "memoryRepairId": original["id"]},
                "question_uids": ["go:460036"],
            },
        )
    )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="retry-receipt",
            data=receipt(answer=answer, session="retry"),
        )
    )
    await db.commit()
    assert await engine.reconcile_engine_results(db, owner_id="owner") == 1
    await db.commit()
    actions = await engine.list_engine_actions(db, owner_id="owner")
    assert len(actions["items"]) == 1 and len(actions["latest_results"]) == 1
    next_action = actions["items"][0]
    assert next_action["data"]["interval_days"] == (3 if clean else 1)
    assert next_action["data"]["activity"] == ("transfer" if clean else "retry")
    assert bool(set(next_action["data"]["question_uids"]) & {"go:460036"}) is not clean
    assert actions["latest_results"][0]["data"]["reliable_correct"] == int(clean)
    assert await engine.reconcile_engine_results(db, owner_id="owner") == 0
    pending = await engine._snapshot(db, "owner")
    assert all(row["attempt_id"] != "retry-receipt" for row in pending["sources"])
    untouched = await db.scalar(
        select(Record).where(
            Record.owner_id == "owner",
            Record.external_id == "attempt",
            Record.collection == "pyq_attempts",
        )
    )
    assert untouched.data == receipt()


def test_frozen_scoring_excludes_unknown_bonus_or_inconsistent_metadata():
    valid = receipt()
    assert engine._frozen_score(valid)["mark_correct"] is False
    for path, value in [
        ("capture_version", 2),
        ("scoring_status", "bonus"),
        ("score_thirds", 2),
        ("score_thirds", False),
        ("question_type", "MSQ"),
    ]:
        bad = copy.deepcopy(valid)
        bad[path] = value
        assert engine._frozen_score(bad) is None


@pytest.mark.asyncio
async def test_history_counts_only_owned_completed_reliably_scored_practice(db):
    from app.services.memory_learning_refinement import practice_history

    await seed(db)
    # Same question in an unfinished practice, and in a completed but sealed exam.
    for session_id, status, mode in [
        ("unfinished", "active", "practice"),
        ("sealed", "completed", "exam"),
    ]:
        db.add(
            Record(
                owner_id="owner",
                collection="pyq_sessions",
                external_id=session_id,
                data={"status": status, "config": {"mode": mode}},
            )
        )
        db.add(
            Record(
                owner_id="owner",
                collection="pyq_attempts",
                external_id=f"{session_id}-answer",
                data=receipt(answer="6", session=session_id),
            )
        )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="legacy",
            data={**receipt(answer="6"), "capture_version": 2},
        )
    )
    await db.commit()
    history = await practice_history(db, owner_id="owner", sources=[{"question_uid": "go:460036"}])
    assert history["questions"] == [
        {
            "question_uid": "go:460036",
            "correct": 0,
            "wrong": 1,
            "skipped": 0,
            "latest_outcome": "wrong",
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("pause", [False, True])
async def test_failed_retry_refines_existing_followup_once_and_respects_pause(
    db, monkeypatch, pause
):
    await seed(db)
    factory = async_sessionmaker(db.bind, expire_on_commit=False)
    snapshots = []

    async def generate(snapshot):
        snapshots.append(snapshot)
        if snapshot.get("refine_entry_id"):
            assert snapshot["prior_activity"]["failed_checks"] == 1
            assert snapshot["practice_history"]["questions"][0]["wrong"] == 2
            if pause:
                async with factory() as connection:
                    await engine.update_engine_config(
                        connection,
                        owner_id="owner",
                        config=engine.EngineConfig(enabled=False, model="qwen3:8b"),
                    )
                    await connection.commit()
            return plan(["retry-receipt"])
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    await engine.run_engine_cycle(factory, owner_id="owner")
    original = (await engine.list_engine_actions(db, owner_id="owner"))["items"][0]
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_sessions",
            external_id="retry",
            data={
                "status": "completed",
                "config": {"mode": "practice", "memoryRepairId": original["id"]},
                "question_uids": ["go:460036"],
            },
        )
    )
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_attempts",
            external_id="retry-receipt",
            data=receipt(session="retry"),
        )
    )
    await db.commit()
    state = await engine.run_engine_cycle(factory, owner_id="owner")
    actions = await engine.list_engine_actions(db, owner_id="owner")
    assert len(actions["items"]) == len(actions["latest_results"]) == 1
    followup = actions["items"][0]
    assert followup["data"]["due_date"] == engine._day(engine.EngineConfig().model_dump(), 1)
    assert followup["data"]["source_entry_ids"][0] == original["id"]
    assert followup["data"]["source_attempt_ids"] == ["retry-receipt"]
    assert followup["data"]["mastery_claim"] is False
    assert bool(followup["data"].get("ai_refined_at")) is not pause
    assert followup["data"]["needs_local_review"] is pause
    assert state["state"] == ("disabled" if pause else "idle")
    await engine.run_engine_cycle(factory, owner_id="owner")
    assert len(snapshots) == 2


def test_compatible_local_url_is_validated_with_its_provider():
    config = engine.EngineConfig(provider="openai_compatible", base_url="http://localhost:1234/v1")
    assert config.base_url == "http://127.0.0.1:1234/v1"


@pytest.mark.asyncio
async def test_refinement_rechecks_completed_practice_session_after_inference(db):
    from app.services.memory_learning_refinement import prepare_refinement

    await seed(db)
    await engine._memory_write(
        db,
        "owner",
        "followup",
        {
            "kind": "repair",
            "state": "open",
            "evidence_kind": "rule",
            "title": "Check remaining errors",
            "subject": "Operating Systems",
            "topic": "Memory Management",
            "content": "Check the unsupported step.",
            "data": {
                "automation": engine.AUTOMATION,
                "needs_local_review": True,
                "source_attempt_ids": ["attempt"],
                "question_uids": ["go:460036"],
            },
        },
    )
    snapshot = await prepare_refinement(db, owner_id="owner")
    assert snapshot
    session = await engine._owned(db, "owner", "pyq_sessions", "set")
    session.data = {**session.data, "config": {"mode": "exam"}}
    await db.flush()
    assert await prepare_refinement(db, owner_id="owner", entry_id="followup", begin=False) is None
    result = await engine.apply_engine_plan(db, owner_id="owner", snapshot=snapshot, plan=plan())
    assert result["applied"] is False
    row = await engine._owned(db, "owner", "study_memory", "followup")
    assert row.data["data"]["needs_local_review"] is True


@pytest.mark.asyncio
async def test_active_exam_prevents_local_generation(db, monkeypatch):
    await seed(db)
    row = await db.scalar(
        select(Record).where(Record.owner_id == "owner", Record.external_id == "exam")
    )
    row.data = {**row.data, "config": {"mode": "exam"}}
    await db.commit()

    async def forbidden(snapshot):
        raise AssertionError("An unfinished exam must not trigger generation")

    monkeypatch.setattr(engine, "generate_engine_plan", forbidden)
    state = await engine.run_engine_cycle(
        async_sessionmaker(db.bind, expire_on_commit=False), owner_id="owner"
    )
    assert state["state"] == "idle" and "exam is finished" in state["message"]
    assert state["pending_count"] == 0


def test_correct_answers_are_not_error_evidence_and_observations_come_from_receipts():
    row = Record(
        owner_id="owner", collection="pyq_attempts", external_id="right", data=receipt(answer="6")
    )
    assert engine._source_evidence(row, []) is None
    row.data = receipt()
    evidence = engine._source_evidence(row, [])
    observation = engine._recorded_observation([evidence])
    assert 'Submitted answer: "2"' in observation and "Saved answer key: 6" in observation


def test_fresh_selection_excludes_seen_duplicate_and_sealed_content(monkeypatch):
    from dataclasses import replace
    from types import SimpleNamespace

    original = active_bank().by_uid["go:460036"]
    source = replace(original, question_uid="source", duplicate_of_uid=None)
    near = replace(
        original,
        question_uid="near",
        html="Count page faults with three initially empty frames.",
        content_hash="near",
        duplicate_of_uid=None,
    )
    unrelated = replace(
        original,
        question_uid="unrelated",
        html="Segmentation address widths and process identifiers.",
        content_hash="unrelated",
        duplicate_of_uid=None,
    )
    duplicate = replace(original, question_uid="duplicate", duplicate_of_uid="source")
    sealed = replace(near, question_uid="sealed", content_hash="sealed")
    questions = [source, near, unrelated, duplicate, sealed]
    bank = SimpleNamespace(
        questions=questions,
        by_uid={q.question_uid: q for q in questions},
        manifest={"benchmarkPapers": [{"questionUids": ["sealed"]}]},
    )
    monkeypatch.setattr(engine, "active_bank", lambda: bank)
    assert engine._select_questions(
        original.subject, original.topic, {"source"}, ["source"], fresh=True
    ) == ["near"]


@pytest.mark.asyncio
async def test_preparing_activity_checks_current_eligibility_and_owner(db, monkeypatch):
    await seed(db)

    async def generate(snapshot):
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    await engine.run_engine_cycle(
        async_sessionmaker(db.bind, expire_on_commit=False), owner_id="owner"
    )
    activity = (await engine.list_engine_actions(db, owner_id="owner"))["items"][0]
    prepared = await engine.prepare_engine_activity(db, owner_id="owner", entry_id=activity["id"])
    assert prepared["data"]["question_uids"] == ["go:460036"]
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as error:
        await engine.prepare_engine_activity(db, owner_id="other", entry_id=activity["id"])
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_completed_exam_keeps_keys_out_of_coaching_until_review_reveal(db, monkeypatch):
    await seed(db)
    row = await db.scalar(
        select(Record).where(
            Record.owner_id == "owner",
            Record.collection == "pyq_sessions",
            Record.external_id == "set",
        )
    )
    row.data = {**row.data, "config": {"mode": "exam"}}
    await db.commit()
    calls = []

    async def generate(snapshot):
        calls.append(snapshot)
        return plan()

    monkeypatch.setattr(engine, "generate_engine_plan", generate)
    factory = async_sessionmaker(db.bind, expire_on_commit=False)
    state = await engine.run_engine_cycle(factory, owner_id="owner")
    assert not calls and "independent exam review" in state["message"]
    db.add(
        Record(
            owner_id="owner",
            collection="study_memory",
            external_id="exam-review",
            data={
                "kind": "exam_review",
                "state": "open",
                "session_id": "set",
                "data": {"revealed_attempt_ids": ["attempt"]},
            },
        )
    )
    await db.commit()
    state = await engine.run_engine_cycle(factory, owner_id="owner")
    assert len(calls) == 1 and state["pending_count"] == 1
