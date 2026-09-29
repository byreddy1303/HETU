from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.db.models import AccessRequest, Buddy, BuddyMessage, DataImport, Invite, Record, User
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


@pytest.mark.asyncio
async def test_delta_import_updates_mutable_normalized_rows(db, tmp_path: Path) -> None:
    dump = tmp_path / "source.sql"

    def write_state(*, updated: bool) -> None:
        used_by = "user-2" if updated else r"\N"
        read_at = "2026-09-02 00:00:00+00" if updated else r"\N"
        dump.write_text(
            'COPY "public"."users" '
            '("id", "name", "email", "username", "created_at") FROM stdin;\n'
            f"user-1\t{'New name' if updated else 'Old name'}\ta@example.com\t"
            f"{'newname' if updated else 'oldname'}\t2026-09-01 00:00:00+00\n"
            "user-2\tSecond\tb@example.com\tsecond\t2026-09-01 00:00:00+00\n"
            "\\.\n"
            'COPY "public"."account_requests" '
            '("id", "name", "email", "purpose", "status", "created_at") FROM stdin;\n'
            "request-1\tApplicant\trequest@example.com\tStudy\t"
            f"{'approved' if updated else 'pending'}\t2026-09-01 00:00:00+00\n"
            "\\.\n"
            'COPY "public"."invites" '
            '("id", "token", "issued_by", "used_by", "expires_at", "created_at") FROM stdin;\n'
            f"invite-1\ttoken-1\tuser-1\t{used_by}\t"
            "2026-10-01 00:00:00+00\t2026-09-01 00:00:00+00\n"
            "\\.\n"
            'COPY "public"."buddies" '
            '("id", "user_a", "user_b", "status", "created_at") FROM stdin;\n'
            f"buddy-1\tuser-1\tuser-2\t{'active' if updated else 'pending'}\t"
            "2026-09-01 00:00:00+00\n"
            "\\.\n"
            'COPY "public"."buddy_messages" '
            '("id", "buddy_id", "sender_id", "kind", "body", "created_at", "read_at") '
            "FROM stdin;\n"
            "message-1\tbuddy-1\tuser-1\ttext\tHello\t"
            "2026-09-01 00:00:00+00\t"
            f"{read_at}\n"
            "\\.\n"
        )

    write_state(updated=False)
    await import_source_dump(db, dump)
    write_state(updated=True)
    await import_source_dump(db, dump)

    user = await db.get(User, "user-1")
    request = await db.get(AccessRequest, "request-1")
    invite = await db.get(Invite, "invite-1")
    buddy = await db.get(Buddy, "buddy-1")
    message = await db.get(BuddyMessage, "message-1")
    assert user is not None and (user.display_name, user.username) == ("New name", "newname")
    assert request is not None and request.status == "approved"
    assert invite is not None and invite.used_by == "user-2"
    assert buddy is not None and buddy.status == "active"
    assert message is not None and message.read_at is not None
    assert await db.scalar(select(func.count()).select_from(DataImport)) == 2
