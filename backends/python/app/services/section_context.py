"""Evidence retrieval for HETU sections; never invents derived scores."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, RecordRevision
from app.schemas import RecordQuery
from app.services.records import query_records, to_api

SECTION_COLLECTIONS: dict[str, tuple[str, ...]] = {
    "dashboard": ("sessions", "questions", "pyq_attempts", "mock_tests", "learning_items"),
    "do_now": (
        "plan_items",
        "planner_day_plans",
        "reattempts",
        "learning_items",
        "concept_reviews",
    ),
    "planner": ("planner_day_plans", "plan_items", "plan_item_completions"),
    "sessions": ("sessions", "questions", "doubt_sessions"),
    "quick_capture": ("sessions", "questions", "doubt_sessions"),
    "pyq": ("pyq_sessions", "pyq_attempts"),
    "mocks": ("mock_tests", "pyq_attempts", "questions"),
    "journal": ("questions", "learning_items", "learning_events"),
    "patterns": ("patterns", "questions", "reattempts"),
    "recovery": (
        "reattempts",
        "recovery_sessions",
        "learning_items",
        "learning_events",
        "concept_reviews",
    ),
    "weekly_review": ("weekly_reviews", "planner_day_plans", "sessions"),
    "heatmap": ("questions", "pyq_attempts", "topic_progress", "learning_items"),
    "calibration": ("questions", "pyq_attempts", "mock_tests"),
    "readiness": ("readiness_snapshots", "mock_tests", "pyq_attempts", "learning_items"),
    "references": ("account_state",),
    "revision_pack": (
        "formulas",
        "patterns",
        "trigger_phrases",
        "learning_insights",
        "revision_packs",
    ),
    "syllabus": ("topic_progress", "learning_items"),
    "trigger_drill": ("trigger_phrases", "questions"),
    "formulas": ("formulas",),
    "learning_library": (
        "concept_pages",
        "concept_relations",
        "learning_insights",
        "source_captures",
        "concept_reviews",
    ),
    "buddy": ("shared_insights", "question_shares"),
    "settings": ("account_state", "study_notification_preferences", "telegram_subscriptions"),
    "exports": ("account_state",),
    "account_administration": (),
}


def _collections(section: str) -> tuple[str, ...]:
    value = SECTION_COLLECTIONS.get(section)
    if value is None:
        raise HTTPException(404, "Unknown HETU section")
    return value


async def section_overview(db: AsyncSession, *, owner_id: str, section: str) -> dict[str, Any]:
    collections = _collections(section)
    summaries = []
    for collection in collections:
        count, latest = (
            await db.execute(
                select(func.count(Record.id), func.max(Record.updated_at)).where(
                    Record.owner_id == owner_id,
                    Record.collection == collection,
                    Record.deleted_at.is_(None),
                )
            )
        ).one()
        summaries.append(
            {
                "collection": collection,
                "count": count,
                "latest_updated_at": latest.isoformat() if latest else None,
                "state": "available" if count else "empty",
            }
        )
    return {
        "section": section,
        "collections": summaries,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "complete": True,
        "coverage": "mapped_records_only",
        "section_complete": False,
        "note": (
            "These are mapped underlying record counts, not a computed section score "
            "or full section inventory. Other stores and bundled sources may exist. "
            "Use section_records for detail before changing related work."
        ),
    }


async def section_records(
    db: AsyncSession,
    *,
    owner_id: str,
    section: str,
    collection: str,
    cursor: str | None = None,
    limit: int = 50,
    query: RecordQuery | None = None,
) -> dict[str, Any]:
    if collection not in _collections(section):
        raise HTTPException(403, "Collection is not mapped to this section")
    if not 1 <= limit <= 100 or (query is not None and query.limit > 100):
        raise HTTPException(422, "Limit must be 1–100")
    effective_query = query or RecordQuery(
        cursor=cursor, limit=limit, order_by="updated_at", descending=True
    )
    rows, next_cursor = await query_records(
        db,
        collection=collection,
        owner_id=owner_id,
        query=effective_query,
    )
    return {
        "section": section,
        "collection": collection,
        "items": [to_api(row) for row in rows],
        "next_cursor": next_cursor,
        "complete": next_cursor is None,
        "filters": [item.model_dump() for item in effective_query.filters],
        "retrieved_at": datetime.now(UTC).isoformat(),
    }


async def section_record_detail(
    db: AsyncSession,
    *,
    owner_id: str,
    section: str,
    collection: str,
    record_id: str,
    include_history: bool = False,
) -> dict[str, Any]:
    if collection not in _collections(section):
        raise HTTPException(403, "Collection is not mapped to this section")
    row = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == collection,
            Record.external_id == record_id,
            Record.deleted_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    result = {"item": to_api(row), "retrieved_at": datetime.now(UTC).isoformat()}
    if include_history:
        revisions = (
            await db.scalars(
                select(RecordRevision)
                .where(
                    RecordRevision.owner_id == owner_id,
                    RecordRevision.record_id == row.id,
                )
                .order_by(RecordRevision.version.desc())
                .limit(100)
            )
        ).all()
        result["history"] = [revision.snapshot for revision in revisions]
        result["history_complete"] = len(revisions) < 100
    return result
