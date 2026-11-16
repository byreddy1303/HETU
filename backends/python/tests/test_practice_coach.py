from datetime import UTC, datetime, timedelta
from fractions import Fraction

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from test_memory_learning_engine import receipt

from app.db.models import Record, User
from app.services import practice_coach as coach
from app.services.practice_drills import FAMILIES, catalog_entry
from app.services.records import require_collection


async def seed(db, count=1):
    db.add_all([User(id="owner"), User(id="other")])
    await db.flush()
    for owner in ["owner", "other"]:
        db.add(
            Record(
                owner_id=owner,
                collection="pyq_sessions",
                external_id="set",
                data={
                    "status": "completed",
                    "config": {"mode": "practice"},
                    "question_uids": ["go:460036"],
                },
            )
        )
        for i in range(count):
            db.add(
                Record(
                    owner_id=owner,
                    collection="pyq_attempts",
                    external_id=f"attempt-{i}",
                    data=receipt(),
                )
            )
    await db.flush()


@pytest.mark.asyncio
async def test_prepare_deduplicates_preserves_receipts_hides_keys_and_isolates_owner(db):
    await seed(db)
    before = (await coach._owned(db, "owner", "pyq_attempts", "attempt-0")).data.copy()
    result = await coach.prepare(db, "owner")
    assert len(result["created"]) == 1
    key = result["created"][0]
    assert (await coach.prepare(db, "owner"))["retained"] == [key]
    view = await coach.overview(db, "owner")
    assert len(view["groups"]) == 1
    assert len(view["packs"][0]["questions"]) == 3
    assert all("answer" not in q and "explanation" not in q for q in view["packs"][0]["questions"])
    assert view["packs"][0]["principle"] is None
    assert not (await coach.overview(db, "other"))["packs"]
    with pytest.raises(HTTPException):
        await coach.get_pack(db, "other", key)
    with pytest.raises(HTTPException):
        require_collection(coach.COLLECTION)
    assert (await coach._owned(db, "owner", "pyq_attempts", "attempt-0")).data == before


@pytest.mark.asyncio
async def test_draft_resume_conflict_and_immutable_submission(db):
    await seed(db)
    key = (await coach.prepare(db, "owner"))["created"][0]
    saved = await coach.save_pack_draft(
        db, "owner", key, coach.PackDraft(expected_version=1, round=0, selections={"0": 0})
    )
    assert saved["selections"] == {"0": 0}
    with pytest.raises(HTTPException) as conflict:
        await coach.save_pack_draft(
            db, "owner", key, coach.PackDraft(expected_version=1, round=0, selections={"0": 1})
        )
    assert conflict.value.status_code == 409
    draft = coach.Answer(round=0, index=0, choice=0, assistance="without-help", elapsed_sec=4)
    view = await coach.submit_answer(db, "owner", key, draft)
    replay = await coach.submit_answer(db, "owner", key, draft)
    assert replay["version"] == view["version"]
    assert view["questions"][0]["result"]["correct"]
    assert "answer" not in view["questions"][1]
    with pytest.raises(HTTPException):
        await coach.submit_answer(db, "owner", key, draft.model_copy(update={"choice": 1}))
    with pytest.raises(HTTPException):
        await coach.save_pack_draft(
            db,
            "owner",
            key,
            coach.PackDraft(expected_version=view["version"], round=0, selections={"0": 1}),
        )
    assert (await coach.overview(db, "owner"))["evidence"]["answers"] == 1


@pytest.mark.asyncio
async def test_completed_round_schedules_delayed_check_and_preserves_history(db):
    await seed(db)
    key = (await coach.prepare(db, "owner"))["created"][0]
    row = await coach.get_pack(db, "owner", key)
    for i, question in enumerate(row.data["questions"]):
        view = await coach.submit_answer(
            db,
            "owner",
            key,
            coach.Answer(round=0, index=i, choice=question["answer"], assistance="without-help"),
        )
    assert view["done"] and not view["due"]
    assert view["due_date"] == ((await coach.today(db, "owner")) + timedelta(days=3)).isoformat()
    with pytest.raises(HTTPException):
        await coach.start_round(db, "owner", key)
    row = await coach.get_pack(db, "owner", key)
    await coach.write(
        db,
        "owner",
        key,
        {
            **row.data,
            "due_date": (await coach.today(db, "owner")).isoformat(),
            "completed_at": (datetime.now(UTC) - timedelta(days=4)).isoformat(),
        },
    )
    restarted = await coach.start_round(db, "owner", key)
    assert restarted["round"] == 1 and not restarted["selections"]
    result = await coach.submit_answer(
        db, "owner", key, coach.Answer(round=1, index=0, choice=0, assistance="without-help")
    )
    assert result["questions"][0]["result"]["delayed"]
    assert not result["questions"][0]["result"]["fresh_in_workspace"]
    evidence = (await coach.overview(db, "owner"))["evidence"]
    assert evidence["answers"] == 4 and evidence["fresh"] == 3 and evidence["delayed"] == 1


@pytest.mark.asyncio
async def test_failed_round_returns_tomorrow_and_missing_help_is_not_independent(db):
    await seed(db)
    key = (await coach.prepare(db, "owner"))["created"][0]
    for i in range(3):
        view = await coach.submit_answer(db, "owner", key, coach.Answer(round=0, index=i, choice=1))
    assert view["due_date"] == ((await coach.today(db, "owner")) + timedelta(days=1)).isoformat()
    evidence = (await coach.overview(db, "owner"))["evidence"]
    assert evidence["conditions_unknown"] == 3 and evidence["fresh"] == 0


@pytest.mark.asyncio
async def test_exam_guard_and_unrevealed_completed_exam_excluded(db):
    await seed(db)
    session = await coach._owned(db, "owner", "pyq_sessions", "set")
    session.data = {**session.data, "config": {"mode": "exam"}, "status": "paused"}
    await db.flush()
    with pytest.raises(HTTPException):
        await coach.prepare(db, "owner")
    session.data = {**session.data, "status": "completed"}
    await db.flush()
    assert not (await coach.mistake_groups(db, "owner"))[0]


@pytest.mark.asyncio
async def test_review_stays_capped_and_replays_without_new_reflection_prompts(db):
    await seed(db, 8)
    first = await coach.review(db, "owner", "set")
    assert len(first["candidates"]) == 3
    ids = [x["attempt_id"] for x in first["candidates"]]
    for index, key in enumerate(ids):
        draft = coach.Reflection(
            attempt_id=key,
            later=index == 0,
            cause="recognition",
            note="Forgot to count the initial loads",
        )
        await coach.reflect(db, "owner", "set", draft)
        await coach.reflect(db, "owner", "set", draft)
    later = await coach.review(db, "owner", "set")
    assert [x["attempt_id"] for x in later["candidates"]] == ids
    assert all(x["decision"] for x in later["candidates"])


@pytest.mark.asyncio
async def test_batch_logging_deduplicates_and_leaves_timing_confidence_unknown(db):
    await seed(db)
    draft = coach.NotebookBatch(
        request_id="paper-session",
        source="My book",
        subject="Networks",
        topic="CRC",
        studied_on="2026-11-15",
        items=[coach.BatchItem(number="12", outcome="wrong")],
    )
    saved = await coach.save_batch(db, "owner", draft)
    assert await coach.save_batch(db, "owner", draft) == saved
    row = await coach._owned(db, "owner", coach.COLLECTION, saved["id"])
    assert row.data["confidence"] is None and row.data["timing"] is None
    with pytest.raises(HTTPException):
        await coach.save_batch(db, "owner", draft.model_copy(update={"source": "changed"}))
    with pytest.raises(ValidationError):
        coach.NotebookBatch(**{**draft.model_dump(), "items": [draft.items[0], draft.items[0]]})


@pytest.mark.asyncio
async def test_plan_respects_budget_excludes_exposed_and_keeps_started_steps(db):
    await seed(db)
    for budget in [10, 20, 30, 45, 60]:
        plan = await coach.daily_plan(db, "owner", budget)
        assert sum(s["minutes"] for s in plan["steps"]) == budget
        assert plan["steps"][2]["minutes"] > 0
        assert "hideTopics=1" in plan["steps"][2]["href"]
    plan = await coach.complete_plan_step(db, "owner", plan["id"], "recall", plan["version"])
    assert (await coach.daily_plan(db, "owner", 60))["completed"]["recall"]


@pytest.mark.parametrize("family", list(FAMILIES))
def test_original_problem_contract_and_variant_choices(family):
    for round_number in range(8):
        entry = catalog_entry(family, round_number)
        assert len(entry["questions"]) == 3
        for raw in entry["questions"]:
            coach.Problem.model_validate(raw)


def test_exercise_answers_against_enumerated_cases():
    # Enumerate backoff pairs and correction balls rather than trusting prose keys.
    for round_number in range(7):
        problem = catalog_entry("backoff", round_number)["questions"][1]
        slots = 4 * 2 ** (round_number % 3)
        wins = sum(a < b for a in range(2) for b in range(slots))
        assert Fraction(problem["choices"][problem["answer"]]) == Fraction(wins, 2 * slots)
        problem = catalog_entry("hamming", round_number)["questions"][1]
        distance = 3 + round_number
        words = [0, (1 << distance) - 1]
        balls = [
            {
                x
                for x in range(1 << distance)
                if (x ^ word).bit_count() <= int(problem["choices"][problem["answer"]])
            }
            for word in words
        ]
        assert balls[0].isdisjoint(balls[1])
    code = [0b0000, 0b1110, 0b1101]
    minimum = min((a ^ b).bit_count() for a in code for b in code if a != b)
    problem = catalog_entry("hamming")["questions"][2]
    assert int(problem["choices"][problem["answer"]]) == minimum
    frames, faults = [], 0
    for page in [1, 2, 1, 3, 2]:
        if page not in frames:
            faults += 1
            if len(frames) == 2:
                frames.pop(0)
            frames.append(page)
    problem = catalog_entry("page-faults")["questions"][1]
    assert int(problem["choices"][problem["answer"]]) == faults


@pytest.mark.asyncio
async def test_authored_questions_survive_due_round_and_later_can_be_completed(db):
    await seed(db)
    group = (await coach.mistake_groups(db, "owner"))[0][0]
    content = catalog_entry("hamming")
    draft = coach.AuthoredPack(
        group_id=group["id"],
        **{key: content[key] for key in ("questions", "principle", "conditions", "counterexample")},
    )
    key = (await coach.prepare(db, "owner", draft))["created"][0]
    row = await coach.get_pack(db, "owner", key)
    questions = row.data["questions"]
    for i, question in enumerate(questions):
        await coach.submit_answer(
            db, "owner", key, coach.Answer(round=0, index=i, choice=question["answer"])
        )
    await coach.write(
        db, "owner", key, {**row.data, "due_date": (await coach.today(db, "owner")).isoformat()}
    )
    await coach.start_round(db, "owner", key)
    assert row.data["questions"] == questions
    await coach.reflect(db, "owner", "set", coach.Reflection(attempt_id="attempt-0", later=True))
    view = await coach.reflect(
        db, "owner", "set", coach.Reflection(attempt_id="attempt-0", cause="reading")
    )
    assert view["candidates"][0]["decision"]["state"] == "done"


@pytest.mark.asyncio
async def test_http_local_boundary_private_keys_and_notebook_photo_ownership(db):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from app.api.deps import get_current_user
    from app.api.routes.practice_coach import router
    from app.core.config import Settings, get_settings
    from app.core.security import Identity
    from app.db.session import get_db

    await seed(db)
    app = FastAPI()
    app.include_router(router, prefix="/practice")

    async def database():
        yield db

    async def user():
        return Identity(user_id="owner")

    settings = Settings(environment="local", database_url="sqlite+aiosqlite://")
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = user
    app.dependency_overrides[get_settings] = lambda: settings
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1") as client:
        result = await client.post("/practice/prepare")
        assert result.status_code == 200
        key = result.json()["created"][0]
        hidden = (await client.get(f"/practice/packs/{key}")).json()
        assert "answer" not in hidden["questions"][0]
        saved = await client.post(
            "/practice/batches",
            json={
                "request_id": "photo",
                "source": "Paper",
                "subject": "Networks",
                "studied_on": "2026-11-15",
                "items": [{"number": "1"}],
                "attachment": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
                "CAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            },
        )
        assert saved.status_code == 200
        key = saved.json()["id"]
        assert (await client.get(f"/practice/batches/{key}")).json()["attachment"]
        overview = (await client.get("/practice")).json()
        assert overview["batches"][0]["has_attachment"]
        assert "attachment" not in overview["batches"][0]

        async def other():
            return Identity(user_id="other")

        app.dependency_overrides[get_current_user] = other
        assert (await client.get(f"/practice/batches/{key}")).status_code == 404
        settings.environment = "production"
        assert (await client.get("/practice")).status_code == 403


@pytest.mark.asyncio
async def test_long_lived_packs_survive_bounded_recent_receipt_history(db, monkeypatch):
    await seed(db)
    key = (await coach.prepare(db, "owner"))["created"][0]
    pack = await coach.get_pack(db, "owner", key)
    pack.created_at = datetime(2000, 1, 1, tzinfo=UTC)
    for i in range(4):
        await coach.write(db, "owner", f"recent-{i}", {"kind": "signal", "attempt_id": f"a-{i}"})
    original = coach.rows

    async def bounded(db, owner, collection, limit=coach.LIMIT):
        return await original(db, owner, collection, 2 if collection == coach.COLLECTION else limit)

    monkeypatch.setattr(coach, "rows", bounded)
    view = await coach.overview(db, "owner")
    assert not view["complete"]
    assert [pack["id"] for pack in view["packs"]] == [key]
    assert (await coach.prepare(db, "owner"))["retained"] == [key]
