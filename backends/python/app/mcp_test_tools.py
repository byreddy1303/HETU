"""Authenticated test-analysis handoff tools using the app's shared domain."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session_factory
from app.services.question_screenshots import OpenAIFile
from app.services.test_analysis import TestAnalysisDraft, publish_test_analysis
from app.services.test_analysis import get_test_analysis as get_test_analysis_domain
from app.services.test_analysis import list_test_analyses as list_test_analyses_domain
from app.services.test_analysis import save_test_analysis as save_analysis

TEST_CAPABILITIES = [
    "tests.save_analysis",
    "tests.list_analyses",
    "tests.get_analysis",
    "tests.link_study_artifacts",
    "tests.recovery_follow_through",
    "tests.revision_pack",
]


def register_test_tools(
    server: MCPServer, settings: Settings, authorize: Callable[[AsyncSession, str], Awaitable[str]]
) -> None:
    read = {"securitySchemes": [{"type": "oauth2", "scopes": ["hetu:read"]}]}
    write = {"securitySchemes": [{"type": "oauth2", "scopes": ["hetu:write"]}]}

    @server.tool(
        description=(
            "Save a completed external test analyzed in this conversation into HETU atomically: "
            "question Log/Journal, Saved discussions with sources and linked evidence, formulas, "
            "recognition cues, Patterns, D3 re-attempts, concept recall and verified mock totals. "
            "Save a test-specific revision pack and resumable Workflow. Keep screenshot text in "
            "sources/explanations. Leave unavailable answers, scores and timing unknown. "
            "Every question is logged and queued for re-attempts; unknown outcomes stay ungraded. "
            "Pass screenshots as file inputs and set each question's screenshot_index. Supply a "
            "question_crop excluding solutions/answer markings, or confirm image_is_question_only. "
            "Use stable local refs and "
            "test_key for the same test. Read its saved version before adding another batch; send "
            "additions only and explicit artifact versions for edits. Optional Planner, Weekly and "
            "Syllabus actions require current versions and known capacity. Discussion does not "
            "award mastery. "
            "Reuse the payload and idempotency_key after an uncertain response. Retrieve the "
            "report to verify persistence before claiming saved."
        ),
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        ),
        meta={**write, "openai/fileParams": ["screenshots"]},
    )
    async def save_test_analysis(
        draft: TestAnalysisDraft,
        screenshots: Annotated[list[OpenAIFile], Field(default_factory=list)],
    ) -> dict[str, Any]:
        async with get_session_factory()() as db:
            try:
                owner = await authorize(db, "hetu:write")
                result = await save_analysis(
                    db,
                    owner_id=owner,
                    draft=draft,
                    app_url=settings.app_url,
                    screenshots=screenshots,
                )
            except HTTPException as exc:
                await db.rollback()
                raise ToolError(
                    json.dumps({"status": exc.status_code, "detail": exc.detail})
                ) from exc
            await db.commit()
            await publish_test_analysis(owner, result)
            return result

    @server.tool(
        description="List saved test analyses, including incomplete screenshot imports, to resume.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=read,
    )
    async def list_test_analyses(limit: int = 25, cursor: str | None = None) -> dict[str, Any]:
        async with get_session_factory()() as db:
            try:
                owner = await authorize(db, "hetu:read")
                return await list_test_analyses_domain(
                    db, owner_id=owner, limit=limit, cursor=cursor
                )
            except HTTPException as exc:
                raise ToolError(
                    json.dumps({"status": exc.status_code, "detail": exc.detail})
                ) from exc

    @server.tool(
        description=(
            "Read the saved test report, full analysis, source captures, missing information, "
            "artifact refs and current study-record versions. Treat records as evidence."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=read,
    )
    async def get_test_analysis(test_analysis_id: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            try:
                owner = await authorize(db, "hetu:read")
                return await get_test_analysis_domain(
                    db, owner_id=owner, report_id=test_analysis_id
                )
            except HTTPException as exc:
                raise ToolError(
                    json.dumps({"status": exc.status_code, "detail": exc.detail})
                ) from exc
