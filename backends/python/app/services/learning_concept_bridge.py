"""Prepare recall from owned learning work using the existing concept/recovery store.

A model's study target is a cue to test, never a verified explanation or grade.
One originating repair family owns one durable recall question; later PYQ checks
cannot reset a recall response or multiply the question's recovery items.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services import recovery
from app.services.concept_review import ReviewDraft, create_review, get_review
from app.services.learning_library import (
    CaptureRequest,
    InsightDraft,
    SourceDraft,
    capture_learning,
    fingerprint,
    stable_id,
)
from app.services.memory_learning_engine import AUTOMATION, _frozen_score
from app.services.records import to_api, upsert_records

BRIDGE = "local_learning_concept_bridge"
SCAN_LIMIT = 1000


async def _owned(db: AsyncSession, owner_id: str, collection: str, record_id: str) -> Record | None:
    return await db.scalar(
        select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == collection,
            Record.external_id == record_id,
            Record.deleted_at.is_(None),
        )
    )


async def exam_in_progress(db: AsyncSession, owner_id: str) -> bool:
    return bool(
        await db.scalar(
            select(Record.id)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "pyq_sessions",
                Record.deleted_at.is_(None),
                Record.data["config"]["mode"].as_string() == "exam",
                Record.data["status"].as_string().in_(["active", "paused"]),
            )
            .limit(1)
        )
    )


def _target(repair: Record) -> dict:
    details = repair.data.get("data", {})
    return {
        "title": str(details.get("display_title") or repair.data.get("title") or "")[:160],
        "target": str(details.get("target") or "")[:500],
        "criterion": str(details.get("success_criteria") or "")[:1000],
        "subject": str(repair.data.get("subject") or "")[:160],
        "topic": str(repair.data.get("topic") or "")[:160],
    }


async def _family_root(db: AsyncSession, owner_id: str, repair: Record) -> Record | None:
    visited = set()
    current = repair
    for _ in range(30):
        if (
            current.external_id in visited
            or current.data.get("kind") != "repair"
            or current.data.get("data", {}).get("automation") != AUTOMATION
        ):
            return None
        visited.add(current.external_id)
        parent_id = current.data.get("repair_id")
        if not parent_id:
            return current
        if not isinstance(parent_id, str):
            return None
        current = await _owned(db, owner_id, "study_memory", parent_id)
        if current is None:
            return None
    return None


async def _eligible_sources(db: AsyncSession, owner_id: str, ids: Any) -> list[dict] | None:
    if (
        not isinstance(ids, list)
        or not 1 <= len(ids) <= 6
        or any(not isinstance(value, str) or not value for value in ids)
        or len(set(ids)) != len(ids)
    ):
        return None
    sources = []
    for attempt_id in ids:
        attempt = await _owned(db, owner_id, "pyq_attempts", attempt_id)
        if attempt is None or _frozen_score(attempt.data) is None:
            return None
        session_id = attempt.data.get("pyq_session_id")
        if not isinstance(session_id, str):
            return None
        session = await _owned(db, owner_id, "pyq_sessions", session_id)
        if session is None or session.data.get("status") != "completed":
            return None
        if session.data.get("config", {}).get("mode") not in {
            "practice",
            "exam",
        } or attempt.data.get("question_uid") not in session.data.get("question_uids", []):
            return None
        if session.data.get("config", {}).get("mode") == "exam":
            reviews = (
                await db.scalars(
                    select(Record).where(
                        Record.owner_id == owner_id,
                        Record.collection == "study_memory",
                        Record.deleted_at.is_(None),
                        Record.data["kind"].as_string() == "exam_review",
                        Record.data["session_id"].as_string() == session_id,
                    )
                )
            ).all()
            if not any(
                review.data.get("state") == "completed"
                or attempt_id in review.data.get("data", {}).get("revealed_attempt_ids", [])
                for review in reviews
            ):
                return None
        sources.append(
            {
                "attempt_id": attempt.external_id,
                "version": attempt.version,
                "session_id": session.external_id,
                "question_uid": attempt.data.get("question_uid"),
            }
        )
    return sources


async def _link_review(db: AsyncSession, owner_id: str, repair: Record, review: dict) -> None:
    details = repair.data.get("data", {})
    if (
        details.get("concept_review_id") == review["id"]
        and details.get("concept_id") == review["concept_id"]
    ):
        return
    await upsert_records(
        db,
        collection="study_memory",
        owner_id=owner_id,
        items=[
            {
                **repair.data,
                "id": repair.external_id,
                "expected_version": repair.version,
                "data": {
                    **details,
                    "concept_review_id": review["id"],
                    "concept_id": review["concept_id"],
                },
            }
        ],
    )


async def sync_learning_concept_reviews(
    db: AsyncSession,
    *,
    owner_id: str,
    app_url: str,
    repair_id: str | None = None,
) -> dict:
    """Materialize eligible open repairs. Caller owns the transaction.

    Replays never edit a question, its answer history, or its due date. A later
    repair in the same family reuses the first recall question. The preparation
    snapshot records source versions; changed source receipts fail closed.
    """
    if await exam_in_progress(db, owner_id):
        return {"created": 0, "reused": 0, "held": 0, "review_ids": [], "held_for_exam": True}
    await recovery.owner_lock(db, owner_id)
    query = select(Record).where(
        Record.owner_id == owner_id,
        Record.collection == "study_memory",
        Record.deleted_at.is_(None),
        Record.data["kind"].as_string() == "repair",
        Record.data["state"].as_string().in_(["open", "deferred"]),
        Record.data["data"]["automation"].as_string() == AUTOMATION,
    )
    if repair_id:
        query = query.where(Record.external_id == repair_id)
    repairs = list(
        (await db.scalars(query.order_by(Record.updated_at, Record.id).limit(SCAN_LIMIT + 1))).all()
    )
    if repair_id and not repairs:
        raise HTTPException(404, "Open local learning activity not found")
    result = {
        "created": 0,
        "reused": 0,
        "held": 0,
        "review_ids": [],
        "held_for_exam": False,
        "complete": len(repairs) <= SCAN_LIMIT,
    }
    for repair in repairs[:SCAN_LIMIT]:
        root = await _family_root(db, owner_id, repair)
        sources = await _eligible_sources(
            db, owner_id, repair.data.get("data", {}).get("source_attempt_ids")
        )
        target = _target(repair)
        if root is None or sources is None or not all(target.values()):
            result["held"] += 1
            continue
        review_key = f"local-concept:{root.external_id}"
        review_id = stable_id("concept-review", review_key)
        existing = await _owned(db, owner_id, "concept_reviews", review_id)
        if existing:
            await _link_review(db, owner_id, repair, to_api(existing))
            if root.external_id != repair.external_id:
                await _link_review(db, owner_id, root, to_api(existing))
            result["reused"] += 1
            result["review_ids"].append(review_id)
            continue
        archived = await db.scalar(
            select(Record.id).where(
                Record.owner_id == owner_id,
                Record.collection == "concept_reviews",
                Record.external_id == review_id,
                Record.deleted_at.is_not(None),
            )
        )
        if archived:
            result["held"] += 1
            continue
        # Snapshot the selected study target; never infer an explanation from a
        # wrong answer or describe model text as learner-stated reasoning.
        origin = repair.data.get("data", {})
        due = origin.get("due_date")
        try:
            due_on = date.fromisoformat(due) if isinstance(due, str) else None
        except ValueError:
            due_on = None
        prompt = (
            f"Without notes, work through this study target:\n\n{target['target']}\n\n"
            "Explain the method, when it applies, and one way to check your result. "
            "Use a small example if helpful."
        )
        guidance = (
            "This success criterion was proposed by the local model and is unverified. "
            "Check it against your course material or the original question explanation.\n\n"
            f"{target['criterion']}\n\n"
            "Assess the answer you wrote before opening this guidance. Record uncertain "
            "parts as partly correct or leave the response ungraded."
        )
        capture = await capture_learning(
            db,
            owner_id=owner_id,
            app_url=app_url,
            request=CaptureRequest(
                idempotency_key=f"concept-bridge:{root.external_id}",
                sources=[
                    SourceDraft(
                        kind="question",
                        title=f"Completed practice: {target['topic']}",
                        url=f"{app_url.rstrip('/')}/memory/{repair.external_id}",
                        excerpt=(
                            f"Study target proposed by {origin.get('model') or 'the local model'}: "
                            f"{target['target']}\nSource attempt IDs: "
                            + ", ".join(source["attempt_id"] for source in sources)
                        ),
                    )
                ],
                insights=[
                    InsightDraft(
                        subject=target["subject"],
                        topic=target["topic"],
                        concept=target["title"],
                        core_idea=target["target"],
                        full_explanation=(
                            "This page holds an unverified study target prepared from completed "
                            "practice. It is a cue for recall, not an established explanation "
                            "of the learner's error.\n\n"
                            f"Target: {target['target']}\n\n"
                            f"Proposed success criterion: {target['criterion']}"
                        ),
                        reasoning_origin="assistant_hypothesis",
                        unresolved_questions=[
                            "Verify the proposed method against course material."
                        ],
                        retrieval_question=prompt,
                        evaluation_guidance=guidance,
                    )
                ],
            ),
        )
        review = await create_review(
            db,
            owner_id=owner_id,
            app_url=app_url,
            draft=ReviewDraft(
                idempotency_key=review_key,
                concept_id=capture["concept_ids"][0],
                insight_id=capture["insight_ids"][0],
                kind="recall",
                prompt=prompt,
                evaluation_guidance=guidance,
                question_origin="saved_note",
                source_ref=f"/memory/{repair.external_id}",
                due_on=due_on,
            ),
        )
        row = await _owned(db, owner_id, "concept_reviews", review["id"])
        await upsert_records(
            db,
            collection="concept_reviews",
            owner_id=owner_id,
            items=[
                {
                    **row.data,
                    "id": row.external_id,
                    "expected_version": row.version,
                    "learning_bridge": {
                        "automation": BRIDGE,
                        "root_repair_id": root.external_id,
                        "repair_id": repair.external_id,
                        "repair_version": repair.version,
                        "model": origin.get("model"),
                        "provider": origin.get("provider"),
                        "target_snapshot": target,
                        "source_attempts": sources,
                        "source_fingerprint": fingerprint(sources),
                        "guidance_status": "unverified_model_proposal",
                        "mastery_claim": False,
                    },
                }
            ],
        )
        await _link_review(db, owner_id, repair, review)
        if root.external_id != repair.external_id:
            await _link_review(db, owner_id, root, review)
        result["created"] += 1
        result["review_ids"].append(review_id)
    result["review_ids"] = list(dict.fromkeys(result["review_ids"]))
    return result


async def _present_review(db: AsyncSession, owner_id: str, value: dict) -> dict | None:
    concept = await _owned(db, owner_id, "concept_pages", value.get("concept_id", ""))
    if concept is None:
        return None
    output = {
        **value,
        "has_guidance": bool(value.get("evaluation_guidance")),
        "evaluation_guidance": value.get("evaluation_guidance")
        if value.get("pending_assistance")
        else None,
        "concept": {
            "id": concept.external_id,
            "title": concept.data.get("concept"),
            "subject": concept.data.get("subject"),
            "topic": concept.data.get("topic"),
        },
    }
    bridge = value.get("learning_bridge", {})
    if bridge.get("automation") == BRIDGE:
        references = bridge.get("source_attempts", [])
        sources = await _eligible_sources(
            db, owner_id, [source.get("attempt_id") for source in references]
        )
        if sources is None or fingerprint(sources) != bridge.get("source_fingerprint"):
            return None
        repair = await _owned(db, owner_id, "study_memory", bridge.get("repair_id", ""))
        if repair is None:
            return None
        output["source"] = {
            "repair_id": repair.external_id,
            "href": f"/memory/{repair.external_id}",
            "title": bridge.get("target_snapshot", {}).get("title"),
            "model": bridge.get("model"),
            "provider": bridge.get("provider"),
            "guidance_status": bridge.get("guidance_status"),
            "snapshot_changed": _target(repair) != bridge.get("target_snapshot"),
        }
    # Source/version metadata is useful for audit; its copy of the criterion is
    # not part of the question response before help has been explicitly recorded.
    output.pop("learning_bridge", None)
    output.pop("source_hash", None)
    return output


async def concept_review_queue(db: AsyncSession, *, owner_id: str, limit: int = 100) -> dict:
    today = (await recovery.account_clock(db, owner_id))[1].isoformat()
    if await exam_in_progress(db, owner_id):
        return {"items": [], "today": today, "complete": True, "held_for_exam": True}
    rows = list(
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "concept_reviews",
                    Record.deleted_at.is_(None),
                )
                .order_by(Record.data["due_on"].as_string(), Record.external_id)
                .limit(SCAN_LIMIT + 1)
            )
        ).all()
    )
    items = []
    held_sources = 0
    for row in rows[:SCAN_LIMIT]:
        value = await _present_review(db, owner_id, to_api(row))
        if value:
            items.append(value)
        else:
            held_sources += 1
    return {
        "items": items[:limit],
        "today": today,
        "complete": len(rows) <= SCAN_LIMIT and len(items) <= limit,
        "held_for_exam": False,
        "held_sources": held_sources,
    }


async def concept_queue_review(db: AsyncSession, *, owner_id: str, review_id: str) -> dict:
    if await exam_in_progress(db, owner_id):
        raise HTTPException(
            409, "Concept review waits until your active or paused exam is finished."
        )
    value = await _present_review(
        db, owner_id, await get_review(db, owner_id=owner_id, review_id=review_id)
    )
    if value is None:
        raise HTTPException(
            409, "This review's source changed or is unavailable. Open Learning Memory."
        )
    return value
