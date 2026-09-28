from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.db.models import DataImport, Record, User
from app.services.source_import import (
    import_source_dump,
    parse_public_copy_dump,
    validate_source_tables,
)


def write_dump(path: Path) -> None:
    path.write_text(
        'COPY "public"."users" '
        '("id", "name", "email", "username", "created_at") FROM stdin;\n'
        "user-1\tAlex\talex@example.com\talex\t2026-09-01 00:00:00+00\n"
        "\\.\n"
        'COPY "public"."sessions" '
        '("id", "user_id", "subject", "actual_duration_min", "insight", '
        '"created_at") FROM stdin;\n'
        "session-1\tuser-1\tAlgorithms\t45\tline one\\nline two\t"
        "2026-09-02 00:00:00+00\n"
        "\\.\n"
        'COPY "public"."pyq_attempts" '
        '("id", "user_id", "selected_answer", "mark_correct", "created_at") '
        "FROM stdin;\n"
        'attempt-1\tuser-1\t"B"\tt\t2026-09-03 00:00:00+00\n'
        "\\.\n"
    )


def test_copy_parser_preserves_json_booleans_and_escaped_text(tmp_path: Path) -> None:
    dump = tmp_path / "source.sql"
    write_dump(dump)
    tables = parse_public_copy_dump(dump)
    assert tables["sessions"][0]["actual_duration_min"] == 45
    assert tables["sessions"][0]["insight"] == "line one\nline two"
    assert tables["pyq_attempts"][0]["selected_answer"] == "B"
    assert tables["pyq_attempts"][0]["mark_correct"] is True
    assert validate_source_tables(tables) == {
        "users": 1,
        "sessions": 1,
        "pyq_attempts": 1,
    }


@pytest.mark.asyncio
async def test_source_import_is_complete_and_idempotent(db, tmp_path: Path) -> None:
    dump = tmp_path / "source.sql"
    write_dump(dump)

    first = await import_source_dump(db, dump)
    second = await import_source_dump(db, dump)

    assert first == second == {"users": 1, "sessions": 1, "pyq_attempts": 1}
    user = await db.get(User, "user-1")
    assert user is not None and user.email == "alex@example.com"
    records = list(await db.scalars(select(Record).order_by(Record.collection)))
    assert [(row.collection, row.external_id) for row in records] == [
        ("pyq_attempts", "attempt-1"),
        ("sessions", "session-1"),
    ]
    assert records[0].data["selected_answer"] == "B"
    assert await db.scalar(select(func.count()).select_from(DataImport)) == 1
