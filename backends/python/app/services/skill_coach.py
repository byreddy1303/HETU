"""Local skill coaching on the existing revisioned memory and repair lifecycle."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services.records import to_api
from app.services.recovery import owner_lock
from app.services.skill_curriculum import (
    curriculum,
    mapped_uids,
    public_skill,
    select_skill_questions,
    skill_by_id,
)
from app.services.study_memory import StudyMemoryDraft, _owned, save_entry

PREFIX = "skill-diagnosis:"


def identity(kind: str, value: str) -> str:
    return f"{kind}:{uuid5(NAMESPACE_URL, 'hetu-skill:' + value)}"


class StartDiagnosis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=100)
    attempt_id: str | None = Field(default=None, max_length=128)


class DiagnosisDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)
    answers: dict[str, StrictInt] = Field(default_factory=dict)
    reasoning: str = Field(default="", max_length=4000)
    confidence: Literal["low", "medium", "high", "unknown"] = "unknown"
    assisted: bool = False
    submit: bool = False


class ConfirmDiagnosis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)
    cause: Literal["uncertain", "recall", "recognition", "method", "execution", "time", "none"]


class DayPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0, strict=True)
    budget: Literal[10, 20, 30, 45, 60] = 20
    parked_action_ids: list[str] = Field(default_factory=list, max_length=50)


class SessionConditions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assisted: bool
    expected_version: int = Field(ge=0, strict=True)


async def ensure_no_exam(db: AsyncSession, owner_id: str) -> None:
    exam = await db.scalar(
        select(Record.id)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "pyq_sessions",
            Record.deleted_at.is_(None),
            Record.data["config"]["mode"].as_string() == "exam",
            Record.data["status"].as_string().in_(["active", "paused", "interrupted"]),
        )
        .limit(1)
    )
    if exam is not None:
        raise HTTPException(
            409, "Finish your saved exam before opening coaching or starting another check."
        )


async def validate_practice_session(
    db: AsyncSession, owner_id: str, session_id: str, payload: dict, previous: Record | None
) -> Record | None:
    """Keep a skill activity linked to one immutable question set and one session."""
    from app.services.memory_learning_engine import _day, get_engine_config

    repair_id = payload.get("config", {}).get("memoryRepairId")
    old_id = previous.data.get("config", {}).get("memoryRepairId") if previous else None
    repair = await _owned(db, owner_id, "study_memory", old_id or repair_id or "")
    if not repair or not repair.data.get("data", {}).get("skill_id"):
        return None
    if previous:
        if (
            old_id != repair_id
            or payload.get("question_uids") != previous.data.get("question_uids")
            or payload.get("config", {}).get("mode") != "practice"
        ):
            raise HTTPException(409, "A skill session's activity and questions cannot be replaced.")
        return None
    await owner_lock(db, owner_id)
    await ensure_no_exam(db, owner_id)
    data = repair.data["data"]
    config = await get_engine_config(db, owner_id=owner_id)
    if repair.data.get("state") not in {"open", "deferred"} or data.get("due_date", "") > _day(
        config.model_dump()
    ):
        raise HTTPException(409, "This skill activity is finished or scheduled for a later day.")
    planned = payload.get("question_uids", [])
    if (
        payload.get("config", {}).get("mode") != "practice"
        or not planned
        or len(planned) != len(set(planned))
        or set(planned) != set(data.get("question_uids", []))
        or not set(planned) <= set(mapped_uids(data["skill_id"]))
    ):
        raise HTTPException(
            422, "The selected skill questions changed. Reopen the prepared activity."
        )
    duplicate = await db.scalar(
        select(Record.id)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "pyq_sessions",
            Record.deleted_at.is_(None),
            Record.data["config"]["memoryRepairId"].as_string() == repair.external_id,
            Record.data["status"].as_string() != "abandoned",
        )
        .limit(1)
    )
    if duplicate is not None:
        raise HTTPException(
            409,
            "This activity already has a saved session. Resume it from Today or "
            "refresh skill evidence.",
        )
    return repair


async def bind_practice_session(
    db: AsyncSession, owner_id: str, repair: Record, session_id: str
) -> None:
    await _write(
        db,
        owner_id,
        repair.external_id,
        {**repair.data, "data": {**repair.data["data"], "active_session_id": session_id}},
        repair.version,
    )


async def _write(
    db: AsyncSession, owner_id: str, entry_id: str, payload: dict, version: int
) -> dict:
    return await save_entry(
        db,
        owner_id=owner_id,
        entry_id=entry_id,
        draft=StudyMemoryDraft(**payload, expected_version=version),
        skill_domain=True,
    )


async def _diagnosis(db: AsyncSession, owner_id: str, entry_id: str) -> Record:
    row = await _owned(db, owner_id, "study_memory", entry_id)
    if not row or not entry_id.startswith(PREFIX):
        raise HTTPException(404, "This diagnostic check is unavailable.")
    return row


def diagnosis_view(row: Record | dict) -> dict:
    entry = to_api(row) if isinstance(row, Record) else row
    if entry["data"].get("curriculum_version") != curriculum()["version"]:
        raise HTTPException(
            409,
            "This check uses an older curriculum. Its saved responses are preserved "
            "in Learning Memory.",
        )
    skill = skill_by_id(entry["data"]["skill_id"])
    return {"entry": entry, "skill": public_skill(skill, feedback=entry["state"] == "completed")}


async def start_diagnosis(
    db: AsyncSession, *, owner_id: str, skill_id: str, draft: StartDiagnosis
) -> dict:
    await owner_lock(db, owner_id)
    await ensure_no_exam(db, owner_id)
    skill = skill_by_id(skill_id)
    entry_id = identity("skill-diagnosis", f"{owner_id}:{skill_id}:{draft.request_id}")
    previous = await _owned(db, owner_id, "study_memory", entry_id)
    if previous:
        if previous.data.get("attempt_id") != draft.attempt_id:
            raise HTTPException(409, "This request identity already belongs to another source.")
        return diagnosis_view(previous)
    # Reopen an unfinished check even after an app restart or a lost start response.
    unfinished = await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "study_memory",
            Record.deleted_at.is_(None),
            Record.data["data"]["skill_diagnostic"].as_boolean().is_(True),
            Record.data["data"]["skill_id"].as_string() == skill_id,
            Record.data["state"].as_string() == "draft",
        )
        .order_by(Record.created_at)
        .limit(1)
    )
    if unfinished:
        return diagnosis_view(unfinished)
    if draft.attempt_id:
        attempt = await _owned(db, owner_id, "pyq_attempts", draft.attempt_id)
        if not attempt or attempt.data.get("question_uid") not in mapped_uids(skill_id):
            raise HTTPException(422, "The source attempt is not mapped to this skill.")
    entry = await _write(
        db,
        owner_id,
        entry_id,
        {
            "kind": "reflection",
            "title": f"Contrast check: {skill['title']}",
            "subject": skill["subject"],
            "topic": skill["topic"],
            "attempt_id": draft.attempt_id,
            "state": "draft",
            "evidence_kind": "learner",
            "content": "",
            "data": {
                "skill_diagnostic": True,
                "skill_id": skill_id,
                "curriculum_version": curriculum()["version"],
                "answers": {},
                "confidence": "unknown",
                "assisted": False,
                "source_attempt_ids": [draft.attempt_id] if draft.attempt_id else [],
            },
        },
        0,
    )
    return diagnosis_view(entry)


async def update_diagnosis(
    db: AsyncSession, *, owner_id: str, entry_id: str, draft: DiagnosisDraft
) -> dict:
    await owner_lock(db, owner_id)
    await ensure_no_exam(db, owner_id)
    row = await _diagnosis(db, owner_id, entry_id)
    diagnosis_view(row)  # Reject a changed curriculum before evaluating saved responses.
    skill = skill_by_id(row.data["data"]["skill_id"])
    probes = {probe["id"]: probe for probe in skill["probes"]}
    if any(
        key not in probes or type(value) is not int or not 0 <= value < len(probes[key]["choices"])
        for key, value in draft.answers.items()
    ):
        raise HTTPException(422, "One of the selected answers is invalid.")
    if draft.submit and set(draft.answers) != set(probes):
        raise HTTPException(422, "Answer both questions before comparing them.")
    data = {
        **row.data["data"],
        "answers": draft.answers,
        "confidence": draft.confidence,
        "assisted": draft.assisted,
    }
    payload = {
        **row.data,
        "content": draft.reasoning,
        "data": data,
        "state": "completed" if draft.submit else "draft",
    }
    if draft.submit:
        data["correct"] = sum(
            draft.answers[key] == probe["answer"] for key, probe in probes.items()
        )
        data["total"] = len(probes)
        data["mastery_claim"] = False
    if row.data["state"] == "completed":
        if payload != row.data:
            raise HTTPException(
                409, "This check was submitted. Start a new check to record a new response."
            )
        return diagnosis_view(row)
    saved = await _write(db, owner_id, entry_id, payload, draft.expected_version)
    return diagnosis_view(saved)


async def confirm_diagnosis(
    db: AsyncSession, *, owner_id: str, entry_id: str, draft: ConfirmDiagnosis
) -> dict:
    from app.services.memory_learning_engine import AUTOMATION, _day, _exposure, get_engine_config

    await owner_lock(db, owner_id)
    await ensure_no_exam(db, owner_id)
    row = await _diagnosis(db, owner_id, entry_id)
    if row.data["state"] != "completed":
        raise HTTPException(409, "Submit the contrast check before choosing follow-up practice.")
    if row.data["data"].get("confirmed_cause") is not None:
        if row.data["data"]["confirmed_cause"] != draft.cause:
            raise HTTPException(
                409, "This assessment was already confirmed. Create a new check to revise it."
            )
        repair = await _owned(db, owner_id, "study_memory", row.data["data"]["repair_entry_id"])
        return {"diagnosis": diagnosis_view(row), "repair": to_api(repair)}
    if draft.expected_version != row.version:
        raise HTTPException(409, "This diagnostic check changed. Reload it before confirming.")
    skill_id = row.data["data"]["skill_id"]
    skill = skill_by_id(skill_id)
    # Reuse an open repair family rather than producing a competing schedule.
    existing = await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner_id,
            Record.collection == "study_memory",
            Record.deleted_at.is_(None),
            Record.data["kind"].as_string() == "repair",
            Record.data["state"].as_string().in_(["open", "deferred"]),
            Record.data["data"]["skill_id"].as_string() == skill_id,
        )
        .order_by(Record.created_at)
        .limit(1)
    )
    if existing:
        repair = to_api(existing)
    else:
        selected = select_skill_questions(skill_id, await _exposure(db, owner_id))
        if not selected:
            raise HTTPException(
                422,
                "No unseen reviewed questions remain for this skill. Your check is "
                "saved; choose another skill or use ordinary practice.",
            )
        config = await get_engine_config(db, owner_id=owner_id)
        repair_id = identity("skill-repair", f"{owner_id}:{entry_id}")
        repair = await _write(
            db,
            owner_id,
            repair_id,
            {
                "kind": "repair",
                "title": f"Application check: {skill['title']}",
                "subject": skill["subject"],
                "topic": skill["topic"],
                "state": "open",
                "evidence_kind": "rule",
                "content": "Apply the skill on unfamiliar questions, then inspect the evidence.",
                "data": {
                    "automation": AUTOMATION,
                    "activity": "transfer",
                    "skill_id": skill_id,
                    "curriculum_version": curriculum()["version"],
                    "skill_match_verified": True,
                    "selection_basis": "reviewed-skill-map",
                    "target": skill["title"],
                    "reason": "Follow-up to your contrast check and your assessment.",
                    "success_criteria": "Answer unfamiliar questions, then record "
                    "whether you used help.",
                    "duration_min": 20,
                    "due_date": _day(config.model_dump()),
                    "question_uids": selected,
                    "source_question_uids": [],
                    "allow_seen": False,
                    "requested_count": len(selected),
                    "source_entry_ids": [entry_id],
                    "source_attempt_ids": row.data["data"].get("source_attempt_ids", []),
                    "selection_status": "ready",
                    "mastery_claim": False,
                },
            },
            0,
        )
    saved = await _write(
        db,
        owner_id,
        entry_id,
        {
            **row.data,
            "data": {
                **row.data["data"],
                "confirmed_cause": draft.cause,
                "repair_entry_id": repair["id"],
                "cause_provenance": "learner-assessment",
            },
        },
        row.version,
    )
    return {"diagnosis": diagnosis_view(saved), "repair": repair}


async def get_day(db: AsyncSession, owner_id: str, day: date) -> dict:
    entry_id = identity("study-day", f"{owner_id}:{day.isoformat()}")
    row = await _owned(db, owner_id, "study_memory", entry_id)
    return {
        "version": row.version if row else 0,
        "budget": row.data["data"]["budget"] if row else 20,
        "parked_action_ids": row.data["data"]["parked_action_ids"] if row else [],
    }


async def save_day(db: AsyncSession, owner_id: str, day: date, draft: DayPreferences) -> dict:
    await owner_lock(db, owner_id)
    if any(
        not value.startswith("resume-practice:") or len(value) > 200
        for value in draft.parked_action_ids
    ):
        raise HTTPException(422, "Only saved practice sessions can be set aside.")
    for value in draft.parked_action_ids:
        session = await _owned(db, owner_id, "pyq_sessions", value.removeprefix("resume-practice:"))
        if not session or session.data.get("config", {}).get("mode") == "exam":
            raise HTTPException(422, "An exam cannot be set aside by the daily queue.")
    entry_id = identity("study-day", f"{owner_id}:{day.isoformat()}")
    await _write(
        db,
        owner_id,
        entry_id,
        {
            "kind": "profile",
            "title": f"Study choices for {day.isoformat()}",
            "state": "completed",
            "evidence_kind": "learner",
            "data": {
                "budget": draft.budget,
                "parked_action_ids": sorted(set(draft.parked_action_ids)),
            },
        },
        draft.expected_version,
    )
    return await get_day(db, owner_id, day)


async def save_conditions(
    db: AsyncSession, owner_id: str, session_id: str, draft: SessionConditions
) -> dict:
    await owner_lock(db, owner_id)
    session = await _owned(db, owner_id, "pyq_sessions", session_id)
    if not session or session.data.get("status") != "completed":
        raise HTTPException(422, "Study conditions can be recorded after the session is completed.")
    repair_id = session.data.get("config", {}).get("memoryRepairId")
    repair = await _owned(db, owner_id, "study_memory", repair_id or "")
    if not repair or not repair.data.get("data", {}).get("skill_id"):
        raise HTTPException(422, "This session has no reviewed skill link.")
    return await _write(
        db,
        owner_id,
        identity("skill-conditions", f"{owner_id}:{session_id}"),
        {
            "kind": "reflection",
            "title": "Practice conditions",
            "session_id": session_id,
            "repair_id": repair_id,
            "state": "completed",
            "evidence_kind": "learner",
            "data": {
                "skill_id": repair.data["data"]["skill_id"],
                "assisted": draft.assisted,
                "conditions_report": True,
            },
        },
        draft.expected_version,
    )


async def list_skills(db: AsyncSession, *, owner_id: str) -> dict:
    await ensure_no_exam(db, owner_id)
    # One bounded indexed owner query; never scan the complete question bank for each attempt.
    rows = list(
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "study_memory",
                    Record.deleted_at.is_(None),
                    Record.data["data"]["skill_id"].as_string().is_not(None),
                )
                .order_by(Record.created_at.desc(), Record.id.desc())
                .limit(501)
            )
        ).all()
    )
    complete = len(rows) <= 500
    rows = rows[:500]
    conditions = {
        row.data.get("session_id"): row
        for row in reversed(rows)
        if row.data.get("data", {}).get("conditions_report")
    }
    items = []
    for skill in curriculum()["skills"]:
        linked = [row for row in rows if row.data.get("data", {}).get("skill_id") == skill["id"]]
        results = [row for row in linked if row.data.get("kind") == "verification"]
        independent = []
        delayed = []
        for result in results:
            raw = result.data["data"]
            condition = conditions.get(result.data.get("session_id"))
            if condition is None or condition.data["data"].get("assisted") is not False:
                continue
            if raw.get("fresh_question_check") is not True:
                continue
            independent.append(result)
            if raw.get("delay_satisfied") is True:
                delayed.append(result)

        def accurate(values):
            return sum(
                r.data["data"].get("reliable_correct", 0) == r.data["data"].get("planned", -1)
                and r.data["data"].get("planned", 0) > 0
                for r in values
            )

        item = public_skill(skill)
        item.pop("probes")
        item.update(
            diagnostics=[
                to_api(r) for r in linked if r.data.get("data", {}).get("skill_diagnostic")
            ][:3],
            repairs=[to_api(r) for r in linked if r.data.get("kind") == "repair"][:30],
            results=[to_api(r) for r in results][:20],
            conditions=[
                to_api(r) for r in linked if r.data.get("data", {}).get("conditions_report")
            ][:20],
            evidence={
                "fresh_checks": len(independent),
                "accurate_fresh_checks": accurate(independent),
                "delayed_checks": len(delayed),
                "accurate_delayed_checks": accurate(delayed),
                "conditions_unknown": sum(
                    r.data.get("session_id") not in conditions for r in results
                ),
                "pace": "Not established",
                "calibration": "Not established",
            },
        )
        items.append(item)
    return {"items": items, "complete": complete, "curriculum_version": curriculum()["version"]}


async def result_conditions(
    db: AsyncSession, owner_id: str, entry: dict, session: Record, receipts: list[Record]
) -> dict:
    skill_id = entry.get("data", {}).get("skill_id")
    if not skill_id:
        return {}
    from app.services.pyq_catalog import active_bank

    bank = active_bank()
    planned = session.data.get("question_uids", [])
    allowed = set(mapped_uids(skill_id))
    current_ids = {row.external_id for row in receipts}
    exposure_cutoff = max((row.created_at for row in receipts), default=session.created_at)
    other_uids = (
        await db.scalars(
            select(Record.data["question_uid"].as_string()).where(
                Record.owner_id == owner_id,
                Record.collection == "pyq_attempts",
                Record.deleted_at.is_(None),
                Record.external_id.not_in(current_ids),
                Record.created_at <= exposure_cutoff,
            )
        )
    ).all()
    other_hashes = {bank.by_uid[uid].content_hash for uid in other_uids if uid in bank.by_uid}
    fresh = (
        bool(planned)
        and set(planned) <= allowed
        and all(
            uid not in other_uids and bank.by_uid[uid].content_hash not in other_hashes
            for uid in planned
        )
    )
    interval = entry.get("data", {}).get("interval_days", 0)
    created = entry["created_at"]
    if isinstance(created, str):
        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    started = session.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    return {
        "skill_id": skill_id,
        "curriculum_version": curriculum()["version"],
        "skill_match_verified": set(planned) <= allowed,
        "fresh_question_check": fresh,
        "delay_satisfied": interval >= 3 and started >= created + timedelta(days=interval),
    }
