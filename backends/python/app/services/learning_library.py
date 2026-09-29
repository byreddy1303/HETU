"""Account-scoped learning knowledge shared by the app and MCP tools.

The existing record transaction and append-only revisions are the persistence
boundary. Source captures are immutable; current explanations can evolve.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, RecordRevision
from app.services.records import lock_identity, patch_record, to_api, upsert_records


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SourceDraft(StrictModel):
    kind: Literal["conversation", "document", "web", "manual", "question", "other"]
    title: str = Field(min_length=1, max_length=300)
    url: str | None = Field(default=None, max_length=2000)
    conversation_id: str | None = Field(default=None, max_length=300)
    excerpt: str | None = Field(default=None, max_length=30000)
    observed_at: datetime | None = None

    @field_validator("url")
    @classmethod
    def safe_source_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
            raise ValueError("Source URL must be an HTTP(S) address without credentials")
        return value


class InsightDraft(StrictModel):
    subject: str = Field(min_length=1, max_length=160)
    topic: str = Field(min_length=1, max_length=160)
    concept: str = Field(min_length=1, max_length=160)
    aliases: list[str] = Field(default_factory=list, max_length=16)
    core_idea: str = Field(min_length=1, max_length=3000)
    full_explanation: str = Field(min_length=1, max_length=50000)
    reasoning_origin: Literal[
        "learner_stated", "assistant_hypothesis", "general_pitfall", "none"
    ] = "none"
    prior_reasoning: str | None = Field(default=None, max_length=6000)
    reasoning_correction: str | None = Field(default=None, max_length=6000)
    better_method: str | None = Field(default=None, max_length=10000)
    intuition: str | None = Field(default=None, max_length=10000)
    derivation: str | None = Field(default=None, max_length=30000)
    conditions: list[str] = Field(default_factory=list, max_length=24)
    exceptions: list[str] = Field(default_factory=list, max_length=24)
    examples: list[str] = Field(default_factory=list, max_length=16)
    recognition_cues: list[str] = Field(default_factory=list, max_length=24)
    unresolved_questions: list[str] = Field(default_factory=list, max_length=16)
    related_concepts: list[str] = Field(default_factory=list, max_length=24)
    retrieval_question: str | None = Field(default=None, max_length=5000)
    evaluation_guidance: str | None = Field(default=None, max_length=5000)
    insight_id: str | None = Field(default=None, max_length=128)
    expected_version: int | None = Field(default=None, ge=1)
    revision_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_reasoning(self) -> InsightDraft:
        if self.reasoning_origin == "learner_stated" and not self.prior_reasoning:
            raise ValueError("Learner-stated reasoning needs the actual prior reasoning")
        if self.insight_id and self.expected_version is None:
            raise ValueError("Revising a specified insight requires expected_version")
        return self

    @field_validator(
        "aliases",
        "conditions",
        "exceptions",
        "examples",
        "recognition_cues",
        "unresolved_questions",
        "related_concepts",
    )
    @classmethod
    def nonempty_items(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value]
        if any(not item or len(item) > 3000 for item in cleaned):
            raise ValueError("List entries must have 1 to 3000 characters")
        return cleaned


class CaptureRequest(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    sources: list[SourceDraft] = Field(min_length=1, max_length=12)
    insights: list[InsightDraft] = Field(min_length=1, max_length=12)
    page_explanations: dict[str, str] = Field(default_factory=dict, max_length=12)


class InsightRevision(StrictModel):
    expected_version: int = Field(ge=1)
    revision_reason: str = Field(min_length=1, max_length=1000)
    core_idea: str | None = Field(default=None, min_length=1, max_length=3000)
    full_explanation: str | None = Field(default=None, min_length=1, max_length=50000)
    reasoning_origin: (
        Literal["learner_stated", "assistant_hypothesis", "general_pitfall", "none"] | None
    ) = None
    prior_reasoning: str | None = Field(default=None, max_length=6000)
    reasoning_correction: str | None = Field(default=None, max_length=6000)
    better_method: str | None = Field(default=None, max_length=10000)
    intuition: str | None = Field(default=None, max_length=10000)
    derivation: str | None = Field(default=None, max_length=30000)
    conditions: list[str] | None = Field(default=None, max_length=24)
    exceptions: list[str] | None = Field(default=None, max_length=24)
    examples: list[str] | None = Field(default=None, max_length=16)
    recognition_cues: list[str] | None = Field(default=None, max_length=24)
    unresolved_questions: list[str] | None = Field(default=None, max_length=16)
    retrieval_question: str | None = Field(default=None, max_length=5000)
    evaluation_guidance: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def require_change(self) -> InsightRevision:
        if not (self.model_fields_set - {"expected_version", "revision_reason"}):
            raise ValueError("Specify at least one insight field to revise")
        return self


def key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return re.sub(r"\s+", " ", normalized)


def stable_id(kind: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"hetu:{kind}:{value}"))


def fingerprint(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, default=str, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


async def _owned(
    db: AsyncSession, collection: str, owner_id: str, external_id: str
) -> Record | None:
    return await db.scalar(
        select(Record).where(
            Record.collection == collection,
            Record.owner_id == owner_id,
            Record.external_id == external_id,
            Record.deleted_at.is_(None),
        )
    )


async def _matching_page(
    db: AsyncSession, owner_id: str, subject: str, topic: str, concept: str
) -> Record | None:
    subject_key, topic_key, concept_key = key(subject), key(topic), key(concept)
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.collection == "concept_pages",
                Record.owner_id == owner_id,
                Record.deleted_at.is_(None),
            )
            .limit(2001)
        )
    ).all()
    if len(rows) > 2000:
        raise HTTPException(409, "Concept inventory exceeds the safe matching window")
    matches = [
        row
        for row in rows
        if row.data.get("subject_key") == subject_key
        and row.data.get("topic_key") == topic_key
        and concept_key
        in {row.data.get("concept_key"), *(key(a) for a in row.data.get("aliases", []))}
    ]
    if len(matches) > 1:
        raise HTTPException(409, "Several concept pages match; resolve the duplicate first")
    return matches[0] if matches else None


async def capture_learning(
    db: AsyncSession, *, owner_id: str, request: CaptureRequest, app_url: str
) -> dict[str, Any]:
    """Atomically save sources, insights, concept pages, and a retry receipt.

    The caller owns commit/rollback. PostgreSQL identity locks serialize retries
    and concept edits. Existing record versions preserve all earlier explanations.
    """
    payload = request.model_dump(mode="json", exclude={"idempotency_key"})
    request_hash = fingerprint(payload)
    receipt_id = stable_id("receipt", request.idempotency_key)
    await lock_identity(db, "plugin_receipts", owner_id, receipt_id)
    receipt = await _owned(db, "plugin_receipts", owner_id, receipt_id)
    if receipt:
        if receipt.data.get("request_hash") != request_hash:
            raise HTTPException(409, "Idempotency key was already used for different content")
        return {**receipt.data["result"], "idempotent_replay": True}

    source_content = [source.model_dump(mode="json") for source in request.sources]
    source_id = stable_id("source", fingerprint(source_content))
    source_row = await _owned(db, "source_captures", owner_id, source_id)
    if source_row is None:
        await upsert_records(
            db,
            collection="source_captures",
            owner_id=owner_id,
            items=[
                {
                    "id": source_id,
                    "sources": source_content,
                    "captured_at": datetime.now(UTC).isoformat(),
                    "content_hash": fingerprint(source_content),
                }
            ],
        )

    concept_ids: list[str] = []
    insight_ids: list[str] = []
    pages: dict[str, dict[str, Any]] = {}
    for draft in request.insights:
        existing_page = await _matching_page(
            db, owner_id, draft.subject, draft.topic, draft.concept
        )
        concept_id = (
            existing_page.external_id
            if existing_page
            else stable_id(
                "concept", ":".join((key(draft.subject), key(draft.topic), key(draft.concept)))
            )
        )
        await lock_identity(db, "concept_pages", owner_id, concept_id)
        existing_page = await _owned(db, "concept_pages", owner_id, concept_id)
        if existing_page is not None:
            await db.refresh(existing_page)
        if concept_id not in pages:
            pages[concept_id] = {
                **(existing_page.data if existing_page else {}),
                "id": concept_id,
                "subject": existing_page.data["subject"] if existing_page else draft.subject,
                "topic": existing_page.data["topic"] if existing_page else draft.topic,
                "concept": existing_page.data["concept"] if existing_page else draft.concept,
                "subject_key": key(draft.subject),
                "topic_key": key(draft.topic),
                "concept_key": key(draft.concept),
                "aliases": list(existing_page.data.get("aliases", [])) if existing_page else [],
                "insight_ids": (
                    list(existing_page.data.get("insight_ids", [])) if existing_page else []
                ),
                "source_ids": (
                    list(existing_page.data.get("source_ids", [])) if existing_page else []
                ),
                "expected_version": existing_page.version if existing_page else None,
            }
        page = pages[concept_id]
        page["aliases"] = list(dict.fromkeys([*page["aliases"], *draft.aliases]))
        page["source_ids"] = list(dict.fromkeys([*page["source_ids"], source_id]))
        insight_id = draft.insight_id or stable_id(
            "insight", f"{concept_id}:{key(draft.core_idea)}"
        )
        await lock_identity(db, "learning_insights", owner_id, insight_id)
        existing_insight = await _owned(db, "learning_insights", owner_id, insight_id)
        previous_insight_data = dict(existing_insight.data) if existing_insight else None
        if existing_insight and existing_insight.data.get("concept_id") != concept_id:
            raise HTTPException(409, "Insight belongs to another concept")
        if draft.insight_id and (
            existing_insight is None or existing_insight.version != draft.expected_version
        ):
            raise HTTPException(409, "Specified insight revision is stale or missing")
        content = draft.model_dump(mode="json", exclude={"insight_id", "expected_version"})
        if existing_insight:
            # Omitted optional details in a later discussion do not erase earlier learning.
            for field, value in content.items():
                previous = existing_insight.data.get(field)
                if value is None and previous is not None:
                    content[field] = previous
                elif isinstance(value, list) and isinstance(previous, list):
                    content[field] = list(dict.fromkeys([*previous, *value]))
        previous_sources = existing_insight.data.get("source_ids", []) if existing_insight else []
        content.update(
            {
                "id": insight_id,
                "concept_id": concept_id,
                "source_ids": list(dict.fromkeys([*previous_sources, source_id])),
                "revision_reason": draft.revision_reason
                or (
                    "Expanded from a later discussion"
                    if existing_insight
                    else "Captured from source"
                ),
                "expected_version": existing_insight.version if existing_insight else None,
            }
        )
        # A repeated discussion with the same content and same source makes no revision.
        comparable = {
            k: v
            for k, v in content.items()
            if k not in {"id", "expected_version", "revision_reason"}
        }
        previous_comparable = (
            {k: v for k, v in existing_insight.data.items() if k != "revision_reason"}
            if existing_insight
            else None
        )
        if existing_insight and comparable == previous_comparable:
            pass
        else:
            await upsert_records(
                db, collection="learning_insights", owner_id=owner_id, items=[content]
            )
        if insight_id not in page["insight_ids"]:
            page["insight_ids"].append(insight_id)
        # Keep a page's concise reading view current when it still mirrors this
        # insight. A separately edited page explanation remains authoritative.
        if previous_insight_data:
            if page.get("summary") == previous_insight_data.get("core_idea"):
                page["summary"] = content["core_idea"]
            if page.get("full_explanation") == previous_insight_data.get("full_explanation"):
                page["full_explanation"] = content["full_explanation"]
        page.setdefault("summary", draft.core_idea)
        page.setdefault("full_explanation", draft.full_explanation)
        concept_ids.append(concept_id)
        insight_ids.append(insight_id)

    for concept_id, page in pages.items():
        explicit = request.page_explanations.get(concept_id)
        if explicit:
            page["full_explanation"] = explicit
        page["revision_reason"] = "Learning capture"
        await upsert_records(db, collection="concept_pages", owner_id=owner_id, items=[page])

    result = {
        "source_id": source_id,
        "concept_ids": list(dict.fromkeys(concept_ids)),
        "insight_ids": list(dict.fromkeys(insight_ids)),
        "links": [
            f"{app_url.rstrip('/')}/learning-library/{id_}" for id_ in dict.fromkeys(concept_ids)
        ],
        "idempotent_replay": False,
        "saved_at": datetime.now(UTC).isoformat(),
    }
    await upsert_records(
        db,
        collection="plugin_receipts",
        owner_id=owner_id,
        items=[{"id": receipt_id, "request_hash": request_hash, "result": result}],
    )
    return result


async def search_learning(
    db: AsyncSession,
    *,
    owner_id: str,
    text: str = "",
    subject: str | None = None,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    # Filtering in Python preserves portable behavior across SQLite and Postgres;
    # a bounded scan reports incompleteness instead of silently dropping records.
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.collection == "concept_pages",
                Record.owner_id == owner_id,
                Record.deleted_at.is_(None),
            )
            .order_by(Record.updated_at.desc(), Record.id.desc())
            .limit(5001)
        )
    ).all()
    partial = len(rows) > 5000
    query = key(text)
    matches = [
        row
        for row in rows[:5000]
        if (not subject or row.data.get("subject_key") == key(subject))
        and (
            not query
            or query
            in key(
                " ".join(
                    str(row.data.get(field, ""))
                    for field in ("subject", "topic", "concept", "summary", "full_explanation")
                )
            )
            or any(query in key(alias) for alias in row.data.get("aliases", []))
        )
    ]
    page = matches[offset : offset + limit]
    return {
        "items": [
            {
                "id": row.external_id,
                "subject": row.data["subject"],
                "topic": row.data["topic"],
                "concept": row.data["concept"],
                "summary": row.data.get("summary"),
                "updated_at": row.updated_at.isoformat(),
                "version": row.version,
            }
            for row in page
        ],
        "next_offset": offset + limit if offset + limit < len(matches) else None,
        "total_matches": len(matches),
        "complete": not partial,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }


async def learning_detail(
    db: AsyncSession, *, owner_id: str, concept_id: str, include_history: bool = False
) -> dict[str, Any]:
    page = await _owned(db, "concept_pages", owner_id, concept_id)
    if page is None:
        raise HTTPException(404, "Concept not found")
    insight_ids = page.data.get("insight_ids", [])
    source_ids = page.data.get("source_ids", [])
    related = (
        await db.scalars(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.deleted_at.is_(None),
                Record.collection.in_(("learning_insights", "source_captures")),
                Record.external_id.in_([*insight_ids, *source_ids]),
            )
        )
    ).all()
    by_id = {row.external_id: row for row in related}
    result = {
        "page": to_api(page),
        "insights": [to_api(by_id[id_]) for id_ in insight_ids if id_ in by_id],
        "sources": [to_api(by_id[id_]) for id_ in source_ids if id_ in by_id],
        "complete": len(related) == len(set([*insight_ids, *source_ids])),
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
    if include_history:
        revisions = (
            await db.scalars(
                select(RecordRevision)
                .where(
                    RecordRevision.owner_id == owner_id,
                    RecordRevision.record_id == page.id,
                )
                .order_by(RecordRevision.version.desc())
                .limit(100)
            )
        ).all()
        result["page_history"] = [row.snapshot for row in revisions]
        insight_history: dict[str, list[dict[str, Any]]] = {}
        for insight_id in insight_ids[:50]:
            insight = by_id.get(insight_id)
            if insight is None:
                continue
            history = (
                await db.scalars(
                    select(RecordRevision)
                    .where(
                        RecordRevision.owner_id == owner_id,
                        RecordRevision.record_id == insight.id,
                    )
                    .order_by(RecordRevision.version.desc())
                    .limit(100)
                )
            ).all()
            insight_history[insight_id] = [row.snapshot for row in history]
        result["insight_history"] = insight_history
        result["history_complete"] = len(insight_ids) <= 50
    return result


async def revise_insight(
    db: AsyncSession,
    *,
    owner_id: str,
    insight_id: str,
    revision: InsightRevision,
) -> dict[str, Any]:
    existing = await _owned(db, "learning_insights", owner_id, insight_id)
    if existing is None:
        raise HTTPException(404, "Insight not found")
    concept_id = existing.data.get("concept_id")
    if not isinstance(concept_id, str):
        raise HTTPException(409, "Insight has no concept page")
    await lock_identity(db, "concept_pages", owner_id, concept_id)
    await lock_identity(db, "learning_insights", owner_id, insight_id)
    await db.refresh(existing)
    page = await _owned(db, "concept_pages", owner_id, concept_id)
    if page is None:
        raise HTTPException(409, "Insight concept page is missing")
    previous_core = existing.data.get("core_idea")
    previous_explanation = existing.data.get("full_explanation")
    patch = revision.model_dump(exclude_unset=True, exclude={"expected_version"})
    updated = await patch_record(
        db,
        collection="learning_insights",
        owner_id=owner_id,
        external_id=insight_id,
        patch=patch,
        expected_version=revision.expected_version,
    )
    page_changes: dict[str, Any] = {}
    if page.data.get("summary") == previous_core and updated.data.get("core_idea") != previous_core:
        page_changes["summary"] = updated.data["core_idea"]
    if (
        page.data.get("full_explanation") == previous_explanation
        and updated.data.get("full_explanation") != previous_explanation
    ):
        page_changes["full_explanation"] = updated.data["full_explanation"]
    if page_changes:
        await patch_record(
            db,
            collection="concept_pages",
            owner_id=owner_id,
            external_id=concept_id,
            patch={**page_changes, "revision_reason": "Linked insight revised"},
            expected_version=page.version,
        )
    return to_api(updated)
