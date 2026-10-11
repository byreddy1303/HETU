"""Register focused MCP actions using the app's shared section domain."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session_factory
from app.services.realtime import broker
from app.services.study_actions import (
    FormulaDraft,
    JournalDraft,
    PlannerDraft,
    StudyAction,
    SyllabusDraft,
    TriggerDraft,
    WeeklyDraft,
    execute_action,
)

STUDY_CAPABILITIES = [
    "formulas.save",
    "trigger_drill.save_cue",
    "journal.update_analysis",
    "syllabus.set_progress",
    "weekly_review.save",
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
) -> None:
    annotations = ToolAnnotations(
        read_only_hint=False,
        destructive_hint=False,
        idempotent_hint=True,
        open_world_hint=False,
    )
    security = {"securitySchemes": [{"type": "oauth2", "scopes": ["hetu:write"]}]}

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

    @server.tool(
        description=(
            "Add, edit, split, remove or reorder unstarted blocks in one Planner day. "
            "Retrieve its current revision and known availability first. New days "
            "require available_min and protected_buffer_min. Python rejects overfilled "
            "days, overlapping times, stale edits and changes to started work."
        ),
        annotations=annotations,
        meta=security,
    )
    async def edit_planner_day(draft: PlannerDraft) -> dict[str, Any]:
        return await run(draft)
