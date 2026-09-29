"""Canonical Python scoring for actual attempts against the versioned PYQ catalog."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PyqCatalogQuestion, Record
from app.services.learning_library import fingerprint, stable_id
from app.services.pyq_catalog import active_bank, question_payload
from app.services.records import lock_identity, to_api, upsert_records


class PyqAttemptDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(min_length=8, max_length=128)
    question_uid: str = Field(min_length=1, max_length=128)
    decision: Literal["MARK", "FIFTY_FIFTY", "SKIP"]
    selected_answer: str | int | float | list[str | int | float] | None = None
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    duration_source: Literal["measured", "reported", "unknown"] = "unknown"
    session_id: str | None = Field(default=None, max_length=128)

    @field_validator("selected_answer", mode="before")
    @classmethod
    def reject_boolean_answer(cls, value: Any) -> Any:
        values = value if isinstance(value, list) else [value]
        if any(isinstance(item, bool) for item in values):
            raise ValueError("Boolean values are not PYQ answers")
        return value

    @model_validator(mode="after")
    def validate_answer(self) -> PyqAttemptDraft:
        if self.decision == "SKIP" and self.selected_answer is not None:
            raise ValueError("A skipped question cannot retain an answer")
        if self.decision != "SKIP" and self.selected_answer is None:
            raise ValueError("A marked question requires the learner's actual answer")
        if self.duration_source == "measured" and self.duration_ms is None:
            raise ValueError("Measured duration requires duration_ms")
        values = (
            self.selected_answer
            if isinstance(self.selected_answer, list)
            else [self.selected_answer]
        )
        if any(isinstance(item, bool) for item in values):
            raise ValueError("Boolean values are not PYQ answers")
        if any(isinstance(item, float) and not math.isfinite(item) for item in values):
            raise ValueError("PYQ numerical answers must be finite")
        return self


def _choice_set(value: Any) -> list[str]:
    values = value if isinstance(value, list) else [] if value is None else [value]
    return sorted({str(item).strip().upper() for item in values if str(item).strip()})


def validate_question_response(question: PyqCatalogQuestion, draft: PyqAttemptDraft) -> None:
    """Use the same response shapes accepted by React's PYQ attempt builder."""
    if draft.decision == "SKIP":
        return
    selected = draft.selected_answer
    if question.question_type == "NAT":
        if isinstance(selected, list):
            raise HTTPException(422, "NAT requires one numerical response")
        try:
            if not math.isfinite(float(selected)):
                raise ValueError("non-finite")
        except (TypeError, ValueError, OverflowError) as exc:
            raise HTTPException(422, "NAT requires one numerical response") from exc
    elif question.question_type == "MSQ":
        if (
            not isinstance(selected, list)
            or not selected
            or not all(isinstance(item, str) and item.strip() for item in selected)
        ):
            raise HTTPException(422, "MSQ requires selected choices")
    elif not isinstance(selected, str) or not selected.strip():
        raise HTTPException(422, "This question requires a selected choice")


def evaluate_answer(question: PyqCatalogQuestion, selected: Any) -> bool | None:
    """Match the app's exact-set MCQ/MSQ and tolerance-aware NAT evaluation."""
    if question.answer_status != "available" or question.integrity_status == "quarantined":
        return None
    expected = question.answer
    if selected is None or selected == "" or selected == []:
        return None
    if question.question_type == "MCQ":
        correct = _choice_set(expected)
        chosen = _choice_set(selected)
        if len(correct) != 1:
            return None
        return len(chosen) == 1 and chosen == correct
    if question.question_type == "MSQ":
        correct = _choice_set(expected)
        return _choice_set(selected) == correct if correct else None
    if question.question_type == "NAT":
        if isinstance(selected, list):
            return None
        try:
            chosen = float(selected)
            values = expected if isinstance(expected, list) else [expected]
            answers = [float(item) for item in values]
            tolerance = float((question.tolerance or {}).get("abs", 0))
        except (TypeError, ValueError, OverflowError):
            return None
        if not math.isfinite(chosen):
            return False
        if (
            not answers
            or any(not math.isfinite(item) for item in answers)
            or not math.isfinite(tolerance)
            or tolerance < 0
        ):
            return None
        return any(abs(chosen - answer) <= tolerance + math.ulp(1.0) for answer in answers)
    return None


def score_question(
    question: PyqCatalogQuestion, decision: str, correctness: bool | None
) -> dict[str, Any]:
    """Use integer thirds so repeated MCQ penalties have no float drift."""
    marks = question.marks
    kind = question.question_type
    status = question.answer_status
    if question.integrity_status == "quarantined":
        kind, status = "AMBIGUOUS", "ambiguous"
    confidence = {"MARK": "committed", "FIFTY_FIFTY": "fifty-fifty", "SKIP": "skipped"}[decision]
    base = {
        "scoring_version": 1,
        "confidence": confidence,
        "question_type": kind,
        "marks": marks if marks in {1, 2} else None,
        "negative_applied": False,
        "max_thirds": marks * 3 if marks in {1, 2} else None,
    }

    def unscorable(reason: str) -> dict[str, Any]:
        return {
            **base,
            "scoring_status": "unscorable",
            "outcome": "unscorable",
            "score_thirds": None,
            "mark_correct": None,
            "reason": reason,
        }

    if marks is None:
        return unscorable("missing-marks")
    if marks not in {1, 2}:
        return unscorable("unsupported-mark-scheme")
    if kind == "MARKS_TO_ALL" or status == "marks-to-all":
        if kind != "MARKS_TO_ALL" or status != "marks-to-all":
            return unscorable("conflicting-bonus-metadata")
        return {
            **base,
            "scoring_status": "bonus",
            "outcome": "bonus",
            "score_thirds": marks * 3,
            "mark_correct": None,
        }
    if kind == "AMBIGUOUS" or status == "ambiguous":
        return unscorable("ambiguous-answer")
    if kind == "UNSUPPORTED" or status == "unsupported":
        return unscorable("unsupported-answer")
    if status != "available":
        return unscorable("unavailable-answer")
    if kind not in {"MCQ", "MSQ", "NAT"}:
        return unscorable("unsupported-question-type")
    if decision == "SKIP":
        return {
            **base,
            "scoring_status": "scored",
            "outcome": "skipped",
            "score_thirds": 0,
            "mark_correct": None,
        }
    if correctness is None:
        return unscorable("missing-correctness")
    if correctness:
        return {
            **base,
            "scoring_status": "scored",
            "outcome": "correct",
            "score_thirds": marks * 3,
            "mark_correct": True,
        }
    penalty = -marks if kind == "MCQ" else 0
    return {
        **base,
        "scoring_status": "scored",
        "outcome": "wrong",
        "score_thirds": penalty,
        "mark_correct": False,
        "negative_applied": penalty < 0,
    }


def question_snapshot(question: PyqCatalogQuestion) -> dict[str, Any]:
    """Match the v3 attempt snapshot consumed by the React PYQ history."""
    visible = question_payload(question)
    return {
        "question_uid": visible["id"],
        "book_slug": visible["bookSlug"],
        "year": visible["year"],
        "set": visible["set"],
        "number": visible["number"],
        "paper_label": visible["paperLabel"],
        "subject": visible["subject"],
        "subject_slug": visible["subjectSlug"],
        "topic": visible["topic"],
        "topic_slug": visible["topicSlug"],
        "subtopics": visible["subtopics"],
        "marks": visible["marks"],
        "type": visible["type"],
        "choices": visible["choices"],
        "tolerance": visible["tolerance"],
        "answer_status": visible["answerStatus"],
        "answer_source": visible["answerSource"],
        "html": visible["html"],
        "source_url": visible["sourceUrl"],
    }


def canonical_logged_answer(question: PyqCatalogQuestion) -> Any:
    """Mirror the app's immutable answer value, including sorted MSQ keys."""
    if question.integrity_status == "quarantined" or question.answer_status != "available":
        return None
    answer = question.answer
    if isinstance(answer, list):
        return sorted(str(item) for item in answer)
    return answer


async def validate_session_association(
    db: AsyncSession,
    *,
    owner_id: str,
    session_id: str | None,
    bank_version: str,
    question_uid: str,
) -> None:
    if not session_id:
        return
    session = await db.scalar(
        select(Record).where(
            Record.collection == "pyq_sessions",
            Record.owner_id == owner_id,
            Record.external_id == session_id,
            Record.deleted_at.is_(None),
        )
    )
    if (
        session is None
        or session.data.get("status") != "active"
        or session.data.get("bank_version") != bank_version
        or question_uid not in session.data.get("question_uids", [])
    ):
        raise HTTPException(422, "PYQ session is not active for this question and account")


async def validate_app_attempt(db: AsyncSession, *, owner_id: str, row: dict[str, Any]) -> None:
    """Validate the React receipt against the same catalog and scoring as MCP.

    Historical imported attempts use the separate import path. New app receipts
    must carry the current v3 snapshot and cannot supply a fabricated score.
    """
    if row.get("capture_version") != 3:
        raise HTTPException(422, "New PYQ attempts require capture version 3")
    if not isinstance(row.get("id"), str) or not row["id"]:
        raise HTTPException(422, "PYQ attempt ID is required")
    bank = await active_bank(db)
    if row.get("bank_version") != bank.version:
        raise HTTPException(409, "PYQ bank version changed; reload the question")
    question = await db.scalar(
        select(PyqCatalogQuestion).where(
            PyqCatalogQuestion.bank_version == bank.version,
            PyqCatalogQuestion.question_uid == row.get("question_uid"),
        )
    )
    if question is None:
        raise HTTPException(404, "Unknown PYQ question")
    try:
        draft = PyqAttemptDraft(
            idempotency_key="app-validation",
            question_uid=row["question_uid"],
            decision=row["mark_decision"],
            selected_answer=row.get("selected_answer"),
            duration_ms=row.get("time_spent_ms"),
            duration_source="measured",
            session_id=row.get("pyq_session_id"),
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, "Invalid PYQ attempt response or timing") from exc
    validate_question_response(question, draft)
    snapshot = question_snapshot(question)
    received_snapshot = row.get("question_snapshot")
    if not isinstance(received_snapshot, dict):
        raise HTTPException(422, "PYQ question snapshot is required")
    # The React snapshot omits empty choice arrays; the Python snapshot uses null.
    normalized_snapshot = dict(received_snapshot)
    if not snapshot["choices"]:
        normalized_snapshot["choices"] = snapshot["choices"]
    if normalized_snapshot != snapshot:
        raise HTTPException(409, "PYQ question snapshot differs from canonical bank")
    correct = canonical_logged_answer(question)
    correctness = (
        None if draft.decision == "SKIP" else evaluate_answer(question, draft.selected_answer)
    )
    score = score_question(question, draft.decision, correctness)
    expected = {
        "answer_status": snapshot["answer_status"],
        "correct_answer": correct,
        "question_type": score["question_type"],
        "question_marks": score["marks"],
        "mark_correct": score["mark_correct"],
        "score_thirds": score["score_thirds"],
        "scoring_status": score["scoring_status"],
        "scoring_version": score["scoring_version"],
        "year": question.year,
    }
    if any(row.get(key) != value for key, value in expected.items()):
        raise HTTPException(409, "PYQ answer key or score differs from canonical bank")
    if (
        type(row.get("attempt_number")) is not int
        or row["attempt_number"] < 1
        or row.get("time_spent_sec") != max(1, math.ceil(draft.duration_ms / 1000))
    ):
        raise HTTPException(422, "Invalid PYQ attempt number or elapsed time")
    await validate_session_association(
        db,
        owner_id=owner_id,
        session_id=draft.session_id,
        bank_version=bank.version,
        question_uid=question.question_uid,
    )


async def submit_pyq_attempt(
    db: AsyncSession, *, owner_id: str, draft: PyqAttemptDraft, app_url: str
) -> dict[str, Any]:
    """Persist one actual learner response with a replay-safe immutable receipt."""
    attempt_id = stable_id("pyq-attempt", draft.idempotency_key)
    await lock_identity(db, "pyq_attempts", owner_id, attempt_id)
    request_hash = fingerprint(draft.model_dump(exclude={"idempotency_key"}))
    existing = await db.scalar(
        select(Record).where(
            Record.collection == "pyq_attempts",
            Record.owner_id == owner_id,
            Record.external_id == attempt_id,
        )
    )
    if existing:
        if existing.data.get("request_hash") != request_hash:
            raise HTTPException(409, "Attempt key was reused for different content")
        return {
            **to_api(existing),
            "idempotent_replay": True,
            "url": f"{app_url.rstrip('/')}/pyq",
        }

    bank = await active_bank(db)
    question = await db.scalar(
        select(PyqCatalogQuestion).where(
            PyqCatalogQuestion.bank_version == bank.version,
            PyqCatalogQuestion.question_uid == draft.question_uid,
        )
    )
    if question is None:
        raise HTTPException(404, "Unknown PYQ question")
    await validate_session_association(
        db,
        owner_id=owner_id,
        session_id=draft.session_id,
        bank_version=bank.version,
        question_uid=question.question_uid,
    )

    validate_question_response(question, draft)
    correctness = (
        None if draft.decision == "SKIP" else evaluate_answer(question, draft.selected_answer)
    )
    score = score_question(question, draft.decision, correctness)
    await lock_identity(db, "pyq_attempt_sequence", owner_id, question.question_uid)
    previous_attempts = await db.scalar(
        select(func.count(Record.id)).where(
            Record.collection == "pyq_attempts",
            Record.owner_id == owner_id,
            Record.data["question_uid"].as_string() == question.question_uid,
        )
    )
    now = datetime.now(UTC).isoformat()
    snapshot = question_snapshot(question)
    row = (
        await upsert_records(
            db,
            collection="pyq_attempts",
            owner_id=owner_id,
            items=[
                {
                    "id": attempt_id,
                    "request_hash": request_hash,
                    "pyq_session_id": draft.session_id,
                    "question_uid": question.question_uid,
                    "capture_origin": "chatgpt",
                    "attempt_number": int(previous_attempts or 0) + 1,
                    "subject": question.subject,
                    "year": question.year,
                    "selected_answer": draft.selected_answer,
                    "correct_answer": canonical_logged_answer(question),
                    "question_snapshot": snapshot,
                    "answer_status": snapshot["answer_status"],
                    "mark_decision": draft.decision,
                    "attempted_at": now,
                    "question_started_at": None,
                    "time_spent_ms": draft.duration_ms,
                    "time_spent_sec": (
                        math.ceil(draft.duration_ms / 1000) if draft.duration_ms is not None else 0
                    ),
                    "duration_source": draft.duration_source,
                    "screenshot_url": None,
                    "bank_version": bank.version,
                    "question_type": score["question_type"],
                    "question_marks": score["marks"],
                    "capture_version": 3,
                    "reattempt_id": None,
                    "reattempt_round": None,
                    "round_attempt_number": None,
                    **score,
                    "confidence": (
                        "high"
                        if draft.decision == "MARK"
                        else "medium"
                        if draft.decision == "FIFTY_FIFTY"
                        else None
                    ),
                }
            ],
        )
    )[0]
    return {
        **to_api(row),
        "idempotent_replay": False,
        "url": f"{app_url.rstrip('/')}/pyq",
    }
