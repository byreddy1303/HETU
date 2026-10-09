from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.revision_pack import (
    PackDraft,
    PackOptions,
    build_pack,
    get_saved_pack,
    list_saved_packs,
    save_pack,
)

router = APIRouter()


@router.get("")
async def preview(
    identity: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    as_of: date | None = None,
    subject: str | None = Query(default=None, min_length=1, max_length=160),
    limit: int = Query(default=10, ge=1, le=20),
) -> dict:
    return await build_pack(
        db,
        owner_id=identity.user_id,
        options=PackOptions(as_of=as_of, subject=subject, limit=limit),
        app_url=settings.app_url,
    )


@router.post("/saved")
async def save(draft: PackDraft, identity: CurrentUser, db: DbDep, settings: SettingsDep) -> dict:
    result = await save_pack(db, owner_id=identity.user_id, draft=draft, app_url=settings.app_url)
    await db.commit()
    return result


@router.get("/saved")
async def list_saved(
    identity: CurrentUser,
    db: DbDep,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await list_saved_packs(db, owner_id=identity.user_id, limit=limit, offset=offset)


@router.get("/saved/{pack_id}")
async def detail(pack_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await get_saved_pack(db, owner_id=identity.user_id, pack_id=pack_id)
