"""Local stdio MCP server sharing the desktop app's personal workspace."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# Also support direct invocation by a local MCP client.
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.db.models import User  # noqa: E402
from app.db.session import close_database  # noqa: E402
from app.mcp_server import READ_SCOPE, WRITE_SCOPE, register_domain_tools  # noqa: E402
from app.mcp_transport import HetuMCPServer  # noqa: E402
from app.services.local_workspace import (  # noqa: E402
    LOCAL_USER_ID,
    ensure_local_workspace,
)


def _validate_local_settings(settings: Settings) -> None:
    if settings.environment != "local" or not settings.sqlalchemy_database_url.startswith(
        "sqlite+aiosqlite:"
    ):
        raise ValueError("Local MCP requires ENVIRONMENT=local and a local SQLite DATABASE_URL")


async def authorize_local(db: AsyncSession, required_scope: str) -> str:
    """Use the same persisted personal account as the desktop API, never a model-supplied ID."""
    if required_scope not in {READ_SCOPE, WRITE_SCOPE}:
        raise ToolError("Unsupported local HETU scope")
    user = await db.get(User, LOCAL_USER_ID)
    if user is None or user.deleted_at is not None:
        raise ToolError("The personal HETU workspace is unavailable")
    return user.id


async def init_local_db(settings: Settings) -> None:
    """Initialize the desktop database and repair the personal identity mapping."""
    _validate_local_settings(settings)
    await ensure_local_workspace(settings)


def create_local_server(settings: Settings | None = None) -> MCPServer:
    current_settings = settings or get_settings()
    _validate_local_settings(current_settings)
    server = HetuMCPServer(
        "HETU",
        description="Operate your personal HETU preparation workspace on this computer.",
        instructions=(
            "Preserve the user's original goal, constraints, and corrections. "
            "Retrieve account evidence before acting; do not invent attempts, mastery, "
            "availability, or access to historical conversations. Save useful learning "
            "with source attribution and verify writes. "
            "Use get_profile to identify this personal workspace. "
            "For planning: read get_planner_day before editing existing blocks. "
            "For test screenshots: use save_test_analysis, crop questions to exclude "
            "solutions and answer markings, preserve unknown evidence, and return the "
            "saved app handoff link. Use the study, concept, review, recovery, revision "
            "pack, section, and task brief tools to continue the user's work."
        ),
        version="0.2.0",
    )

    async def authorize(db: AsyncSession, required_scope: str) -> str:
        _validate_local_settings(current_settings)
        return await authorize_local(db, required_scope)

    register_domain_tools(server, current_settings, authorize, authenticated=False)
    return server


async def main() -> None:
    # MCP stdout is reserved for JSON-RPC. Application logs must go to stderr.
    os.environ.setdefault("APP_URL", "http://127.0.0.1:8765")
    settings = get_settings()
    logging.basicConfig(format="%(message)s", stream=sys.stderr, level=settings.log_level.upper())
    configure_logging(settings.log_level)
    if not os.environ.get("DATABASE_URL"):
        raise ValueError(
            "Set DATABASE_URL to the desktop SQLite database or launch with npm run mcp; "
            "refusing to create a separate database in the current directory"
        )
    await init_local_db(settings)
    try:
        await create_local_server(settings).run_stdio_async()
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
