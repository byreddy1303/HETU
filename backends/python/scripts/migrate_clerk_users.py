from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.db.models import User, UserIdentity
from app.db.session import get_engine, get_session_factory
from app.services.auth_migration import parse_supabase_auth_users


async def clerk_users(client: httpx.AsyncClient) -> dict[str, dict[str, Any]]:
    response = await client.get("/v1/users", params={"limit": 100})
    response.raise_for_status()
    users = response.json()
    return {
        str(user["external_id"]): user for user in users if isinstance(user.get("external_id"), str)
    }


async def migrate(path: Path, check_only: bool) -> None:
    legacy_users = parse_supabase_auth_users(path)
    settings = get_settings()
    secret = settings.clerk_secret_key.get_secret_value() if settings.clerk_secret_key else ""
    if not secret:
        raise RuntimeError("CLERK_SECRET_KEY is required")

    async with get_session_factory()() as db:
        database_users = {user.id: user for user in await db.scalars(select(User))}
        if set(database_users) != {user.user_id for user in legacy_users}:
            raise RuntimeError("Supabase Auth users do not exactly match PostgreSQL users")
        existing_mappings = {
            mapping.user_id: mapping
            for mapping in await db.scalars(
                select(UserIdentity).where(UserIdentity.provider == "clerk")
            )
        }

        async with httpx.AsyncClient(
            base_url="https://api.clerk.com",
            headers={"Authorization": f"Bearer {secret}"},
            timeout=30,
        ) as client:
            by_external_id = await clerk_users(client)
            if check_only:
                print(
                    {
                        "legacy_users": len(legacy_users),
                        "clerk_users": len(by_external_id),
                        "identity_mappings": len(existing_mappings),
                        "ready_to_create": sum(
                            user.user_id not in by_external_id for user in legacy_users
                        ),
                    }
                )
                return

            created = 0
            mapped = 0
            for legacy in legacy_users:
                database_user = database_users[legacy.user_id]
                clerk_user = by_external_id.get(legacy.user_id)
                if clerk_user is None:
                    name_parts = (database_user.display_name or "").strip().split(maxsplit=1)
                    body: dict[str, Any] = {
                        "email_address": [database_user.email],
                        "email_address_identification_status": ["verified"],
                        "external_id": database_user.id,
                        "password_digest": legacy.password_digest,
                        "password_hasher": "bcrypt",
                        "skip_legal_checks": True,
                        "private_metadata": {"internal_user_id": database_user.id},
                    }
                    if database_user.username:
                        body["username"] = database_user.username
                    if name_parts:
                        body["first_name"] = name_parts[0]
                    if len(name_parts) > 1:
                        body["last_name"] = name_parts[1]
                    response = await client.post("/v1/users", json=body)
                    if response.status_code == 422 and "username" in body:
                        body.pop("username")
                        response = await client.post("/v1/users", json=body)
                    response.raise_for_status()
                    clerk_user = response.json()
                    by_external_id[legacy.user_id] = clerk_user
                    created += 1

                subject = clerk_user.get("id")
                if not isinstance(subject, str) or not subject:
                    raise RuntimeError("Clerk returned a user without an ID")
                mapping = existing_mappings.get(legacy.user_id)
                if mapping is None:
                    db.add(
                        UserIdentity(
                            user_id=legacy.user_id,
                            provider="clerk",
                            subject=subject,
                        )
                    )
                    mapped += 1
                elif mapping.subject != subject:
                    raise RuntimeError("Existing Clerk identity mapping conflicts with migration")
            await db.commit()
            print({"created_clerk_users": created, "created_identity_mappings": mapped})


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Supabase bcrypt users into Clerk")
    parser.add_argument("auth_dump", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        await migrate(args.auth_dump, args.check_only)
    finally:
        await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(main())
