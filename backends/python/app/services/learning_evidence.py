"""Versioned connections from saved understanding to existing study evidence."""

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import Field
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services.learning_library import StrictModel, _owned, fingerprint, key, stable_id
from app.services.records import lock_identity, patch_record, to_api, upsert_records

EvidenceCollection = Literal[
    "questions",
    "patterns",
    "formulas",
    "trigger_phrases",
    "pyq_attempts",
    "mock_tests",
    "reattempts",
    "learning_items",
    "concept_reviews",
]
EVIDENCE_SECTIONS = {
    "questions": ("Journal", "/journal"),
    "patterns": ("Patterns", "/patterns"),
    "formulas": ("Formulas", "/formulas"),
    "trigger_phrases": ("Trigger drill", "/trigger-drill"),
    "pyq_attempts": ("PYQ attempts", "/pyq"),
    "mock_tests": ("Mocks", "/mocks"),
    "reattempts": ("Re-attempts", "/reattempts"),
    "learning_items": ("Recovery", "/reattempts"),
    "concept_reviews": ("Concept review", "/concept-review"),
}


class EvidenceLinkDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    source_concept_id: str = Field(min_length=1, max_length=128)
    target_collection: EvidenceCollection
    target_record_id: str = Field(min_length=1, max_length=128)
    rationale: str = Field(min_length=1, max_length=2000)
    active: bool = True
    expected_version: int | None = Field(default=None, ge=1)


def evidence_summary(row: Record) -> dict[str, Any]:
    label, path = EVIDENCE_SECTIONS[row.collection]
    title = next(
        (
            row.data[field]
            for field in (
                "title",
                "name",
                "question_text",
                "phrase",
                "prompt",
                "concept",
                "question_id",
            )
            if isinstance(row.data.get(field), str) and row.data[field].strip()
        ),
        row.external_id,
    )
    return {
        "id": row.external_id,
        "collection": row.collection,
        "title": title[:300],
        "section": label,
        "section_path": path,
        "subject": row.data.get("subject"),
        "topic": row.data.get("topic") or row.data.get("subtopic"),
        "version": row.version,
        "updated_at": row.updated_at.isoformat(),
    }


async def search_evidence(
    db: AsyncSession,
    *,
    owner_id: str,
    collection: EvidenceCollection,
    query: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    if (
        collection not in EVIDENCE_SECTIONS
        or not 1 <= limit <= 100
        or offset < 0
        or len(query) > 300
    ):
        raise HTTPException(422, "Invalid evidence search filters")
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == collection,
                Record.deleted_at.is_(None),
            )
            .order_by(Record.updated_at.desc(), Record.external_id)
            .limit(2001)
        )
    ).all()
    terms = key(query).split()
    matches = []
    for row in rows[:2000]:
        summary = evidence_summary(row)
        searchable = " ".join(str(value or "") for value in summary.values())
        searchable += " " + " ".join(
            str(row.data.get(field) or "")
            for field in ("question_text", "expression", "capture_note", "root_cause", "prompt")
        )
        if all(term in key(searchable) for term in terms):
            matches.append(summary)
    return {
        "items": matches[offset : offset + limit],
        "total_matches": len(matches),
        "next_offset": offset + limit if offset + limit < len(matches) else None,
        "complete": len(rows) <= 2000,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }


async def evidence_detail(
    db: AsyncSession,
    *,
    owner_id: str,
    collection: EvidenceCollection,
    record_id: str,
) -> dict[str, Any]:
    if collection not in EVIDENCE_SECTIONS:
        raise HTTPException(422, "Unsupported evidence collection")
    row = await _owned(db, collection, owner_id, record_id)
    if row is None:
        raise HTTPException(404, "Study evidence is unavailable")
    return {
        "summary": evidence_summary(row),
        "item": to_api(row),
        "retrieved_at": datetime.now(UTC).isoformat(),
    }


async def link_evidence(
    db: AsyncSession,
    *,
    owner_id: str,
    draft: EvidenceLinkDraft,
) -> dict[str, Any]:
    # A durable receipt makes a delayed retry safe even after a later edit.
    receipt_id = stable_id("evidence-link-receipt", draft.idempotency_key)
    request_hash = fingerprint(draft.model_dump(exclude={"idempotency_key"}))
    await lock_identity(db, "plugin_receipts", owner_id, receipt_id)
    receipt = await _owned(db, "plugin_receipts", owner_id, receipt_id)
    if receipt:
        if receipt.data["request_hash"] != request_hash:
            raise HTTPException(409, "Idempotency key was already used for different content")
        return {**receipt.data["result"], "idempotent_replay": True}

    relation_id = stable_id(
        "concept-evidence",
        fingerprint(
            [
                draft.source_concept_id,
                draft.target_collection,
                draft.target_record_id,
            ]
        ),
    )
    await lock_identity(db, "concept_relations", owner_id, relation_id)
    existing = await _owned(db, "concept_relations", owner_id, relation_id)
    source = await _owned(db, "concept_pages", owner_id, draft.source_concept_id)
    target = await _owned(db, draft.target_collection, owner_id, draft.target_record_id)
    if source is None or (target is None and (draft.active or existing is None)):
        raise HTTPException(404, "Concept and evidence must belong to the connected account")
    content = draft.model_dump(exclude={"idempotency_key", "expected_version"})
    content["relation"] = "study_evidence"
    if existing:
        if draft.expected_version is None:
            raise HTTPException(428, "Updating a link requires expected_version")
        saved = await patch_record(
            db,
            collection="concept_relations",
            owner_id=owner_id,
            external_id=relation_id,
            patch={**content, "revision_reason": "Study evidence connection updated"},
            expected_version=draft.expected_version,
        )
    else:
        if draft.expected_version is not None or not draft.active:
            raise HTTPException(409, "Study evidence link does not exist")
        saved = (
            await upsert_records(
                db,
                collection="concept_relations",
                owner_id=owner_id,
                items=[
                    {
                        "id": relation_id,
                        **content,
                        "revision_reason": "Study evidence connection created",
                    }
                ],
            )
        )[0]
    # JSON-safe snapshot; receipts survive subsequent revisions to the link.
    result = {
        **content,
        "id": saved.external_id,
        "version": saved.version,
        "updated_at": saved.updated_at.isoformat(),
        "idempotent_replay": False,
    }
    await upsert_records(
        db,
        collection="plugin_receipts",
        owner_id=owner_id,
        items=[
            {
                "id": receipt_id,
                "request_hash": request_hash,
                "result": result,
            }
        ],
    )
    return result


async def concept_evidence(
    db: AsyncSession,
    *,
    owner_id: str,
    concept_id: str,
) -> dict[str, Any]:
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "concept_relations",
                Record.deleted_at.is_(None),
                Record.data["source_concept_id"].as_string() == concept_id,
                Record.data["relation"].as_string() == "study_evidence",
            )
            .order_by(Record.updated_at.desc())
            .limit(101)
        )
    ).all()
    identities = {
        (row.data["target_collection"], row.data["target_record_id"]) for row in rows[:100]
    }
    targets = (
        (
            await db.scalars(
                select(Record).where(
                    Record.owner_id == owner_id,
                    Record.deleted_at.is_(None),
                    tuple_(Record.collection, Record.external_id).in_(identities),
                )
            )
        ).all()
        if identities
        else []
    )
    by_identity = {(row.collection, row.external_id): row for row in targets}
    items = []
    for row in rows[:100]:
        target = by_identity.get((row.data["target_collection"], row.data["target_record_id"]))
        items.append({**to_api(row), "evidence": evidence_summary(target) if target else None})
    return {"items": items, "complete": len(rows) <= 100}
