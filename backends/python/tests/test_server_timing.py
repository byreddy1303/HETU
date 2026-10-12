from __future__ import annotations

import re

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.timing import instrument_engine
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_server_timing_reports_database_round_trips(db) -> None:
    instrument_engine(db.bind)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/health/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    header = response.headers["server-timing"]
    assert re.search(r"rl;dur=\d+\.\d", header)
    assert re.search(r'db;dur=\d+\.\d;desc="[1-9]\d* queries"', header)
    assert re.search(r"app;dur=\d+\.\d", header)


@pytest.mark.asyncio
async def test_server_timing_present_without_database_work() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health/live")

    assert response.status_code == 200
    assert 'db;dur=0.0;desc="0 queries"' in response.headers["server-timing"]
