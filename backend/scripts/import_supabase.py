"""Import user-owned Supabase rows into the Hetu record API schema.

The script is dry-run by default. It requires an explicit old-user-id to Clerk
user-id JSON map because authentication identities cannot be inferred safely.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

import asyncpg

from app.db.models import User
from app.db.session import get_session_factory
from app.services.records import COLLECTIONS, upsert_records

OWNED_COLLECTIONS = tuple(
    sorted(
        COLLECTIONS
        - {
            "buddies",
            "buddy_messages",
            "question_shares",
            "shared_insights",
            "study_room_presence",
            "study_rooms",
        }
    )
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-url", default=os.getenv("SUPABASE_DATABASE_URL"))
    parser.add_argument("--user-map", type=Path, required=True)
    parser.add_argument(
        "--apply", action="store_true", help="Commit the import; default is dry-run"
    )
    return parser.parse_args()


def json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, bytes):
        raise ValueError("Binary columns must be migrated to R2 before import")
    if isinstance(value, dict):
        return {str(key): json_safe(nested) for key, nested in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    return value


def external_id(collection: str, row: dict[str, Any]) -> str:
    if row.get("id") is not None:
        return str(row["id"])
    stable = json.dumps(row, sort_keys=True, default=str)
    return str(uuid5(NAMESPACE_URL, f"hetu:{collection}:{stable}"))


async def import_rows(source_url: str, user_map: dict[str, str], apply: bool) -> None:
    source = await asyncpg.connect(source_url)
    counts: dict[str, int] = {}
    try:
        async with get_session_factory()() as destination:
            for clerk_id in sorted(set(user_map.values())):
                if await destination.get(User, clerk_id) is None:
                    destination.add(User(id=clerk_id))
            await destination.flush()

            for collection in OWNED_COLLECTIONS:
                exists = await source.fetchval("SELECT to_regclass($1)", f"public.{collection}")
                if not exists:
                    continue
                source_rows = await source.fetch(f'SELECT * FROM public."{collection}"')
                by_owner: dict[str, list[dict[str, Any]]] = {}
                for source_row in source_rows:
                    row = dict(source_row)
                    old_owner = row.pop("user_id", None)
                    if old_owner is None:
                        continue
                    clerk_owner = user_map.get(str(old_owner))
                    if clerk_owner is None:
                        raise RuntimeError(
                            f"Missing Clerk mapping for Supabase user {old_owner} ({collection})"
                        )
                    row_id = external_id(collection, row)
                    row.pop("id", None)
                    by_owner.setdefault(clerk_owner, []).append({"id": row_id, **json_safe(row)})
                for owner_id, rows in by_owner.items():
                    for offset in range(0, len(rows), 100):
                        await upsert_records(
                            destination,
                            collection=collection,
                            owner_id=owner_id,
                            items=rows[offset : offset + 100],
                        )
                counts[collection] = len(source_rows)

            if apply:
                await destination.commit()
            else:
                await destination.rollback()
    finally:
        await source.close()

    mode = "imported" if apply else "would import"
    for collection, count in counts.items():
        print(f"{collection}: {mode} {count} source rows")
    if not apply:
        print("Dry run complete. Re-run with --apply after reviewing counts.")


async def async_main() -> None:
    args = parse_args()
    if not args.source_url:
        raise SystemExit("--source-url or SUPABASE_DATABASE_URL is required")
    user_map = json.loads(args.user_map.read_text())
    if not isinstance(user_map, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in user_map.items()
    ):
        raise SystemExit("--user-map must be a JSON object of Supabase UUID to Clerk user ID")
    await import_rows(args.source_url, user_map, args.apply)


if __name__ == "__main__":
    asyncio.run(async_main())
