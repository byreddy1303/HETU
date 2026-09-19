"""Consistent PostgreSQL backup with a manifest; verification never restores over data.

Requires PostgreSQL client binaries on PATH. Credentials stay in environment, not
process arguments. Store output on encrypted storage and replicate off-account.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit

import asyncpg


async def fingerprint(connection: asyncpg.Connection) -> dict:
    tables = await connection.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    result = {}
    for entry in tables:
        name = entry["tablename"]
        quoted = '"' + name.replace('"', '""') + '"'
        digest = hashlib.sha256()
        count = 0
        async for row in connection.cursor(
            f"SELECT to_jsonb(t)::text AS row FROM public.{quoted} t "
            'ORDER BY to_jsonb(t)::text COLLATE "C"'
        ):
            digest.update(row["row"].encode() + b"\n")
            count += 1
        result[name] = {"rows": count, "sha256": digest.hexdigest()}
    return result


def file_hash(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


async def backup(url: str, directory: Path) -> None:
    await asyncio.to_thread(directory.mkdir, mode=0o700, parents=True, exist_ok=False)
    source = await asyncpg.connect(url)
    try:
        async with source.transaction(isolation="repeatable_read", readonly=True):
            snapshot = await source.fetchval("SELECT pg_export_snapshot()")
            parts = urlsplit(url)
            env = {
                **os.environ,
                "PGHOST": parts.hostname or "",
                "PGPORT": str(parts.port or 5432),
                "PGUSER": unquote(parts.username or ""),
                "PGPASSWORD": unquote(parts.password or ""),
                "PGDATABASE": unquote(parts.path.lstrip("/")),
            }
            # libpq honors URL SSL options without exposing its password in argv.
            env["PGDATABASE"] = url
            dump = directory / "database.dump"
            with dump.open("xb") as output:
                process = await asyncio.create_subprocess_exec(
                    "pg_dump",
                    "--format=custom",
                    "--no-owner",
                    "--no-acl",
                    f"--snapshot={snapshot}",
                    env=env,
                    stdout=output,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, error = await process.communicate()
                if process.returncode:
                    # Do not echo driver messages which may contain credentials.
                    raise RuntimeError("pg_dump failed; backup is incomplete")
            manifest = {
                "format": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "dump_sha256": file_hash(dump),
                "tables": await fingerprint(source),
            }
            with (directory / "manifest.json").open("x") as output:
                json.dump(manifest, output, indent=2)
        print(f"Backup and manifest complete: {directory}")
    finally:
        await source.close()


async def verify(url: str, directory: Path) -> None:
    manifest = json.loads((directory / "manifest.json").read_text())
    if file_hash(directory / "database.dump") != manifest["dump_sha256"]:
        raise RuntimeError("Backup checksum mismatch")
    connection = await asyncpg.connect(url)
    try:
        async with connection.transaction(isolation="repeatable_read", readonly=True):
            actual = await fingerprint(connection)
        if actual != manifest["tables"]:
            raise RuntimeError("Restored rows differ from backup manifest; do not cut over")
        print("Recovery verified: all public table counts and content hashes match")
    finally:
        await connection.close()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["backup", "verify"])
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    variable = "BACKUP_DATABASE_URL" if args.mode == "backup" else "RESTORED_DATABASE_URL"
    url = os.environ.get(variable)
    if not url:
        raise SystemExit(f"{variable} is required (use a direct Postgres URL)")
    if args.mode == "backup":
        await backup(url, args.directory)
    else:
        await verify(url, args.directory)


if __name__ == "__main__":
    asyncio.run(main())
