from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.db.models import Record, User
from app.services import learning_concept_bridge as bridge
from app.services import memory_learning_engine as engine
from app.services.concept_review import (
    ReviewHelp,
    ReviewResponse,
    record_review_response,
    reveal_review_help,
)
from app.services.pyq_catalog import active_bank
from app.services.pyq_practice import evaluate_answer, question_snapshot, score_question


async def seed_repair(db):
    db.add_all([User(id="owner"), User(id="other")])
    await db.flush()
    question = active_bank().by_uid["go:460036"]
    attempt = {
        **score_question(question, "MARK", evaluate_answer(question, "2")),
        "question_uid": question.question_uid,
        "pyq_session_id": "session",
        "selected_answer": "2",
        "correct_answer": question.answer,
        "capture_version": 3,
        "question_snapshot": question_snapshot(question),
        "answer_status": "available",
        "question_marks": question.marks,
        "mark_decision": "MARK",
    }
    db.add(
        Record(
            owner_id="owner",
            collection="pyq_sessions",
            external_id="session",
            data={
                "status": "completed",
                "config": {"mode": "practice"},
                "question_uids": [question.question_uid],
            },
        )
    )
    db.add(Record(owner_id="owner", collection="pyq_attempts", external_id="attempt", data=attempt))
    await db.flush()
    await engine._memory_write(
        db,
        "owner",
        "repair",
        {
            "kind": "repair",
            "title": "Count all page faults",
            "subject": "Operating Systems",
            "topic": "Memory Management",
            "state": "open",
            "evidence_kind": "model",
            "content": "Trace resident pages before choosing a replacement.",
            "data": {
                "automation": engine.AUTOMATION,
                "model": "qwen3:8b",
                "provider": "ollama",
                "target": "Trace resident pages before choosing a replacement.",
                "success_criteria": "Count initial loads and later faults separately.",
                "source_attempt_ids": ["attempt"],
                "question_uids": [question.question_uid],
            },
        },
    )
    await db.commit()
    return attempt


async def sync(db, **kwargs):
    return await bridge.sync_learning_concept_reviews(
        db, owner_id="owner", app_url="http://127.0.0.1:8765", **kwargs
    )


@pytest.mark.asyncio
async def test_prepares_owned_durable_recall_with_redacted_guidance_and_replay(db):
    original = await seed_repair(db)
    result = await sync(db)
    assert result["created"] == 1
    assert (await sync(db))["created"] == 0
    queue = await bridge.concept_review_queue(db, owner_id="owner")
    assert len(queue["items"]) == 1 and queue["complete"]
    review = queue["items"][0]
    assert review["has_guidance"] and review["evaluation_guidance"] is None
    assert "learning_bridge" not in review and "source_hash" not in review
    assert review["source"]["href"] == "/memory/repair"
    assert review["concept"]["subject"] == "Operating Systems"
    assert review["attempts"] == []
    assert (await engine._owned(db, "owner", "pyq_attempts", "attempt")).data == original
    assert not (await bridge.concept_review_queue(db, owner_id="other"))["items"]
    repair = await engine._owned(db, "owner", "study_memory", "repair")
    assert repair.data["data"]["concept_review_id"] == review["id"]
    recovery_items = (
        await db.scalars(select(Record).where(Record.collection == "learning_items"))
    ).all()
    assert len(recovery_items) == 1


@pytest.mark.asyncio
async def test_guidance_and_response_remain_assisted_and_resync_preserves_history(db):
    await seed_repair(db)
    review_id = (await sync(db))["review_ids"][0]
    review = (await bridge.concept_review_queue(db, owner_id="owner"))["items"][0]
    help_result = await reveal_review_help(
        db,
        owner_id="owner",
        review_id=review_id,
        draft=ReviewHelp(
            idempotency_key="show-guide-once",
            expected_version=review["version"],
            assistance="solution",
        ),
    )
    visible = await bridge.concept_queue_review(db, owner_id="owner", review_id=review_id)
    assert "unverified" in visible["evaluation_guidance"]
    saved = await record_review_response(
        db,
        owner_id="owner",
        review_id=review_id,
        response=ReviewResponse(
            expected_version=help_result["review"]["version"],
            attempt_id="response-one",
            answer="Count each nonresident access, including free-frame loads.",
            assistance="none",
            evaluation="partial",
            evaluated_by="self",
        ),
    )
    assert saved["attempts"][0]["assistance"] == "solution"
    assert saved["last_evidence"]["evaluated_by"] == "self"
    await sync(db)
    again = await bridge.concept_queue_review(db, owner_id="owner", review_id=review_id)
    assert again["attempts"] == saved["attempts"] and again["due_on"] == saved["due_on"]
    assert again["evaluation_guidance"] is None


@pytest.mark.asyncio
async def test_followup_family_reuses_one_review_and_preserves_user_edits(db):
    await seed_repair(db)
    first = (await sync(db))["review_ids"][0]
    root = await engine._owned(db, "owner", "study_memory", "repair")
    root.data = {**root.data, "state": "completed"}
    await engine._memory_write(
        db,
        "owner",
        "followup",
        {
            **root.data,
            "state": "open",
            "repair_id": "repair",
            "data": {**root.data["data"], "target": "Reconsider the first unsupported step."},
        },
    )
    result = await sync(db)
    assert result["created"] == 0 and result["review_ids"] == [first]
    assert len((await bridge.concept_review_queue(db, owner_id="owner"))["items"]) == 1
    followup = await engine._owned(db, "owner", "study_memory", "followup")
    assert followup.data["data"]["concept_review_id"] == first


@pytest.mark.asyncio
async def test_unfinished_exam_and_changed_sources_are_held(db):
    await seed_repair(db)
    session = await engine._owned(db, "owner", "pyq_sessions", "session")
    session.data = {**session.data, "status": "paused", "config": {"mode": "exam"}}
    await db.flush()
    assert (await sync(db))["held_for_exam"]
    assert (await bridge.concept_review_queue(db, owner_id="owner"))["held_for_exam"]
    session.data = {**session.data, "status": "completed"}
    await db.flush()
    assert (await sync(db))["created"] == 0
    session.data = {**session.data, "config": {"mode": "practice"}}
    await db.flush()
    assert (await sync(db))["created"] == 1
    attempt = await engine._owned(db, "owner", "pyq_attempts", "attempt")
    attempt.version += 1
    await db.flush()
    queue = await bridge.concept_review_queue(db, owner_id="owner")
    assert queue["held_sources"] == 1 and not queue["items"]


@pytest.mark.asyncio
async def test_archived_review_is_not_recreated_or_reset(db):
    await seed_repair(db)
    review_id = (await sync(db))["review_ids"][0]
    row = await engine._owned(db, "owner", "concept_reviews", review_id)
    row.deleted_at = datetime.now(UTC)
    await db.flush()
    result = await sync(db)
    assert result["created"] == 0 and result["held"] == 1
    assert not (await bridge.concept_review_queue(db, owner_id="owner"))["items"]
