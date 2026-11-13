"""Forward-only SQLite upgrades with a verified snapshot before persistent DDL."""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import closing
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine

from app.services.local_backup import BackupBusy, _backup_lock, backup_database

SCHEMA_VERSION = 1


def migrate_database(path: Path) -> None:
    path = path.resolve()
    if not path.is_file():
        return
    with _backup_lock(path.parent / "schema-upgrades"):
        with closing(sqlite3.connect(path, timeout=30)) as db:
            tables = {
                row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            version = (
                db.execute("SELECT version FROM hetu_schema_version WHERE id=1").fetchone()[0]
                if "hetu_schema_version" in tables
                else 0
            )
            if version > SCHEMA_VERSION:
                raise RuntimeError(
                    "This workspace was upgraded by a newer HETU. Use that version; "
                    "the database has not been changed."
                )
            if version == SCHEMA_VERSION or "records" not in tables:
                return
            backup_database(
                path,
                path.parent / "schema-upgrades" / f"before-v{SCHEMA_VERSION}",
                sync_icloud=False,
            )
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "CREATE TABLE IF NOT EXISTS hetu_schema_version (id INTEGER PRIMARY "
                "KEY CHECK(id=1), version INTEGER NOT NULL, upgraded_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS ix_records_local_memory_skill ON "
                "records(owner_id, collection, json_extract(data, '$.data.skill_id'), deleted_at)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS ix_records_local_session_repair ON "
                "records(owner_id, collection, json_extract(data, "
                "'$.config.memoryRepairId'), deleted_at)"
            )
            db.execute(
                "INSERT INTO hetu_schema_version(id,version,upgraded_at) "
                "VALUES(1,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET "
                "version=excluded.version, upgraded_at=excluded.upgraded_at",
                (SCHEMA_VERSION,),
            )
            db.commit()


async def migrate_local_schema(engine: AsyncEngine) -> None:
    database = engine.url.database
    if not database or database == ":memory:":
        return
    for attempt in range(100):
        try:
            await asyncio.to_thread(migrate_database, Path(database))
            return
        except BackupBusy:
            if attempt == 99:
                raise RuntimeError(
                    "Another HETU process is upgrading this workspace. Retry shortly."
                ) from None
            await asyncio.sleep(0.1)
