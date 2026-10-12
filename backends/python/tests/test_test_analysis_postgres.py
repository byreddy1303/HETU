"""Test-analysis retries must serialize across independent PostgreSQL connections."""

from __future__ import annotations

import asyncio
import os
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Record, RecordRevision, User
from app.services.test_analysis import TestAnalysisDraft as AnalysisDraft
from app.services.test_analysis import save_test_analysis
from tests.test_test_analysis import analysis

URL = os.getenv("HETU_TEST_DATABASE_URL")
if URL and (
    urlsplit(URL).hostname not in {"127.0.0.1", "localhost"} or urlsplit(URL).path != "/hetu_test"
):
    raise pytest.UsageError("Test analysis requires local disposable hetu_test")
pytestmark = pytest.mark.skipif(not URL, reason="Requires disposable migrated PostgreSQL")


@pytest.mark.asyncio
async def test_parallel_test_imports_create_one_atomic_handoff():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
        payload = {**analysis(), "test_key": f"concurrent-test-{owner}"}

        async def save(number):
            async with factory() as db:
                draft = AnalysisDraft.model_validate(
                    {**payload, "idempotency_key": f"capture-{owner}-{number % 2}"}
                )
                result = await save_test_analysis(
                    db, owner_id=owner, draft=draft, app_url="https://hetu.test"
                )
                await db.commit()
                return result

        results = await asyncio.gather(*(save(n) for n in range(6)))
        assert len({result["test_analysis_id"] for result in results}) == 1
        assert sum(not result["idempotent_replay"] for result in results) == 1
        async with factory() as db:
            for collection in (
                "test_analyses",
                "questions",
                "sessions",
                "reattempts",
                "formulas",
                "trigger_phrases",
                "concept_reviews",
                "revision_packs",
                "mock_tests",
            ):
                assert (
                    await db.scalar(
                        select(func.count(Record.id)).where(
                            Record.owner_id == owner, Record.collection == collection
                        )
                    )
                    == 1
                )
            report = await db.scalar(
                select(Record).where(Record.owner_id == owner, Record.collection == "test_analyses")
            )
            assert (
                await db.scalar(
                    select(func.count(RecordRevision.id)).where(
                        RecordRevision.record_id == report.id
                    )
                )
                == 1
            )
    finally:
        await engine.dispose()
