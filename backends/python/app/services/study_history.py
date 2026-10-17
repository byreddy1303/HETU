"""A bounded, owner-scoped index over existing study evidence.

The timeline is a projection, not a copy of the underlying records. SQL applies
all filters, ordering, counts and pagination before Python receives any events.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any, Literal
from urllib.parse import quote, urlsplit

from fastapi import HTTPException
from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db.models import Record

HistoryCollection = Literal[
    "study_memory",
    "pyq_attempts",
    "pyq_sessions",
    "questions",
    "formulas",
    "concept_pages",
    "learning_insights",
    "concept_reviews",
    "learning_items",
    "mock_tests",
]
COLLECTIONS = (
    "study_memory",
    "pyq_attempts",
    "pyq_sessions",
    "questions",
    "formulas",
    "concept_pages",
    "learning_insights",
    "concept_reviews",
    "learning_items",
    "mock_tests",
)
DETAIL_COLLECTIONS = (*COLLECTIONS, "source_captures")
RELATED_LIMIT = 50


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in {"script", "style", "template"}:
            self.hidden += 1
        elif not self.hidden and tag in {"br", "p", "div", "li", "tr"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "template"}:
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def plain_text(value: Any, limit: int = 360) -> str:
    if not isinstance(value, str):
        return ""
    parser = _Text()
    parser.feed(value[:30_000])
    result = " ".join("".join(parser.parts).split())
    result = re.sub(r"data:[^\s]+", "[embedded media omitted]", result, flags=re.I)
    # Do not forward raw credentials accidentally pasted into a note.
    result = re.sub(
        r"(?i)\b(?:sk-[\w-]{12,}|Bearer\s+[\w.~-]{12,})", "[credential omitted]", result
    )
    return result[:limit]


def _text(*path: str):
    result = Record.data
    for part in path:
        result = result[part]
    return result.as_string()


def _coalesce(*values):
    return func.coalesce(*(func.nullif(value, "") for value in values))


def _fields(owner_id: str) -> dict[str, Any]:
    # Journal annotations may have only the immutable receipt link. Resolve its
    # question identity in SQL so question filters connect those older records.
    receipt = aliased(Record)
    receipt_uid = (
        select(receipt.data["question_uid"].as_string())
        .where(
            receipt.owner_id == owner_id,
            receipt.collection == "pyq_attempts",
            receipt.external_id == _text("source_pyq_attempt_id"),
            receipt.deleted_at.is_(None),
        )
        .correlate(Record)
        .scalar_subquery()
    )
    concept = aliased(Record)

    def concept_field(name: str):
        return (
            select(concept.data[name].as_string())
            .where(
                concept.owner_id == owner_id,
                concept.collection == "concept_pages",
                concept.external_id == _text("concept_id"),
                concept.deleted_at.is_(None),
            )
            .correlate(Record)
            .scalar_subquery()
        )

    subject = _coalesce(
        _text("subject"),
        _text("question_snapshot", "subject"),
        _text("config", "subjectSlug"),
        concept_field("subject"),
    )
    topic = _coalesce(
        _text("topic"),
        _text("subtopic"),
        _text("question_snapshot", "topic"),
        _text("config", "topicSlug"),
        concept_field("topic"),
    )
    session = _coalesce(
        _text("session_id"),
        _text("pyq_session_id"),
        _text("source_pyq_session_id"),
        case((Record.collection == "pyq_sessions", Record.external_id), else_=None),
    )
    attempt = _coalesce(
        _text("attempt_id"),
        _text("source_pyq_attempt_id"),
        _text("latest_pyq_attempt_id"),
        _text("origin_pyq_attempt_id"),
        case((Record.collection == "pyq_attempts", Record.external_id), else_=None),
    )
    title = case(
        (Record.collection == "study_memory", _text("title")),
        (
            Record.collection == "pyq_attempts",
            _coalesce(_text("question_snapshot", "topic"), _text("subject")),
        ),
        (
            Record.collection == "pyq_sessions",
            _coalesce(_text("title"), _text("config", "topicSlug"), _text("config", "subjectSlug")),
        ),
        (
            Record.collection == "questions",
            _coalesce(_text("pattern_name"), _text("question_text")),
        ),
        (Record.collection == "formulas", _text("name")),
        (Record.collection == "concept_pages", _text("concept")),
        (Record.collection == "learning_insights", _coalesce(_text("concept"), _text("core_idea"))),
        (Record.collection == "concept_reviews", _text("prompt")),
        (Record.collection == "mock_tests", _text("name")),
        (Record.collection == "learning_items", _coalesce(_text("topic"), _text("subject"))),
        (Record.collection == "source_captures", Record.data["sources"][0]["title"].as_string()),
        else_=_text("title"),
    )
    excerpt = case(
        (Record.collection == "study_memory", _text("content")),
        (Record.collection == "pyq_attempts", _text("question_snapshot", "html")),
        (
            Record.collection == "questions",
            _coalesce(_text("capture_note"), _text("question_text"), _text("trigger_sentence")),
        ),
        (Record.collection == "formulas", _text("expression")),
        (
            Record.collection == "concept_pages",
            _coalesce(_text("summary"), _text("core_idea"), _text("explanation")),
        ),
        (Record.collection == "learning_insights", _text("core_idea")),
        (Record.collection == "concept_reviews", _text("prompt")),
        (Record.collection == "source_captures", Record.data["sources"][0]["excerpt"].as_string()),
        else_=None,
    )
    occurred = _coalesce(
        _text("attempted_at"),
        _text("occurred_at"),
        _text("started_at"),
        _text("test_date"),
        _text("created_at"),
        cast(Record.created_at, String),
    )
    return {
        "title": title,
        "excerpt": excerpt,
        "subject": subject,
        "topic": topic,
        "session_id": session,
        "attempt_id": attempt,
        "question_uid": _coalesce(
            _text("question_uid"), case((Record.collection == "questions", receipt_uid), else_=None)
        ),
        "state": _coalesce(
            _text("state"),
            _text("status"),
            _text("recovery_state"),
            _text("analysis_state"),
            # Only submitted receipts carry a mark decision. Never
            # derive skips from an unfinished session's question set.
            case((Record.collection == "pyq_attempts", _text("mark_decision")), else_=None),
        ),
        "occurred_at": occurred,
    }


def _projection(fields: dict[str, Any]):
    return select(
        Record.collection,
        Record.external_id.label("record_id"),
        Record.updated_at,
        *(
            func.substr(expr, 1, 5000 if name == "excerpt" else 1000).label(name)
            for name, expr in fields.items()
        ),
    )


def _href(collection: str, record_id: str, row: dict[str, Any]) -> str:
    encoded = quote(record_id, safe="")
    session = row.get("session_id")
    if collection == "study_memory":
        return f"/memory/{encoded}"
    if collection == "pyq_attempts":
        return (
            f"/session/{quote(session, safe='')}/review?attempt={encoded}"
            if session
            else f"/journal?sourceAttempt={encoded}"
        )
    if collection == "pyq_sessions":
        return f"/session/{encoded}/review"
    if collection == "questions":
        if row.get("attempt_id"):
            return f"/journal?sourceAttempt={quote(row['attempt_id'], safe='')}"
        return f"/journal?session={quote(session, safe='')}" if session else "/journal"
    if collection in {"concept_pages", "learning_insights", "source_captures"}:
        return (
            f"/learning-library/{encoded}" if collection == "concept_pages" else "/learning-library"
        )
    if collection == "concept_reviews":
        return f"/concept-review/{encoded}"
    return {"formulas": "/formulas", "learning_items": "/reattempts", "mock_tests": "/mocks"}.get(
        collection, "/memory"
    )


def _event(raw: Any) -> dict[str, Any]:
    row = dict(raw)
    collection, record_id = row["collection"], row["record_id"]
    fallback = {
        "pyq_attempts": "Submitted question attempt",
        "pyq_sessions": "Practice or exam session",
        "questions": "Journal question",
        "formulas": "Formula",
        "concept_pages": "Concept",
        "learning_insights": "Learning insight",
        "concept_reviews": "Concept review",
        "learning_items": "Question recovery",
        "mock_tests": "Mock test",
        "source_captures": "Source capture",
    }.get(collection, "Learning memory")
    row["id"] = f"{collection}:{record_id}"
    row["title"] = plain_text(row.get("title"), 180) or fallback
    row["excerpt"] = plain_text(row.get("excerpt"))
    for key in ("subject", "topic", "state", "session_id", "attempt_id", "question_uid"):
        row[key] = plain_text(row.get(key), 300) or None
    row["href"] = _href(collection, record_id, row)
    for key in ("occurred_at", "updated_at"):
        value = row.get(key)
        if value is not None:
            try:
                parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value)
                row[key] = (
                    parsed.replace(tzinfo=UTC).isoformat()
                    if parsed.tzinfo is None
                    else parsed.isoformat()
                )
            except (TypeError, ValueError):
                row[key] = None
    return row


def _escaped_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


async def list_history(
    db: AsyncSession,
    *,
    owner_id: str,
    q: str | None = None,
    subject: str | None = None,
    topic: str | None = None,
    question_uid: str | None = None,
    session_id: str | None = None,
    collection: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if collection and collection not in COLLECTIONS:
        raise HTTPException(422, "Unsupported study history collection")
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(
            422, "History page must have a limit from 1 to 100 and a nonnegative offset"
        )
    fields = _fields(owner_id)
    conditions = [
        Record.owner_id == owner_id,
        Record.deleted_at.is_(None),
        Record.collection.in_([collection] if collection else COLLECTIONS),
    ]
    for name, value in (
        ("subject", subject),
        ("topic", topic),
        ("question_uid", question_uid),
        ("session_id", session_id),
    ):
        if value:
            if name in {"subject", "topic"}:
                conditions.append(
                    func.lower(func.replace(fields[name], "-", " "))
                    == value.strip().lower().replace("-", " ")
                )
            elif name == "question_uid":
                conditions.append(
                    or_(
                        fields[name] == value,
                        _array_has(Record.data["question_uids"], value),
                        _array_has(Record.data["data"]["question_uids"], value),
                    )
                )
            elif name == "session_id":
                conditions.append(
                    or_(
                        fields[name] == value,
                        _text("data", "active_session_id") == value,
                        _text("data", "source_session_id") == value,
                    )
                )
            else:
                conditions.append(fields[name] == value)
    if q and q.strip():
        needle = f"%{_escaped_like(q.strip())}%"
        conditions.append(
            or_(
                *(
                    fields[name].ilike(needle, escape="\\")
                    for name in ("title", "excerpt", "subject", "topic", "question_uid")
                )
            )
        )
    total = int(await db.scalar(select(func.count(Record.id)).where(*conditions)) or 0)
    rows = (
        (
            await db.execute(
                _projection(fields)
                .where(*conditions)
                .order_by(
                    fields["occurred_at"].desc(),
                    Record.collection,
                    Record.external_id,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return {
        "items": [_event(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


_FORBIDDEN_KEYS = re.compile(
    r"(?:image|screenshot|base64|credential|password|secret|token|api.?key|authorization|cookie|"
    r"correct.?answer|answer.?key|answer.?source|evaluation.?guidance|private.?key)",
    re.I,
)


def _sanitize_evidence(data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Limit depth, count, text and total size; redact media and credential fields."""
    truncated = False
    remaining = 32_000
    nodes = 600

    def visit(value: Any, depth: int = 0):
        nonlocal truncated, remaining, nodes
        nodes -= 1
        if remaining <= 0 or depth > 6 or nodes <= 0:
            truncated = True
            return "[omitted: size limit]"
        if isinstance(value, str):
            if value.lower().startswith("data:"):
                truncated = True
                return "[embedded media omitted]"
            if len(value) > 6000:
                truncated = True
            text = plain_text(value, min(remaining, 6000))
            remaining -= len(text)
            return text
        if isinstance(value, dict):
            result = {}
            for index, (key, item) in enumerate(value.items()):
                if index >= 80 or remaining <= 0 or nodes <= 0:
                    truncated = True
                    break
                if _FORBIDDEN_KEYS.search(str(key)):
                    truncated = True
                    continue
                if str(key).endswith("url") and isinstance(item, str):
                    parsed = urlsplit(item)
                    if (
                        parsed.scheme not in {"https", "http"}
                        or not parsed.hostname
                        or parsed.username
                        or parsed.query
                    ):
                        truncated = True
                        continue
                bounded_key = str(key)[:120]
                remaining -= len(bounded_key) + 4
                result[bounded_key] = visit(item, depth + 1)
            return result
        if isinstance(value, list):
            if len(value) > 40:
                truncated = True
            return [visit(item, depth + 1) for item in value[:40] if remaining > 0 and nodes > 0]
        if value is None or isinstance(value, (bool, int, float)):
            remaining -= len(str(value)) + 1
            return value
        truncated = True
        return None

    return visit(data), truncated


def _source_refs(collection: str, data: dict[str, Any]) -> tuple[set[tuple[str, str]], bool]:
    result: set[tuple[str, str]] = set()
    truncated = False
    scalar = {
        "attempt_id": "pyq_attempts",
        "source_pyq_attempt_id": "pyq_attempts",
        "latest_pyq_attempt_id": "pyq_attempts",
        "origin_pyq_attempt_id": "pyq_attempts",
        "session_id": "pyq_sessions",
        "pyq_session_id": "pyq_sessions",
        "source_pyq_session_id": "pyq_sessions",
        "concept_id": "concept_pages",
        "insight_id": "learning_insights",
        "source_review_id": "concept_reviews",
        "source_question_id": "questions",
        "repair_id": "study_memory",
    }
    arrays = {
        "source_ids": "source_captures",
        "insight_ids": "learning_insights",
        "source_entry_ids": "study_memory",
        "source_attempt_ids": "pyq_attempts",
        "attempt_ids": "pyq_attempts",
    }
    for scope in [data, data.get("data", {})]:
        if not isinstance(scope, dict):
            continue
        for key, target in scalar.items():
            value = scope.get(key)
            if isinstance(value, str) and value:
                result.add((target, value[:300]))
        for key, target in arrays.items():
            values = scope.get(key)
            if isinstance(values, list):
                truncated = truncated or len(values) > 100
                result.update(
                    (target, value[:300])
                    for value in values[:100]
                    if isinstance(value, str) and value
                )
    return result - {(collection, str(data.get("id", "")))}, truncated


def _array_has(expression: Any, value: str):
    return cast(expression, String).like(
        f"%{_escaped_like(json.dumps(value, ensure_ascii=False))}%", escape="\\"
    )


async def get_history_detail(
    db: AsyncSession,
    *,
    owner_id: str,
    collection: str,
    record_id: str,
) -> dict[str, Any]:
    if collection not in DETAIL_COLLECTIONS:
        raise HTTPException(404, "Study history record not found")
    row = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == collection,
            Record.external_id == record_id,
            Record.deleted_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(404, "Study history record not found")
    fields = _fields(owner_id)
    event_row = (await db.execute(_projection(fields).where(Record.id == row.id))).mappings().one()
    event = _event(event_row)
    evidence, evidence_truncated = _sanitize_evidence(row.data)
    refs, refs_truncated = _source_refs(collection, row.data)
    refs.discard((collection, record_id))
    sources = []
    if refs:
        source_rows = (
            (
                await db.execute(
                    _projection(fields)
                    .where(
                        Record.owner_id == owner_id,
                        Record.deleted_at.is_(None),
                        or_(
                            *(
                                and_(
                                    Record.collection == source_collection,
                                    Record.external_id == source_id,
                                )
                                for source_collection, source_id in sorted(refs)
                            )
                        ),
                    )
                    .order_by(Record.updated_at.desc(), Record.id)
                    .limit(RELATED_LIMIT + 1)
                )
            )
            .mappings()
            .all()
        )
        sources = [_event(item) for item in source_rows]
    relations = []
    if collection == "pyq_attempts":
        relations.extend(
            [
                _text("attempt_id") == record_id,
                _array_has(Record.data["data"]["source_attempt_ids"], record_id),
                _array_has(Record.data["data"]["attempt_ids"], record_id),
            ]
        )
    if collection == "pyq_sessions":
        relations.append(_text("session_id") == record_id)
    if collection == "concept_pages":
        relations.append(_text("concept_id") == record_id)
    if collection == "study_memory":
        relations.extend(
            [
                _text("repair_id") == record_id,
                _array_has(Record.data["data"]["source_entry_ids"], record_id),
            ]
        )
    if event.get("question_uid"):
        relations.append(_text("question_uid") == event["question_uid"])
    if event.get("attempt_id"):
        relations.append(_text("attempt_id") == event["attempt_id"])
    linked = []
    if relations:
        linked_rows = (
            (
                await db.execute(
                    _projection(fields)
                    .where(
                        Record.owner_id == owner_id,
                        Record.collection == "study_memory",
                        Record.deleted_at.is_(None),
                        Record.id != row.id,
                        or_(*relations),
                    )
                    .order_by(Record.updated_at.desc(), Record.id)
                    .limit(RELATED_LIMIT + 1)
                )
            )
            .mappings()
            .all()
        )
        linked = [_event(item) for item in linked_rows]
    return {
        "event": event,
        "evidence": evidence,
        "evidence_truncated": evidence_truncated,
        "linked_memory": linked[:RELATED_LIMIT],
        "sources": sources[:RELATED_LIMIT],
        "related_truncated": len(linked) > RELATED_LIMIT
        or len(sources) > RELATED_LIMIT
        or refs_truncated,
    }
