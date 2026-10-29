"""Durable, owner-scoped learning evidence that does not require an AI provider.

Facts, learner statements, and interpretations retain their provenance. All
changes use the Record revision boundary; verification receipts are append-only.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, RecordRevision
from app.services.pyq_practice import validate_app_attempt
from app.services.records import lock_identity, to_api, upsert_records

MemoryKind = Literal[
    "reflection", "exam_review", "finding", "repair", "concept", "verification", "profile"
]
MemoryState = Literal["draft", "open", "completed", "deferred", "superseded"]
EvidenceKind = Literal["learner", "observed", "rule", "model"]
COLLECTION = "study_memory"
EXPORT_SCHEMA = "hetu.study-memory.v1"


class StudyMemoryDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: MemoryKind
    title: str = Field(min_length=1, max_length=300)
    subject: str | None = Field(default=None, max_length=160)
    topic: str | None = Field(default=None, max_length=300)
    session_id: str | None = Field(default=None, min_length=1, max_length=128)
    attempt_id: str | None = Field(default=None, min_length=1, max_length=128)
    question_uid: str | None = Field(default=None, min_length=1, max_length=300)
    concept_id: str | None = Field(default=None, min_length=1, max_length=128)
    pattern_slug: str | None = Field(default=None, min_length=1, max_length=200)
    repair_id: str | None = Field(default=None, min_length=1, max_length=128)
    content: str = Field(default="", max_length=30_000)
    data: dict[str, Any] = Field(default_factory=dict)
    state: MemoryState = "draft"
    evidence_kind: EvidenceKind = "learner"
    expected_version: int = Field(ge=0, strict=True)

    @field_validator("title")
    @classmethod
    def meaningful_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()

    @field_validator("data")
    @classmethod
    def bounded_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError, RecursionError) as exc:
            raise ValueError("Memory data must be finite JSON") from exc
        if len(encoded.encode("utf-8")) > 65_536:
            raise ValueError("Memory data exceeds the 64 KiB limit")
        return value


class ExamSubmissionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session: dict[str, Any]
    attempts: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    canonical_session: dict[str, Any]
    mock_test: dict[str, Any] | None = None


async def commit_exam(db: AsyncSession, *, owner_id: str, draft: ExamSubmissionDraft) -> dict:
    """Validate receipts without resuming, then commit the completed exam atomically."""
    session_id = draft.session.get("id")
    if not isinstance(session_id, str) or len(session_id) > 128:
        raise HTTPException(422, "Exam session id is required")
    # Use the same owner lock as ordinary practice and recovery submissions.
    from app.services.recovery import owner_lock

    await owner_lock(db, owner_id)
    current = await _owned(db, owner_id, "pyq_sessions", session_id)
    if current is None or current.data.get("config", {}).get("mode") != "exam":
        raise HTTPException(422, "Exam session is unavailable for this account")
    uids = current.data.get("question_uids", [])
    if draft.session.get("status") != "completed" or draft.session.get("question_uids") != uids:
        raise HTTPException(422, "Final exam must preserve the original question set")
    if draft.canonical_session.get("id") != session_id:
        raise HTTPException(422, "Canonical session does not match the exam")
    if any(
        not isinstance(row.get("id"), str)
        or not row["id"]
        or len(row["id"]) > 128
        or not isinstance(row.get("question_uid"), str)
        for row in draft.attempts
    ):
        raise HTTPException(422, "Exam receipts require valid attempt and question ids")
    if len(draft.attempts) != len(uids) or {
        row.get("question_uid") for row in draft.attempts
    } != set(uids):
        raise HTTPException(422, "Exam requires exactly one receipt for every question")
    if len({row.get("id") for row in draft.attempts}) != len(draft.attempts):
        raise HTTPException(422, "Duplicate exam attempt ids")
    for row in draft.attempts:
        if row.get("pyq_session_id") != session_id or row.get("user_id") != owner_id:
            raise HTTPException(422, "Exam attempt ownership or session does not match")
        existing = await _owned(db, owner_id, "pyq_attempts", row["id"])
        if existing is None:
            await validate_app_attempt(db, owner_id=owner_id, row=row, allow_paused_exam=True)
    await upsert_records(db, collection="pyq_attempts", owner_id=owner_id, items=draft.attempts)
    for collection, raw in [
        ("pyq_sessions", draft.session),
        ("sessions", draft.canonical_session),
        *([("mock_tests", draft.mock_test)] if draft.mock_test else []),
    ]:
        existing = await _owned(db, owner_id, collection, raw.get("id", ""))
        value = {
            key: item
            for key, item in raw.items()
            if key
            not in {
                "version",
                "expected_version",
                "updated_at",
                "created_at",
                "owner_id",
                "user_id",
            }
        }
        if existing:
            value["expected_version"] = existing.version
        await upsert_records(db, collection=collection, owner_id=owner_id, items=[value])
    return {
        "session_id": session_id,
        "attempt_ids": [row["id"] for row in draft.attempts],
        "committed": True,
    }


async def _owned(
    db: AsyncSession, owner_id: str, collection: str, external_id: str
) -> Record | None:
    return await db.scalar(
        select(Record)
        .where(
            Record.collection == collection,
            Record.owner_id == owner_id,
            Record.external_id == external_id,
            Record.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )


async def _session(db: AsyncSession, owner_id: str, session_id: str) -> Record:
    row = await _owned(db, owner_id, "pyq_sessions", session_id)
    if row is None:
        row = await _owned(db, owner_id, "sessions", session_id)
    if row is None:
        raise HTTPException(422, "Session is unavailable for this account")
    return row


def _attempt_session(attempt: Record) -> str | None:
    return attempt.data.get("pyq_session_id") or attempt.data.get("session_id")


async def _validate_links(
    db: AsyncSession, owner_id: str, entry_id: str, draft: StudyMemoryDraft
) -> None:
    attempt = None
    if draft.attempt_id:
        attempt = await _owned(db, owner_id, "pyq_attempts", draft.attempt_id)
        if attempt is None:
            raise HTTPException(422, "Attempt is unavailable for this account")
        if draft.question_uid and draft.question_uid != attempt.data.get("question_uid"):
            raise HTTPException(422, "Question does not match the attempt")
        if draft.session_id and draft.session_id != _attempt_session(attempt):
            raise HTTPException(422, "Session does not match the attempt")
    if draft.session_id:
        session = await _session(db, owner_id, draft.session_id)
        question_uid = draft.question_uid or (attempt.data.get("question_uid") if attempt else None)
        if (
            session.collection == "pyq_sessions"
            and question_uid
            and question_uid not in session.data.get("question_uids", [])
        ):
            raise HTTPException(422, "Question is not part of this session")
    if draft.concept_id and not await _owned(db, owner_id, "concept_pages", draft.concept_id):
        raise HTTPException(422, "Concept is unavailable for this account")
    if draft.pattern_slug:
        pattern = await _owned(db, owner_id, "cognitive_pattern_families", draft.pattern_slug)
        if pattern is None:
            raise HTTPException(422, "Pattern is unavailable for this account")
    if draft.repair_id:
        repair = await _owned(db, owner_id, COLLECTION, draft.repair_id)
        if repair is None or repair.data.get("kind") != "repair" or draft.repair_id == entry_id:
            raise HTTPException(422, "Repair is unavailable for this account")

    for key, collection in {
        "source_entry_ids": COLLECTION,
        "source_attempt_ids": "pyq_attempts",
        "attempt_ids": "pyq_attempts",
    }.items():
        values = draft.data.get(key, [])
        if (
            not isinstance(values, list)
            or len(values) > 1000
            or any(not isinstance(value, str) or not value or len(value) > 128 for value in values)
        ):
            raise HTTPException(422, f"{key} must contain at most 1000 record ids")
        if values:
            count = await db.scalar(
                select(func.count(Record.id)).where(
                    Record.owner_id == owner_id,
                    Record.collection == collection,
                    Record.external_id.in_(set(values)),
                    Record.deleted_at.is_(None),
                )
            )
            if count != len(set(values)):
                raise HTTPException(422, f"{key} contains an unavailable record")

    # These established workflow references are validated even though the rest of
    # data remains extensible. A draft must never smuggle another owner's receipt.
    active_session_id = draft.data.get("active_session_id")
    if active_session_id is not None:
        if not isinstance(active_session_id, str) or not active_session_id:
            raise HTTPException(422, "active_session_id must be a session id")
        if not await _owned(db, owner_id, "pyq_sessions", active_session_id):
            raise HTTPException(422, "Repair session is unavailable for this account")
    review_ids: set[str] = set()
    for key in ("reviewed_attempt_ids", "revealed_attempt_ids"):
        values = draft.data.get(key, [])
        if (
            not isinstance(values, list)
            or len(values) > 1000
            or any(not isinstance(value, str) or not value or len(value) > 128 for value in values)
        ):
            raise HTTPException(422, f"{key} must contain at most 1000 attempt ids")
        review_ids.update(values)
    current = draft.data.get("current_attempt_id")
    if current is not None and (not isinstance(current, str) or not current or len(current) > 128):
        raise HTTPException(422, "current_attempt_id must be an attempt id")
    attempt_ids = review_ids
    if current:
        attempt_ids.add(current)
    if attempt_ids:
        rows = list(
            (
                await db.scalars(
                    select(Record).where(
                        Record.owner_id == owner_id,
                        Record.collection == "pyq_attempts",
                        Record.external_id.in_(attempt_ids),
                        Record.deleted_at.is_(None),
                    )
                )
            ).all()
        )
        if len(rows) != len(attempt_ids) or any(
            draft.session_id and _attempt_session(row) != draft.session_id for row in rows
        ):
            raise HTTPException(422, "Review contains an unavailable or unrelated attempt")


async def save_entry(
    db: AsyncSession, *, owner_id: str, entry_id: str, draft: StudyMemoryDraft
) -> dict[str, Any]:
    if not entry_id or len(entry_id) > 128:
        raise HTTPException(422, "Memory id must contain 1 to 128 characters")
    await lock_identity(db, COLLECTION, owner_id, entry_id)
    existing = await _owned(db, owner_id, COLLECTION, entry_id)
    await _validate_links(db, owner_id, entry_id, draft)
    payload = draft.model_dump(exclude={"expected_version"})
    if draft.kind == "verification" and draft.repair_id and draft.session_id:
        session = await _session(db, owner_id, draft.session_id)
        if session.data.get("config", {}).get("memoryRepairId") != draft.repair_id:
            raise HTTPException(422, "This session was not launched by the linked repair")
        receipts = list(
            (
                await db.scalars(
                    select(Record).where(
                        Record.owner_id == owner_id,
                        Record.collection == "pyq_attempts",
                        Record.data["pyq_session_id"].as_string() == draft.session_id,
                        Record.deleted_at.is_(None),
                    )
                )
            ).all()
        )
        if not receipts:
            raise HTTPException(422, "This repair session has no submitted attempt receipts")
        judged = [
            row
            for row in receipts
            if row.data.get("mark_correct") is not None and row.data.get("mark_decision") != "SKIP"
        ]
        payload["data"] = {
            **payload["data"],
            "attempt_ids": sorted(row.external_id for row in receipts),
            "correct": sum(row.data.get("mark_correct") is True for row in judged),
            "judged": len(judged),
            "skipped": sum(row.data.get("mark_decision") == "SKIP" for row in receipts),
            "active_time_sec": sum(row.data.get("time_spent_sec") or 0 for row in receipts),
            "calculated_from": "canonical_attempt_receipts",
            "mastery_claim": False,
        }
    if existing:
        # A response lost during a save must be replayable even with the old
        # version. Different content always needs the exact current version.
        if existing.data == payload:
            return to_api(existing)
        if existing.data.get("kind") == "verification":
            raise HTTPException(409, "Verification records are immutable; append a new record")
        if existing.data.get("kind") != draft.kind:
            raise HTTPException(409, "Memory kind cannot change; create a related record")
        if draft.expected_version != existing.version:
            raise HTTPException(
                409, {"message": "Version conflict", "current_version": existing.version}
            )
    elif draft.expected_version != 0:
        raise HTTPException(409, "Memory entry does not exist; new entries use expected_version 0")
    raw = {"id": entry_id, **payload}
    if existing:
        raw["expected_version"] = draft.expected_version
    row = (await upsert_records(db, collection=COLLECTION, owner_id=owner_id, items=[raw]))[0]
    return to_api(row)


async def list_entries(
    db: AsyncSession,
    *,
    owner_id: str,
    q: str | None = None,
    kind: MemoryKind | None = None,
    subject: str | None = None,
    state: MemoryState | None = None,
    attempt_id: str | None = None,
    session_id: str | None = None,
    repair_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(422, "Invalid memory pagination")
    filters = [
        Record.owner_id == owner_id,
        Record.collection == COLLECTION,
        Record.deleted_at.is_(None),
    ]
    for key, value in {
        "kind": kind,
        "subject": subject,
        "state": state,
        "attempt_id": attempt_id,
        "session_id": session_id,
        "repair_id": repair_id,
    }.items():
        if value is not None:
            filters.append(Record.data[key].as_string() == value)
    if q and q.strip():
        # Search all text, including nested notes, in SQL. Escape wildcard input
        # so a literal '%' or '_' cannot accidentally select the whole library.
        query = q.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        filters.append(func.lower(cast(Record.data, String)).like(f"%{query}%", escape="\\"))
    total = int(await db.scalar(select(func.count(Record.id)).where(*filters)) or 0)
    rows = list(
        (
            await db.scalars(
                select(Record)
                .where(*filters)
                .order_by(Record.updated_at.desc(), Record.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
    return {
        "items": [to_api(row) for row in rows],
        "total": total,
        "has_more": offset + len(rows) < total,
    }


async def get_entry(
    db: AsyncSession, *, owner_id: str, entry_id: str, before_version: int | None = None
) -> dict[str, Any]:
    row = await _owned(db, owner_id, COLLECTION, entry_id)
    if row is None:
        raise HTTPException(404, "Memory entry not found")
    statement = select(RecordRevision).where(
        RecordRevision.record_id == row.id, RecordRevision.owner_id == owner_id
    )
    if before_version is not None:
        statement = statement.where(RecordRevision.version < before_version)
    revisions = list(
        (await db.scalars(statement.order_by(RecordRevision.version.desc()).limit(101))).all()
    )
    return {
        "entry": to_api(row),
        "history": [revision.snapshot for revision in revisions[:100]],
        "history_has_more": len(revisions) > 100,
    }


async def context_for_attempt(
    db: AsyncSession, *, owner_id: str, attempt_id: str
) -> dict[str, Any]:
    attempt = await _owned(db, owner_id, "pyq_attempts", attempt_id)
    if attempt is None:
        raise HTTPException(404, "Attempt not found")
    session_id = _attempt_session(attempt)
    question_uid = attempt.data.get("question_uid")
    related = [Record.data["attempt_id"].as_string() == attempt_id]
    if question_uid:
        related.append(Record.data["question_uid"].as_string() == question_uid)
    if session_id:
        related.append(Record.data["session_id"].as_string() == session_id)
    filters = [
        Record.owner_id == owner_id,
        Record.collection == COLLECTION,
        Record.deleted_at.is_(None),
        or_(*related),
    ]
    total = int(await db.scalar(select(func.count(Record.id)).where(*filters)) or 0)
    memory = list(
        (
            await db.scalars(
                select(Record)
                .where(*filters)
                .order_by(Record.updated_at.desc(), Record.id.desc())
                .limit(100)
            )
        ).all()
    )
    return {
        "attempt": to_api(attempt),
        "question_snapshot": attempt.data.get("question_snapshot"),
        "memory": [to_api(row) for row in memory],
        "memory_total": total,
        "memory_has_more": total > len(memory),
        "provenance": {
            "source": "canonical_pyq_attempt",
            "attempt_id": attempt.external_id,
            "attempt_version": attempt.version,
            "bank_version": attempt.data.get("bank_version"),
            "question_uid": question_uid,
            "session_id": session_id,
            "model_used": False,
        },
    }


async def export_memory(db: AsyncSession, *, owner_id: str) -> dict[str, Any]:
    """Export the complete memory and source receipts, never account settings.

    Restoring a whole workspace remains the database-backup workflow. This
    portable evidence export deliberately cannot overwrite canonical attempts.
    """
    entries = list(
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == COLLECTION,
                    Record.deleted_at.is_(None),
                )
                .order_by(Record.created_at, Record.id)
            )
        ).all()
    )
    attempt_ids: set[str] = set()
    session_ids: set[str] = set()
    for row in entries:
        if row.data.get("attempt_id"):
            attempt_ids.add(row.data["attempt_id"])
        if row.data.get("session_id"):
            session_ids.add(row.data["session_id"])
        data = row.data.get("data", {})
        for key in (
            "reviewed_attempt_ids",
            "revealed_attempt_ids",
            "source_attempt_ids",
            "attempt_ids",
        ):
            attempt_ids.update(data.get(key, []))
        if data.get("current_attempt_id"):
            attempt_ids.add(data["current_attempt_id"])
        if data.get("active_session_id"):
            session_ids.add(data["active_session_id"])
    receipt_filters = []
    if attempt_ids:
        receipt_filters.append(Record.external_id.in_(attempt_ids))
    if session_ids:
        receipt_filters.append(Record.data["pyq_session_id"].as_string().in_(session_ids))
        receipt_filters.append(Record.data["session_id"].as_string().in_(session_ids))
    attempts = []
    if receipt_filters:
        attempts = list(
            (
                await db.scalars(
                    select(Record)
                    .where(
                        Record.owner_id == owner_id,
                        Record.collection == "pyq_attempts",
                        Record.deleted_at.is_(None),
                        or_(*receipt_filters),
                    )
                    .order_by(Record.created_at, Record.id)
                )
            ).all()
        )
    revisions = []
    if entries:
        revisions = list(
            (
                await db.scalars(
                    select(RecordRevision)
                    .where(
                        RecordRevision.owner_id == owner_id,
                        RecordRevision.record_id.in_([row.id for row in entries]),
                    )
                    .order_by(RecordRevision.record_id, RecordRevision.version)
                )
            ).all()
        )
    return {
        "schema": EXPORT_SCHEMA,
        "exported_at": datetime.now(UTC).isoformat(),
        "owner_id": owner_id,
        "entries": [to_api(row) for row in entries],
        "history": [row.snapshot for row in revisions],
        "attempt_receipts": [to_api(row) for row in attempts],
    }
