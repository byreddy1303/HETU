from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import User
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_record_api_round_trip(db) -> None:
    db.add(User(id="user_api"))
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id="user_api")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.put(
                "/v1/records/sessions",
                json={"items": [{"id": "session-api", "subject": "OS", "minutes": 30}]},
            )
            assert response.status_code == 200, response.text
            assert response.json()[0]["version"] == 1

            response = await client.post(
                "/v1/records/sessions/query",
                json={"filters": [{"field": "subject", "op": "eq", "value": "OS"}]},
            )
            assert response.status_code == 200, response.text
            assert [item["id"] for item in response.json()["items"]] == ["session-api"]

            response = await client.patch(
                "/v1/records/sessions/session-api",
                json={"data": {"minutes": 35}, "expected_version": 1},
            )
            assert response.status_code == 200, response.text
            assert response.json()["minutes"] == 35
            assert response.json()["version"] == 2

            response = await client.delete("/v1/records/sessions/session-api?expected_version=2")
            assert response.status_code == 204
            response = await client.get("/v1/records/sessions/session-api/history")
            assert [row["version"] for row in response.json()] == [3, 2, 1]
            response = await client.post(
                "/v1/records/sessions/session-api/restore",
                json={"revision": 1, "expected_version": 3},
            )
            assert response.status_code == 200
            assert response.json()["minutes"] == 30
            assert response.json()["version"] == 4
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_maintenance_blocks_reads_writes_and_readiness(monkeypatch):
    from app.main import settings

    monkeypatch.setattr(settings, "maintenance_mode", True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert (await client.get("/health/live")).status_code == 200
        assert (await client.get("/health/ready")).status_code == 503
        assert (await client.get("/v1/me")).status_code == 503
        assert (await client.put("/v1/records/questions", json={"items": []})).status_code == 503


@pytest.mark.asyncio
async def test_readiness_reports_unconfigured_redis_as_degraded(db) -> None:
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/health/ready")
        assert response.status_code == 200
        assert response.json()["status"] == "degraded"
        assert response.json()["checks"]["database"] == "ok"
    finally:
        app.dependency_overrides.clear()
