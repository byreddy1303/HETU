from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep
from app.schemas import RecordQuery
from app.services.section_context import (
    SECTION_COLLECTIONS,
    section_overview,
    section_record_detail,
    section_records,
)

router = APIRouter()


@router.get("")
async def sections(identity: CurrentUser) -> dict:
    del identity
    return {"sections": sorted(SECTION_COLLECTIONS)}


@router.get("/{section}")
async def overview(section: str, identity: CurrentUser, db: DbDep) -> dict:
    return await section_overview(db, owner_id=identity.user_id, section=section)


@router.get("/{section}/records/{collection}")
async def records(
    section: str,
    collection: str,
    identity: CurrentUser,
    db: DbDep,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> dict:
    return await section_records(
        db,
        owner_id=identity.user_id,
        section=section,
        collection=collection,
        cursor=cursor,
        limit=limit,
    )


@router.post("/{section}/records/{collection}/query")
async def query_section(
    section: str, collection: str, payload: RecordQuery, identity: CurrentUser, db: DbDep
) -> dict:
    return await section_records(
        db,
        owner_id=identity.user_id,
        section=section,
        collection=collection,
        query=payload,
    )


@router.get("/{section}/records/{collection}/{record_id}")
async def record_detail(
    section: str,
    collection: str,
    record_id: str,
    identity: CurrentUser,
    db: DbDep,
    include_history: bool = False,
) -> dict:
    return await section_record_detail(
        db,
        owner_id=identity.user_id,
        section=section,
        collection=collection,
        record_id=record_id,
        include_history=include_history,
    )
