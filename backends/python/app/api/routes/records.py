from __future__ import annotations

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.db.models import Record, RecordRevision
from app.schemas import RecordBatchUpsert, RecordListResponse, RecordPatch, RecordQuery
from app.services.realtime import broker
from app.services.records import (
    delete_record,
    patch_record,
    query_records,
    require_collection,
    restore_record,
    to_api,
    upsert_records,
)

router = APIRouter()


class RestoreRequest(BaseModel):
    revision: int = Field(ge=1)
    expected_version: int = Field(ge=1)


@router.get("/{collection}/{record_id}/history")
async def record_history(
    collection: str,
    record_id: str,
    identity: CurrentUser,
    db: DbDep,
    before_version: int | None = Query(default=None, ge=1),
) -> list[dict]:
    require_collection(collection)
    statement = (
        select(RecordRevision)
        .join(Record, Record.id == RecordRevision.record_id)
        .where(
            Record.collection == collection,
            Record.external_id == record_id,
            RecordRevision.owner_id == identity.user_id,
        )
    )
    if before_version is not None:
        statement = statement.where(RecordRevision.version < before_version)
    rows = await db.scalars(statement.order_by(RecordRevision.version.desc()).limit(100))
    return [row.snapshot for row in rows]


@router.post("/{collection}/{record_id}/restore")
async def restore_collection_record(
    collection: str, record_id: str, payload: RestoreRequest, identity: CurrentUser, db: DbDep
) -> dict:
    row = await restore_record(
        db,
        collection=collection,
        owner_id=identity.user_id,
        external_id=record_id,
        revision=payload.revision,
        expected_version=payload.expected_version,
    )
    await db.commit()
    return to_api(row)


@router.post("/{collection}/query", response_model=RecordListResponse)
async def query_collection(
    collection: str,
    payload: RecordQuery,
    identity: CurrentUser,
    db: DbDep,
) -> RecordListResponse:
    rows, next_cursor = await query_records(
        db, collection=collection, owner_id=identity.user_id, query=payload
    )
    return RecordListResponse(items=[to_api(row) for row in rows], next_cursor=next_cursor)


@router.put("/{collection}", response_model=list[dict])
async def upsert_collection(
    collection: str,
    payload: RecordBatchUpsert,
    identity: CurrentUser,
    db: DbDep,
) -> list[dict]:
    require_collection(collection)
    items = [item.model_dump(exclude_unset=True) for item in payload.items]
    rows = await upsert_records(db, collection=collection, owner_id=identity.user_id, items=items)
    await db.commit()
    for row in rows:
        await broker.publish(
            identity.user_id,
            {"type": "record.upserted", "collection": collection, "record": to_api(row)},
        )
    return [to_api(row) for row in rows]


@router.patch("/{collection}/{record_id}", response_model=dict)
async def patch_collection_record(
    collection: str,
    record_id: str,
    payload: RecordPatch,
    identity: CurrentUser,
    db: DbDep,
) -> dict:
    row = await patch_record(
        db,
        collection=collection,
        owner_id=identity.user_id,
        external_id=record_id,
        patch=payload.data,
        expected_version=payload.expected_version,
    )
    await db.commit()
    await broker.publish(
        identity.user_id,
        {"type": "record.updated", "collection": collection, "record": to_api(row)},
    )
    return to_api(row)


@router.delete("/{collection}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection_record(
    collection: str,
    record_id: str,
    identity: CurrentUser,
    db: DbDep,
    expected_version: int | None = Query(default=None, ge=1),
) -> Response:
    await delete_record(
        db,
        collection=collection,
        owner_id=identity.user_id,
        external_id=record_id,
        expected_version=expected_version,
    )
    await db.commit()
    await broker.publish(
        identity.user_id,
        {"type": "record.deleted", "collection": collection, "id": record_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
