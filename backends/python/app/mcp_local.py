"""Local stdio MCP server for HETU desktop and local AI clients."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

# Ensure backends/python is on sys.path when invoked directly
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.types import ToolAnnotations  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.db.models import User  # noqa: E402
from app.db.session import get_session_factory  # noqa: E402
from app.mcp_study_tools import STUDY_CAPABILITIES, register_study_tools  # noqa: E402
from app.mcp_test_tools import TEST_CAPABILITIES, register_test_tools  # noqa: E402
from app.services.learning_library import (  # noqa: E402
    CaptureRequest,
    capture_learning,
    learning_detail,
    search_learning,
)

LOCAL_USER_ID = "local_user"


async def authorize_local(_db: AsyncSession, _required_scope: str) -> str:
    """Always resolves to the local user for single-user desktop MCP operations."""
    return LOCAL_USER_ID


async def init_local_db(settings: Settings) -> None:
    """Ensure database tables and local_user exist before serving requests."""
    if settings.environment == "local" and settings.sqlalchemy_database_url.startswith("sqlite"):
        import app.db.models  # noqa: F401
        from app.db.base import Base
        from app.db.models import User, UserIdentity
        from app.db.session import get_engine, get_session_factory

        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with get_session_factory()() as session:
            user = await session.get(User, LOCAL_USER_ID)
            if user is None:
                session.add(
                    User(
                        id=LOCAL_USER_ID,
                        display_name="Local Learner",
                        username="local_learner",
                        profile={"role": "learner", "local": True},
                    )
                )
                session.add(
                    UserIdentity(
                        user_id=LOCAL_USER_ID,
                        provider="local",
                        subject=LOCAL_USER_ID,
                    )
                )
                await session.commit()


def create_local_server(settings: Settings | None = None) -> MCPServer:
    current_settings = settings or get_settings()

    server = MCPServer(
        "HETU",
        description="Operate the local learner's HETU preparation workspace.",
        instructions=(
            "Preserve the user's original goal, constraints, and corrections. "
            "Retrieve account evidence before acting; do not invent attempts or mastery. "
            "For test screenshots: use save_test_analysis to atomically crop questions, "
            "exclude solutions/answer markings, log into Journal, record mistake patterns, "
            "and schedule re-attempts. "
            "For study actions: use save_question, update_journal_analysis, save_formula, "
            "save_recognition_cue, set_syllabus_progress, save_weekly_review, and edit_planner_day."
        ),
        version="0.2.0",
    )

    @server.tool(
        description="Identify the connected HETU account.",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def get_profile() -> dict[str, Any]:
        async with get_session_factory()() as db:
            user = await db.get(User, LOCAL_USER_ID)
            return {
                "profile_id": LOCAL_USER_ID,
                "display_name": (user.display_name if user else None) or "Local Learner",
                "email": user.email if user else None,
            }

    @server.tool(
        description="Report actual supported HETU operations and current capabilities.",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def get_capabilities() -> dict[str, Any]:
        return {
            "schema_version": "learning-v1",
            "supported": [
                "learning.capture",
                "learning.search",
                "learning.detail",
                *STUDY_CAPABILITIES,
                *TEST_CAPABILITIES,
            ],
            "mode": "local_desktop",
        }

    @server.tool(
        description="Search saved concepts by text or subject in the local HETU workspace.",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def search_knowledge(
        query: str = "", subject: str | None = None, limit: int = 25, offset: int = 0
    ) -> dict[str, Any]:
        if not 1 <= limit <= 100 or offset < 0 or len(query) > 300:
            raise ValueError("Use limit 1–100, offset >= 0, and a query under 300 characters")
        async with get_session_factory()() as db:
            user_id = await authorize_local(db, "hetu:read")
            return await search_learning(
                db, owner_id=user_id, text=query, subject=subject, limit=limit, offset=offset
            )

    @server.tool(
        description="Get a concept's full explanation, insights, and sources.",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def get_concept(concept_id: str, include_history: bool = False) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await authorize_local(db, "hetu:read")
            return await learning_detail(
                db, owner_id=user_id, concept_id=concept_id, include_history=include_history
            )

    @server.tool(
        description="Save useful ideas and insights from the conversation into HETU.",
        annotations=ToolAnnotations(idempotent_hint=True),
    )
    async def save_to_hetu(request: CaptureRequest) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await authorize_local(db, "hetu:write")
            result = await capture_learning(
                db, owner_id=user_id, request=request, app_url=current_settings.app_url
            )
            await db.commit()
            return result

    register_study_tools(server, current_settings, authorize_local)
    register_test_tools(server, current_settings, authorize_local)

    return server


async def main() -> None:
    settings = get_settings()
    await init_local_db(settings)
    server = create_local_server(settings)
    await server.run_stdio_async()


if __name__ == "__main__":
    asyncio.run(main())
