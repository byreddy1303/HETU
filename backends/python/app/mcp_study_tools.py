"""Register focused MCP actions using the app's shared section domain."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Record
from app.db.session import get_session_factory
from app.services.realtime import broker
from app.services.records import to_api
from app.services.study_actions import (
    FormulaDraft,
    JournalDraft,
    PlannerDraft,
    SaveQuestionDraft,
    StudyAction,
    SyllabusDraft,
    TriggerDraft,
    WeeklyDraft,
    execute_action,
)

STUDY_CAPABILITIES = [
    "formulas.save",
    "trigger_drill.save_cue",
    "journal.save_question",
    "journal.get_question",
    "journal.update_analysis",
    "syllabus.set_progress",
    "weekly_review.save",
    "planner.get_day",
    "planner.add_blocks",
    "planner.edit_blocks",
    "planner.remove_blocks",
    "planner.reorder_blocks",
    "planner.capacity_validation",
]


def register_study_tools(
    server: MCPServer,
    settings: Settings,
    authorize: Callable[[AsyncSession, str], Awaitable[str]],
    *,
    authenticated: bool = True,
) -> None:
    annotations = ToolAnnotations(
        read_only_hint=False,
        destructive_hint=False,
        idempotent_hint=True,
        open_world_hint=False,
    )
    security = {
        "securitySchemes": [
            {"type": "oauth2", "scopes": ["hetu:write"]} if authenticated else {"type": "noauth"}
        ]
    }

    async def run(draft: StudyAction) -> dict[str, Any]:
        async with get_session_factory()() as db:
            owner = await authorize(db, "hetu:write")
            try:
                result = await execute_action(
                    db,
                    owner_id=owner,
                    draft=draft,
                    app_url=settings.app_url,
                    origin="chatgpt",
                )
            except HTTPException as exc:
                await db.rollback()
                raise ToolError(
                    json.dumps({"status": exc.status_code, "detail": exc.detail})
                ) from exc
            await db.commit()
            if result.get("record") and not result["idempotent_replay"]:
                record = result["record"]
                event = (
                    {
                        "type": "record.deleted",
                        "collection": result["collection"],
                        "id": record["id"],
                    }
                    if record.get("deleted_at")
                    else {
                        "type": "record.updated",
                        "collection": result["collection"],
                        "record": record,
                    }
                )
                await broker.publish(owner, event)
            return result

    @server.tool(
        description=(
            "Create or revise a formula in HETU. Read the current version before editing; "
            "use expected_version 0 for creation. Review and mastery evidence are preserved."
        ),
        annotations=annotations,
        meta=security,
    )
    async def save_formula(draft: FormulaDraft) -> dict[str, Any]:
        return await run(draft)

    @server.tool(
        description=(
            "Save a recognition cue and its concept, optionally linking owned Journal "
            "questions. This does not record a completed drill or measured reflex time."
        ),
        annotations=annotations,
        meta=security,
    )
    async def save_recognition_cue(draft: TriggerDraft) -> dict[str, Any]:
        return await run(draft)

    @server.tool(
        description=(
            "Annotate an existing Journal question with reasoning, root cause, pattern "
            "or recognition cue at its current version. Preserve answer/score/timing "
            "evidence; label learner reports and assistant hypotheses explicitly."
        ),
        annotations=annotations,
        meta=security,
    )
    async def update_journal_analysis(draft: JournalDraft) -> dict[str, Any]:
        return await run(draft)

    @server.tool(
        description=(
            "Mark a syllabus topic studied or reopen it using the learner's reported "
            "progress. Read its current version first; coverage does not award mastery."
        ),
        annotations=annotations,
        meta=security,
    )
    async def set_syllabus_progress(draft: SyllabusDraft) -> dict[str, Any]:
        return await run(draft)

    @server.tool(
        description=(
            "Save a weekly reflection and concrete next fix for a Monday week_start. "
            "Retrieve the week's actual evidence first and use its existing version."
        ),
        annotations=annotations,
        meta=security,
    )
    async def save_weekly_review(draft: WeeklyDraft) -> dict[str, Any]:
        return await run(draft)

    read_security = {
        "securitySchemes": [
            {"type": "oauth2", "scopes": ["hetu:read"]} if authenticated else {"type": "noauth"}
        ]
    }
    read_annotations = ToolAnnotations(read_only_hint=True)

    @server.tool(
        description=(
            "Add, edit, split, remove or reorder unstarted blocks in one Planner day. "
            "Use get_planner_day to read the day's existing plan and revision first. "
            "Python enforces availability and capacity bounds, non-overlapping times, "
            "and preserves started work."
        ),
        annotations=annotations,
        meta=security,
    )
    async def edit_planner_day(draft: PlannerDraft) -> dict[str, Any]:
        if draft.available_min is None and draft.protected_buffer_min is None:
            async with get_session_factory()() as db:
                owner = await authorize(db, "hetu:write")
                row = await db.scalar(
                    select(Record).where(
                        Record.owner_id == owner,
                        Record.collection == "planner_day_plans",
                        Record.external_id == draft.plan_date.isoformat(),
                        Record.deleted_at.is_(None),
                    )
                )
                if row is None:
                    planned = sum(b.duration_min for b in draft.add_blocks)
                    draft = draft.model_copy(
                        update={
                            "available_min": max(360, planned + 45),
                            "protected_buffer_min": 45,
                        }
                    )
        return await run(draft)

    @server.tool(
        description=(
            "Retrieve a learner's day plan for a given date (YYYY-MM-DD). "
            "Returns the current revision, planned blocks, availability, and capacity."
        ),
        annotations=read_annotations,
        meta=read_security,
    )
    async def get_planner_day(plan_date: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            owner = await authorize(db, "hetu:read")
            row = await db.scalar(
                select(Record).where(
                    Record.owner_id == owner,
                    Record.collection == "planner_day_plans",
                    Record.external_id == plan_date,
                    Record.deleted_at.is_(None),
                )
            )
            if row is None:
                return {
                    "exists": False,
                    "plan_date": plan_date,
                    "revision": 0,
                    "usable_min": 315,
                    "planned_min": 0,
                    "remaining_min": 315,
                    "sessions": [],
                    "availability": {
                        "availableMin": 360,
                        "protectedBufferMin": 45,
                        "timeWindows": [],
                    },
                }
            plan = dict(row.data.get("plan") or {})
            sessions = plan.get("sessions") or row.data.get("sessions") or []
            avail = dict(plan.get("availability") or {})
            available = avail.get("availableMin", 360)
            buffer = avail.get("protectedBufferMin", 45)
            planned = sum(s.get("durationMin", 0) for s in sessions)
            usable = max(0, available - buffer)
            revision = int(row.data.get("revision", row.version))
            return {
                "exists": True,
                "plan_date": plan_date,
                "revision": revision,
                "usable_min": usable,
                "planned_min": planned,
                "remaining_min": usable - planned,
                "sessions": sessions,
                "availability": avail,
                "record_id": row.external_id,
            }

    @server.tool(
        description=(
            "Save a new or existing question to the HETU Journal and practice queue. "
            "Supports subject, topic, question/answer text, outcome (e.g. W-C, R, W-E, W-R), "
            "root cause, pattern name, trigger cue, and automatically schedules recovery."
        ),
        annotations=annotations,
        meta=security,
    )
    async def save_question(draft: SaveQuestionDraft) -> dict[str, Any]:
        return await run(draft)

    @server.tool(
        description=(
            "Retrieve a Journal question by ID, including text, answer, outcome, and analysis."
        ),
        annotations=read_annotations,
        meta=read_security,
    )
    async def get_journal_question(question_id: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            owner = await authorize(db, "hetu:read")
            row = await db.scalar(
                select(Record).where(
                    Record.owner_id == owner,
                    Record.collection == "questions",
                    Record.external_id == question_id,
                    Record.deleted_at.is_(None),
                )
            )
            if row is None:
                raise ToolError(f"Question '{question_id}' not found")
            return {"question": to_api(row)}
