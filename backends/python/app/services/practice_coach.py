"""Local practice, selective reflection, original drills and qualified evidence.

Private records retain drafts and immutable answers. Original PYQ receipts are
never changed. The generic records API cannot read private answer keys.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from statistics import median
from typing import Literal
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from sqlalchemy import select

from app.db.models import Record
from app.services.memory_learning_engine import (
    _frozen_score,
    _memory_write,
    _plain,
    _select_questions,
    get_engine_config,
)
from app.services.practice_drills import FAMILIES, catalog_entry, classify
from app.services.pyq_catalog import active_bank
from app.services.records import lock_identity, snapshot_for_sqlite, to_api
from app.services.recovery import owner_lock
from app.services.skill_coach import ensure_no_exam
from app.services.study_memory import StudyMemoryDraft, _owned, save_entry

COLLECTION = "practice_coach_private"
LIMIT = 2500


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Signal(Draft):
    expected_version: int = Field(ge=0)
    flag: Literal["none", "unsure", "stuck", "useful", "help"] = "none"
    note: str = Field(default="", max_length=1000)


class Reflection(Draft):
    attempt_id: str
    cause: Literal[
        "uncertain",
        "reading",
        "recall",
        "recognition",
        "method",
        "execution",
        "verification",
        "time",
        "none",
    ] = "uncertain"
    note: str = Field(default="", max_length=2000)
    later: bool = False


class Trap(Draft):
    expected_version: int = Field(ge=0)
    principle: str = Field(min_length=1, max_length=2000)
    conditions: str = Field(default="", max_length=2000)
    counterexample: str = Field(default="", max_length=2000)
    confirmed: bool = True


class Problem(Draft):
    prompt: str = Field(min_length=8, max_length=4000)
    choices: list[str] = Field(min_length=2, max_length=6)
    answer: StrictInt = Field(ge=0)
    explanation: str = Field(min_length=5, max_length=4000)
    kind: Literal["recognition", "application", "boundary"] = "application"

    @model_validator(mode="after")
    def valid_answer(self):
        if self.answer >= len(self.choices) or any(
            not x.strip() or len(x) > 1500 for x in self.choices
        ):
            raise ValueError("Every choice and the correct answer must be valid")
        if len(set(self.choices)) != len(self.choices):
            raise ValueError("Choices must be distinct")
        return self


class AuthoredPack(Draft):
    group_id: str
    questions: list[Problem] = Field(min_length=2, max_length=3)
    principle: str = Field(min_length=5, max_length=2000)
    conditions: str = Field(default="", max_length=2000)
    counterexample: str = Field(default="", max_length=2000)
    source_url: str = Field(default="", max_length=500)
    provenance: str = Field(
        default="Assistant-authored original practice; not official PYQs", max_length=300
    )


class Answer(Draft):
    round: int = Field(ge=0)
    index: int = Field(ge=0, le=2)
    choice: StrictInt = Field(ge=0, le=5)
    assistance: Literal["unknown", "without-help", "with-help"] = "unknown"
    elapsed_sec: int | None = Field(default=None, ge=0, le=7200)


class PackDraft(Draft):
    expected_version: int = Field(ge=1)
    round: int = Field(ge=0)
    selections: dict[str, StrictInt] = Field(default_factory=dict)


class RepairFocus(Draft):
    expected_version: int = Field(ge=0)
    pack_ids: list[str] = Field(max_length=3)


class RepairAssessment(Draft):
    expected_version: int = Field(ge=1)
    difficulty: Literal["uncertain", "understanding", "recognition", "execution", "time"]
    next_action: str = Field(default="", max_length=500)


class ApplicationConditions(Draft):
    expected_version: int = Field(ge=0)
    assistance: Literal["unknown", "without-help", "with-help"]


class Strategy(Draft):
    expected_version: int = Field(ge=0)
    approach: Literal["two-pass", "check-conditions", "protect-review"] = "two-pass"
    first_pass_minutes: int = Field(default=2, ge=1, le=10)
    review_minutes: int = Field(default=5, ge=1, le=30)


class BatchItem(Draft):
    number: str = Field(min_length=1, max_length=80)
    outcome: Literal["correct", "wrong", "skipped", "unknown"] = "unknown"
    flagged: bool = False
    note: str = Field(default="", max_length=1000)


class NotebookBatch(Draft):
    request_id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=300)
    subject: str = Field(min_length=1, max_length=160)
    topic: str = Field(default="", max_length=300)
    studied_on: date
    items: list[BatchItem] = Field(min_length=1, max_length=100)
    attachment: str | None = Field(default=None, max_length=700_000)

    @model_validator(mode="after")
    def unique_numbers(self):
        if len({x.number.strip() for x in self.items}) != len(self.items):
            raise ValueError("Question numbers must be unique within a batch")
        if self.attachment and not self.attachment.startswith(
            ("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")
        ):
            raise ValueError("Use a PNG, JPEG or WebP attachment")
        if self.attachment:
            try:
                image = base64.b64decode(self.attachment.split(",", 1)[1], validate=True)
            except (ValueError, binascii.Error) as error:
                raise ValueError("The photo data is invalid") from error
            if not (
                image.startswith(b"\x89PNG\r\n\x1a\n")
                or image.startswith(b"\xff\xd8\xff")
                or image.startswith(b"RIFF")
                and image[8:12] == b"WEBP"
            ):
                raise ValueError("The photo does not contain a supported image")
        return self


def identity(kind, value):
    return f"{kind}:{uuid5(NAMESPACE_URL, 'hetu-practice:' + value)}"


def fingerprint(problem):
    return hashlib.sha256(
        json.dumps({k: problem[k] for k in ("prompt", "choices")}, sort_keys=True).encode()
    ).hexdigest()


async def rows(db, owner, collection, limit=LIMIT):
    query = select(Record).where(
        Record.owner_id == owner,
        Record.collection == collection,
        Record.deleted_at.is_(None),
    )
    if collection == COLLECTION:
        query = query.where(Record.data["kind"].as_string() != "photo")
    result = list(
        (
            await db.scalars(
                query.order_by(Record.created_at.desc(), Record.id.desc()).limit(limit + 1)
            )
        ).all()
    )
    return result[:limit], len(result) <= limit


async def private_state(db, owner):
    recent, complete = await rows(db, owner, COLLECTION)
    # Long-lived packs and principles must survive the bounded receipt window.
    durable = list(
        (
            await db.scalars(
                select(Record).where(
                    Record.owner_id == owner,
                    Record.collection == COLLECTION,
                    Record.deleted_at.is_(None),
                    Record.data["kind"]
                    .as_string()
                    .in_(["pack", "trap", "focus", "application_conditions"]),
                )
            )
        ).all()
    )
    by_id = {r.external_id: r for r in recent + durable}
    return list(by_id.values()), complete


async def write(db, owner, key, data, expected=None):
    await lock_identity(db, COLLECTION, owner, key)
    row = await _owned(db, owner, COLLECTION, key)
    if row and row.data == data:
        return row
    if expected is not None and expected != (row.version if row else 0):
        raise HTTPException(409, "This record changed. Reload before saving.")
    if row and row.data.get("kind") in {"answer", "batch", "photo"}:
        raise HTTPException(409, "Submitted evidence cannot be rewritten")
    if row is None:
        row = Record(owner_id=owner, collection=COLLECTION, external_id=key, data=data)
        db.add(row)
    else:
        row.data = data
        row.version += 1
        row.updated_at = datetime.now(UTC)
    await db.flush()
    await snapshot_for_sqlite(db, row)
    return row


async def today(db, owner):
    config = await get_engine_config(db, owner_id=owner)
    return datetime.now(ZoneInfo(config.time_zone)).date()


async def sources(db, owner):
    attempts, a = await rows(db, owner, "pyq_attempts")
    memory, b = await rows(db, owner, "study_memory")
    questions, c = await rows(db, owner, "questions")
    sessions, d = await rows(db, owner, "pyq_sessions")
    private, e = await private_state(db, owner)
    session_map = {x.external_id: x.data for x in sessions}
    exposed = set()
    for entry in memory:
        if entry.data.get("kind") == "exam_review":
            exposed.update(entry.data.get("data", {}).get("revealed_attempt_ids", []))
    eligible = []
    for attempt in attempts:
        session = session_map.get(attempt.data.get("pyq_session_id"))
        if not session:
            continue
        if session.get("config", {}).get("mode") == "exam":
            if session.get("status") != "completed" or attempt.external_id not in exposed:
                continue
        eligible.append(attempt)
    return eligible, memory, questions, private, a and b and c and d and e


async def mistake_groups(db, owner):
    attempts, memory, questions, private, complete = await sources(db, owner)
    reflections = {
        r.data.get("attempt_id"): r.data
        for r in reversed(memory)
        if r.data.get("kind") == "reflection" and r.data.get("state") == "completed"
    }
    groups = {}

    def add(source_id, raw, text, attempt_id=None, question_id=None, reflection=None):
        subject = raw.get("subject") or "Unclassified"
        topic = raw.get("topic") or raw.get("subtopic") or "Unclassified"
        family = classify(text)
        detail = (reflection or {}).get("data", {})
        mechanism = str(detail.get("mechanism") or "").strip()
        confirmed = bool(
            mechanism and detail.get("failure_stage") not in (None, "uncertain", "none")
        )
        grouping = f"{subject}:{topic}:{mechanism.lower() if confirmed else family or 'unassessed'}"
        key = identity("group", grouping)
        if key not in groups:
            groups[key] = {
                "id": key,
                "subject": subject,
                "topic": topic,
                "family": family,
                "title": mechanism
                if confirmed
                else FAMILIES[family][0]
                if family
                else f"Investigate {topic}",
                "basis": "learner-confirmed mechanism"
                if confirmed
                else "topic association; cause unassessed",
                "source_ids": [],
                "attempt_ids": [],
                "question_ids": [],
                "question_uids": [],
                "notes": [],
            }
        group = groups[key]
        group["source_ids"].append(source_id)
        if attempt_id:
            group["attempt_ids"].append(attempt_id)
        if question_id:
            group["question_ids"].append(question_id)
        if raw.get("question_uid"):
            group["question_uids"].append(raw["question_uid"])
        if reflection and reflection.get("content"):
            group["notes"].append(reflection["content"][:1200])

    for attempt in attempts:
        raw = attempt.data
        score = _frozen_score(raw)
        if (
            not score
            or score.get("mark_correct") is not False
            or raw.get("mark_decision") == "SKIP"
        ):
            continue
        snapshot = raw.get("question_snapshot") or {}
        add(
            attempt.external_id,
            {**raw, "topic": snapshot.get("topic")},
            _plain(snapshot.get("html", ""), 5000),
            attempt_id=attempt.external_id,
            reflection=reflections.get(attempt.external_id),
        )
    for question in questions:
        raw = question.data
        # Linked journal entries annotate attempts, not another independent error.
        if (
            raw.get("source_pyq_attempt_id")
            or raw.get("mark_correct") is not False
            and not str(raw.get("outcome", "")).startswith("W")
        ):
            continue
        add(
            question.external_id,
            raw,
            str(raw.get("question_text") or ""),
            question_id=question.external_id,
        )
    for batch in private:
        if batch.data.get("kind") != "batch":
            continue
        raw = batch.data
        for item in raw["items"]:
            if item["outcome"] == "wrong":
                add(f"{batch.external_id}:{item['number']}", raw, f"{raw['topic']} {item['note']}")
    return (
        sorted(groups.values(), key=lambda x: (-len(x["source_ids"]), x["title"])),
        private,
        complete,
    )


def pack_view(row, day):
    data = row.data
    answers = data.get("answers", {})
    questions = []
    for i, problem in enumerate(data["questions"]):
        shown = {k: v for k, v in problem.items() if k not in {"answer", "explanation"}}
        if str(i) in answers:
            shown.update(
                answer=problem["answer"], explanation=problem["explanation"], result=answers[str(i)]
            )
        questions.append(shown)
    done = len(answers) == len(questions)
    return {
        "id": row.external_id,
        "version": row.version,
        "group_id": data["group_id"],
        "title": data["title"],
        "subject": data["subject"],
        "topic": data["topic"],
        "family": data.get("family"),
        "round": data["round"],
        "questions": questions,
        "selections": data.get("selections", {}),
        "done": done,
        "due_date": data["due_date"],
        "due": data["due_date"] <= day.isoformat(),
        "completed_rounds": data.get("completed_rounds", 0),
        "provenance": data["provenance"],
        "principle": data["principle"] if done else None,
        "conditions": data["conditions"] if done else None,
        "counterexample": data["counterexample"] if done else None,
        "source_url": data.get("source_url") if done else None,
        "transfer_id": data.get("transfer_id"),
        "source_count": len(data["source_ids"]),
        "assessment": data.get("assessment"),
        "round_outcome": data.get("round_outcome") if done else None,
        "independent_rounds": data.get("independent_rounds", 0),
        "independent_delayed_rounds": data.get("independent_delayed_rounds", 0),
        "unsuccessful_rounds": data.get("unsuccessful_rounds", 0),
    }


def focus_view(private, day):
    saved = next((r for r in private if r.data.get("kind") == "focus"), None)
    packs = [r for r in private if r.data.get("kind") == "pack"]
    available = {r.external_id for r in packs}
    # Suggestions remain read-only. A learner's selected targets survive time and queue changes.
    ranked = sorted(
        packs,
        key=lambda r: (
            not bool(
                r.data.get("selections") and len(r.data["answers"]) < len(r.data["questions"])
            ),
            r.data["due_date"] > day.isoformat(),
            -len(r.data["source_ids"]),
            r.data["due_date"],
            r.data["title"],
            r.external_id,
        ),
    )
    return {
        "version": saved.version if saved else 0,
        "pack_ids": [key for key in saved.data["pack_ids"] if key in available]
        if saved
        else [r.external_id for r in ranked[:3]],
        "suggested": saved is None,
    }


async def save_focus(db, owner, draft: RepairFocus):
    await owner_lock(db, owner)
    await ensure_no_exam(db, owner)
    if len(set(draft.pack_ids)) != len(draft.pack_ids):
        raise HTTPException(422, "Choose distinct repair targets")
    for key in draft.pack_ids:
        await get_pack(db, owner, key)
    await write(
        db,
        owner,
        identity("focus", "repairs"),
        {"kind": "focus", "pack_ids": draft.pack_ids},
        draft.expected_version,
    )
    return await overview(db, owner)


async def assess_repair(db, owner, key, draft: RepairAssessment):
    await owner_lock(db, owner)
    row = await get_pack(db, owner, key)
    assessment = {
        "difficulty": draft.difficulty,
        "next_action": draft.next_action.strip(),
        "basis": "learner assessment",
    }
    previous = row.data.get("assessment", {})
    if all(previous.get(key) == value for key, value in assessment.items()):
        return pack_view(row, await today(db, owner))
    assessment["saved_at"] = datetime.now(UTC).isoformat()
    row = await write(
        db, owner, key, {**row.data, "assessment": assessment}, draft.expected_version
    )
    return pack_view(row, await today(db, owner))


async def application_conditions(db, owner, session_id, draft=None):
    from app.services.memory_learning_engine import reconcile_engine_results
    from app.services.practice_application import application

    if draft:
        await owner_lock(db, owner)
    await ensure_no_exam(db, owner)
    _, _, pack_id = await application(db, owner, session_id)
    key = identity("application-conditions", session_id)
    row = await _owned(db, owner, COLLECTION, key)
    if draft:
        # A condition report is evidence about a completed session. Preserve it once saved.
        if row and row.data["assistance"] != draft.assistance:
            raise HTTPException(409, "The saved application conditions cannot be changed")
        row = await write(
            db,
            owner,
            key,
            {
                "kind": "application_conditions",
                "session_id": session_id,
                "pack_id": pack_id,
                "assistance": draft.assistance,
            },
            draft.expected_version,
        )
        await reconcile_engine_results(db, owner_id=owner)
    return {
        "version": row.version if row else 0,
        "assistance": row.data["assistance"] if row else "unknown",
        "pack_id": pack_id,
    }


async def overview(db, owner):
    await ensure_no_exam(db, owner)
    groups, private, complete = await mistake_groups(db, owner)
    day = await today(db, owner)
    packs = [pack_view(r, day) for r in private if r.data.get("kind") == "pack"]
    traps = {r.data["group_id"]: to_api(r) for r in private if r.data.get("kind") == "trap"}
    answers = [r.data for r in private if r.data.get("kind") == "answer"]
    independent = [a for a in answers if a["assistance"] == "without-help"]
    fresh = [a for a in independent if a["fresh_in_workspace"]]
    delayed = [a for a in independent if a["delayed"]]
    fresh_delayed = [a for a in delayed if a["fresh_in_workspace"]]
    sessions, _ = await rows(db, owner, "pyq_sessions", 100)
    recent_sessions = [
        {
            "id": r.external_id,
            "title": (
                f"{r.data.get('started_at', '')[:10]} · "
                f"{len(r.data.get('completed_question_uids', []))} saved answers"
            ),
        }
        for r in sessions
        if r.data.get("config", {}).get("mode") != "exam"
        and r.data.get("status") in {"completed", "paused"}
    ][:12]
    group_progress = []
    for group in groups:
        history = sorted(
            [a for a in answers if a["group_id"] == group["id"]],
            key=lambda a: a["submitted_at"],
            reverse=True,
        )
        recent, previous = history[:6], history[6:12]
        timed = [
            a["elapsed_sec"]
            for a in history
            if a["correct"]
            and a["assistance"] == "without-help"
            and a["fresh_in_workspace"]
            and a.get("elapsed_sec") is not None
        ]
        group_progress.append(
            {
                "group_id": group["id"],
                "title": group["title"],
                "observations": len(group["source_ids"]),
                "recent_count": len(recent),
                "recent_correct": sum(a["correct"] for a in recent),
                "previous_count": len(previous),
                "previous_correct": sum(a["correct"] for a in previous),
                "timed_count": len(timed),
                "median_seconds": median(timed) if timed else None,
                "fresh_count": sum(
                    a["fresh_in_workspace"] and a["assistance"] == "without-help" for a in history
                ),
                "fresh_correct": sum(
                    a["correct"] and a["fresh_in_workspace"] and a["assistance"] == "without-help"
                    for a in history
                ),
                "delayed_count": sum(
                    a["delayed"] and a["assistance"] == "without-help" for a in history
                ),
                "delayed_correct": sum(
                    a["correct"] and a["delayed"] and a["assistance"] == "without-help"
                    for a in history
                ),
            }
        )
    from app.services.practice_application import progress

    applications = await progress(db, owner, private)
    return {
        "focus": focus_view(private, day),
        "applications": applications,
        "group_progress": group_progress,
        "recent_sessions": recent_sessions,
        "groups": [{**g, "trap": traps.get(g["id"])} for g in groups],
        "packs": sorted(packs, key=lambda p: (p["done"], p["due_date"], p["title"])),
        "complete": complete,
        "evidence": {
            "answers": len(answers),
            "correct": sum(a["correct"] for a in answers),
            "fresh": len(fresh),
            "fresh_correct": sum(a["correct"] for a in fresh),
            "delayed": len(delayed),
            "delayed_correct": sum(a["correct"] for a in delayed),
            "conditions_unknown": sum(a["assistance"] == "unknown" for a in answers),
            "helped": sum(a["assistance"] == "with-help" for a in answers),
            "fresh_delayed": len(fresh_delayed),
            "fresh_delayed_correct": sum(a["correct"] for a in fresh_delayed),
        },
        "batches": [
            {
                **{k: v for k, v in to_api(r).items() if k != "attachment"},
                "has_attachment": bool(r.data.get("has_attachment")),
            }
            for r in private
            if r.data.get("kind") == "batch"
        ][:20],
    }


async def prepare(db, owner, authored: AuthoredPack | None = None):
    await owner_lock(db, owner)
    await ensure_no_exam(db, owner)
    groups, private, complete = await mistake_groups(db, owner)
    if authored and authored.group_id not in {g["id"] for g in groups}:
        raise HTTPException(422, "Choose an existing mistake group from the local log")
    existing = {r.data["group_id"]: r for r in private if r.data.get("kind") == "pack"}
    day = await today(db, owner)
    created, retained, uncovered = [], [], []
    for group in groups:
        if authored and group["id"] != authored.group_id:
            continue
        if group["id"] in existing:
            saved = existing[group["id"]]
            changes = {
                key: list(dict.fromkeys(saved.data.get(key, []) + group[key]))
                for key in ("source_ids", "attempt_ids", "question_ids", "question_uids")
            }
            await write(db, owner, saved.external_id, {**saved.data, **changes})
            retained.append(saved.external_id)
            continue
        if authored:
            content = authored.model_dump(exclude={"group_id"})
        elif group["family"]:
            content = catalog_entry(group["family"])
        else:
            uncovered.append(group)
            continue
        for problem in content["questions"]:
            Problem.model_validate(problem)
        key = identity("pack", group["id"])
        data = {
            **content,
            **{
                k: group[k]
                for k in (
                    "title",
                    "subject",
                    "topic",
                    "family",
                    "source_ids",
                    "attempt_ids",
                    "question_ids",
                    "question_uids",
                )
            },
            "group_id": group["id"],
            "kind": "pack",
            "authored": authored is not None,
            "round": 0,
            "answers": {},
            "selections": {},
            "due_date": day.isoformat(),
            "completed_rounds": 0,
            "streak": 0,
        }
        await write(db, owner, key, data, 0)
        created.append(key)
    return {"created": created, "retained": retained, "uncovered": uncovered, "complete": complete}


async def get_pack(db, owner, key):
    await ensure_no_exam(db, owner)
    row = await _owned(db, owner, COLLECTION, key)
    if not row or row.data.get("kind") != "pack":
        raise HTTPException(404, "Practice pack not found")
    return row


async def save_pack_draft(db, owner, key, draft: PackDraft):
    await owner_lock(db, owner)
    row = await get_pack(db, owner, key)
    if draft.round != row.data["round"]:
        raise HTTPException(409, "This practice round has changed")
    for index, choice in draft.selections.items():
        if index not in {
            str(i) for i in range(len(row.data["questions"]))
        } or not 0 <= choice < len(row.data["questions"][int(index)]["choices"]):
            raise HTTPException(422, "Invalid question selection")
        if index in row.data["answers"] and choice != row.data["answers"][index]["choice"]:
            raise HTTPException(409, "A committed answer cannot be changed")
    row = await write(
        db, owner, key, {**row.data, "selections": draft.selections}, draft.expected_version
    )
    return pack_view(row, await today(db, owner))


async def start_round(db, owner, key):
    await owner_lock(db, owner)
    row = await get_pack(db, owner, key)
    day = await today(db, owner)
    data = row.data
    if len(data["answers"]) < len(data["questions"]):
        return pack_view(row, day)
    if data["due_date"] > day.isoformat():
        raise HTTPException(409, "This check is scheduled for a later day")
    next_round = data["round"] + 1
    content = (
        catalog_entry(data["family"], next_round)
        if data.get("family") and not data.get("authored")
        else {}
    )
    row = await write(
        db, owner, key, {**data, **content, "round": next_round, "answers": {}, "selections": {}}
    )
    return pack_view(row, day)


async def prepare_transfer(db, owner, pack):
    attempts, _ = await rows(db, owner, "pyq_attempts")
    seen = {x.data.get("question_uid") for x in attempts}
    uids = _select_questions(
        pack["subject"], pack["topic"], seen, pack["question_uids"], fresh=True
    )
    if not uids:
        return None
    key = identity("repair", pack["group_id"])
    previous = await _owned(db, owner, "study_memory", key)
    if previous:
        return key
    await _memory_write(
        db,
        owner,
        key,
        {
            "kind": "repair",
            "title": f"Apply: {pack['title']}",
            "subject": pack["subject"],
            "topic": pack["topic"],
            "state": "open",
            "evidence_kind": "rule",
            "content": "Apply the distinction to fresh bank questions. Topic matching is "
            "approximate; the exact mistake mechanism is not certified.",
            "data": {
                "automation": "local_learning_engine",
                "practice_pack_id": identity("pack", pack["group_id"]),
                "activity": "transfer",
                "target": pack["principle"],
                "reason": "Fresh application after a completed original micro-drill",
                "success_criteria": "Answer independently, then check again after a delay.",
                "due_date": (await today(db, owner)).isoformat(),
                "duration_min": 10,
                "requested_count": len(uids),
                "question_uids": uids,
                "source_question_uids": pack["question_uids"],
                "source_attempt_ids": pack["attempt_ids"],
                "allow_seen": False,
                "selection_basis": "topic-and-text-match",
                "mastery_claim": False,
            },
        },
    )
    return key


async def submit_answer(db, owner, key, draft: Answer):
    await owner_lock(db, owner)
    row = await get_pack(db, owner, key)
    data = row.data
    receipt_id = identity("answer", f"{key}:{draft.round}:{draft.index}")
    existing = await _owned(db, owner, COLLECTION, receipt_id)
    if existing:
        if existing.data["request"] != draft.model_dump():
            raise HTTPException(409, "This question already has a committed answer")
        return pack_view(row, await today(db, owner))
    if draft.round != data["round"] or draft.index >= len(data["questions"]):
        raise HTTPException(409, "This practice round has changed")
    question = data["questions"][draft.index]
    if draft.choice >= len(question["choices"]):
        raise HTTPException(422, "Choose an available answer")
    private, complete_history = await rows(db, owner, COLLECTION)
    digest = fingerprint(question)
    previous = [r.data for r in private if r.data.get("kind") == "answer"]
    now = datetime.now(UTC)
    previous_completion = data.get("completed_at")
    delayed = bool(
        previous_completion
        and (now - datetime.fromisoformat(previous_completion)).total_seconds() >= 3 * 86400
    )
    result = {
        "kind": "answer",
        "pack_id": key,
        "group_id": data["group_id"],
        "request": draft.model_dump(),
        "choice": draft.choice,
        "correct": draft.choice == question["answer"],
        "assistance": draft.assistance,
        "elapsed_sec": draft.elapsed_sec,
        "timing_basis": "reported foreground interval",
        "fingerprint": digest,
        "fresh_in_workspace": complete_history
        and not any(p["fingerprint"] == digest for p in previous),
        "delayed": delayed,
        "submitted_at": now.isoformat(),
        "round": draft.round,
    }
    await write(db, owner, receipt_id, result, 0)
    answers = {**data["answers"], str(draft.index): result}
    next_data = {
        **data,
        "answers": answers,
        "selections": {**data.get("selections", {}), str(draft.index): draft.choice},
    }
    if len(answers) == len(data["questions"]):
        clean = all(a["correct"] for a in answers.values())
        independent = clean and all(a["assistance"] == "without-help" for a in answers.values())
        # Old streaks may contain helped answers; never promote them as independent evidence.
        streak = data.get("independent_streak", 0) + 1 if independent else 0
        interval = [3, 7, 14, 30][min(streak - 1, 3)] if independent else 1
        next_data.update(
            streak=streak,
            independent_streak=streak,
            independent_rounds=data.get("independent_rounds", 0) + int(independent),
            independent_delayed_rounds=data.get("independent_delayed_rounds", 0)
            + int(independent and all(a["delayed"] for a in answers.values())),
            unsuccessful_rounds=0
            if independent
            else data.get("unsuccessful_rounds", 0) + int(not clean),
            round_outcome="independent"
            if independent
            else "needs-independent-check"
            if clean
            else "needs-repair",
            schedule_policy=2,
            completed_rounds=data["completed_rounds"] + 1,
            completed_at=now.isoformat(),
            due_date=((await today(db, owner)) + timedelta(days=interval)).isoformat(),
        )
        if independent:
            next_data["transfer_id"] = await prepare_transfer(db, owner, data)
    row = await write(db, owner, key, next_data)
    return pack_view(row, await today(db, owner))


async def save_trap(db, owner, group_id, draft: Trap):
    await owner_lock(db, owner)
    await ensure_no_exam(db, owner)
    groups, _, _ = await mistake_groups(db, owner)
    group = next((g for g in groups if g["id"] == group_id), None)
    if not group:
        raise HTTPException(404, "Mistake group not found")
    row = await write(
        db,
        owner,
        identity("trap", group_id),
        {
            "kind": "trap",
            "group_id": group_id,
            "source_ids": group["source_ids"],
            **draft.model_dump(exclude={"expected_version"}),
        },
        draft.expected_version,
    )
    return to_api(row)


async def save_signal(db, owner, attempt_id, draft: Signal):
    await owner_lock(db, owner)
    attempt = await _owned(db, owner, "pyq_attempts", attempt_id)
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    session = await _owned(db, owner, "pyq_sessions", attempt.data.get("pyq_session_id", ""))
    if not session or session.data.get("config", {}).get("mode") == "exam":
        raise HTTPException(409, "Use independent exam review after submitting the exam")
    return to_api(
        await write(
            db,
            owner,
            identity("signal", attempt_id),
            {
                "kind": "signal",
                "attempt_id": attempt_id,
                **draft.model_dump(exclude={"expected_version"}),
                "reveal_state": "after",
            },
            draft.expected_version,
        )
    )


async def review(db, owner, session_id):
    session = await _owned(db, owner, "pyq_sessions", session_id)
    if (
        not session
        or session.data.get("config", {}).get("mode") == "exam"
        or session.data.get("status") not in {"completed", "paused"}
    ):
        raise HTTPException(409, "Finish or pause practice before the short review")
    attempts, memory, _, private, complete = await sources(db, owner)
    attempts = [a for a in attempts if a.data.get("pyq_session_id") == session_id]
    signals = {r.data["attempt_id"]: r.data for r in private if r.data.get("kind") == "signal"}
    decisions = {r.data["attempt_id"]: r.data for r in private if r.data.get("kind") == "review"}
    existing_reflections = {
        r.data.get("attempt_id")
        for r in memory
        if r.data.get("kind") == "reflection"
        and r.data.get("state") == "completed"
        and r.data.get("content")
    }

    def rank(row):
        raw, flag = row.data, signals.get(row.external_id, {}).get("flag")
        wrong = (_frozen_score(raw) or {}).get("mark_correct") is False
        return (
            0
            if flag in {"stuck", "useful"}
            else 1
            if wrong
            and raw.get("confidence_source") == "reported"
            and raw.get("confidence") == "high"
            else 2
            if wrong
            else 3
            if flag in {"unsure", "help"}
            else 4,
            row.external_id,
        )

    ordered = sorted(attempts, key=rank)
    chosen = [a for a in ordered if rank(a)[0] < 4][:3]
    if len(chosen) < 3:
        success = next(
            (a for a in ordered if a not in chosen and a.data.get("mark_correct") is True), None
        )
        if success:
            chosen.append(success)
    candidates = []
    for a in chosen:
        raw = a.data
        q = raw.get("question_snapshot") or {}
        candidates.append(
            {
                "attempt_id": a.external_id,
                "title": f"{q.get('paper_label', 'Practice')} · Q{q.get('number', '?')}",
                "topic": q.get("topic"),
                "prompt": _plain(q.get("html"), 1200),
                "correct": raw.get("mark_correct"),
                "reason": "Your quick flag"
                if signals.get(a.external_id, {}).get("flag") not in (None, "none")
                else "Check the first unsupported step"
                if raw.get("mark_correct") is False
                else "Sample a successful answer's reasoning",
                "decision": decisions.get(a.external_id)
                or ({"state": "done"} if a.external_id in existing_reflections else None),
            }
        )
    return {
        "session_id": session_id,
        "saved_count": len(attempts),
        "candidates": candidates,
        "complete": complete,
    }


async def reflect(db, owner, session_id, draft: Reflection):
    await owner_lock(db, owner)
    view = await review(db, owner, session_id)
    if draft.attempt_id not in {c["attempt_id"] for c in view["candidates"]}:
        previous = await _owned(db, owner, COLLECTION, identity("review", draft.attempt_id))
        if previous and previous.data["request"] == draft.model_dump():
            return view
        raise HTTPException(422, "Choose an offered review moment")
    key = identity("review", draft.attempt_id)
    previous = await _owned(db, owner, COLLECTION, key)
    if previous and previous.data["request"] == draft.model_dump():
        return view
    if not draft.later and not draft.note.strip() and draft.cause == "uncertain":
        raise HTTPException(422, "Choose an assessment, add a note, or leave this for later")
    await write(
        db,
        owner,
        key,
        {
            "kind": "review",
            "session_id": session_id,
            "attempt_id": draft.attempt_id,
            "request": draft.model_dump(),
            "state": "later" if draft.later else "done",
        },
    )
    if not draft.later:
        previous_reflection = await _owned(
            db, owner, "study_memory", identity("reflection", draft.attempt_id)
        )
        attempt = await _owned(db, owner, "pyq_attempts", draft.attempt_id)
        await save_entry(
            db,
            owner_id=owner,
            entry_id=identity("reflection", draft.attempt_id),
            draft=StudyMemoryDraft(
                kind="reflection",
                title="Short practice review",
                subject=attempt.data.get("subject"),
                topic=(attempt.data.get("question_snapshot") or {}).get("topic"),
                attempt_id=draft.attempt_id,
                session_id=session_id,
                content=draft.note.strip(),
                state="completed",
                expected_version=previous_reflection.version if previous_reflection else 0,
                data={"failure_stage": draft.cause, "reveal_state": "after", "quick_review": True},
            ),
        )
    return await review(db, owner, session_id)


async def save_batch(db, owner, draft: NotebookBatch):
    await owner_lock(db, owner)
    key = identity("batch", draft.request_id)
    row = await write(
        db,
        owner,
        key,
        {
            "kind": "batch",
            **draft.model_dump(mode="json", exclude={"attachment"}),
            "has_attachment": bool(draft.attachment),
            "attachment_hash": hashlib.sha256(draft.attachment.encode()).hexdigest()
            if draft.attachment
            else None,
            "timing": None,
            "confidence": None,
            "evidence_kind": "learner-reported",
        },
        0,
    )
    if draft.attachment:
        await write(
            db,
            owner,
            identity("photo", key),
            {
                "kind": "photo",
                "batch_id": key,
                "attachment": draft.attachment,
            },
            0,
        )
    return {"id": row.external_id, "count": len(draft.items)}


async def daily_plan(db, owner, budget: int):
    await owner_lock(db, owner)
    await ensure_no_exam(db, owner)
    if budget not in {10, 20, 30, 45, 60}:
        raise HTTPException(422, "Choose an available time budget")
    day = await today(db, owner)
    private, _ = await private_state(db, owner)
    attempts, complete = await rows(db, owner, "pyq_attempts")
    bank = active_bank()
    seen = {a.data.get("question_uid") for a in attempts}
    hashes = {bank.by_uid[u].content_hash for u in seen if u in bank.by_uid}
    reserved = {
        u for p in bank.manifest.get("benchmarkPapers", []) for u in p.get("questionUids", [])
    }
    counts = Counter(a.data.get("subject") for a in attempts)
    eligible = [
        q
        for q in bank.questions
        if q.book_slug == "gate-cse"
        and q.question_uid not in seen | reserved
        and q.content_hash not in hashes
        and not q.duplicate_of_uid
        and q.answer_status == "available"
        and q.integrity_status == "verified"
        and q.question_type in {"MCQ", "MSQ", "NAT"}
    ]
    eligible.sort(
        key=lambda q: (
            counts[q.subject],
            hashlib.sha256(f"{day}:{q.question_uid}".encode()).hexdigest(),
        )
    )
    recall = 2 if budget < 30 else 3
    review_minutes = 1 if budget == 10 else 2
    repair = max(3, budget // 4)
    fresh = budget - recall - review_minutes - repair
    selected = eligible[: max(1, (budget if budget == 10 else fresh) // 3)]
    focus_ids = focus_view(private, day)["pack_ids"]
    packs = sorted(
        [
            r
            for r in private
            if r.data.get("kind") == "pack"
            and r.data["due_date"] <= day.isoformat()
            and r.external_id in focus_ids
        ],
        key=lambda r: (focus_ids.index(r.external_id), r.data["due_date"]),
    )
    steps = [
        {
            "id": "recall",
            "title": "Retrieve one idea",
            "minutes": recall,
            "href": "/concept-review",
            "reason": "Recall before reopening your explanation.",
        },
        {
            "id": "repair",
            "title": "Check one difficult distinction",
            "minutes": repair,
            "href": f"/practice-lab?pack={packs[0].external_id}" if packs else "/skills",
            "reason": "One due repair; the remaining queue can wait.",
        },
        {
            "id": "fresh",
            "title": "Fresh mixed practice",
            "minutes": fresh,
            "href": "/pyq?"
            + urlencode(
                {
                    "questionUids": ",".join(q.question_uid for q in selected),
                    "count": "all",
                    "mode": "practice",
                    "order": "random",
                    "hideTopics": "1",
                }
            )
            if selected
            else "/pyq",
            "reason": "Protect fresh syllabus coverage and choose methods without topic labels.",
        },
        {
            "id": "review",
            "title": "Close with one useful observation",
            "minutes": review_minutes,
            "href": "/practice-lab?tab=reviews",
            "reason": "Answers are already saved; review at most three moments.",
        },
    ]
    if budget == 10:
        # One destination: short sessions should not spend their budget changing tools.
        step = steps[1] if packs else steps[2]
        steps = [
            {
                **step,
                "minutes": budget,
                "reason": "Stay with one repair and its feedback."
                if packs
                else "Stay with fresh practice; stop when your available time is used.",
            }
        ]
    elif packs:
        steps[1]["reason"] = "One of your selected repair targets; other packs stay scheduled."
    else:
        steps[1]["reason"] = "Choose a skill check when no selected repair is due."
    focused_pack_ids = [packs[0].external_id] if packs else []
    key = identity("plan", f"{day}:{budget}")
    previous = await _owned(db, owner, COLLECTION, key)
    if previous and any(previous.data.get("completed", {}).values()):
        return to_api(previous)
    return to_api(
        await write(
            db,
            owner,
            key,
            {
                "kind": "plan",
                "date": day.isoformat(),
                "budget": budget,
                "steps": steps,
                "completed": {},
                "complete_history": complete,
                "fresh_count": len(selected) if any(s["id"] == "fresh" for s in steps) else 0,
                "focus_pack_ids": focused_pack_ids,
            },
        )
    )


async def complete_plan_step(db, owner, key, step, expected):
    await owner_lock(db, owner)
    row = await _owned(db, owner, COLLECTION, key)
    if (
        not row
        or row.data.get("kind") != "plan"
        or step not in {s["id"] for s in row.data["steps"]}
    ):
        raise HTTPException(404, "Plan step not found")
    return to_api(
        await write(
            db,
            owner,
            key,
            {**row.data, "completed": {**row.data["completed"], step: True}},
            expected,
        )
    )


async def strategy(db, owner, draft: Strategy | None = None, session_id: str | None = None):
    if draft:
        await owner_lock(db, owner)
        await ensure_no_exam(db, owner)
        saved = await write(
            db,
            owner,
            "exam-strategy",
            {"kind": "strategy", **draft.model_dump(exclude={"expected_version"})},
            draft.expected_version,
        )
    else:
        saved = await _owned(db, owner, COLLECTION, "exam-strategy")
    attempts, complete = await rows(db, owner, "pyq_attempts")
    sessions, _ = await rows(db, owner, "pyq_sessions")
    eligible = {
        s.external_id
        for s in sessions
        if s.data.get("status") == "completed"
        and s.data.get("config", {}).get("mode") == "exam"
        and (not session_id or s.external_id == session_id)
    }
    values = [a for a in attempts if a.data.get("pyq_session_id") in eligible]
    wrong = [a for a in values if (_frozen_score(a.data) or {}).get("mark_correct") is False]
    correct = [a for a in values if (_frozen_score(a.data) or {}).get("mark_correct") is True]
    times = sorted(
        [a.data.get("time_spent_sec", 0) for a in correct if a.data.get("time_spent_sec", 0) > 0]
    )
    slow_wrong = sorted(wrong, key=lambda a: -a.data.get("time_spent_sec", 0))[:3]
    # Aggregate observations only; no unrevealed exam keys or model-derived causes.
    return {
        "plan": to_api(saved)
        if saved
        else {"version": 0, "approach": "two-pass", "first_pass_minutes": 2, "review_minutes": 5},
        "evidence": {
            "exam_count": len(eligible),
            "attempts": len(values),
            "wrong": len(wrong),
            "correct": len(correct),
            "correct_timing_count": len(times),
            "median_correct_sec": median(times) if times else None,
            "longest_wrong_sec": [a.data.get("time_spent_sec", 0) for a in slow_wrong],
            "penalty_thirds": sum(
                max(0, -(_frozen_score(a.data) or {}).get("score_thirds", 0)) for a in values
            ),
            "complete": complete,
        },
    }
