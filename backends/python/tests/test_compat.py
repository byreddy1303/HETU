from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import User
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_compat_table_round_trip_is_owner_scoped(db) -> None:
    db.add_all([User(id="compat-user"), User(id="other-user")])
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id="compat-user")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            created = await client.post(
                "/v1/compat/tables/sessions/upsert",
                json={
                    "values": [{"id": "session-1", "user_id": "other-user", "subject": "OS"}],
                    "returning": True,
                },
            )
            assert created.status_code == 200, created.text
            assert created.json()["data"][0]["user_id"] == "compat-user"

            queried = await client.post(
                "/v1/compat/tables/sessions/query",
                json={
                    "filters": [{"field": "subject", "op": "eq", "value": "OS"}],
                    "orders": [{"field": "created_at", "ascending": True}],
                    "cardinality": "single",
                },
            )
            assert queried.status_code == 200, queried.text
            assert queried.json()["data"][0]["id"] == "session-1"
            assert queried.json()["count"] == 1

            updated = await client.post(
                "/v1/compat/tables/sessions/update",
                json={
                    "values": [{"subject": "CN"}],
                    "filters": [{"field": "id", "op": "eq", "value": "session-1"}],
                    "returning": True,
                },
            )
            assert updated.status_code == 200, updated.text
            assert updated.json()["data"][0]["subject"] == "CN"

            removed = await client.post(
                "/v1/compat/tables/sessions/delete",
                json={
                    "filters": [{"field": "id", "op": "eq", "value": "session-1"}],
                    "returning": True,
                },
            )
            assert removed.status_code == 200, removed.text
            after = await client.post(
                "/v1/compat/tables/sessions/query",
                json={"filters": [{"field": "id", "op": "eq", "value": "session-1"}]},
            )
            assert after.json()["data"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_compat_rejects_unknown_rpc(db) -> None:
    db.add(User(id="compat-user"))
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id="compat-user")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/v1/compat/rpc/not-a-real-operation", json={"arguments": {}}
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()
