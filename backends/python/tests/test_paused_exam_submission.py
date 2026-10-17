from __future__ import annotations

import math

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, RecordRevision, User
from app.schemas import CompatMutation
from app.services.compat import _mutate_records
from app.services.pyq_practice import (
    PyqAttemptDraft,
    canonical_logged_answer,
    question_snapshot,
    score_question,
    submit_pyq_attempt,
    validate_app_attempt,
)
from app.services.records import require_generic_mutation_allowed, upsert_records
from app.services.study_memory import ExamSubmissionDraft, commit_exam
from tests.test_pyq_catalog import install_catalog, sample_question


async def paused_exam(db, monkeypatch, *, status="paused", mode="exam"):
    bank = install_catalog(
        monkeypatch,
        [
            sample_question(),
            sample_question(id="gate:test:2", html="<p>A second question</p>", number="2"),
        ],
    )
    db.add(User(id="learner-a"))
    await db.flush()
    session = {
        "id": "paused-exam",
        "status": status,
        "config": {"mode": mode},
        "bank_version": bank.version,
        "question_uids": list(bank.by_uid),
        "total_time_ms": 41_000,
    }
    await upsert_records(db, collection="pyq_sessions", owner_id="learner-a", items=[session])
    await db.commit()
    attempts = []
    for index, question in enumerate(bank.by_uid.values()):
        skipped = index == 1
        decision = "SKIP" if skipped else "MARK"
        score = score_question(question, decision, None if skipped else True)
        duration_ms = 0 if skipped else 41_000
        attempts.append(
            {
                "id": f"exam-attempt:{index}",
                "user_id": "learner-a",
                "pyq_session_id": session["id"],
                "question_uid": question.question_uid,
                "capture_version": 3,
                "bank_version": bank.version,
                "question_snapshot": question_snapshot(question),
                "selected_answer": None if skipped else "B",
                "correct_answer": canonical_logged_answer(question),
                "answer_status": question.answer_status,
                "mark_decision": decision,
                "mark_correct": score["mark_correct"],
                "question_type": score["question_type"],
                "question_marks": score["marks"],
                "score_thirds": score["score_thirds"],
                "scoring_status": score["scoring_status"],
                "scoring_version": score["scoring_version"],
                "year": question.year,
                "attempt_number": 1,
                "time_spent_ms": duration_ms,
                "time_spent_sec": max(1, math.ceil(duration_ms / 1000)),
            }
        )
    return ExamSubmissionDraft(
        session={**session, "status": "completed"},
        attempts=attempts,
        canonical_session={"id": session["id"], "kind": "pyq", "total_time_sec": 41},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["active", "paused"])
async def test_exam_can_complete_without_resuming_and_receipts_replay_safely(
    db, monkeypatch, status
):
    draft = await paused_exam(db, monkeypatch, status=status)

    result = await commit_exam(db, owner_id="learner-a", draft=draft)
    await db.commit()
    assert result["committed"] is True
    replay = await commit_exam(db, owner_id="learner-a", draft=draft)
    await db.commit()
    assert replay == result

    async with AsyncSession(bind=db.bind) as reopened:
        session = await reopened.scalar(
            select(Record).where(
                Record.collection == "pyq_sessions",
                Record.external_id == "paused-exam",
            )
        )
        assert session.data["status"] == "completed"
        assert session.data["total_time_ms"] == 41_000
        revisions = (
            await reopened.scalars(
                select(RecordRevision)
                .where(
                    RecordRevision.record_id == session.id,
                )
                .order_by(RecordRevision.version)
            )
        ).all()
        assert [row.snapshot["status"] for row in revisions] == [status, "completed"]
        receipts = (
            await reopened.scalars(
                select(Record)
                .where(
                    Record.collection == "pyq_attempts",
                )
                .order_by(Record.external_id)
            )
        ).all()
        assert len(receipts) == 2
        assert receipts[0].data["score_thirds"] == 3
        assert receipts[0].data["time_spent_ms"] == 41_000
        assert receipts[1].data["mark_decision"] == "SKIP"
        canonical = await reopened.scalar(
            select(Record).where(
                Record.collection == "sessions",
                Record.external_id == "paused-exam",
            )
        )
        assert canonical.data["total_time_sec"] == 41


@pytest.mark.asyncio
async def test_invalid_receipt_leaves_exam_paused_without_partial_saves(db, monkeypatch):
    draft = await paused_exam(db, monkeypatch)
    draft.attempts[1]["score_thirds"] = 999

    with pytest.raises(HTTPException) as invalid:
        await commit_exam(db, owner_id="learner-a", draft=draft)
    assert invalid.value.status_code == 409

    # Validation must not transiently resume or save the first valid receipt.
    session = await db.scalar(select(Record).where(Record.collection == "pyq_sessions"))
    assert session.data["status"] == "paused"
    assert session.data["total_time_ms"] == 41_000
    assert not (
        await db.scalars(
            select(Record).where(
                Record.collection.in_(["pyq_attempts", "sessions"]),
            )
        )
    ).all()
    await db.rollback()
    async with AsyncSession(bind=db.bind) as reopened:
        session = await reopened.scalar(select(Record).where(Record.collection == "pyq_sessions"))
        assert session.data["status"] == "paused"
        assert session.version == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["abandoned", "completed"])
async def test_closed_exams_cannot_receive_new_attempts(db, monkeypatch, status):
    draft = await paused_exam(db, monkeypatch, status=status)
    with pytest.raises(HTTPException) as closed:
        await commit_exam(db, owner_id="learner-a", draft=draft)
    assert closed.value.status_code == 422
    assert not (
        await db.scalars(
            select(Record).where(
                Record.collection == "pyq_attempts",
            )
        )
    ).all()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["practice", "exam"])
async def test_paused_sessions_still_reject_ordinary_attempt_writes(db, monkeypatch, mode):
    draft = await paused_exam(db, monkeypatch, mode=mode)
    with pytest.raises(HTTPException) as app_attempt:
        await validate_app_attempt(db, owner_id="learner-a", row=draft.attempts[0])
    assert app_attempt.value.status_code == 422
    with pytest.raises(HTTPException) as compat_attempt:
        await _mutate_records(
            db,
            "pyq_attempts",
            "upsert",
            "learner-a",
            CompatMutation(values=[draft.attempts[0]]),
        )
    assert compat_attempt.value.status_code == 422
    with pytest.raises(HTTPException) as mcp_attempt:
        await submit_pyq_attempt(
            db,
            owner_id="learner-a",
            draft=PyqAttemptDraft(
                idempotency_key="paused-receipt",
                question_uid=draft.attempts[0]["question_uid"],
                session_id="paused-exam",
                decision="MARK",
                selected_answer="B",
            ),
            app_url="https://hetu.example",
        )
    assert mcp_attempt.value.status_code == 422
    with pytest.raises(HTTPException) as generic:
        require_generic_mutation_allowed("pyq_attempts")
    assert generic.value.status_code == 403
    if mode == "practice":
        with pytest.raises(HTTPException) as practice:
            await commit_exam(db, owner_id="learner-a", draft=draft)
        assert practice.value.status_code == 422
        with pytest.raises(HTTPException) as paused_practice:
            await validate_app_attempt(
                db,
                owner_id="learner-a",
                row=draft.attempts[0],
                allow_paused_exam=True,
            )
        assert paused_practice.value.status_code == 422
