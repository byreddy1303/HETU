"""Read-only, answer-free daily agenda for the native desktop brief."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services.learning_concept_bridge import concept_review_queue
from app.services.recovery import account_clock, recovery_candidates


async def daily_brief(db: AsyncSession, owner_id: str) -> dict:
    _, today, timezone = await account_clock(db, owner_id)
    day = today.isoformat()
    planner = await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == "planner_day_plans",
            Record.external_id == day,
            Record.deleted_at.is_(None),
        )
    )
    plan = (planner.data.get("plan") or planner.data) if planner else {}
    blocks = [
        block
        for block in plan.get("sessions", [])
        if isinstance(block, dict) and not (block.get("execution") or {}).get("completedAt")
    ]
    candidates, complete = await recovery_candidates(db, owner_id)
    due = [
        row["item"]
        for row in candidates
        if row["item"].get("scheduled_date")
        and row["item"]["scheduled_date"] <= day
        and row["item"].get("source_kind") != "concept"
        and row["item"].get("stage") != "MASTERED"
        and row["item"].get("recovery_state") not in {"mastered", "paused"}
    ]
    concepts = await concept_review_queue(db, owner_id=owner_id, limit=100)
    due_concepts = [item for item in concepts["items"] if item["due_on"] <= day]
    memory_concepts = list(
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "study_memory",
                Record.deleted_at.is_(None),
                Record.data["kind"].as_string() == "concept",
                Record.data["state"].as_string() != "superseded",
                Record.data["data"]["next_review_on"].as_string() <= day,
            )
            .order_by(Record.external_id)
            .limit(101)
        )
    )
    canonical_ids = {row["item"]["id"] for row in candidates}
    legacy = list(
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "reattempts",
                Record.deleted_at.is_(None),
            )
            .order_by(Record.external_id)
            .limit(2001)
        )
    )
    legacy_due = [
        row
        for row in legacy[:2000]
        if row.data.get("scheduled_date")
        and row.data["scheduled_date"] <= day
        and row.data.get("stage") != "MASTERED"
        and row.data.get("learning_item_id") not in canonical_ids
    ]
    due.extend({"topic": "Saved question"} for _row in legacy_due)
    due_concepts.extend(
        {"concept": {"topic": row.data.get("topic") or row.data.get("subject")}}
        for row in memory_concepts[:100]
    )
    exams = list(
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "pyq_sessions",
                Record.deleted_at.is_(None),
                Record.data["status"].as_string().in_(["active", "paused"]),
                Record.data["config"]["mode"].as_string() == "exam",
            )
            .limit(1)
        )
    )
    held = bool(exams) or concepts.get("held_for_exam", False)
    return {
        "date": day,
        "timezone": timezone,
        "held_for_exam": held,
        "planner": {
            "count": len(blocks),
            "items": [
                {
                    "title": str(block.get("target") or block.get("subject") or "Study block")[
                        :180
                    ],
                    "minutes": block.get("durationMin"),
                }
                for block in blocks[:8]
            ],
        },
        "reattempts": {
            "count": len(due),
            "complete": complete and len(legacy) <= 2000,
            "items": [
                {"label": str(item.get("topic") or item.get("subject") or "Question")[:180]}
                for item in due[:8]
            ],
        },
        "concepts": {
            "count": len(due_concepts),
            "complete": concepts["complete"] and len(memory_concepts) <= 100,
            "items": [
                {
                    "label": str(
                        (item.get("concept") or {}).get("topic")
                        or (item.get("concept") or {}).get("subject")
                        or "Concept recall"
                    )[:180]
                }
                for item in due_concepts[:8]
            ],
        },
    }
