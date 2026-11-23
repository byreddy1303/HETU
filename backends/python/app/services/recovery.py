"""Owner-scoped, retry-safe recovery workflows over the existing record store."""

from __future__ import annotations

import math
import re
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from pydantic import Field, field_validator, model_validator
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, User
from app.services.learning_library import StrictModel, fingerprint, stable_id
from app.services.pyq_catalog import (
    active_bank,
    bank_question,
    question_payload,
    transfer_candidate,
)
from app.services.pyq_practice import (
    PyqAttemptDraft,
    canonical_logged_answer,
    evaluate_answer,
    submit_pyq_attempt,
    validate_question_response,
)
from app.services.records import lock_identity, require_version, to_api, upsert_records
from app.services.recovery_engine import (
    DEFAULT_EXAM_DATE,
    Mode,
    build_sprint,
    derive_grade,
    exam_interval,
    forecast,
    is_final_pass_due,
    rank_candidates,
    transition,
)

SCAN_LIMIT = 2000
CONFIDENCE = Literal["low", "medium", "high"]


class SessionStart(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    mode: Mode = "minutes-20"
    subject: str | None = Field(default=None, min_length=1, max_length=160)
    item_ids: list[str] | None = Field(default=None, min_length=1, max_length=100)


class SessionCommand(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=1, strict=True)
    expected_index: int = Field(ge=0, strict=True)
    item_id: str = Field(min_length=1, max_length=128)


class SessionCheckpoint(SessionCommand):
    action: Literal["draft", "resume", "interrupt", "abandon"]
    draft_answer: dict[str, Any] | None = None
    elapsed_ms: int | None = Field(default=None, ge=0, le=86_400_000, strict=True)
    reason: str | None = Field(default=None, max_length=1000)


class SessionDefer(SessionCommand):
    reason: str = Field(min_length=1, max_length=1000)


class RecoveryAnswer(SessionCommand):
    answer: str | int | float | list[str | int | float] | None = None
    confidence: CONFIDENCE | None = None
    assistance: Literal["none", "hint", "solution"] = "none"
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000, strict=True)
    duration_source: Literal["measured", "reported", "unknown"] = "unknown"
    reported_correct: bool | None = Field(default=None, strict=True)
    source_pyq_attempt_id: str | None = Field(default=None, min_length=1, max_length=128)

    @field_validator("answer", mode="before")
    @classmethod
    def finite_answer(cls, value: Any) -> Any:
        values = value if isinstance(value, list) else [value]
        if any(
            isinstance(v, bool) or (isinstance(v, float) and not math.isfinite(v)) for v in values
        ):
            raise ValueError("Answer cannot contain boolean or nonfinite values")
        return value

    @model_validator(mode="after")
    def timing(self) -> RecoveryAnswer:
        if self.duration_source == "measured" and self.duration_ms is None:
            raise ValueError("Measured duration requires duration_ms")
        return self


class RemediationDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=1, strict=True)
    corrected_opening_move: str = Field(min_length=8, max_length=5000)
    focused_plan: str = Field(min_length=8, max_length=5000)
    session_id: str | None = Field(default=None, max_length=128)
    expected_session_version: int | None = Field(default=None, ge=1, strict=True)
    expected_index: int | None = Field(default=None, ge=0, strict=True)


class TransferDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=1, strict=True)
    question_uid: str | None = Field(default=None, max_length=128)
    delay_days: int = Field(default=3, ge=1, le=30, strict=True)


class TriageDraft(StrictModel):
    """The learner's own answer to: did you miss this question in the test?"""

    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=1, strict=True)
    decision: Literal["missed", "correct", "unsure"]


class RebalanceDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    per_day: int = Field(default=8, ge=1, le=50, strict=True)
    max_days: int = Field(default=7, ge=1, le=21, strict=True)


def now_utc() -> datetime:
    return datetime.now(UTC)


async def account_clock(db: AsyncSession, owner_id: str) -> tuple[str, date, str]:
    user = await db.get(User, owner_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, "HETU account is unavailable")
    timezone = user.profile.get("timezone") or "Asia/Kolkata"
    try:
        zone = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, TypeError) as cause:
        raise HTTPException(422, "Account timezone is invalid; update it in Settings") from cause
    now = now_utc()
    return now.isoformat(), now.astimezone(zone).date(), timezone


def account_exam_date(user: User | None) -> date | None:
    """The exam the schedule works towards: the profile's date, else the GATE 2027 default."""
    raw = (user.profile or {}).get("exam_date") if user is not None else None
    if isinstance(raw, str) and raw.strip():
        try:
            return date.fromisoformat(raw.strip()[:10])
        except ValueError:
            pass
    return DEFAULT_EXAM_DATE


async def exam_date_for(db: AsyncSession, owner_id: str) -> date | None:
    return account_exam_date(await db.get(User, owner_id))


async def owner_lock(db: AsyncSession, owner_id: str) -> None:
    # One consistent lock order for PYQ capture, answer and session mutations.
    if db.bind.dialect.name == "sqlite":
        # SQLite has no advisory locks. Acquire its transaction-scoped writer
        # reservation before reading workflow state; a no-op preserves profiles.
        await db.execute(text("UPDATE users SET id=id WHERE id=:owner"), {"owner": owner_id})
    else:
        await lock_identity(db, "recovery_owner", owner_id, "workflow")


async def owned(db: AsyncSession, owner_id: str, collection: str, record_id: str) -> Record:
    row = await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner_id,
            Record.collection == collection,
            Record.external_id == record_id,
            Record.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise HTTPException(404, "Recovery record not found")
    return row


async def write(
    db: AsyncSession, owner_id: str, collection: str, data: dict, row: Record | None = None
) -> Record:
    return (
        await upsert_records(
            db,
            collection=collection,
            owner_id=owner_id,
            items=[
                {
                    **data,
                    **({"id": row.external_id, "expected_version": row.version} if row else {}),
                }
            ],
        )
    )[0]


async def begin(
    db: AsyncSession, owner_id: str, operation: str, key: str, payload: dict
) -> tuple[str, dict | None]:
    await owner_lock(db, owner_id)
    receipt_id = stable_id(f"recovery-{operation}", key)
    receipt = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "plugin_receipts",
            Record.external_id == receipt_id,
        )
    )
    request_hash = fingerprint(
        {
            k: v
            for k, v in payload.items()
            if k not in {"expected_version", "expected_session_version"}
        }
    )
    if receipt:
        if receipt.data.get("request_hash") != request_hash:
            raise HTTPException(409, "Recovery key was reused for different content")
        return request_hash, {**receipt.data["result"], "idempotent_replay": True}
    return request_hash, None


async def finish(
    db: AsyncSession, owner_id: str, operation: str, key: str, request_hash: str, result: dict
) -> dict:
    result = {**result, "idempotent_replay": False}
    await write(
        db,
        owner_id,
        "plugin_receipts",
        {
            "id": stable_id(f"recovery-{operation}", key),
            "operation": operation,
            "request_hash": request_hash,
            "result": result,
        },
    )
    return result


def event_data(
    item_id: str, key: str, event_type: str, occurred_at: str, today: date, timezone: str, **fields
) -> dict:
    return {
        "id": stable_id("recovery-event", key),
        "learning_item_id": item_id,
        "event_type": event_type,
        "occurred_at": occurred_at,
        "local_date": today.isoformat(),
        "timezone": timezone,
        "source_pyq_attempt_id": None,
        "recovery_session_id": None,
        "grade": None,
        "is_correct": None,
        "answer": None,
        "confidence": None,
        "time_spent_ms": None,
        "hint_used": False,
        "idempotency_key": key,
        "metadata": {},
        **fields,
    }


async def append_event(db: AsyncSession, owner_id: str, data: dict) -> Record:
    existing = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "learning_events",
            Record.data["idempotency_key"].as_string() == data["idempotency_key"],
        )
    )
    return existing or await write(db, owner_id, "learning_events", data)


def initial_item(
    *,
    item_id: str,
    subject: str,
    topic: str | None,
    today: date,
    reasons: list[str],
    exam_date: date | None = None,
    **fields,
) -> dict:
    first_gap = exam_interval(3, today, exam_date) or 3
    return {
        "id": item_id,
        "source_kind": "manual",
        "question_uid": None,
        "source_question_id": None,
        "content_fingerprint": None,
        "subject": subject,
        "topic": topic,
        "origin_pyq_attempt_id": None,
        "latest_pyq_attempt_id": None,
        "analysis_state": "pending",
        "recovery_state": "active",
        "stage": "D3",
        "scheduled_date": (today + timedelta(days=first_gap)).isoformat(),
        "reason_flags": reasons,
        "lapse_count": 0,
        "successful_retrieval_count": 0,
        "last_grade": None,
        "last_interval_days": None,
        "successful_due_d30_at": None,
        "transfer_passed_at": None,
        "mastered_at": None,
        **fields,
    }


def weak_reasons(attempt: dict) -> list[str]:
    reasons = []
    correct = attempt.get("mark_correct")
    if attempt.get("mark_decision") == "SKIP":
        reasons.append("skipped")
    if correct is False:
        reasons.append("wrong")
    if attempt.get("confidence") == "low":
        reasons.append("low-confidence")
    if correct is False and attempt.get("confidence") == "high":
        reasons.append("high-confidence-wrong")
    if correct is True and attempt.get("mark_decision") == "FIFTY_FIFTY":
        reasons.append("guessed-correct")
    target = target_seconds(
        attempt.get("question_marks") or (attempt.get("question_snapshot") or {}).get("marks")
    )
    if (
        correct is True
        and attempt.get("duration_source") != "unknown"
        and (attempt.get("time_spent_sec") or 0) > target
    ):
        reasons.append("slow-correct")
    return reasons


def target_seconds(marks: Any) -> int:
    if type(marks) in {int, float} and math.isfinite(marks) and marks > 0:
        return round(marks * 90)
    return 120


REHEARSAL_WINDOW = timedelta(hours=20)
CREDIT_GRADES = {"good", "easy", "hard", "again"}


def parse_instant(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


async def recent_key_exposure(
    db: AsyncSession, owner_id: str, question_uid: str, attempt_id: str, attempted: datetime
) -> datetime | None:
    """Latest earlier committed answer to this question inside the rehearsal window.

    Committing an answer reveals its key, so a correct answer soon afterwards shows
    short-term memory, not spaced recall.
    """
    rows = await db.scalars(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "pyq_attempts",
            Record.deleted_at.is_(None),
            Record.data["question_uid"].as_string() == question_uid,
            Record.external_id != attempt_id,
        )
    )
    latest = None
    for row in rows:
        seen = parse_instant(row.data.get("attempted_at"))
        if seen is None or seen >= attempted or attempted - seen > REHEARSAL_WINDOW:
            continue
        latest = seen if latest is None or seen > latest else latest
    return latest


async def lapsed_on(db: AsyncSession, owner_id: str, item_id: str, day: date) -> bool:
    found = await db.scalar(
        select(Record.id)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "learning_events",
            Record.deleted_at.is_(None),
            Record.data["learning_item_id"].as_string() == item_id,
            Record.data["grade"].as_string() == "again",
            Record.data["local_date"].as_string() == day.isoformat(),
        )
        .limit(1)
    )
    return found is not None


def practice_confidence(attempt: dict) -> str | None:
    """A 50/50 mark is a guess, whatever confidence chip was chosen."""
    if attempt.get("mark_decision") == "FIFTY_FIFTY":
        return "low"
    value = attempt.get("confidence")
    return value if value in {"low", "medium", "high"} else None


async def credit_practice_attempt(
    db: AsyncSession,
    *,
    owner_id: str,
    item: Record,
    data: dict,
    attempt: dict,
    attempt_id: str,
    attempted_at: str,
    attempted_day: date,
) -> tuple[dict, dict]:
    """Grade a later answer to a question that already has a learning item.

    Practice, mocks and Review mistakes all reach the same ladder: a miss is a lapse,
    and a correct due answer advances it exactly like a re-attempt session would.
    """
    previous_stage = data.get("stage")
    due = data.get("scheduled_date")
    exam_date = await exam_date_for(db, owner_id)
    final_pass = is_final_pass_due(data, attempted_day)
    correct = attempt.get("mark_correct")
    blank = attempt.get("mark_decision") == "SKIP" or attempt.get("selected_answer") in (
        None,
        "",
        [],
    )
    summary: dict[str, Any] = {
        "via": "practice",
        "credited": False,
        "previous_stage": previous_stage,
        "next_stage": previous_stage,
        "next_due_date": due,
    }
    if correct is None and not blank:
        return data, {
            **summary,
            "outcome": "ungraded",
            "explanation": "This answer has no checkable key, so the re-attempt is unchanged.",
        }
    if data.get("recovery_state") == "paused":
        return data, {
            **summary,
            "outcome": "paused",
            "explanation": "This re-attempt is paused. Your answer is saved without moving it.",
        }
    if blank or correct is False:
        # One lapse per item per day: a second miss today reschedules without escalating twice.
        already = await lapsed_on(db, owner_id, item.external_id, attempted_day)
        base = (
            {**data, "lapse_count": max(0, int(data.get("lapse_count", 0)) - 1)}
            if already
            else data
        )
        result = transition(
            base,
            grade="again",
            today=attempted_day,
            occurred_at=attempted_at,
            qualification="canonical",
            exam_date=exam_date,
        )
        updated = {**result["item"], "analysis_state": "pending"}
        return updated, {
            **summary,
            "credited": True,
            "outcome": "again",
            "grade": "again",
            "next_stage": updated["stage"],
            "next_due_date": updated["scheduled_date"],
            "lapse_count": updated["lapse_count"],
            "remediation": updated["recovery_state"] == "remediation",
            "explanation": (
                "Missed again: this needs focused remediation before its next re-attempt."
                if updated["recovery_state"] == "remediation"
                else f"Missed again: back to {updated['stage']}, next re-attempt "
                f"{updated['scheduled_date']}."
            ),
        }
    if not final_pass and (
        data.get("recovery_state") in {"mastered", "remediation"}
        or previous_stage in {"MASTERED", "TRANSFER"}
    ):
        reason = (
            "already mastered"
            if previous_stage == "MASTERED" or data.get("recovery_state") == "mastered"
            else "waiting for remediation"
            if data.get("recovery_state") == "remediation"
            else "waiting for its unseen transfer question"
        )
        return data, {
            **summary,
            "outcome": "rehearsal",
            "reason": reason,
            "explanation": f"Correct. Saved as practice; this item is {reason}.",
        }
    attempted = parse_instant(attempted_at) or now_utc()
    seen = await recent_key_exposure(db, owner_id, attempt["question_uid"], attempt_id, attempted)
    if seen is not None:
        return data, {
            **summary,
            "outcome": "rehearsal",
            "reason": "key seen within 20 hours",
            "explanation": (
                "Correct, but you saw this key within the last 20 hours, so it counts as "
                f"practice. The re-attempt stays due {due}."
            ),
        }
    if not isinstance(due, str) or due > attempted_day.isoformat():
        return data, {
            **summary,
            "outcome": "rehearsal",
            "reason": "not due yet",
            "explanation": f"Correct. Early practice; the spaced re-attempt stays due {due}.",
        }
    measured = attempt.get("duration_source") != "unknown" and isinstance(
        attempt.get("time_spent_ms"), int | float
    )
    graded = derive_grade(
        correct=True,
        blank=False,
        seconds=attempt["time_spent_ms"] / 1000 if measured else None,
        target_seconds=target_seconds(
            attempt.get("question_marks") or (attempt.get("question_snapshot") or {}).get("marks")
        ),
        confidence=practice_confidence(attempt),
        assisted=False,
        prior_successes=int(data.get("successful_retrieval_count", 0)),
    )
    result = transition(
        data,
        grade=graded["grade"],
        today=attempted_day,
        occurred_at=attempted_at,
        qualification="canonical",
        exam_date=exam_date,
    )
    updated = result["item"]
    return updated, {
        **summary,
        "credited": True,
        "outcome": graded["grade"],
        "grade": graded["grade"],
        "grade_reasons": graded["reasons"],
        "next_stage": updated["stage"],
        "next_due_date": updated["scheduled_date"],
        "mastered": result["mastered"],
        "final_pass": final_pass and result["mastered"],
        "explanation": result["explanation"],
    }


async def capture_attempt(
    db: AsyncSession, *, owner_id: str, attempt_id: str, question_id: str | None = None
) -> dict | None:
    await owner_lock(db, owner_id)
    attempt_row = await owned(db, owner_id, "pyq_attempts", attempt_id)
    attempt = attempt_row.data
    reasons = weak_reasons(attempt)
    existing = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "learning_items",
            Record.deleted_at.is_(None),
            Record.data["question_uid"].as_string() == attempt["question_uid"],
        )
    )
    # A clean first solve needs no ladder; a later answer to a scheduled question always counts.
    if not reasons and existing is None:
        return None
    occurred, today, timezone = await account_clock(db, owner_id)
    attempted_at = attempt.get("attempted_at") or occurred
    try:
        attempted_day = (
            datetime.fromisoformat(attempted_at.replace("Z", "+00:00"))
            .astimezone(ZoneInfo(timezone))
            .date()
        )
    except (ValueError, TypeError):
        raise HTTPException(422, "Attempt timestamp is invalid") from None
    event_key = f"attempt:{attempt_id}"
    previous = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "learning_events",
            Record.data["idempotency_key"].as_string() == event_key,
        )
    )
    credit = None
    if existing and previous:
        item = existing
        credit = (previous.data.get("metadata") or {}).get("credit")
    else:
        if existing:
            data = dict(existing.data)
            data.update(
                {
                    "latest_pyq_attempt_id": attempt_id,
                    "subject": attempt.get("subject", data["subject"]),
                    "topic": (attempt.get("question_snapshot") or {}).get(
                        "topic", data.get("topic")
                    ),
                    "reason_flags": list(dict.fromkeys([*data.get("reason_flags", []), *reasons])),
                }
            )
            data, credit = await credit_practice_attempt(
                db,
                owner_id=owner_id,
                item=existing,
                data=data,
                attempt=attempt,
                attempt_id=attempt_id,
                attempted_at=attempted_at,
                attempted_day=attempted_day,
            )
        else:
            data = initial_item(
                item_id=stable_id("recovery-pyq", f"{owner_id}:{attempt['question_uid']}"),
                subject=attempt.get("subject") or "Unclassified",
                topic=(attempt.get("question_snapshot") or {}).get("topic"),
                today=attempted_day,
                reasons=reasons,
                exam_date=await exam_date_for(db, owner_id),
                source_kind="pyq",
                question_uid=attempt["question_uid"],
                origin_pyq_attempt_id=attempt_id,
                latest_pyq_attempt_id=attempt_id,
            )
        item = await write(db, owner_id, "learning_items", data, existing)
    graded = bool(credit and credit.get("credited"))
    event = previous or await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            event_key,
            f"retrieval_{credit['grade']}" if graded else "answer_committed",
            attempted_at,
            attempted_day,
            timezone,
            source_pyq_attempt_id=attempt_id,
            grade=credit["grade"] if graded else None,
            is_correct=attempt.get("mark_correct"),
            answer=attempt.get("selected_answer"),
            confidence=attempt.get("confidence"),
            time_spent_ms=attempt.get("time_spent_ms"),
            metadata={
                "mark_decision": attempt.get("mark_decision"),
                "question_uid": attempt["question_uid"],
                "capture_version": attempt.get("capture_version"),
                "question_marks": attempt.get("question_marks"),
                "pyq_session_id": attempt.get("pyq_session_id"),
                "duration_source": attempt.get("duration_source", "measured"),
                **(
                    {
                        "credit": credit,
                        "previous_stage": credit["previous_stage"],
                        "next_stage": credit["next_stage"],
                        "next_due_date": credit["next_due_date"],
                        "qualification": "canonical" if graded else "practice",
                        "canonical_version": "recovery-v1",
                    }
                    if credit
                    else {}
                ),
            },
        ),
    )
    if graded and not previous:
        await record_practice_history(db, owner_id, item, attempt, attempted_day, credit)
    question = (
        await owned(db, owner_id, "questions", question_id)
        if question_id
        else await db.scalar(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == "questions",
                Record.deleted_at.is_(None),
                Record.data["source_pyq_attempt_id"].as_string() == attempt_id,
            )
        )
    )
    if question and question.data.get("source_pyq_attempt_id") != attempt_id:
        raise HTTPException(422, "Journal question does not reference this attempt")
    reattempt = await projection(db, owner_id, item, question.external_id) if question else None
    return {
        "item": to_api(item),
        "event": to_api(event),
        "reasons": reasons,
        "credit": credit,
        "compatibilityQuestion": to_api(question) if question else None,
        "compatibilityReattempt": to_api(reattempt) if reattempt else None,
    }


async def record_practice_history(
    db: AsyncSession, owner_id: str, item: Record, attempt: dict, day: date, credit: dict
) -> None:
    """Mirror a credited practice answer onto the Re-attempts history it belongs to."""
    rows = list(
        await db.scalars(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == "reattempts",
                Record.deleted_at.is_(None),
                Record.data["learning_item_id"].as_string() == item.external_id,
            )
        )
    )
    clean = credit["grade"] in {"good", "easy"}
    entry: dict[str, Any] = {
        "date": day.isoformat(),
        "result": "clean" if clean else "fail",
        "selectedAnswer": attempt.get("selected_answer"),
        "recovery_grade": credit["grade"],
        "hint_used": False,
        "via": "practice",
    }
    if isinstance(attempt.get("time_spent_ms"), int | float):
        entry["timeSpent"] = math.ceil(attempt["time_spent_ms"] / 1000)
    for row in rows:
        await write(
            db,
            owner_id,
            "reattempts",
            {
                **row.data,
                "stage": "D30" if item.data["stage"] == "TRANSFER" else item.data["stage"],
                "scheduled_date": item.data.get("scheduled_date") or row.data["scheduled_date"],
                "history": [*row.data.get("history", []), entry],
                "practice_only": bool(row.data.get("practice_only")) and clean,
            },
            row,
        )


async def projection(
    db: AsyncSession,
    owner_id: str,
    item: Record,
    question_id: str,
    history_entry: dict | None = None,
) -> Record:
    row = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "reattempts",
            Record.deleted_at.is_(None),
            Record.data["learning_item_id"].as_string() == item.external_id,
        )
    )
    if row is None:
        row = await db.scalar(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "reattempts",
                Record.deleted_at.is_(None),
                Record.data["question_id"].as_string() == question_id,
            )
            .order_by(Record.created_at)
            .limit(1)
        )
    data = (
        dict(row.data)
        if row
        else {"id": stable_id("recovery-projection", item.external_id), "history": []}
    )
    data.update(
        question_id=question_id,
        learning_item_id=item.external_id,
        stage="D30" if item.data["stage"] == "TRANSFER" else item.data["stage"],
        scheduled_date=item.data.get("scheduled_date")
        or data.get("scheduled_date")
        or date.today().isoformat(),
    )
    if history_entry:
        data["history"] = [*data.get("history", []), history_entry]
    return await write(db, owner_id, "reattempts", data, row)


async def schedule_question(db: AsyncSession, *, owner_id: str, question_id: str) -> dict:
    await owner_lock(db, owner_id)
    question = await owned(db, owner_id, "questions", question_id)
    if question.data.get("source_pyq_attempt_id"):
        captured = await capture_attempt(
            db,
            owner_id=owner_id,
            attempt_id=question.data["source_pyq_attempt_id"],
            question_id=question_id,
        )
        if captured:
            return captured
    occurred, today, timezone = await account_clock(db, owner_id)
    item = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "learning_items",
            Record.deleted_at.is_(None),
            Record.data["source_question_id"].as_string() == question_id,
        )
    )
    if item is None:
        data = initial_item(
            item_id=stable_id("recovery-manual", f"{owner_id}:{question_id}"),
            subject=question.data.get("subject") or "Unclassified",
            topic=question.data.get("subtopic"),
            today=today,
            reasons=["manual-recovery"],
            exam_date=await exam_date_for(db, owner_id),
            source_question_id=question_id,
            analysis_state="completed",
        )
        item = await write(db, owner_id, "learning_items", data)
        await append_event(
            db,
            owner_id,
            event_data(
                item.external_id,
                f"manual-question:{question_id}",
                "created",
                occurred,
                today,
                timezone,
                metadata={
                    "source_question_id": question_id,
                    "outcome": question.data.get("outcome"),
                },
            ),
        )
    elif item.data.get("recovery_state") == "mastered":
        gap = exam_interval(3, today, await exam_date_for(db, owner_id)) or 3
        item = await write(
            db,
            owner_id,
            "learning_items",
            {
                **item.data,
                "stage": "D3",
                "recovery_state": "active",
                "scheduled_date": (today + timedelta(days=gap)).isoformat(),
                "mastered_at": None,
            },
            item,
        )
        await append_event(
            db,
            owner_id,
            event_data(
                item.external_id,
                f"reopened:{item.external_id}:{item.version}",
                "created",
                occurred,
                today,
                timezone,
                metadata={"reopened": True, "source_question_id": question_id},
            ),
        )
    reattempt = await projection(db, owner_id, item, question_id)
    return {
        "item": to_api(item),
        "compatibilityQuestion": to_api(question),
        "compatibilityReattempt": to_api(reattempt),
    }


async def complete_analysis(db: AsyncSession, *, owner_id: str, attempt_id: str) -> dict | None:
    await owner_lock(db, owner_id)
    captured = await capture_attempt(db, owner_id=owner_id, attempt_id=attempt_id)
    if captured is None:
        return None
    item = await owned(db, owner_id, "learning_items", captured["item"]["id"])
    occurred, today, timezone = await account_clock(db, owner_id)
    if item.data.get("analysis_state") != "completed":
        item = await write(
            db, owner_id, "learning_items", {**item.data, "analysis_state": "completed"}, item
        )
    event = await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"analysis:{attempt_id}",
            "analysis_completed",
            occurred,
            today,
            timezone,
            source_pyq_attempt_id=attempt_id,
        ),
    )
    return {"item": to_api(item), "event": to_api(event)}


async def reconcile_recovery(
    db: AsyncSession, *, owner_id: str, cursor: int = 0, limit: int = 100
) -> dict:
    """Read existing evidence; no caller-supplied historical grades or dates are imported."""
    await owner_lock(db, owner_id)
    rows = list(
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection.in_(["concept_reviews", "reattempts", "pyq_attempts"]),
                Record.deleted_at.is_(None),
            )
            .order_by(Record.collection, Record.external_id)
            .offset(cursor)
            .limit(limit + 1)
        )
    )
    counts = {"attempts": 0, "ladders": 0, "concept_reviews": 0}
    occurred, today, timezone = await account_clock(db, owner_id)
    for source in rows[:limit]:
        if source.collection == "concept_reviews":
            await ensure_concept_item(db, owner_id=owner_id, review=source)
            counts["concept_reviews"] += 1
            continue
        if source.collection == "pyq_attempts":
            # Retrieval receipts already belong to an item. Avoid a second transfer ladder.
            if not source.data.get("recovery_session_id") and not source.data.get("reattempt_id"):
                await capture_attempt(db, owner_id=owner_id, attempt_id=source.external_id)
            counts["attempts"] += 1
            continue
        if source.data.get("learning_item_id"):
            counts["ladders"] += 1
            continue
        original_source = deepcopy(source.data)
        question = await db.scalar(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == "questions",
                Record.deleted_at.is_(None),
                Record.external_id == source.data.get("question_id"),
            )
        )
        if question is None:
            continue
        captured = await schedule_question(db, owner_id=owner_id, question_id=question.external_id)
        item = await owned(db, owner_id, "learning_items", captured["item"]["id"])
        # Keep the most conservative existing open stage/due date. Legacy "mastered"
        # has no due/cue/key proof; preserve it on the source row, review the projection.
        stage = original_source.get("stage", "D3")
        if stage in {"D3", "D10", "D30"} and item.data.get("successful_retrieval_count", 0) == 0:
            due = original_source.get("scheduled_date")
            try:
                due = date.fromisoformat(due).isoformat()
            except (ValueError, TypeError):
                due = item.data["scheduled_date"]
            item = await write(
                db,
                owner_id,
                "learning_items",
                {
                    **item.data,
                    "stage": stage,
                    "scheduled_date": due,
                    "reason_flags": list(
                        dict.fromkeys([*item.data["reason_flags"], "legacy-recovery"])
                    ),
                },
                item,
            )
        source = await owned(db, owner_id, "reattempts", source.external_id)
        # Keep the original ladder projection and every history entry. Subsequent
        # real retrievals update its projection; migration only attaches identity.
        await write(
            db,
            owner_id,
            "reattempts",
            {**original_source, "learning_item_id": item.external_id},
            source,
        )
        for index, entry in enumerate(original_source.get("history", [])):
            try:
                local_day = date.fromisoformat(entry["date"])
            except (ValueError, KeyError, TypeError):
                continue
            await append_event(
                db,
                owner_id,
                event_data(
                    item.external_id,
                    f"legacy-history:{source.external_id}:{index + 1}",
                    "retrieval_good" if entry.get("result") == "clean" else "retrieval_again",
                    f"{local_day.isoformat()}T00:00:00+00:00",
                    local_day,
                    timezone,
                    grade="good" if entry.get("result") == "clean" else "again",
                    is_correct=entry.get("result") == "clean",
                    answer=entry.get("selectedAnswer"),
                    metadata={
                        "legacy_import": True,
                        "legacy_history": entry,
                        "qualification": "reported",
                    },
                ),
            )
        counts["ladders"] += 1
    return {
        "processed": counts,
        "next_cursor": cursor + limit if len(rows) > limit else None,
        "complete": len(rows) <= limit,
    }


async def recovery_candidates(
    db: AsyncSession, owner_id: str, subject: str | None = None
) -> tuple[list[dict], bool]:
    statement = select(Record).where(
        Record.owner_id == owner_id,
        Record.collection == "learning_items",
        Record.deleted_at.is_(None),
    )
    if subject:
        statement = statement.where(
            func.lower(Record.data["subject"].as_string()) == subject.lower()
        )
    items = list(
        await db.scalars(
            statement.order_by(Record.data["scheduled_date"].as_string(), Record.external_id).limit(
                SCAN_LIMIT + 1
            )
        )
    )
    complete = len(items) <= SCAN_LIMIT
    result = []
    attempt_ids = {row.data.get("origin_pyq_attempt_id") for row in items[:SCAN_LIMIT]} - {None}
    attempts = (
        {
            row.external_id: row.data
            for row in await db.scalars(
                select(Record).where(
                    Record.owner_id == owner_id,
                    Record.collection == "pyq_attempts",
                    Record.external_id.in_(attempt_ids),
                    Record.deleted_at.is_(None),
                )
            )
        }
        if attempt_ids
        else {}
    )
    question_ids = {row.data.get("source_question_id") for row in items[:SCAN_LIMIT]} - {None}
    questions = (
        {
            row.external_id: row.data
            for row in await db.scalars(
                select(Record).where(
                    Record.owner_id == owner_id,
                    Record.collection == "questions",
                    Record.external_id.in_(question_ids),
                    Record.deleted_at.is_(None),
                )
            )
        }
        if question_ids
        else {}
    )
    for row in items[:SCAN_LIMIT]:
        data = row.data
        try:
            if data.get("scheduled_date"):
                date.fromisoformat(data["scheduled_date"])
        except (ValueError, TypeError):
            complete = False
            continue
        attempt = attempts.get(data.get("origin_pyq_attempt_id"), {})
        question = questions.get(data.get("source_question_id"), {})
        target = question.get("target_time_sec") or target_seconds(attempt.get("question_marks"))
        result.append(
            {
                "item": to_api(row),
                "estimatedSeconds": max(30, float(target)),
                "marks": attempt.get("question_marks"),
                "confidenceSurprise": "high-confidence-wrong" in data.get("reason_flags", []),
            }
        )
    return result, complete


async def recovery_overview(
    db: AsyncSession,
    *,
    owner_id: str,
    mode: Mode = "minutes-20",
    subject: str | None = None,
    days: int = 7,
) -> dict:
    occurred, today, timezone = await account_clock(db, owner_id)
    candidates, complete = await recovery_candidates(db, owner_id, subject)
    due = [
        row
        for row in candidates
        if row["item"].get("scheduled_date") and row["item"]["scheduled_date"] <= today.isoformat()
    ]
    return {
        "as_of": today.isoformat(),
        "timezone": timezone,
        "retrieved_at": occurred,
        "sprint": build_sprint(due, mode, today),
        "forecast": forecast(candidates, today, days),
        "complete": complete,
        "scan_limit": SCAN_LIMIT,
    }


async def start_session(
    db: AsyncSession, *, owner_id: str, draft: SessionStart, app_url: str
) -> dict:
    operation = "session-start"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    occurred, today, timezone = await account_clock(db, owner_id)
    candidates, complete = await recovery_candidates(db, owner_id, draft.subject)
    if not complete:
        raise HTTPException(409, "Recovery selection is incomplete; filter by subject")
    if draft.item_ids:
        if len(set(draft.item_ids)) != len(draft.item_ids):
            raise HTTPException(422, "Duplicate recovery item IDs")
        selected_ids = set(draft.item_ids)
        candidates = [row for row in candidates if row["item"]["id"] in selected_ids]
        if {row["item"]["id"] for row in candidates} != selected_ids:
            raise HTTPException(404, "Recovery item not found in this account")
    candidates = [
        row
        for row in candidates
        if row["item"].get("scheduled_date") and row["item"]["scheduled_date"] <= today.isoformat()
    ]
    sprint = build_sprint(candidates, draft.mode, today)
    if not sprint["selected"]:
        raise HTTPException(409, "No due recovery item fits this sprint")
    session = await write(
        db,
        owner_id,
        "recovery_sessions",
        {
            "id": stable_id("recovery-session", draft.idempotency_key),
            "status": "active",
            "mode": draft.mode,
            "selection_seed": draft.idempotency_key,
            "item_ids": [r["item"]["id"] for r in sprint["selected"]],
            "current_index": 0,
            "queue_snapshot": [
                {
                    "position": i,
                    "learning_item_id": r["item"]["id"],
                    "subject": r["item"]["subject"],
                    "topic": r["item"].get("topic"),
                    "stage": r["item"]["stage"],
                    "scheduled_date": r["item"]["scheduled_date"],
                    "reason_flags": r["item"]["reason_flags"],
                    "priority_reasons": r["reasons"],
                    "priority_score": r["score"],
                    "estimated_seconds": r["estimatedSeconds"],
                }
                for i, r in enumerate(sprint["selected"])
            ],
            "draft_answer": None,
            "elapsed_by_item_ms": {},
            "deferred_item_ids": [],
            "hinted_item_ids": [],
            "current_item_started_at": occurred,
            "started_at": occurred,
            "completed_at": None,
            "timezone": timezone,
            "url": (
                f"{app_url.rstrip('/')}/reattempts?recoverySession="
                f"{stable_id('recovery-session', draft.idempotency_key)}"
            ),
        },
    )
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"session": to_api(session), "sprint": sprint},
    )


async def list_sessions(
    db: AsyncSession,
    *,
    owner_id: str,
    resumable_only: bool = False,
    cursor: int = 0,
    limit: int = 25,
) -> dict:
    statement = select(Record).where(
        Record.owner_id == owner_id,
        Record.collection == "recovery_sessions",
        Record.deleted_at.is_(None),
    )
    if resumable_only:
        statement = statement.where(
            Record.data["status"].as_string().in_(["active", "paused", "interrupted"])
        )
    rows = list(
        await db.scalars(
            statement.order_by(Record.updated_at.desc(), Record.external_id)
            .offset(cursor)
            .limit(limit + 1)
        )
    )
    return {
        "items": [to_api(row) for row in rows[:limit]],
        "next_cursor": cursor + limit if len(rows) > limit else None,
        "complete": len(rows) <= limit,
    }


async def item_detail(
    db: AsyncSession, *, owner_id: str, item_id: str, cursor: int = 0, limit: int = 25
) -> dict:
    item = await owned(db, owner_id, "learning_items", item_id)
    events = list(
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "learning_events",
                Record.deleted_at.is_(None),
                Record.data["learning_item_id"].as_string() == item_id,
            )
            .order_by(Record.data["occurred_at"].as_string().desc(), Record.external_id)
            .offset(cursor)
            .limit(limit + 1)
        )
    )
    return {
        "item": to_api(item),
        "events": [to_api(row) for row in events[:limit]],
        "next_cursor": cursor + limit if len(events) > limit else None,
        "complete": len(events) <= limit,
    }


async def get_session(db: AsyncSession, *, owner_id: str, session_id: str) -> dict:
    session = await owned(db, owner_id, "recovery_sessions", session_id)
    index = session.data["current_index"]
    item_id = session.data["item_ids"][index] if index < len(session.data["item_ids"]) else None
    item = await owned(db, owner_id, "learning_items", item_id) if item_id else None
    prompt = await prompt_for(db, owner_id, item) if item else None
    return {"session": to_api(session), "item": to_api(item) if item else None, "prompt": prompt}


async def assignment(db: AsyncSession, owner_id: str, item_id: str) -> Record | None:
    return await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "learning_events",
            Record.deleted_at.is_(None),
            Record.data["learning_item_id"].as_string() == item_id,
            Record.data["event_type"].as_string() == "transfer_assigned",
        )
        .order_by(Record.data["occurred_at"].as_string().desc(), Record.external_id.desc())
        .limit(1)
    )


async def prompt_for(db: AsyncSession, owner_id: str, item: Record) -> dict:
    if item.data["stage"] == "TRANSFER":
        transfer = await assignment(db, owner_id, item.external_id)
        if not transfer:
            raise HTTPException(409, "Transfer assignment evidence is missing")
        question = bank_question(
            transfer.data["metadata"]["transfer_question_uid"],
            transfer.data["metadata"].get("bank_version"),
        )
    elif item.data["source_kind"] == "pyq":
        question = bank_question(item.data["question_uid"])
    elif item.data["source_kind"] == "concept":
        review = await owned(db, owner_id, "concept_reviews", item.data["source_review_id"])
        return {
            "kind": "concept",
            "review_id": review.external_id,
            "prompt": review.data["prompt"],
            "answer_hidden": True,
        }
    else:
        logged = await owned(db, owner_id, "questions", item.data["source_question_id"])
        return {
            "kind": "manual",
            "question_id": logged.external_id,
            "question": {
                k: v
                for k, v in logged.data.items()
                if k
                in {
                    "subject",
                    "subtopic",
                    "question_text",
                    "image_url",
                    "format",
                    "target_time_sec",
                }
            },
            "answer_hidden": True,
        }
    payload = question_payload(question)
    payload["answer"] = None
    return {"kind": "pyq", "question": payload, "answer_hidden": True}


async def current(
    db: AsyncSession,
    owner_id: str,
    session_id: str,
    command: SessionCommand,
    *,
    allow_inactive: bool = False,
) -> tuple[Record, Record]:
    session = await owned(db, owner_id, "recovery_sessions", session_id)
    require_version(session, command.expected_version)
    data = session.data
    if (
        data["current_index"] != command.expected_index
        or command.expected_index >= len(data["item_ids"])
        or data["item_ids"][command.expected_index] != command.item_id
        or (data["status"] != "active" and not allow_inactive)
        or data["status"] in {"completed", "abandoned"}
    ):
        raise HTTPException(409, "Recovery submission is stale; resume the saved question")
    item = await owned(db, owner_id, "learning_items", command.item_id)
    return session, item


def advance_session(session: Record, occurred: str) -> dict:
    index = session.data["current_index"] + 1
    completed = index >= len(session.data["item_ids"])
    return {
        **session.data,
        "current_index": index,
        "status": "completed" if completed else "active",
        "draft_answer": None,
        "current_item_started_at": None if completed else occurred,
        "completed_at": occurred if completed else None,
    }


async def checkpoint_session(
    db: AsyncSession, *, owner_id: str, session_id: str, draft: SessionCheckpoint
) -> dict:
    operation = f"checkpoint:{session_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    session, item = await current(db, owner_id, session_id, draft, allow_inactive=True)
    occurred, today, timezone = await account_clock(db, owner_id)
    data, events = dict(session.data), []
    if draft.action == "draft":
        if draft.draft_answer and draft.draft_answer.get("itemId") != item.external_id:
            raise HTTPException(409, "Draft belongs to a different recovery question")
        if len(str(draft.draft_answer).encode()) > 30000:
            raise HTTPException(413, "Recovery draft is too large")
        data["draft_answer"] = draft.draft_answer
    elif draft.action == "resume":
        if session.data["status"] != "active":
            data.update(status="active", current_item_started_at=occurred)
    elif draft.action == "abandon":
        data.update(status="abandoned", current_item_started_at=None)
    else:
        data.update(status="interrupted", current_item_started_at=None)
        if draft.elapsed_ms is not None:
            data["elapsed_by_item_ms"] = {
                **data.get("elapsed_by_item_ms", {}),
                item.external_id: max(
                    draft.elapsed_ms, data.get("elapsed_by_item_ms", {}).get(item.external_id, 0)
                ),
            }
        event = await append_event(
            db,
            owner_id,
            event_data(
                item.external_id,
                f"interrupt:{session_id}:{draft.idempotency_key}",
                "interrupted",
                occurred,
                today,
                timezone,
                recovery_session_id=session_id,
                metadata={"reason": draft.reason, "elapsed_ms": draft.elapsed_ms},
            ),
        )
        events.append(to_api(event))
    saved = await write(db, owner_id, "recovery_sessions", data, session)
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"session": to_api(saved), "events": events},
    )


async def reveal_hint(
    db: AsyncSession, *, owner_id: str, session_id: str, draft: SessionCommand
) -> dict:
    operation = f"hint:{session_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    session, item = await current(db, owner_id, session_id, draft)
    occurred, today, timezone = await account_clock(db, owner_id)
    saved = await write(
        db,
        owner_id,
        "recovery_sessions",
        {
            **session.data,
            "hinted_item_ids": list(
                dict.fromkeys([*session.data.get("hinted_item_ids", []), item.external_id])
            ),
        },
        session,
    )
    event = await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"hint_revealed:{session_id}:{draft.expected_index}",
            "hint_revealed",
            occurred,
            today,
            timezone,
            recovery_session_id=session_id,
            hint_used=True,
        ),
    )
    hint = None
    if item.data.get("source_question_id"):
        question = await owned(db, owner_id, "questions", item.data["source_question_id"])
        hint = question.data.get("trigger_sentence") or question.data.get("pattern_name")
    elif item.data.get("source_kind") == "concept":
        review = await owned(db, owner_id, "concept_reviews", item.data["source_review_id"])
        hint = review.data.get("evaluation_guidance")
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"session": to_api(saved), "hint": hint, "events": [to_api(event)]},
    )


async def defer_item(
    db: AsyncSession, *, owner_id: str, session_id: str, draft: SessionDefer
) -> dict:
    operation = f"defer:{session_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    session, item = await current(db, owner_id, session_id, draft)
    occurred, today, timezone = await account_clock(db, owner_id)
    due = item.data.get("scheduled_date")
    new_due = due if due and due > today.isoformat() else (today + timedelta(days=1)).isoformat()
    item = await write(
        db, owner_id, "learning_items", {**item.data, "scheduled_date": new_due}, item
    )
    data = advance_session(session, occurred)
    data["deferred_item_ids"] = list(
        dict.fromkeys([*data.get("deferred_item_ids", []), item.external_id])
    )
    session = await write(db, owner_id, "recovery_sessions", data, session)
    event = await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"deferred:{session_id}:{draft.expected_index}",
            "deferred",
            occurred,
            today,
            timezone,
            recovery_session_id=session_id,
            metadata={"reason": draft.reason, "next_due_date": new_due},
        ),
    )
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"session": to_api(session), "item": to_api(item), "events": [to_api(event)]},
    )


def logged_verdict(question: dict, answer: Any) -> bool | None:
    """Use the stored Journal key; keep missing/ambiguous keys explicitly ungraded."""
    if answer is None:
        return False
    key = question.get("answer_text")
    if key is None or str(key).strip() == "":
        return None
    key = re.sub(
        r"^(?:actual\s+answer|answer(?:\s+key)?|correct\s+(?:answer|option))\s*[:=-]\s*",
        "",
        str(key).strip(),
        flags=re.I,
    )
    kind = question.get("format") or question.get("question_type")
    if not kind:
        source_ref = question.get("source_ref") or ""
        match = re.search(r"(?:^| · )(MCQ|MSQ|NAT)$", source_ref)
        kind = match[1] if match else None
    if kind in {"MCQ", "MSQ"}:
        if not re.fullmatch(r"\(?[A-E]\)?[.)]?|[A-E](?:\s*[,/&+]\s*[A-E])+", key, re.I):
            return None
        expected = sorted(re.findall(r"[A-E]", key.upper()))
        selected = sorted(
            str(v).strip().upper() for v in (answer if isinstance(answer, list) else [answer])
        )
        return selected == expected
    if kind != "NAT" or isinstance(answer, list):
        return None
    try:
        value = float(answer)
        if not math.isfinite(value):
            return None
        lo, hi = question.get("nat_accepted_min"), question.get("nat_accepted_max")
        if lo is not None and hi is not None:
            return float(lo) <= value <= float(hi)
        token = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
        match = re.fullmatch(rf"[\[(]?\s*({token})\s*(?:to|\.\.|[–—-])\s*({token})\s*[\])]?", key)
        if match:
            ends = sorted(map(float, match.groups()))
            return ends[0] <= value <= ends[1]
        match = re.fullmatch(rf"({token})\s*(?:±|\+/-)\s*({token})", key)
        expected = float(match[1] if match else key)
        tolerance = question.get("nat_tolerance_abs")
        tolerance = float(tolerance) if tolerance is not None else float(match[2]) if match else 0
        return abs(value - expected) <= max(
            0, tolerance, math.ulp(max(1, abs(value), abs(expected)))
        )
    except (ValueError, TypeError, OverflowError):
        return None


async def record_answer(
    db: AsyncSession, *, owner_id: str, session_id: str, draft: RecoveryAnswer, app_url: str
) -> dict:
    operation = f"answer:{session_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    session, item = await current(db, owner_id, session_id, draft)
    previous_item = dict(item.data)
    occurred, today, timezone = await account_clock(db, owner_id)
    state = item.data.get("recovery_state")
    if state in {"paused", "remediation"} or (
        state == "mastered" and not is_final_pass_due(item.data, today)
    ):
        raise HTTPException(409, "This item requires its current recovery action before answering")
    if item.data.get("source_kind") == "concept":
        raise HTTPException(422, "Submit this concept answer through the concept response API")
    assisted = draft.assistance != "none" or item.external_id in session.data.get(
        "hinted_item_ids", []
    )
    qualification, fresh, attempt, question = "canonical", False, None, None
    if item.data["source_kind"] == "pyq":
        uid, version = item.data["question_uid"], None
        transfer = (
            await assignment(db, owner_id, item.external_id)
            if item.data["stage"] == "TRANSFER"
            else None
        )
        if item.data["stage"] == "TRANSFER":
            if transfer is None:
                raise HTTPException(409, "Transfer assignment evidence is missing")
            uid, version = (
                transfer.data["metadata"]["transfer_question_uid"],
                transfer.data["metadata"].get("bank_version"),
            )
        question = bank_question(uid, version)
        answer_draft = PyqAttemptDraft(
            idempotency_key=f"recovery:{draft.idempotency_key}",
            question_uid=uid,
            decision="SKIP" if draft.answer is None else "MARK",
            selected_answer=draft.answer,
            duration_ms=draft.duration_ms,
            duration_source=draft.duration_source,
        )
        validate_question_response(question, answer_draft)
        correct = False if draft.answer is None else evaluate_answer(question, draft.answer)
        if correct is None:
            qualification = "reported" if draft.reported_correct is not None else "ungraded"
            correct = draft.reported_correct
        if draft.source_pyq_attempt_id:
            source = await owned(db, owner_id, "pyq_attempts", draft.source_pyq_attempt_id)
            if (
                source.data.get("question_uid") != uid
                or source.data.get("bank_version") != (version or active_bank().version)
                or fingerprint(source.data.get("selected_answer")) != fingerprint(draft.answer)
            ):
                raise HTTPException(422, "Recovery receipt does not match this question and answer")
            if source.data.get("attempted_at", "") < session.data["started_at"]:
                raise HTTPException(409, "A historical attempt cannot be reused as a new retrieval")
            used = await db.scalar(
                select(Record.id)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "learning_events",
                    Record.data["source_pyq_attempt_id"].as_string() == source.external_id,
                    Record.data["event_type"]
                    .as_string()
                    .in_(["retrieval_again", "retrieval_hard", "retrieval_good", "retrieval_easy"]),
                )
                .limit(1)
            )
            if used:
                raise HTTPException(409, "This attempt already supplied recovery evidence")
            attempt = to_api(source)
        if transfer:
            seen = await db.scalar(
                select(Record.id)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "pyq_attempts",
                    Record.data["question_uid"].as_string() == uid,
                    Record.external_id != draft.source_pyq_attempt_id
                    if draft.source_pyq_attempt_id
                    else True,
                )
                .limit(1)
            )
            fresh = seen is None and not assisted
        if attempt is None:
            # A recovery answer and its canonical PYQ receipt commit together.
            attempt = await submit_pyq_attempt(
                db,
                owner_id=owner_id,
                draft=answer_draft,
                app_url=app_url,
                capture_recovery=False,
                recovery_session_id=session_id,
            )
        target = target_seconds(question.marks)
    else:
        logged = await owned(db, owner_id, "questions", item.data["source_question_id"])
        correct = logged_verdict(logged.data, draft.answer)
        if correct is None:
            qualification = "reported" if draft.reported_correct is not None else "ungraded"
            correct = draft.reported_correct
        target = max(1, float(logged.data.get("target_time_sec") or 120))
    if correct is None:
        raise HTTPException(422, "No checkable key; supply the learner's explicit self-assessment")
    grade = derive_grade(
        correct=correct,
        blank=draft.answer is None,
        seconds=draft.duration_ms / 1000
        if draft.duration_ms is not None and draft.duration_source != "unknown"
        else None,
        target_seconds=target,
        confidence=draft.confidence,
        assisted=assisted,
        prior_successes=item.data.get("successful_retrieval_count", 0),
    )
    result = transition(
        item.data,
        grade=grade["grade"],
        today=today,
        occurred_at=occurred,
        qualification=qualification,
        fresh_transfer=fresh,
        exam_date=await exam_date_for(db, owner_id),
    )
    if attempt:
        result["item"]["latest_pyq_attempt_id"] = attempt["id"]
    saved_item = await write(db, owner_id, "learning_items", result["item"], item)
    data = advance_session(session, occurred)
    if draft.duration_ms is not None:
        data["elapsed_by_item_ms"] = {
            **data.get("elapsed_by_item_ms", {}),
            item.external_id: draft.duration_ms,
        }
    saved_session = await write(db, owner_id, "recovery_sessions", data, session)
    event = await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"retrieval:{session_id}:{draft.expected_index}",
            f"retrieval_{grade['grade']}",
            occurred,
            today,
            timezone,
            recovery_session_id=session_id,
            source_pyq_attempt_id=attempt["id"] if attempt else None,
            grade=grade["grade"],
            is_correct=correct,
            answer=draft.answer,
            confidence=draft.confidence,
            time_spent_ms=draft.duration_ms,
            hint_used=assisted,
            metadata={
                "grade_reasons": grade["reasons"],
                "previous_stage": previous_item["stage"],
                "next_stage": saved_item.data["stage"],
                "next_due_date": saved_item.data["scheduled_date"],
                "target_time_sec": target,
                "duration_source": draft.duration_source,
                "qualification": qualification,
                "fresh_transfer": fresh,
                "assistance": draft.assistance,
                "canonical_version": "recovery-v1",
            },
        ),
    )
    events = [to_api(event)]
    for enabled, event_type in (
        (
            saved_item.data["recovery_state"] == "remediation"
            and previous_item["recovery_state"] != "remediation",
            "remediation_started",
        ),
        (
            previous_item["stage"] == "TRANSFER",
            "transfer_passed" if result["mastered"] else "transfer_failed",
        ),
        (result["mastered"] and previous_item["stage"] != "MASTERED", "mastered"),
    ):
        if enabled:
            events.append(
                to_api(
                    await append_event(
                        db,
                        owner_id,
                        event_data(
                            item.external_id,
                            f"{event_type}:{session_id}:{draft.expected_index}",
                            event_type,
                            occurred,
                            today,
                            timezone,
                            recovery_session_id=session_id,
                            metadata={
                                "via": "transfer"
                                if previous_item["stage"] == "TRANSFER"
                                else "due-d30",
                                "qualification": qualification,
                            },
                        ),
                    )
                )
            )
    reattempts = []
    linked = list(
        await db.scalars(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == "reattempts",
                Record.deleted_at.is_(None),
                Record.data["learning_item_id"].as_string() == item.external_id,
            )
        )
    )
    for row in linked:
        history = {
            "date": today.isoformat(),
            "result": "clean" if grade["grade"] in {"good", "easy"} else "fail",
            "selectedAnswer": draft.answer,
            "recovery_grade": grade["grade"],
            "hint_used": assisted,
        }
        if draft.duration_ms is not None:
            history["timeSpent"] = math.ceil(draft.duration_ms / 1000)
        reattempts.append(
            to_api(
                await write(
                    db,
                    owner_id,
                    "reattempts",
                    {
                        **row.data,
                        "stage": "D30"
                        if saved_item.data["stage"] == "TRANSFER"
                        else saved_item.data["stage"],
                        "scheduled_date": saved_item.data["scheduled_date"]
                        or row.data["scheduled_date"],
                        "history": [*row.data.get("history", []), history],
                        "practice_only": bool(row.data.get("practice_only")) and correct is True,
                    },
                    row,
                )
            )
        )
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {
            "session": to_api(saved_session),
            "item": to_api(saved_item),
            "grade": grade,
            "explanation": result["explanation"],
            "events": events,
            "reattempts": reattempts,
            "attempt": attempt,
            "correct_answer": canonical_logged_answer(question)
            if question
            else logged.data.get("answer_text"),
        },
    )


async def remediate(
    db: AsyncSession, *, owner_id: str, item_id: str, draft: RemediationDraft
) -> dict:
    operation = f"remediation:{item_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    item = await owned(db, owner_id, "learning_items", item_id)
    require_version(item, draft.expected_version)
    if item.data.get("recovery_state") != "remediation":
        raise HTTPException(409, "This item is not awaiting remediation")
    occurred, today, timezone = await account_clock(db, owner_id)
    saved = await write(
        db,
        owner_id,
        "learning_items",
        {
            **item.data,
            "recovery_state": "active",
            "stage": "D3",
            "scheduled_date": (today + timedelta(days=3)).isoformat(),
            "analysis_state": "completed",
            "reason_flags": [
                flag for flag in item.data["reason_flags"] if flag != "recurring-lapse"
            ]
            + ["remediation-completed"],
        },
        item,
    )
    session = None
    if draft.session_id:
        if draft.expected_session_version is None or draft.expected_index is None:
            raise HTTPException(422, "Remediation in a session requires its version and position")
        command = SessionCommand(
            idempotency_key=draft.idempotency_key,
            expected_version=draft.expected_session_version,
            expected_index=draft.expected_index,
            item_id=item_id,
        )
        session, _ = await current(db, owner_id, draft.session_id, command)
        session = await write(
            db, owner_id, "recovery_sessions", advance_session(session, occurred), session
        )
    event = await append_event(
        db,
        owner_id,
        event_data(
            item_id,
            f"remediation-completed:{item_id}:{item.data.get('lapse_count', 0)}",
            "remediation_completed",
            occurred,
            today,
            timezone,
            recovery_session_id=draft.session_id,
            metadata={
                "corrected_opening_move": draft.corrected_opening_move,
                "focused_plan": draft.focused_plan,
                "next_due_date": saved.data["scheduled_date"],
                "lapse_count": item.data.get("lapse_count", 0),
            },
        ),
    )
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {
            "item": to_api(saved),
            "session": to_api(session) if session else None,
            "events": [to_api(event)],
        },
    )


async def assign_transfer(
    db: AsyncSession, *, owner_id: str, item_id: str, draft: TransferDraft
) -> dict:
    operation = f"transfer:{item_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    item = await owned(db, owner_id, "learning_items", item_id)
    require_version(item, draft.expected_version)
    if item.data.get("source_kind") != "pyq" or item.data.get("recovery_state") == "remediation":
        raise HTTPException(
            422, "Exact transfer requires a bank-backed item with remediation completed"
        )
    occurred, today, timezone = await account_clock(db, owner_id)
    bank = active_bank()
    seen = set(
        await db.scalars(
            select(Record.data["question_uid"].as_string()).where(
                Record.owner_id == owner_id, Record.collection == "pyq_attempts"
            )
        )
    )
    reserved = set()
    for paper in bank.manifest.get("benchmarkPapers", []):
        uids = set(paper.get("questionUids", []))
        if not uids & seen:
            reserved.update(uids)
    source = bank_question(item.data["question_uid"])
    question = transfer_candidate(
        source,
        excluded_uids=seen | reserved,
        required_uid=draft.question_uid or None,
    )
    if question is None:
        raise HTTPException(
            409,
            "No unseen, answerable same-topic transfer remains outside the sealed-paper reserve",
        )
    due = (today + timedelta(days=draft.delay_days)).isoformat()
    saved = await write(
        db,
        owner_id,
        "learning_items",
        {
            **item.data,
            "stage": "TRANSFER",
            "recovery_state": "transfer",
            "scheduled_date": due,
            "reason_flags": list(dict.fromkeys([*item.data["reason_flags"], "transfer-assigned"])),
            "mastered_at": None,
        },
        item,
    )
    event = await append_event(
        db,
        owner_id,
        event_data(
            item_id,
            f"transfer-assigned:{item_id}:{draft.idempotency_key}",
            "transfer_assigned",
            occurred,
            today,
            timezone,
            metadata={
                "source_question_uid": source.question_uid,
                "transfer_question_uid": question.question_uid,
                "subject": question.subject,
                "topic": question.topic,
                "due_date": due,
                "delay_days": draft.delay_days,
                "bank_version": bank.version,
                "unseen_at_assignment": True,
            },
        ),
    )
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {
            "item": to_api(saved),
            "events": [to_api(event)],
            "selection_reasons": [
                "exact same topic",
                "not attempted before",
                "checkable key",
                "sealed benchmark reserve excluded",
            ],
        },
    )


async def ensure_concept_item(db: AsyncSession, *, owner_id: str, review: Record) -> Record:
    await owner_lock(db, owner_id)
    existing = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "learning_items",
            Record.deleted_at.is_(None),
            Record.data["source_review_id"].as_string() == review.external_id,
        )
    )
    if existing:
        return existing
    concept = await owned(db, owner_id, "concept_pages", review.data["concept_id"])
    occurred, today, timezone = await account_clock(db, owner_id)
    item = await write(
        db,
        owner_id,
        "learning_items",
        initial_item(
            item_id=stable_id("recovery-concept", review.external_id),
            subject=concept.data["subject"],
            topic=concept.data.get("topic"),
            today=today,
            reasons=["saved-discussion-review"],
            source_kind="concept",
            source_review_id=review.external_id,
            concept_id=review.data["concept_id"],
            scheduled_date=review.data["due_on"],
            analysis_state="not-required",
        ),
    )
    await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"concept-review:{review.external_id}",
            "created",
            occurred,
            today,
            timezone,
            metadata={
                "concept_id": review.data["concept_id"],
                "review_id": review.external_id,
                "question_origin": review.data["question_origin"],
            },
        ),
    )
    return item


async def concept_response_evidence(
    db: AsyncSession,
    *,
    owner_id: str,
    review: Record,
    response: dict,
    assisted: bool,
    session_id: str | None = None,
    session_version: int | None = None,
    session_index: int | None = None,
) -> dict:
    item = await ensure_concept_item(db, owner_id=owner_id, review=review)
    occurred, today, timezone = await account_clock(db, owner_id)
    evaluation = response["evaluation"]
    if evaluation == "ungraded":
        grade = None
        data = {**item.data, "scheduled_date": (today + timedelta(days=1)).isoformat()}
        explanation = "Ungraded response recorded; no successful or failed recall inferred."
    else:
        grade = (
            "again"
            if evaluation == "incorrect"
            else "hard"
            if evaluation == "partial" or assisted
            else "good"
        )
        result = transition(
            item.data,
            grade=grade,
            today=today,
            occurred_at=occurred,
            qualification="reported",
            exam_date=await exam_date_for(db, owner_id),
        )
        data, explanation = result["item"], result["explanation"]
    saved_session = None
    if session_id:
        if session_version is None or session_index is None:
            raise HTTPException(422, "Concept response in a session requires version and position")
        session, _ = await current(
            db,
            owner_id,
            session_id,
            SessionCommand(
                idempotency_key=response["attempt_id"],
                expected_version=session_version,
                expected_index=session_index,
                item_id=item.external_id,
            ),
        )
        assisted = assisted or item.external_id in session.data.get("hinted_item_ids", [])
        if assisted and grade == "good":
            grade = "hard"
            result = transition(
                item.data,
                grade=grade,
                today=today,
                occurred_at=occurred,
                qualification="reported",
                exam_date=await exam_date_for(db, owner_id),
            )
            data, explanation = result["item"], result["explanation"]
        saved_session = await write(
            db, owner_id, "recovery_sessions", advance_session(session, occurred), session
        )
    item = await write(db, owner_id, "learning_items", data, item)
    event = await append_event(
        db,
        owner_id,
        event_data(
            item.external_id,
            f"concept-response:{review.external_id}:{response['attempt_id']}",
            f"retrieval_{grade}" if grade else "answer_committed",
            occurred,
            today,
            timezone,
            recovery_session_id=session_id,
            grade=grade,
            is_correct=True
            if evaluation == "correct"
            else False
            if evaluation == "incorrect"
            else None,
            answer=response["answer"],
            hint_used=assisted,
            time_spent_ms=response["duration_seconds"] * 1000
            if response.get("duration_seconds") is not None
            else None,
            metadata={
                "qualification": "reported",
                "evaluated_by": response["evaluated_by"],
                "evaluation": evaluation,
                "assistance": "hint"
                if assisted and response["assistance"] == "none"
                else response["assistance"],
                "review_id": review.external_id,
                "concept_id": review.data["concept_id"],
                "next_due_date": item.data["scheduled_date"],
                "duration_source": response["duration_source"],
                "independent_transfer": response["independent_transfer"],
            },
        ),
    )
    return {
        "item": to_api(item),
        "session": to_api(saved_session) if saved_session else None,
        "events": [to_api(event)],
        "explanation": explanation,
        "due_on": item.data["scheduled_date"],
    }


AWAITING_RESULT = "awaiting-test-result"
TRIAGE_FLAGS = {"missed": "triage-missed", "correct": "triage-correct", "unsure": "triage-unsure"}


def triaged_item(data: dict, decision: str, today: date) -> dict:
    """Apply the learner's test result to an item whose outcome was unknown at import."""
    flags = [
        flag
        for flag in data.get("reason_flags", [])
        if flag != AWAITING_RESULT and not flag.startswith("triage-")
    ]
    flags.append(TRIAGE_FLAGS[decision])
    if decision == "correct":
        # Answered correctly in the test: nothing to recover, so it leaves the due queue.
        return {**data, "recovery_state": "paused", "reason_flags": flags}
    due = data.get("scheduled_date") or (today + timedelta(days=3)).isoformat()
    state = data.get("recovery_state")
    return {
        **data,
        "recovery_state": "active" if state in {None, "paused"} else state,
        "scheduled_date": due,
        "analysis_state": "pending" if decision == "missed" else data.get("analysis_state"),
        "reason_flags": flags,
    }


async def triage_item(db: AsyncSession, *, owner_id: str, item_id: str, draft: TriageDraft) -> dict:
    operation = f"triage:{item_id}"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    item = await owned(db, owner_id, "learning_items", item_id)
    require_version(item, draft.expected_version)
    if item.data.get("source_kind") != "manual":
        raise HTTPException(422, "Only imported or logged questions take a test result")
    occurred, today, timezone = await account_clock(db, owner_id)
    saved = await write(
        db, owner_id, "learning_items", triaged_item(item.data, draft.decision, today), item
    )
    event = await append_event(
        db,
        owner_id,
        event_data(
            item_id,
            f"triaged:{item_id}:{draft.idempotency_key}",
            "triaged",
            occurred,
            today,
            timezone,
            metadata={
                "decision": draft.decision,
                "previous_state": item.data.get("recovery_state"),
                "next_state": saved.data.get("recovery_state"),
            },
        ),
    )
    reattempts = await sync_reattempt_schedule(db, owner_id, saved)
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"item": to_api(saved), "events": [to_api(event)], "reattempts": reattempts},
    )


async def mark_awaiting_result(db: AsyncSession, *, owner_id: str, item_id: str) -> Record:
    """Keep an imported question with no known result out of the due queue until triaged."""
    item = await owned(db, owner_id, "learning_items", item_id)
    flags = item.data.get("reason_flags", [])
    if item.data.get("recovery_state") == "paused" or any(f.startswith("triage-") for f in flags):
        return item
    if item.data.get("successful_retrieval_count") or item.data.get("lapse_count"):
        return item  # Real retrieval evidence already exists; never hide it.
    return await write(
        db,
        owner_id,
        "learning_items",
        {
            **item.data,
            "recovery_state": "paused",
            "reason_flags": list(dict.fromkeys([*flags, AWAITING_RESULT])),
        },
        item,
    )


async def sync_reattempt_schedule(db: AsyncSession, owner_id: str, item: Record) -> list[dict]:
    rows = list(
        await db.scalars(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == "reattempts",
                Record.deleted_at.is_(None),
                Record.data["learning_item_id"].as_string() == item.external_id,
            )
        )
    )
    saved = []
    for row in rows:
        if row.data.get("scheduled_date") == item.data.get("scheduled_date"):
            saved.append(to_api(row))
            continue
        saved.append(
            to_api(
                await write(
                    db,
                    owner_id,
                    "reattempts",
                    {
                        **row.data,
                        "scheduled_date": item.data.get("scheduled_date")
                        or row.data["scheduled_date"],
                    },
                    row,
                )
            )
        )
    return saved


async def rebalance_backlog(db: AsyncSession, *, owner_id: str, draft: RebalanceDraft) -> dict:
    """Spread overdue re-attempts across the coming days, most urgent first.

    Nothing becomes due earlier and no grade changes; only the order of work is set.
    """
    operation = "rebalance"
    request_hash, replay = await begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    await owner_lock(db, owner_id)
    occurred, today, timezone = await account_clock(db, owner_id)
    candidates, complete = await recovery_candidates(db, owner_id)
    if not complete:
        raise HTTPException(409, "Too many re-attempts to rebalance at once")
    due = [
        row
        for row in candidates
        if row["item"].get("scheduled_date")
        and row["item"]["scheduled_date"] <= today.isoformat()
        and row["item"].get("recovery_state") in {"active", "transfer"}
    ]
    ranked = rank_candidates(due, today)
    moved = []
    for position, row in enumerate(ranked):
        offset = min(position // draft.per_day, draft.max_days - 1)
        if offset == 0:
            continue
        target = (today + timedelta(days=offset)).isoformat()
        item = await owned(db, owner_id, "learning_items", row["item"]["id"])
        previous = item.data.get("scheduled_date")
        item = await write(
            db, owner_id, "learning_items", {**item.data, "scheduled_date": target}, item
        )
        await append_event(
            db,
            owner_id,
            event_data(
                item.external_id,
                f"rebalanced:{item.external_id}:{draft.idempotency_key}",
                "rescheduled",
                occurred,
                today,
                timezone,
                metadata={"reason": "backlog-spread", "from": previous, "to": target},
            ),
        )
        await sync_reattempt_schedule(db, owner_id, item)
        moved.append({"item_id": item.external_id, "from": previous, "to": target})
    return await finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {
            "due_today": min(len(ranked), draft.per_day),
            "moved": moved,
            "days": min(draft.max_days, math.ceil(len(ranked) / draft.per_day)) if ranked else 0,
        },
    )
