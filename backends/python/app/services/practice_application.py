"""Fresh and delayed bank evidence for original mistake repairs, without rewriting attempts."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.db.models import Record
from app.services.memory_learning_engine import _frozen_score
from app.services.pyq_catalog import active_bank
from app.services.study_memory import _owned


async def application(db, owner, session_id):
    from app.services.practice_coach import get_pack

    session = await _owned(db, owner, "pyq_sessions", session_id)
    if (
        not session
        or session.data.get("status") != "completed"
        or session.data.get("config", {}).get("mode") != "practice"
    ):
        raise HTTPException(409, "Complete the linked practice before reporting its conditions")
    repair = await _owned(
        db, owner, "study_memory", session.data.get("config", {}).get("memoryRepairId", "")
    )
    pack_id = repair.data.get("data", {}).get("practice_pack_id") if repair else None
    if not pack_id:
        raise HTTPException(404, "This session is not a mistake-pack application")
    await get_pack(db, owner, pack_id)
    return session, repair, pack_id


def utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


async def progress(db, owner, private):
    from app.services.practice_coach import rows

    repairs = list(
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner,
                    Record.collection == "study_memory",
                    Record.deleted_at.is_(None),
                    Record.data["kind"].as_string() == "repair",
                    Record.data["data"]["practice_pack_id"].as_string().is_not(None),
                )
                .order_by(Record.created_at.desc(), Record.id.desc())
                .limit(501)
            )
        ).all()
    )
    repair_map = {r.external_id: r for r in repairs[:500]}
    if not repair_map:
        return {"items": [], "complete": True}
    sessions = list(
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner,
                    Record.collection == "pyq_sessions",
                    Record.deleted_at.is_(None),
                    Record.data["config"]["memoryRepairId"].as_string().in_(repair_map),
                    Record.data["config"]["mode"].as_string() == "practice",
                    Record.data["status"].as_string() == "completed",
                )
                .order_by(Record.created_at.desc(), Record.id.desc())
                .limit(501)
            )
        ).all()
    )
    attempts, complete = await rows(db, owner, "pyq_attempts")
    complete = complete and len(repairs) <= 500 and len(sessions) <= 500
    reports = {
        r.data["session_id"]: r.data["assistance"]
        for r in private
        if r.data.get("kind") == "application_conditions"
    }
    bank = active_bank()
    ordered = sorted(attempts, key=lambda r: (utc(r.created_at), r.external_id))
    first_uid, first_hash, by_session = {}, {}, {}
    for receipt in ordered:
        uid = receipt.data.get("question_uid")
        first_uid.setdefault(uid, receipt.external_id)
        if uid in bank.by_uid:
            first_hash.setdefault(bank.by_uid[uid].content_hash, receipt.external_id)
        by_session.setdefault(receipt.data.get("pyq_session_id"), []).append(receipt)
    items = []
    for session in sessions[:500]:
        repair = repair_map[session.data["config"]["memoryRepairId"]]
        planned = session.data.get("question_uids", [])
        first = {}
        for receipt in by_session.get(session.external_id, []):
            if receipt.data.get("question_uid") in planned:
                first.setdefault(receipt.data["question_uid"], receipt)
        assistance = reports.get(session.external_id, "unreported")
        interval = repair.data.get("data", {}).get("interval_days", 0)
        delayed = interval >= 3 and utc(session.created_at) >= utc(repair.created_at) + timedelta(
            days=interval
        )
        fresh_count = fresh_correct = delayed_count = delayed_correct = 0
        for uid, receipt in first.items():
            score = _frozen_score(receipt.data)
            question = bank.by_uid.get(uid)
            fresh = (
                complete
                and question is not None
                and first_uid.get(uid) == receipt.external_id
                and first_hash.get(question.content_hash) == receipt.external_id
            )
            eligible = (
                assistance == "without-help"
                and fresh
                and score
                and (score["mark_correct"] is not None or score["outcome"] == "skipped")
            )
            if eligible:
                fresh_count += 1
                fresh_correct += int(score["mark_correct"] is True)
                delayed_count += int(delayed)
                delayed_correct += int(delayed and score["mark_correct"] is True)
        items.append(
            {
                "pack_id": repair.data["data"]["practice_pack_id"],
                "session_id": session.external_id,
                "repair_id": repair.external_id,
                "next_review_id": repair.data.get("data", {}).get("next_review_entry_id"),
                "assistance": assistance,
                "submitted": len(first),
                "planned": len(planned),
                "fresh_count": fresh_count,
                "fresh_correct": fresh_correct,
                "delayed_count": delayed_count,
                "delayed_correct": delayed_correct,
            }
        )
    return {"items": items, "complete": complete}
