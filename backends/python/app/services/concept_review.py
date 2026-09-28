"""Recall and transfer evidence linked to saved concepts."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services.learning_library import fingerprint, stable_id
from app.services.records import lock_identity, to_api, upsert_records


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

    @model_validator(mode="after")
    def validate_duration(self) -> ReviewResponse:
        if self.duration_source == "measured" and self.duration_seconds is None:
            raise ValueError("Measured duration requires duration_seconds")
        return self


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
                    "due_on": (draft.due_on or date.today()).isoformat(),
                    "attempts": [],
                    "unaided_correct_count": 0,
                    "source_hash": source_hash,
                    "url": f"{app_url.rstrip('/')}/concept-review/{review_id}",
                }
            ],
        )
    )[0]
    return {**to_api(row), "idempotent_replay": False}


def _next_due(attempts: list[dict[str, Any]], response: ReviewResponse) -> str:
    if response.evaluation != "correct" or response.assistance != "none":
        days = 1
    else:
        prior = sum(
            1
            for item in attempts
            if item["evaluation"] == "correct" and item["assistance"] == "none"
        )
        days = [1, 3, 7, 14, 30][min(prior, 4)]
    return (date.today() + timedelta(days=days)).isoformat()


async def record_review_response(
    db: AsyncSession, *, owner_id: str, review_id: str, response: ReviewResponse
) -> dict[str, Any]:
    await lock_identity(db, "concept_reviews", owner_id, review_id)
    row = await _owned(db, "concept_reviews", owner_id, review_id)
    if row is None:
        raise HTTPException(404, "Concept review not found")
    attempts = list(row.data.get("attempts", []))
    response_hash = fingerprint(response.model_dump(exclude={"expected_version", "attempt_id"}))
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
        "recorded_at": datetime.now(UTC).isoformat(),
        "independent_transfer": (
            row.data["kind"] == "transfer"
            and row.data["question_origin"] in {"new_variant", "external_exam"}
            and response.assistance == "none"
        ),
    }
    data = dict(row.data)
    data["attempts"] = [*attempts, new_attempt]
    data["due_on"] = _next_due(attempts, response)
    data["unaided_correct_count"] = row.data.get("unaided_correct_count", 0) + int(
        response.evaluation == "correct" and response.assistance == "none"
    )
    # Evidence is labelled by evaluator and assistance; it is never an automatic mastery claim.
    data["last_evidence"] = {
        "evaluation": response.evaluation,
        "evaluated_by": response.evaluated_by,
        "assistance": response.assistance,
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
    today = date.today().isoformat()
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
