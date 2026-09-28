from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import Identity, authenticate_http_request
from app.db.session import get_db
from app.services.identities import resolve_identity

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DbDep,
    settings: SettingsDep,
) -> Identity:
    identity = await authenticate_http_request(request, settings)
    return await resolve_identity(db, identity)


CurrentUser = Annotated[Identity, Depends(get_current_user)]
