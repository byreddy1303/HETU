from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AccessRequest,
    Buddy,
    BuddyMessage,
    DataImport,
    Invite,
    Record,
    User,
)

COPY_PATTERN = re.compile(r'^COPY (?:(?:"?public"?)\.)?"?([^" ]+)"? \(([^)]+)\) FROM stdin;$')
NORMALIZED_TABLES = frozenset({"users", "account_requests", "invites", "buddies", "buddy_messages"})
IMMUTABLE_COLLECTIONS = frozenset({"learning_events", "pyq_attempts"})
JSON_COLUMNS = frozenset(
    {
        "payload",
        "question_ref",
        "metadata",
        "sessions",
        "plan",
        "config",
        "selected_answer",
        "correct_answer",
        "question_snapshot",
        "history",
        "evidence_counts",
        "components",
        "subject_scores",
        "mistakes",
        "queue_snapshot",
        "draft_answer",
        "elapsed_by_item_ms",
        "answer",
    }
)
ARRAY_COLUMNS = frozenset(
    {
        "question_uids",
        "completed_question_uids",
        "item_ids",
        "deferred_item_ids",
        "hinted_item_ids",
        "question_ids",
        "allowed_actions",
        "used_actions",
        "participants",
        "reason_flags",
    }
)


def _copy_unescape(value: str) -> str:
    replacements = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
    output: list[str] = []
    index = 0
    while index < len(value):
        if value[index] != "\\" or index + 1 >= len(value):
            output.append(value[index])
            index += 1
            continue
        index += 1
        marker = value[index]
        if marker in replacements:
            output.append(replacements[marker])
            index += 1
        elif marker.isdigit():
            digits = value[index : index + 3]
            match = re.match(r"[0-7]{1,3}", digits)
            assert match is not None
            output.append(chr(int(match.group(), 8)))
            index += len(match.group())
        else:
            output.append(marker)
            index += 1
    return "".join(output)


def _postgres_array(value: str) -> list[str]:
    if value == "{}":
        return []
    return next(csv.reader(io.StringIO(value[1:-1]), escapechar="\\"))


def _typed_value(column: str, raw: str) -> Any:
    if raw == r"\N":
        return None
    value = _copy_unescape(raw)
    if column in JSON_COLUMNS:
        return json.loads(value)
    if column in ARRAY_COLUMNS:
        return _postgres_array(value)
    if value in {"t", "f"}:
        return value == "t"
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def parse_public_copy_dump(path: Path) -> dict[str, list[dict[str, Any]]]:
    tables: dict[str, list[dict[str, Any]]] = {}
    current: str | None = None
    columns: list[str] = []
    with path.open() as source:
        for line in source:
            if current is None:
                match = COPY_PATTERN.match(line.rstrip("\n"))
                if match:
                    current = match.group(1)
                    columns = [part.strip().strip('"') for part in match.group(2).split(",")]
                    tables[current] = []
                continue
            if line == "\\.\n":
                current = None
                columns = []
                continue
            values = line.rstrip("\n").split("\t")
            if len(values) != len(columns):
                raise ValueError(f"Malformed COPY row in {current}")
            parsed: dict[str, Any] = {}
            for column, value in zip(columns, values, strict=True):
                try:
                    parsed[column] = _typed_value(column, value)
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"Cannot parse {current}.{column}") from exc
            tables[current].append(parsed)
    return tables


def dump_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _timestamp(value: Any, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return fallback or datetime.now(UTC)


def _timestamps(row: dict[str, Any], *fields: str) -> dict[str, Any]:
    values = dict(row)
    for field in fields:
        if values.get(field) is not None:
            values[field] = _timestamp(values[field])
    return values


def _record_owner(table: str, row: dict[str, Any], subscriptions: dict[str, str]) -> str:
    for field in ("user_id", "recipient_id", "from_user", "created_by", "reply_sender_id"):
        if row.get(field):
            return str(row[field])
    if table == "buddy_notification_deliveries" and row.get("subscription_id"):
        owner = subscriptions.get(str(row["subscription_id"]))
        if owner:
            return owner
    raise ValueError(f"Cannot determine owner for {table}")


def _external_id(table: str, row: dict[str, Any]) -> str:
    if row.get("id") is not None:
        value = str(row["id"])
    else:
        keys = {
            "account_state": ("namespace",),
            "buddy_notification_deliveries": ("message_id", "subscription_id"),
            "buddy_notification_outbox": ("message_id",),
            "buddy_notification_reply_tokens": ("token_hash",),
            "llm_usage_daily": ("day",),
            "notification_action_tokens": ("token_hash",),
            "planner_day_plans": ("plan_date",),
            "readiness_snapshots": ("on_date",),
            "study_notification_preferences": ("category",),
            "telegram_subscriptions": ("user_id",),
        }.get(table)
        if not keys:
            raise ValueError(f"No stable identity for {table}")
        value = ":".join(str(row[key]) for key in keys)
    if len(value) <= 128:
        return value
    return f"source:{hashlib.sha256(value.encode()).hexdigest()}"


def validate_source_tables(tables: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    users = {str(row["id"]) for row in tables.get("users", [])}
    subscriptions = {
        str(row["id"]): str(row["user_id"]) for row in tables.get("push_subscriptions", [])
    }
    for table, rows in tables.items():
        if table in NORMALIZED_TABLES:
            continue
        for row in rows:
            owner = _record_owner(table, row, subscriptions)
            if owner not in users:
                raise ValueError(f"{table} references unknown user {owner}")
            _external_id(table, row)
    return {table: len(rows) for table, rows in tables.items()}


async def import_source_dump(db: AsyncSession, path: Path) -> dict[str, int]:
    source_hash = dump_hash(path)
    previous = await db.scalar(select(DataImport).where(DataImport.source_hash == source_hash))
    if previous:
        return {key: int(value) for key, value in previous.row_counts.items()}
    tables = parse_public_copy_dump(path)
    counts = validate_source_tables(tables)

    for row in tables.get("users", []):
        user_id = str(row["id"])
        user = await db.get(User, user_id)
        profile = {
            key: value
            for key, value in row.items()
            if key not in {"id", "email", "username", "name", "created_at"}
        }
        if user is None:
            db.add(
                User(
                    id=user_id,
                    email=row.get("email"),
                    username=row.get("username"),
                    display_name=row.get("name"),
                    profile=profile,
                    created_at=_timestamp(row.get("created_at")),
                    updated_at=_timestamp(row.get("created_at")),
                )
            )
        elif user.email != row.get("email") or user.profile != profile:
            user.email = row.get("email")
            user.username = row.get("username")
            user.display_name = row.get("name")
            user.profile = profile
    await db.flush()

    for row in tables.get("account_requests", []):
        if await db.get(AccessRequest, str(row["id"])) is None:
            created = _timestamp(row.get("created_at"))
            values = _timestamps(row, "created_at", "decided_at")
            db.add(AccessRequest(**values, updated_at=created))
    for row in tables.get("invites", []):
        if await db.get(Invite, str(row["id"])) is None:
            created = _timestamp(row.get("created_at"))
            values = _timestamps(row, "created_at", "expires_at", "used_at")
            db.add(Invite(**values, email=None, updated_at=created))
    for row in tables.get("buddies", []):
        if await db.get(Buddy, str(row["id"])) is None:
            created = _timestamp(row.get("created_at"))
            values = _timestamps(row, "created_at", "responded_at", "last_request_at")
            db.add(Buddy(**values, updated_at=created))
    await db.flush()
    for row in tables.get("buddy_messages", []):
        if await db.get(BuddyMessage, str(row["id"])) is None:
            db.add(BuddyMessage(**_timestamps(row, "created_at", "read_at")))

    existing_records = {
        (record.collection, record.owner_id, record.external_id): record
        for record in await db.scalars(select(Record))
    }
    subscriptions = {
        str(row["id"]): str(row["user_id"]) for row in tables.get("push_subscriptions", [])
    }
    for table, rows in tables.items():
        if table in NORMALIZED_TABLES:
            continue
        for row in rows:
            owner = _record_owner(table, row, subscriptions)
            external_id = _external_id(table, row)
            created = _timestamp(row.get("created_at"))
            updated = _timestamp(row.get("updated_at"), created)
            deleted = row.get("deleted_at")
            payload = {
                key: value
                for key, value in row.items()
                if key not in {"id", "user_id", "created_at", "updated_at", "deleted_at"}
            }
            identity = (table, owner, external_id)
            record = existing_records.get(identity)
            if record is None:
                record = Record(
                    collection=table,
                    owner_id=owner,
                    external_id=external_id,
                    data=payload,
                    version=1,
                    created_at=created,
                    updated_at=updated,
                    deleted_at=_timestamp(deleted) if deleted else None,
                )
                db.add(record)
                existing_records[identity] = record
            elif record.data != payload:
                if table in IMMUTABLE_COLLECTIONS:
                    raise ValueError(f"Immutable source row changed: {table}/{external_id}")
                record.data = payload
                record.version += 1
                record.updated_at = updated
                record.deleted_at = _timestamp(deleted) if deleted else None

    db.add(
        DataImport(
            id=str(uuid4()),
            source="supabase-public-copy",
            source_hash=source_hash,
            row_counts=counts,
        )
    )
    await db.commit()
    return counts


def nonempty_counts(tables: dict[str, list[dict[str, Any]]]) -> Counter[str]:
    return Counter({table: len(rows) for table, rows in tables.items() if rows})
