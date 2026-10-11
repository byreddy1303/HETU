"""Recall and transfer evidence linked to saved concepts."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services import recovery
from app.services.learning_library import fingerprint, stable_id
from app.services.records import lock_identity, require_version, to_api, upsert_records


class ReviewDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(min_length=8, max_length=128)
    concept_id: str = Field(min_length=1, max_length=128)
    insight_id: str | None = Field(default=None, max_length=128)
    kind: Literal["recall", "transfer"]
    prompt: str = Field(min_length=1, max_length=10000)
    evaluation_guidance: str | None = Field(default=None, max_length=10000)
    question_origin: Literal["saved_note", "new_variant", "external_exam"]
    source_ref: str | None = Field(default=None, max_length=500)
    due_on: date | None = None


class ReviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: int = Field(ge=1)
    attempt_id: str = Field(min_length=8, max_length=128)
    answer: str = Field(min_length=1, max_length=30000)
    assistance: Literal["none", "hint", "solution"]
    evaluation: Literal["correct", "partial", "incorrect", "ungraded"]
    evaluated_by: Literal["self", "assistant", "human", "canonical"]
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)
    duration_source: Literal["measured", "reported", "unknown"] = "unknown"
    feedback: str | None = Field(default=None, max_length=10000)
    recovery_session_id: str | None = Field(default=None, max_length=128)
    expected_session_version: int | None = Field(default=None, ge=1, strict=True)
    expected_session_index: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def validate_duration(self) -> ReviewResponse:
        if self.duration_source == "measured" and self.duration_seconds is None:
            raise ValueError("Measured duration requires duration_seconds")
        if self.evaluated_by == "canonical":
            raise ValueError(
                "Concept assessments require self, assistant, or human provenance; "
                "no canonical key is attached"
            )
        return self


class ReviewHelp(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=1, strict=True)
    assistance: Literal["hint", "solution"]


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


async def create_review(
    db: AsyncSession, *, owner_id: str, draft: ReviewDraft, app_url: str
) -> dict[str, Any]:
    await recovery.owner_lock(db, owner_id)
    concept = await _owned(db, "concept_pages", owner_id, draft.concept_id)
    if concept is None:
        raise HTTPException(404, "Concept not found")
    if draft.insight_id:
        insight = await _owned(db, "learning_insights", owner_id, draft.insight_id)
        if insight is None or insight.data.get("concept_id") != draft.concept_id:
            raise HTTPException(422, "Insight does not belong to this concept")
    review_id = stable_id("concept-review", draft.idempotency_key)
    await lock_identity(db, "concept_reviews", owner_id, review_id)
    existing = await _owned(db, "concept_reviews", owner_id, review_id)
    source_hash = fingerprint(draft.model_dump(mode="json", exclude={"idempotency_key"}))
    if existing:
        if existing.data.get("source_hash") != source_hash:
            raise HTTPException(409, "Review key was reused for different content")
        return {**to_api(existing), "idempotent_replay": True}
    row = (
        await upsert_records(
            db,
            collection="concept_reviews",
            owner_id=owner_id,
            items=[
                {
                    "id": review_id,
                    "concept_id": draft.concept_id,
                    "insight_id": draft.insight_id,
                    "kind": draft.kind,
                    "prompt": draft.prompt,
                    "evaluation_guidance": draft.evaluation_guidance,
                    "question_origin": draft.question_origin,
                    "source_ref": draft.source_ref,
                    "due_on": (
                        draft.due_on or (await recovery.account_clock(db, owner_id))[1]
                    ).isoformat(),
                    "attempts": [],
                    "unaided_correct_count": 0,
                    "source_hash": source_hash,
                    "url": f"{app_url.rstrip('/')}/concept-review/{review_id}",
                }
            ],
        )
    )[0]
    await recovery.ensure_concept_item(db, owner_id=owner_id, review=row)
    return {**to_api(row), "idempotent_replay": False}


async def reveal_review_help(
    db: AsyncSession, *, owner_id: str, review_id: str, draft: ReviewHelp
) -> dict:
    operation = f"concept-help:{review_id}"
    request_hash, replay = await recovery.begin(
        db, owner_id, operation, draft.idempotency_key, draft.model_dump()
    )
    if replay:
        return replay
    row = await recovery.owned(db, owner_id, "concept_reviews", review_id)
    require_version(row, draft.expected_version)
    assistance = (
        "solution"
        if "solution" in {row.data.get("pending_assistance"), draft.assistance}
        else "hint"
    )
    saved = await recovery.write(
        db, owner_id, "concept_reviews", {**row.data, "pending_assistance": assistance}, row
    )
    item = await recovery.ensure_concept_item(db, owner_id=owner_id, review=saved)
    occurred, today, timezone = await recovery.account_clock(db, owner_id)
    event = await recovery.append_event(
        db,
        owner_id,
        recovery.event_data(
            item.external_id,
            f"concept-help:{review_id}:{draft.idempotency_key}",
            "hint_revealed",
            occurred,
            today,
            timezone,
            hint_used=True,
            metadata={"review_id": review_id, "assistance": assistance},
        ),
    )
    return await recovery.finish(
        db,
        owner_id,
        operation,
        draft.idempotency_key,
        request_hash,
        {"review": to_api(saved), "item": to_api(item), "events": [to_api(event)]},
    )


async def record_review_response(
    db: AsyncSession, *, owner_id: str, review_id: str, response: ReviewResponse
) -> dict[str, Any]:
    await recovery.owner_lock(db, owner_id)
    await lock_identity(db, "concept_reviews", owner_id, review_id)
    row = await _owned(db, "concept_reviews", owner_id, review_id)
    if row is None:
        raise HTTPException(404, "Concept review not found")
    attempts = list(row.data.get("attempts", []))
    response_data = response.model_dump(exclude={"expected_version", "attempt_id"})
    for field in ("recovery_session_id", "expected_session_version", "expected_session_index"):
        if response_data[field] is None:
            response_data.pop(field)
    response_hash = fingerprint(response_data)
    previous = next((a for a in attempts if a["attempt_id"] == response.attempt_id), None)
    if previous:
        if previous["response_hash"] != response_hash:
            raise HTTPException(409, "Attempt ID was reused for another response")
        return {**to_api(row), "idempotent_replay": True}
    if row.version != response.expected_version:
        raise HTTPException(409, {"message": "Version conflict", "current_version": row.version})
    if len(attempts) >= 100:
        raise HTTPException(409, "Review reached the attempt-history limit")
    new_attempt = {
        **response.model_dump(exclude={"expected_version"}),
        "response_hash": response_hash,
        "recorded_at": (await recovery.account_clock(db, owner_id))[0],
        "independent_transfer": (
            row.data["kind"] == "transfer"
            and row.data["question_origin"] in {"new_variant", "external_exam"}
            and response.assistance == "none"
            and not attempts
            and not row.data.get("pending_assistance")
        ),
    }
    pending_help = row.data.get("pending_assistance")
    if pending_help:
        new_attempt["assistance"] = (
            "solution" if "solution" in {pending_help, response.assistance} else "hint"
        )
    if response.recovery_session_id:
        item = await recovery.ensure_concept_item(db, owner_id=owner_id, review=row)
        session = await recovery.owned(
            db, owner_id, "recovery_sessions", response.recovery_session_id
        )
        if (
            item.external_id in session.data.get("hinted_item_ids", [])
            and new_attempt["assistance"] == "none"
        ):
            new_attempt["assistance"] = "hint"
            new_attempt["independent_transfer"] = False
    evidence = await recovery.concept_response_evidence(
        db,
        owner_id=owner_id,
        review=row,
        response=new_attempt,
        assisted=new_attempt["assistance"] != "none",
        session_id=response.recovery_session_id,
        session_version=response.expected_session_version,
        session_index=response.expected_session_index,
    )
    data = dict(row.data)
    data["attempts"] = [*attempts, new_attempt]
    data["due_on"] = evidence["due_on"]
    data["pending_assistance"] = None
    data["recovery_item_id"] = evidence["item"]["id"]
    data["recovery_evidence"] = evidence
    data["unaided_correct_count"] = row.data.get("unaided_correct_count", 0) + int(
        response.evaluation == "correct" and new_attempt["assistance"] == "none"
    )
    # Evidence is labelled by evaluator and assistance; it is never an automatic mastery claim.
    data["last_evidence"] = {
        "evaluation": response.evaluation,
        "evaluated_by": response.evaluated_by,
        "assistance": new_attempt["assistance"],
        "independent_transfer": new_attempt["independent_transfer"],
    }
    saved = (
        await upsert_records(
            db,
            collection="concept_reviews",
            owner_id=owner_id,
            items=[{"id": review_id, "expected_version": row.version, **data}],
        )
    )[0]
    return {**to_api(saved), "idempotent_replay": False}


async def list_reviews(
    db: AsyncSession,
    *,
    owner_id: str,
    concept_id: str | None = None,
    due_only: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.collection == "concept_reviews",
                Record.owner_id == owner_id,
                Record.deleted_at.is_(None),
            )
            .order_by(Record.updated_at.desc())
            .limit(1001)
        )
    ).all()
    if len(rows) > 1000:
        raise HTTPException(409, "Too many reviews for an unfiltered query")
    today = (await recovery.account_clock(db, owner_id))[1].isoformat()
    return [
        to_api(row)
        for row in rows
        if (not concept_id or row.data.get("concept_id") == concept_id)
        and (not due_only or row.data.get("due_on", "9999") <= today)
    ][:limit]


async def get_review(db: AsyncSession, *, owner_id: str, review_id: str) -> dict[str, Any]:
    row = await _owned(db, "concept_reviews", owner_id, review_id)
    if row is None:
        raise HTTPException(404, "Concept review not found")
    return to_api(row)
