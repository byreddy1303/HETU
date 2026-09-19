from __future__ import annotations

import base64
import json
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import Float, String, cast, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.schemas import QueryFilter, RecordQuery

COLLECTIONS = frozenset(
    {
        "account_state",
        "buddies",
        "buddy_messages",
        "doubt_sessions",
        "formulas",
        "insights_daily",
        "interruption_logs",
        "learning_events",
        "learning_items",
        "llm_usage_daily",
        "mock_tests",
        "patterns",
        "plan_item_completions",
        "plan_items",
        "planner_day_plans",
        "push_subscriptions",
        "pyq_attempts",
        "pyq_sessions",
        "question_shares",
        "questions",
        "readiness_snapshots",
        "reattempts",
        "recovery_sessions",
        "sessions",
        "shared_insights",
        "study_notification_preferences",
        "study_room_presence",
        "study_rooms",
        "telegram_subscriptions",
        "topic_progress",
        "triangulate_logs",
        "trigger_phrases",
        "variations",
        "weekly_reviews",
    }
)
IMMUTABLE_COLLECTIONS = frozenset({"learning_events", "pyq_attempts"})
RESERVED_FIELDS = frozenset(
    {
        "id",
        "user_id",
        "owner_id",
        "collection",
        "version",
        "created_at",
        "updated_at",
        "expected_version",
    }
)
FIELD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


def require_collection(collection: str) -> str:
    if collection not in COLLECTIONS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown collection")
    return collection


def to_api(record: Record) -> dict[str, Any]:
    return {
        **record.data,
        "id": record.external_id,
        "user_id": record.owner_id,
        "version": record.version,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def clean_payload(raw: dict[str, Any]) -> tuple[str, int | None, dict[str, Any]]:
    external_id = raw.get("id") or str(uuid4())
    if not isinstance(external_id, str) or not external_id or len(external_id) > 128:
        raise HTTPException(status_code=422, detail="Record id must be a non-empty string")
    expected = raw.get("expected_version")
    payload = {key: _json_safe(value) for key, value in raw.items() if key not in RESERVED_FIELDS}
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > 1024 * 1024:
        raise HTTPException(status_code=413, detail="Record exceeds the 1 MiB limit")
    return external_id, expected if isinstance(expected, int) else None, payload


async def upsert_records(
    db: AsyncSession,
    *,
    collection: str,
    owner_id: str,
    items: list[dict[str, Any]],
) -> list[Record]:
    require_collection(collection)
    output: list[Record] = []
    for raw in items:
        external_id, expected, payload = clean_payload(raw)
        existing = await db.scalar(
            select(Record).where(
                Record.collection == collection,
                Record.owner_id == owner_id,
                Record.external_id == external_id,
            )
        )
        if existing is None:
            if expected is not None:
                raise HTTPException(status_code=409, detail=f"Record {external_id} does not exist")
            existing = Record(
                collection=collection,
                owner_id=owner_id,
                external_id=external_id,
                data=payload,
            )
            db.add(existing)
        else:
            if collection in IMMUTABLE_COLLECTIONS:
                if existing.data != payload:
                    raise HTTPException(
                        status_code=409, detail=f"{collection} records are append-only"
                    )
                output.append(existing)
                continue
            if expected is not None and existing.version != expected:
                raise HTTPException(
                    status_code=409,
                    detail={"message": "Version conflict", "current_version": existing.version},
                )
            existing.data = payload
            existing.version += 1
            existing.updated_at = datetime.now(UTC)
        output.append(existing)
    await db.flush()
    return output


async def patch_record(
    db: AsyncSession,
    *,
    collection: str,
    owner_id: str,
    external_id: str,
    patch: dict[str, Any],
    expected_version: int | None,
) -> Record:
    require_collection(collection)
    if collection in IMMUTABLE_COLLECTIONS:
        raise HTTPException(status_code=409, detail=f"{collection} records are append-only")
    record = await _owned_record(db, collection, owner_id, external_id)
    if expected_version is not None and record.version != expected_version:
        raise HTTPException(
            status_code=409,
            detail={"message": "Version conflict", "current_version": record.version},
        )
    _, _, cleaned = clean_payload({"id": external_id, **patch})
    record.data = {**record.data, **cleaned}
    record.version += 1
    record.updated_at = datetime.now(UTC)
    await db.flush()
    return record


async def delete_record(
    db: AsyncSession,
    *,
    collection: str,
    owner_id: str,
    external_id: str,
    expected_version: int | None = None,
) -> None:
    require_collection(collection)
    if collection in IMMUTABLE_COLLECTIONS:
        raise HTTPException(status_code=409, detail=f"{collection} records are append-only")
    conditions = [
        Record.collection == collection,
        Record.owner_id == owner_id,
        Record.external_id == external_id,
    ]
    if expected_version is not None:
        conditions.append(Record.version == expected_version)
    result = await db.execute(delete(Record).where(*conditions))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Record not found or version conflict")


async def query_records(
    db: AsyncSession,
    *,
    collection: str,
    owner_id: str,
    query: RecordQuery,
) -> tuple[list[Record], str | None]:
    require_collection(collection)
    offset = _decode_cursor(query.cursor)
    statement = select(Record).where(
        Record.collection == collection,
        Record.owner_id == owner_id,
    )
    for filter_ in query.filters:
        statement = statement.where(_filter_expression(filter_))

    order_column = _record_column(query.order_by)
    if order_column is None:
        order_column = Record.data[query.order_by].as_string()
    statement = statement.order_by(
        order_column.desc() if query.descending else order_column.asc(),
        Record.id.desc() if query.descending else Record.id.asc(),
    )
    statement = statement.offset(offset).limit(query.limit + 1)
    rows = list((await db.scalars(statement)).all())
    has_more = len(rows) > query.limit
    rows = rows[: query.limit]
    return rows, _encode_cursor(offset + len(rows)) if has_more else None


async def _owned_record(
    db: AsyncSession, collection: str, owner_id: str, external_id: str
) -> Record:
    record = await db.scalar(
        select(Record).where(
            Record.collection == collection,
            Record.owner_id == owner_id,
            Record.external_id == external_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


def _filter_expression(filter_: QueryFilter):
    column = _record_column(filter_.field)
    if column is None:
        column = Record.data[filter_.field]
    value = filter_.value
    if filter_.op == "is":
        return column.is_(None) if value is None else column.is_not(None)

    scalar = column
    if _record_column(filter_.field) is None:
        scalar = cast(column.as_string(), Float if isinstance(value, (int, float)) else String)
    if filter_.op == "eq":
        return scalar == value
    if filter_.op == "neq":
        return scalar != value
    if filter_.op == "in":
        if not isinstance(value, list) or len(value) > 100:
            raise HTTPException(
                status_code=422, detail="'in' requires a list of at most 100 values"
            )
        return scalar.in_(value)
    if filter_.op == "gt":
        return scalar > value
    if filter_.op == "gte":
        return scalar >= value
    if filter_.op == "lt":
        return scalar < value
    if filter_.op == "lte":
        return scalar <= value
    raise HTTPException(status_code=422, detail="Unsupported filter")


def _record_column(field: str):
    return {
        "id": Record.external_id,
        "user_id": Record.owner_id,
        "version": Record.version,
        "created_at": Record.created_at,
        "updated_at": Record.updated_at,
    }.get(field)


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode().rstrip("=")


def _decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = int(base64.urlsafe_b64decode(padded).decode())
        if value < 0 or value > 10_000_000:
            raise ValueError
        return value
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid cursor") from exc


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(nested) for key, nested in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value
