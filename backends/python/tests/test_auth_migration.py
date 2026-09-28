from pathlib import Path

import pytest

from app.services.auth_migration import parse_supabase_auth_users


def test_parses_bcrypt_users_without_plaintext(tmp_path: Path) -> None:
    dump = tmp_path / "auth.sql"
    digest = "$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuu"
    dump.write_text(
        'COPY "auth"."users" ("id", "email", "encrypted_password") FROM stdin;\n'
        f"source-user\tuser@example.com\t{digest}\n"
        "\\.\n"
    )
    users = parse_supabase_auth_users(dump)
    assert [(user.user_id, user.password_digest) for user in users] == [
        ("source-user", digest)
    ]


def test_rejects_non_bcrypt_credentials(tmp_path: Path) -> None:
    dump = tmp_path / "auth.sql"
    dump.write_text(
        'COPY "auth"."users" ("id", "encrypted_password") FROM stdin;\n'
        "source-user\tunsupported-hash\n"
        "\\.\n"
    )
    with pytest.raises(ValueError, match="bcrypt"):
        parse_supabase_auth_users(dump)
