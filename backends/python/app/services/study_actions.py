"""Typed section actions shared by HTTP and MCP, with durable retry receipts."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, User
from app.services.learning_library import StrictModel, fingerprint, stable_id
from app.services.records import (
    delete_record,
    lock_identity,
    patch_record,
    restore_record,
    to_api,
    upsert_records,
)


class ActionDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=160)
    expected_version: int = Field(default=0, ge=0)


class FormulaDraft(ActionDraft):
    action: Literal["save_formula"] = "save_formula"
    record_id: str | None = Field(default=None, min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=300)
    subject: str = Field(min_length=1, max_length=160)
    expression: str = Field(min_length=1, max_length=30000)


class TriggerDraft(ActionDraft):
    action: Literal["save_recognition_cue"] = "save_recognition_cue"
    record_id: str | None = Field(default=None, min_length=1, max_length=128)
    phrase: str = Field(min_length=1, max_length=3000)
    concept: str = Field(min_length=1, max_length=3000)
    question_ids: list[str] = Field(default_factory=list, max_length=50)


class JournalDraft(ActionDraft):
    action: Literal["update_journal_analysis"] = "update_journal_analysis"
    record_id: str = Field(min_length=1, max_length=128)
    expected_version: int = Field(ge=1)
    capture_note: str | None = Field(default=None, max_length=10000)
    root_cause: Literal["concept", "formula", "reading", "computation", "strategy"] | None = None
    pattern_name: str | None = Field(default=None, max_length=300)
    trigger_sentence: str | None = Field(default=None, max_length=3000)
    analysis_provenance: Literal["learner_reported", "assistant_hypothesis"]
    analysis_complete: bool = False

    @model_validator(mode="after")
    def require_annotation(self) -> JournalDraft:
        if not self.model_fields_set.intersection(
            {"capture_note", "root_cause", "pattern_name", "trigger_sentence"}
        ):
            raise ValueError("Supply at least one analysis field")
        return self


class SyllabusDraft(ActionDraft):
    action: Literal["set_syllabus_progress"] = "set_syllabus_progress"
    subject: str = Field(min_length=1, max_length=160)
    topic: str = Field(min_length=1, max_length=300)
    completed: bool
    evidence_note: str = Field(min_length=1, max_length=3000)


class WeeklyDraft(ActionDraft):
    action: Literal["save_weekly_review"] = "save_weekly_review"
    week_start: date
    root_cause_summary: str | None = Field(default=None, max_length=10000)
    weakest_concept: str | None = Field(default=None, max_length=3000)
    this_weeks_fix: str = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def monday(self) -> WeeklyDraft:
        if self.week_start.weekday() != 0:
            raise ValueError("week_start must be a Monday")
        return self


class PlannerBlock(StrictModel):
    id: str | None = Field(default=None, min_length=1, max_length=128)
    subject: str = Field(min_length=1, max_length=160)
    duration_min: int = Field(ge=5, le=480)
    mode: Literal[
        "Deep Study",
        "Revision",
        "Problem Solving",
        "PYQ Practice",
        "Mock Test",
        "Lecture Watch",
        "Note Making",
        "Doubt Clearing",
    ] = "Revision"
    priority: Literal["P1 Critical", "P2 High", "P3 Medium", "P4 Low"] = "P2 High"
    target: str = Field(min_length=1, max_length=3000)
    resource: str | None = Field(default=None, max_length=3000)
    start_at: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class PlannerDraft(StrictModel):
    action: Literal["edit_planner_day"] = "edit_planner_day"
    idempotency_key: str = Field(min_length=8, max_length=160)
    plan_date: date
    expected_revision: int = Field(ge=0)
    add_blocks: list[PlannerBlock] = Field(default_factory=list, max_length=30)
    edit_blocks: list[PlannerBlock] = Field(default_factory=list, max_length=30)
    remove_block_ids: list[str] = Field(default_factory=list, max_length=30)
    ordered_block_ids: list[str] | None = Field(default=None, max_length=60)
    available_min: int | None = Field(default=None, ge=0, le=960)
    protected_buffer_min: int | None = Field(default=None, ge=0, le=480)

    @model_validator(mode="after")
    def valid_edits(self) -> PlannerDraft:
        if any(block.id is None for block in self.edit_blocks):
            raise ValueError("Editing a block requires its existing id")
        ids = [b.id for b in self.add_blocks + self.edit_blocks if b.id] + self.remove_block_ids
        if len(ids) != len(set(ids)):
            raise ValueError("A block can appear in only one change")
        if not (
            self.add_blocks
            or self.edit_blocks
            or self.remove_block_ids
            or self.ordered_block_ids is not None
            or self.available_min is not None
            or self.protected_buffer_min is not None
        ):
            raise ValueError("Supply a planner change")
        return self


StudyAction = Annotated[
    FormulaDraft | TriggerDraft | JournalDraft | SyllabusDraft | WeeklyDraft | PlannerDraft,
    Field(discriminator="action"),
]

ACTION_COLLECTIONS = {
    "save_formula": "formulas",
    "save_recognition_cue": "trigger_phrases",
    "update_journal_analysis": "questions",
    "set_syllabus_progress": "topic_progress",
    "save_weekly_review": "weekly_reviews",
    "edit_planner_day": "planner_day_plans",
}
ACTION_ROUTES = {
    "save_formula": "/formulas",
    "save_recognition_cue": "/trigger-drill",
    "update_journal_analysis": "/journal",
    "set_syllabus_progress": "/syllabus",
    "save_weekly_review": "/weekly-review",
    "edit_planner_day": "/planner",
}


async def _owned(db: AsyncSession, owner: str, collection: str, record_id: str) -> Record | None:
    return await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner,
            Record.collection == collection,
            Record.external_id == record_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _version(row: Record | None, expected: int) -> None:
    current = row.version if row else 0
    if expected != current:
        raise HTTPException(409, {"message": "Version conflict", "current_version": current})


async def _save(
    db: AsyncSession,
    owner: str,
    collection: str,
    record_id: str,
    expected: int,
    content: dict[str, Any],
    defaults: dict[str, Any] | None = None,
) -> Record:
    await lock_identity(db, collection, owner, record_id)
    row = await _owned(db, owner, collection, record_id)
    _version(row, expected)
    if row is not None:
        if row.deleted_at is not None:
            raise HTTPException(409, "Record is archived; restore it explicitly before editing")
        return await patch_record(
            db,
            collection=collection,
            owner_id=owner,
            external_id=record_id,
            patch=content,
            expected_version=expected,
        )
    return (
        await upsert_records(
            db,
            collection=collection,
            owner_id=owner,
            items=[{"id": record_id, **(defaults or {}), **content}],
        )
    )[0]


async def _natural_row(
    db: AsyncSession,
    owner: str,
    collection: str,
    fields: dict[str, str],
) -> Record | None:
    query = select(Record).where(Record.owner_id == owner, Record.collection == collection)
    for name, value in fields.items():
        query = query.where(Record.data[name].as_string() == value)
    rows = list(await db.scalars(query.order_by(Record.id).with_for_update()))
    if len(rows) > 1:
        raise HTTPException(409, "Multiple matching records need reconciliation before editing")
    return rows[0] if rows else None


async def _today(db: AsyncSession, owner: str) -> date:
    user = await db.get(User, owner)
    try:
        zone = ZoneInfo((user.profile if user else {}).get("timezone") or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, TypeError):
        raise HTTPException(422, "Account timezone needs correction") from None
    return datetime.now(zone).date()


async def execute_action(
    db: AsyncSession,
    *,
    owner_id: str,
    draft: StudyAction,
    app_url: str,
    origin: Literal["chatgpt", "app"] = "app",
) -> dict[str, Any]:
    """Commit is the caller's responsibility; action and receipt share one transaction."""
    # Recovery takes its owner lock before record locks throughout its domain.
    if isinstance(draft, JournalDraft):
        from app.services.recovery import owner_lock

        await owner_lock(db, owner_id)
    request_hash = fingerprint({"draft": draft.model_dump(mode="json"), "origin": origin})
    receipt_id = stable_id("study-action-receipt", draft.idempotency_key)
    await lock_identity(db, "plugin_receipts", owner_id, receipt_id)
    receipt = await _owned(db, owner_id, "plugin_receipts", receipt_id)
    if receipt is not None:
        if receipt.data["request_hash"] != request_hash:
            raise HTTPException(409, "Idempotency key was already used for different content")
        return {**receipt.data["result"], "idempotent_replay": True}

    collection = ACTION_COLLECTIONS[draft.action]
    now = datetime.now(UTC).isoformat()
    metadata = {"capture_origin": origin, "last_action_at": now}
    extra: dict[str, Any] = {}
    if isinstance(draft, FormulaDraft):
        record_id = draft.record_id or stable_id("formula", draft.idempotency_key)
        row = await _save(
            db,
            owner_id,
            collection,
            record_id,
            draft.expected_version,
            {
                "name": draft.name,
                "subject": draft.subject,
                "expression": draft.expression,
                **metadata,
            },
            {
                "forgot_count": 0,
                "last_reviewed": None,
                "next_review": (await _today(db, owner_id)).isoformat(),
            },
        )
    elif isinstance(draft, TriggerDraft):
        available_ids = set(
            await db.scalars(
                select(Record.external_id).where(
                    Record.owner_id == owner_id,
                    Record.collection == "questions",
                    Record.external_id.in_(draft.question_ids),
                    Record.deleted_at.is_(None),
                )
            )
        )
        if available_ids != set(draft.question_ids):
            raise HTTPException(404, "Linked Journal question is unavailable")
        record_id = draft.record_id or stable_id("recognition-cue", draft.idempotency_key)
        row = await _save(
            db,
            owner_id,
            collection,
            record_id,
            draft.expected_version,
            {
                "phrase": draft.phrase,
                "concept": draft.concept,
                **(
                    {"question_ids": draft.question_ids}
                    if "question_ids" in draft.model_fields_set
                    else {}
                ),
                **metadata,
            },
            {"reflex_time_ms": None, "question_ids": []},
        )
    elif isinstance(draft, JournalDraft):
        patch = draft.model_dump(
            exclude_unset=True,
            exclude={
                "action",
                "idempotency_key",
                "record_id",
                "expected_version",
                "analysis_complete",
            },
        )
        await lock_identity(db, collection, owner_id, draft.record_id)
        existing = await _owned(db, owner_id, collection, draft.record_id)
        if existing is None or existing.deleted_at is not None:
            raise HTTPException(404, "Journal question is unavailable")
        row = await _save(
            db,
            owner_id,
            collection,
            draft.record_id,
            draft.expected_version,
            {**patch, "analysis_updated_at": now},
        )
        attempt_id = row.data.get("source_pyq_attempt_id")
        if draft.analysis_complete and attempt_id:
            from app.services.recovery import complete_analysis

            extra["recovery"] = await complete_analysis(
                db, owner_id=owner_id, attempt_id=attempt_id
            )
    elif isinstance(draft, SyllabusDraft):
        natural_id = stable_id("syllabus", fingerprint([draft.subject, draft.topic]))
        await lock_identity(db, collection, owner_id, natural_id)
        row = await _natural_row(
            db, owner_id, collection, {"subject": draft.subject, "topic": draft.topic}
        )
        _version(row, draft.expected_version)
        if draft.completed:
            completed_at = now
            if row is not None and row.deleted_at is not None:
                row = await restore_record(
                    db,
                    collection=collection,
                    owner_id=owner_id,
                    external_id=row.external_id,
                    revision=row.version - 1,
                    expected_version=row.version,
                )
            row = await _save(
                db,
                owner_id,
                collection,
                row.external_id if row else natural_id,
                row.version if row else 0,
                {
                    "subject": draft.subject,
                    "topic": draft.topic,
                    "completed_at": completed_at,
                    "evidence_note": draft.evidence_note,
                    "progress_provenance": "learner_reported",
                    **metadata,
                },
            )
        elif row is not None and row.deleted_at is None:
            row = await _save(
                db,
                owner_id,
                collection,
                row.external_id,
                row.version,
                {"evidence_note": draft.evidence_note, **metadata},
            )
            await delete_record(
                db,
                collection=collection,
                owner_id=owner_id,
                external_id=row.external_id,
                expected_version=row.version,
            )
        extra["completed"] = draft.completed
        extra["mastery_awarded"] = False
    elif isinstance(draft, WeeklyDraft):
        natural_id = stable_id("weekly-review", draft.week_start.isoformat())
        await lock_identity(db, collection, owner_id, natural_id)
        row = await _natural_row(
            db, owner_id, collection, {"week_start": draft.week_start.isoformat()}
        )
        row = await _save(
            db,
            owner_id,
            collection,
            row.external_id if row else natural_id,
            draft.expected_version,
            {
                "week_start": draft.week_start.isoformat(),
                **draft.model_dump(
                    include={"root_cause_summary", "weakest_concept"}, exclude_unset=True
                ),
                "this_weeks_fix": draft.this_weeks_fix,
                **metadata,
            },
            {"root_cause_summary": None, "weakest_concept": None},
        )
    else:
        row, extra = await _planner_action(db, owner_id, draft, now)

    result = jsonable_encoder(
        {
            "action": draft.action,
            "collection": collection,
            "record": to_api(row) if row else None,
            "href": app_url.rstrip("/") + ACTION_ROUTES[draft.action],
            "idempotent_replay": False,
            "persisted_at": now,
            **extra,
        }
    )
    await upsert_records(
        db,
        collection="plugin_receipts",
        owner_id=owner_id,
        items=[
            {
                "id": receipt_id,
                "request_hash": request_hash,
                "result": result,
                "action": draft.action,
                "created_at": now,
            }
        ],
    )
    return result


def _minutes(clock: str) -> int:
    try:
        hours, minutes = map(int, clock.split(":"))
        if not 0 <= hours <= 23 or not 0 <= minutes <= 59:
            raise ValueError
        return hours * 60 + minutes
    except (ValueError, AttributeError):
        raise HTTPException(422, "Stored planner times need correction") from None


async def _planner_action(
    db: AsyncSession,
    owner: str,
    draft: PlannerDraft,
    now: str,
) -> tuple[Record, dict[str, Any]]:
    plan_date = draft.plan_date.isoformat()
    await lock_identity(db, "planner_day_plans", owner, plan_date)
    row = await _owned(db, owner, "planner_day_plans", plan_date)
    revision = int(row.data.get("revision", row.version)) if row else 0
    if revision != draft.expected_revision:
        raise HTTPException(
            409, {"message": "Planner revision conflict", "current_revision": revision}
        )
    if row is not None and (row.deleted_at is not None or row.data.get("deleted_at")):
        raise HTTPException(409, "Planner day is deleted; restore it explicitly")
    plan = dict(row.data.get("plan") or {}) if row else {}
    sessions = [
        dict(s) for s in (plan.get("sessions", row.data.get("sessions", [])) if row else [])
    ]
    existing_ids = [s.get("id") for s in sessions]
    if None in existing_ids or len(existing_ids) != len(set(existing_ids)):
        raise HTTPException(409, "Planner block identities need reconciliation")
    by_id = {s["id"]: s for s in sessions}
    for block_id in draft.remove_block_ids + [b.id for b in draft.edit_blocks]:
        if block_id not in by_id:
            raise HTTPException(404, "Planner block is unavailable")
        if any(
            (by_id[block_id].get("execution") or {}).get(field) is not None
            for field in ("sessionId", "startedAt", "completedAt")
        ):
            raise HTTPException(409, "A started block's execution must be preserved")
    for block_id in draft.remove_block_ids:
        sessions = [s for s in sessions if s["id"] != block_id]
    for block in draft.edit_blocks + draft.add_blocks:
        block_id = block.id or stable_id(
            "planner-block", f"{draft.idempotency_key}:{len(sessions)}"
        )
        if block in draft.add_blocks and block_id in by_id:
            raise HTTPException(409, "Added planner block already exists")
        content = {
            "id": block_id,
            "subject": block.subject,
            "durationMin": block.duration_min,
            "mode": block.mode,
            "priority": block.priority,
            "target": block.target,
            "resource": block.resource,
            "startAt": block.start_at,
        }
        if block in draft.edit_blocks:
            sessions = [{**s, **content} if s["id"] == block_id else s for s in sessions]
        else:
            sessions.append(content)
    ids = [s["id"] for s in sessions]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Planner block IDs must be unique")
    if draft.ordered_block_ids is not None:
        if set(draft.ordered_block_ids) != set(ids) or len(draft.ordered_block_ids) != len(ids):
            raise HTTPException(422, "Reordering must contain every final block exactly once")
        blocks = {s["id"]: s for s in sessions}
        sessions = [blocks[i] for i in draft.ordered_block_ids]

    availability = dict(plan.get("availability") or {})
    available = (
        draft.available_min if draft.available_min is not None else availability.get("availableMin")
    )
    buffer = (
        draft.protected_buffer_min
        if draft.protected_buffer_min is not None
        else availability.get("protectedBufferMin")
    )
    if (
        type(available) is not int
        or type(buffer) is not int
        or not 0 <= buffer <= available <= 1440
    ):
        raise HTTPException(
            422, "Supply known available_min and protected_buffer_min before planning"
        )
    if any(type(s.get("durationMin")) is not int or s["durationMin"] < 1 for s in sessions):
        raise HTTPException(422, "Stored planner durations need correction")
    planned = sum(s["durationMin"] for s in sessions)
    if planned > available - buffer:
        raise HTTPException(
            409,
            {
                "message": "Plan exceeds study capacity after protected buffer",
                "planned_min": planned,
                "usable_min": available - buffer,
            },
        )
    windows = availability.get("timeWindows", [])
    if windows:
        ranges = sorted((_minutes(w["start"]), _minutes(w["end"])) for w in windows)
        if any(start >= end for start, end in ranges) or any(
            right[0] < left[1] for left, right in zip(ranges, ranges[1:], strict=False)
        ):
            raise HTTPException(422, "Stored availability windows overlap or have invalid bounds")
        span = sum(end - start for start, end in ranges)
        if planned + buffer > span:
            raise HTTPException(409, "Plan exceeds the recorded availability windows")
    occupied = []
    for session in sessions:
        if session.get("startAt"):
            start = _minutes(session["startAt"])
            end = start + session["durationMin"]
            if end > 1440 or any(
                start < other_end and end > other_start for other_start, other_end in occupied
            ):
                raise HTTPException(409, "Planner blocks overlap or extend beyond the day")
            if windows and not any(
                _minutes(w["start"]) <= start and end <= _minutes(w["end"]) for w in windows
            ):
                raise HTTPException(409, "Planner block falls outside recorded availability")
            occupied.append((start, end))
    availability.update(
        {"availableMin": available, "protectedBufferMin": buffer, "timeWindows": windows}
    )
    plan.update(
        {
            "date": plan_date,
            "sessions": sessions,
            "availability": availability,
            "updatedAt": now,
            "syncRevision": revision + 1,
        }
    )
    # Existing app normalization supplies display defaults for these optional sections.
    plan.setdefault(
        "structure",
        {
            "wakeAt": "06:00",
            "sleepAt": "23:00",
            "totalHoursTarget": available / 60,
            "breakPattern": "p50",
            "dayType": "Full Study Day",
        },
    )
    plan.setdefault("mindset", {"energyForecast": "medium", "moodIntent": "", "motivationNote": ""})
    plan.setdefault(
        "nonStudy", {"exerciseDone": False, "exerciseTime": "", "errands": "", "social": ""}
    )
    plan.setdefault(
        "review", {"completionPct": 0, "wentWell": "", "missed": "", "endMood": "", "replicate": ""}
    )
    row = await _save(
        db,
        owner,
        "planner_day_plans",
        plan_date,
        row.version if row else 0,
        {
            "plan_date": plan_date,
            "plan": plan,
            "sessions": sessions,
            "revision": revision + 1,
            "last_mutation_id": draft.idempotency_key,
        },
    )
    return row, {
        "planned_min": planned,
        "usable_min": available - buffer,
        "remaining_min": available - buffer - planned,
    }
