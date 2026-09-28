from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

COPY_PATTERN = re.compile(
    r'^COPY (?:(?:"?auth"?)\.)?"?users"? \(([^)]+)\) FROM stdin;$'
)


@dataclass(frozen=True, slots=True)
class LegacyAuthUser:
    user_id: str
    password_digest: str


def parse_supabase_auth_users(path: Path) -> list[LegacyAuthUser]:
    columns: list[str] = []
    users: list[LegacyAuthUser] = []
    inside = False
    with path.open() as source:
        for line in source:
            if not inside:
                match = COPY_PATTERN.match(line.rstrip("\n"))
                if match:
                    columns = [part.strip().strip('"') for part in match.group(1).split(",")]
                    inside = True
                continue
            if line == "\\.\n":
                break
            values = line.rstrip("\n").split("\t")
            if len(values) != len(columns):
                raise ValueError("Malformed auth.users COPY row")
            row = dict(zip(columns, values, strict=True))
            user_id = row.get("id", "")
            digest = row.get("encrypted_password", "")
            if not user_id or not digest.startswith(("$2a$", "$2b$", "$2y$")):
                raise ValueError("Every migrated auth user must have a bcrypt digest")
            users.append(LegacyAuthUser(user_id=user_id, password_digest=digest))
    if not inside:
        raise ValueError("The dump does not contain auth.users")
    if len({user.user_id for user in users}) != len(users):
        raise ValueError("The auth dump contains duplicate user IDs")
    return users
