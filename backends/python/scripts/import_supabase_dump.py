from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.db.session import get_engine, get_session_factory
from app.services.source_import import (
    dump_hash,
    import_source_dump,
    nonempty_counts,
    parse_public_copy_dump,
    validate_source_tables,
)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a Supabase public COPY dump into PostgreSQL"
    )
    parser.add_argument("dump", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    tables = parse_public_copy_dump(args.dump)
    validate_source_tables(tables)
    print(
        {
            "source_hash": dump_hash(args.dump),
            "rows": sum(map(len, tables.values())),
            "nonempty": dict(nonempty_counts(tables)),
        }
    )
    if not args.check_only:
        async with get_session_factory()() as db:
            counts = await import_source_dump(db, args.dump)
            print({"status": "imported", "rows": sum(counts.values()), "tables": len(counts)})
    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(main())
