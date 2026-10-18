"""Practice history and local-model reconsideration of an unsuccessful repair."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.db.models import Record
from app.services import memory_learning_engine as engine
from app.services.local_models import LocalModelError
from app.services.study_memory import StudyMemoryDraft, save_entry


async def practice_history(db, *, owner_id: str, sources: list[dict]) -> dict:
    uids = {source["question_uid"] for source in sources}
    session = aliased(Record)
    rows = (
        list(
            (
                await db.scalars(
                    select(Record)
                    .join(
                        session,
                        (
                            (session.external_id == Record.data["pyq_session_id"].as_string())
                            & (session.owner_id == owner_id)
                            & (session.collection == "pyq_sessions")
                            & session.deleted_at.is_(None)
                            & (session.data["status"].as_string() == "completed")
                            & (session.data["config"]["mode"].as_string() == "practice")
                        ),
                    )
                    .where(
                        Record.owner_id == owner_id,
                        Record.collection == "pyq_attempts",
                        Record.deleted_at.is_(None),
                        Record.data["question_uid"].as_string().in_(uids),
                    )
                    .order_by(Record.created_at.desc(), Record.id.desc())
                    .limit(80)
                )
            ).all()
        )
        if uids
        else []
    )
    grouped = {
        uid: {"question_uid": uid, "correct": 0, "wrong": 0, "skipped": 0, "latest_outcome": None}
        for uid in sorted(uids)
    }
    for row in rows:
        score = engine._frozen_score(row.data)
        if not score:
            continue
        item = grouped[row.data["question_uid"]]
        item[score["outcome"]] += 1
        if item["latest_outcome"] is None:
            item["latest_outcome"] = score["outcome"]
    return {
        "scope": (
            "Up to 80 latest completed practice receipts for these questions; not lifetime totals."
        ),
        "questions": list(grouped.values()),
    }


async def prepare_refinement(db, *, owner_id: str, entry_id: str | None = None, begin=True):
    if entry_id:
        row = await engine._owned(db, owner_id, "study_memory", entry_id)
    else:
        row = await db.scalar(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "study_memory",
                Record.deleted_at.is_(None),
                Record.data["kind"].as_string() == "repair",
                Record.data["state"].as_string().in_(["open", "deferred"]),
                Record.data["data"]["automation"].as_string() == engine.AUTOMATION,
                Record.data["data"]["needs_local_review"].as_boolean().is_(True),
            )
            .order_by(Record.created_at, Record.id)
            .limit(1)
        )
    if (
        not row
        or row.data.get("kind") != "repair"
        or row.data.get("state") not in {"open", "deferred"}
        or row.data.get("data", {}).get("automation") != engine.AUTOMATION
        or not row.data.get("data", {}).get("needs_local_review")
    ):
        return None
    config = await engine.get_engine_config(db, owner_id=owner_id)
    settings = await engine._owned(db, owner_id, engine.INTERNAL_COLLECTION, engine.SETTINGS_ID)
    sources, revisions = [], []
    evidence_size = 0
    for attempt_id in row.data.get("data", {}).get("source_attempt_ids", [])[:3]:
        attempt = await engine._owned(db, owner_id, "pyq_attempts", attempt_id)
        if not attempt:
            continue
        session = await engine._owned(
            db, owner_id, "pyq_sessions", attempt.data.get("pyq_session_id", "")
        )
        if (
            not session
            or session.data.get("status") != "completed"
            or session.data.get("config", {}).get("mode") != "practice"
        ):
            continue
        notes = list(
            (
                await db.scalars(
                    select(Record)
                    .where(
                        Record.owner_id == owner_id,
                        Record.collection == "study_memory",
                        Record.deleted_at.is_(None),
                        Record.data["kind"].as_string() == "reflection",
                        Record.data["attempt_id"].as_string() == attempt_id,
                    )
                    .limit(3)
                )
            ).all()
        )
        source = engine._source_evidence(attempt, notes)
        if source:
            size = len(json.dumps(source, ensure_ascii=False))
            if evidence_size + size > 18_000:
                break
            evidence_size += size
            sources.append(source)
            revisions.append(
                [
                    attempt_id,
                    attempt.version,
                    session.external_id,
                    session.version,
                    sorted((note.external_id, note.version) for note in notes),
                ]
            )
    if not sources or not config.enabled:
        return None
    token = engine._id("run", engine._now()) if begin else settings.data.get("run_token")
    data = row.data.get("data", {})
    snapshot = {
        "owner_id": owner_id,
        "config": config.model_dump(),
        "config_token": settings.data.get("config_token"),
        "run_token": token,
        "sources": sources,
        "revisions": revisions,
        "capacity": 1,
        "learning_context": [],
        "refine_entry_id": row.external_id,
        "refine_version": row.version,
        "prior_activity": {
            "title": row.data.get("title"),
            "target": data.get("target"),
            "failed_checks": data.get("failed_checks", 1),
            "instruction": (
                "Refine this existing unsuccessful follow-up. Reconsider the method; "
                "do not create duplicate work or infer an unstated cause."
            ),
        },
        "practice_history": await practice_history(db, owner_id=owner_id, sources=sources),
    }
    if begin:
        await engine._status(
            db,
            owner_id,
            state="running",
            run_token=token,
            message="Reconsidering the next activity from its actual practice result.",
            last_error=None,
            error_code=None,
        )
    return snapshot


async def apply_refinement(db, *, owner_id: str, snapshot: dict, plan):
    current = await prepare_refinement(
        db, owner_id=owner_id, entry_id=snapshot["refine_entry_id"], begin=False
    )
    if not current or any(
        current[key] != snapshot[key]
        for key in ["config_token", "run_token", "revisions", "refine_version", "practice_history"]
    ):
        state = await engine._owned(db, owner_id, engine.INTERNAL_COLLECTION, engine.SETTINGS_ID)
        if (
            state
            and state.data.get("config", {}).get("enabled")
            and state.data.get("run_token") == snapshot["run_token"]
        ):
            await engine._status(
                db,
                owner_id,
                state="idle",
                message="The follow-up changed; the next check will use its current evidence.",
            )
        return {"applied": False, "reason": "stale_evidence", "created_repair_ids": []}
    if len(plan.activities) != 1 or plan.activities[0].activity == "transfer":
        raise LocalModelError(
            "invalid_evidence",
            "The local model must refine this activity before proposing fresh transfer.",
        )
    proposal = plan.activities[0]
    if set(proposal.source_attempt_ids) != {source["attempt_id"] for source in snapshot["sources"]}:
        raise LocalModelError(
            "invalid_evidence",
            "The revised activity must account for its submitted errors and skips.",
        )
    row = await engine._owned(db, owner_id, "study_memory", snapshot["refine_entry_id"])
    data = row.data.get("data", {})
    observed = engine._recorded_observation(snapshot["sources"])
    selected = engine._select_questions(
        row.data.get("subject"),
        row.data.get("topic"),
        await engine._exposure(db, owner_id),
        data.get("question_uids", []),
        fresh=False,
    )
    payload = {
        **row.data,
        "evidence_kind": "model",
        "content": (
            f"Recorded result: {observed}\n\n"
            f"Possible explanation to check: {proposal.possible_explanation}\n\n"
            f"Next investigation: {proposal.target}"
        ),
        "data": {
            **data,
            "display_title": proposal.title,
            "activity": proposal.activity,
            "target": proposal.target,
            "success_criteria": proposal.success_criteria,
            "reason": observed,
            "needs_local_review": False,
            "ai_refined_at": engine._now(),
            "model": snapshot["config"]["model"],
            "provider": snapshot["config"]["provider"],
            "diagnosis_status": "to_verify",
            "mastery_claim": False,
            "duration_min": proposal.duration_min,
            "question_uids": selected,
            "selection_status": "ready" if selected else "insufficient-eligible-questions",
        },
    }
    await save_entry(
        db,
        owner_id=owner_id,
        entry_id=row.external_id,
        draft=StudyMemoryDraft.model_validate(
            {**payload, "expected_version": snapshot["refine_version"]}
        ),
    )
    await engine._status(
        db,
        owner_id,
        state="idle",
        last_run_at=engine._now(),
        message=(
            "Updated the existing follow-up from the latest result; its review date is preserved."
        ),
        last_error=None,
        error_code=None,
    )
    return {"applied": True, "created_repair_ids": [], "refined_repair_id": row.external_id}
