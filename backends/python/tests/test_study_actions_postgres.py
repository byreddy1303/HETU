"""Concurrency tests require a migrated, disposable local hetu_test database."""

from __future__ import annotations

import asyncio
import os
from datetime import date
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Record, User
from app.services.study_actions import FormulaDraft, PlannerBlock, PlannerDraft, execute_action

URL = os.getenv("HETU_TEST_DATABASE_URL")
if URL and (
    urlsplit(URL).hostname not in {"127.0.0.1", "localhost"} or urlsplit(URL).path != "/hetu_test"
):
    raise pytest.UsageError("Study action tests require local disposable hetu_test")
pytestmark = pytest.mark.skipif(not URL, reason="Requires disposable migrated PostgreSQL")


@pytest.mark.asyncio
async def test_parallel_mcp_retries_create_one_formula_and_one_receipt():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
        draft = FormulaDraft(
            idempotency_key=f"parallel-formula-{owner}",
            name="Bayes",
            subject="Probability",
            expression="P(H|E)",
        )

        async def save():
            async with factory() as db:
                result = await execute_action(
                    db, owner_id=owner, draft=draft, app_url="https://hetu.test", origin="chatgpt"
                )
                await db.commit()
                return result

        results = await asyncio.gather(*(save() for _ in range(6)))
        assert len({result["record"]["id"] for result in results}) == 1
        assert sum(not result["idempotent_replay"] for result in results) == 1
        async with factory() as db:
            for collection in ("formulas", "plugin_receipts"):
                assert (
                    await db.scalar(
                        select(func.count(Record.id)).where(
                            Record.owner_id == owner,
                            Record.collection == collection,
                        )
                    )
                    == 1
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_parallel_planner_edits_detect_stale_revision_and_keep_winning_day():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
            draft = PlannerDraft(
                idempotency_key=f"planner-create-{owner}",
                plan_date=date(2026, 10, 12),
                expected_revision=0,
                available_min=120,
                protected_buffer_min=20,
                add_blocks=[
                    PlannerBlock(
                        id="first", subject="OS", duration_min=30, target="Unaided paging recall"
                    )
                ],
            )
            first = await execute_action(
                db, owner_id=owner, draft=draft, app_url="https://hetu.test"
            )
            await db.commit()

        async def edit(label):
            async with factory() as db:
                try:
                    result = await execute_action(
                        db,
                        owner_id=owner,
                        draft=PlannerDraft(
                            idempotency_key=f"planner-{label}-{owner}",
                            plan_date=date(2026, 10, 12),
                            expected_revision=1,
                            add_blocks=[
                                PlannerBlock(id=label, subject="OS", duration_min=30, target=label)
                            ],
                        ),
                        app_url="https://hetu.test",
                    )
                    await db.commit()
                    return result
                except HTTPException as exc:
                    await db.rollback()
                    return exc.status_code

        results = await asyncio.gather(edit("recall"), edit("transfer"))
        assert sum(r == 409 for r in results) == 1
        winner = next(r for r in results if isinstance(r, dict))
        async with factory() as db:
            row = await db.scalar(
                select(Record).where(
                    Record.owner_id == owner, Record.collection == "planner_day_plans"
                )
            )
            assert row.data["revision"] == 2
            assert row.data["sessions"] == winner["record"]["sessions"]
            assert row.data["sessions"][0]["id"] == "first"
            assert (
                await db.scalar(
                    select(func.count(Record.id)).where(
                        Record.owner_id == owner,
                        Record.collection == "plugin_receipts",
                    )
                )
                == 2
            )
            replay = await execute_action(
                db, owner_id=owner, draft=draft, app_url="https://hetu.test"
            )
            assert replay == {**first, "idempotent_replay": True}
    finally:
        await engine.dispose()
