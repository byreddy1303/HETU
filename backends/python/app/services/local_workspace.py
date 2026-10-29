"""One persistent personal workspace shared by the desktop API and stdio MCP."""

from __future__ import annotations

import getpass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.base import Base
from app.db.models import User, UserIdentity
from app.db.session import get_engine, get_session_factory

LOCAL_USER_ID = "local_user"


def local_profile_defaults(settings: Settings) -> tuple[str, str]:
    username = settings.local_username.strip() or getpass.getuser()
    name = settings.local_display_name.strip()
    if not name:
        try:
            import pwd

            name = pwd.getpwnam(getpass.getuser()).pw_gecos.split(",", 1)[0].strip()
        except (ImportError, KeyError):
            pass
    return name or username or "Learner", username


async def ensure_local_workspace(
    settings: Settings,
    *,
    engine: AsyncEngine | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    if not settings.local_workspace:
        raise RuntimeError("The personal workspace requires ENVIRONMENT=local and SQLite")
    engine = engine if engine is not None else get_engine()
    session_factory = session_factory if session_factory is not None else get_session_factory()
    async with engine.begin() as connection:
        await connection.exec_driver_sql("BEGIN IMMEDIATE")
        await connection.run_sync(Base.metadata.create_all)

    name, username = local_profile_defaults(settings)
    async with session_factory() as db:
        # API and MCP may start together. Conflict-safe inserts keep one owner
        # without erasing existing records or replacing their permanent owner ID.
        await db.execute(
            insert(User)
            .values(
                id=LOCAL_USER_ID,
                display_name=name,
                username=username,
                profile={"role": "learner", "local": True},
            )
            .on_conflict_do_nothing()
        )
        await db.execute(
            insert(UserIdentity)
            .values(user_id=LOCAL_USER_ID, provider="local", subject=LOCAL_USER_ID)
            .on_conflict_do_nothing()
        )
        user = await db.get(User, LOCAL_USER_ID)
        mapped_id = await db.scalar(
            select(UserIdentity.user_id).where(
                UserIdentity.provider == "local", UserIdentity.subject == LOCAL_USER_ID
            )
        )
        if mapped_id != LOCAL_USER_ID:
            raise RuntimeError("The local identity is already mapped to another owner")
        if user is None or user.deleted_at is not None:
            raise RuntimeError("The local workspace owner is unavailable")
        if not user.display_name or user.display_name == "Local Learner":
            user.display_name = name
        if not user.username or user.username == "local_learner":
            user.username = username
        profile: dict[str, Any] = dict(user.profile or {})
        if profile.get("name") in ("Local Learner", "Local"):
            profile["name"] = user.display_name
        profile["local"] = True
        user.profile = profile
        await db.commit()
