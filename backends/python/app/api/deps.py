from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import Identity, authenticate_http_request
from app.db.models import User
from app.db.session import get_db
from app.services.records import lock_identity

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DbDep,
    settings: SettingsDep,
) -> Identity:
    identity = await authenticate_http_request(request, settings)
    await lock_identity(db, "users", identity.user_id, "identity")
    user = await db.get(User, identity.user_id)
    if user is None:
        db.add(User(id=identity.user_id))
        await db.commit()
    elif user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="This account has been deleted")
    return identity


CurrentUser = Annotated[Identity, Depends(get_current_user)]
