from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, select

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import Record, RecordRevision, User
from app.db.session import get_db
from app.main import app
from app.services.records import patch_record, upsert_records
from app.services.section_context import section_records
from app.services.study_actions import (
    FormulaDraft,
    JournalDraft,
    PlannerBlock,
    PlannerDraft,
    StudyAction,
    SyllabusDraft,
    TriggerDraft,
    WeeklyDraft,
    execute_action,
)

APP_URL = "https://hetu.test"


@pytest.fixture
async def accounts(db):
    db.add_all([User(id="learner-a", profile={"timezone": "Asia/Kolkata"}), User(id="learner-b")])
    await db.commit()
    return db


async def run(db, draft, owner="learner-a"):
    result = await execute_action(db, owner_id=owner, draft=draft, app_url=APP_URL)
    await db.commit()
    return result


def formula(key="formula-save-1", **changes):
    return FormulaDraft(
        idempotency_key=key,
        name="Bayes",
        subject="Probability",
        expression="P(H|E) = P(E|H)P(H)/P(E)",
        **changes,
    )


def block(id=None, duration=30, start=None):
    return PlannerBlock(
        id=id,
        subject="Operating Systems",
        duration_min=duration,
        target="Recall paging without hints",
        start_at=start,
    )


def planner(key="planner-create-1", **changes):
    return PlannerDraft(
        idempotency_key=key, plan_date=date(2026, 10, 12), expected_revision=0, **changes
    )


@pytest.mark.asyncio
async def test_formula_retry_after_later_edit_preserves_receipt_review_metrics_and_history(
    accounts,
):
    db = accounts
    first = await run(db, formula())
    item = first["record"]
    await patch_record(
        db,
        collection="formulas",
        owner_id="learner-a",
        external_id=item["id"],
        expected_version=1,
        patch={"forgot_count": 3, "last_reviewed": "2026-10-10"},
    )
    await db.commit()
    edited = await run(db, formula("formula-edit-1", record_id=item["id"], expected_version=2))
    assert edited["record"]["forgot_count"] == 3
    assert edited["record"]["last_reviewed"] == "2026-10-10"
    replay = await run(db, formula())
    assert replay == {**first, "idempotent_replay": True}
    assert replay["record"]["version"] == 1
    assert (
        await db.scalar(select(func.count(Record.id)).where(Record.collection == "formulas")) == 1
    )
    history = list(
        await db.scalars(
            select(RecordRevision)
            .where(
                RecordRevision.record_id
                == (
                    select(Record.id).where(
                        Record.collection == "formulas", Record.external_id == item["id"]
                    )
                ).scalar_subquery()
            )
            .order_by(RecordRevision.version)
        )
    )
    assert [h.version for h in history] == [1, 2, 3]
    with pytest.raises(HTTPException) as stale:
        await run(db, formula("formula-stale", record_id=item["id"], expected_version=1))
    assert stale.value.status_code == 409


@pytest.mark.asyncio
async def test_retry_key_cannot_change_action_or_payload(accounts):
    await run(accounts, formula())
    with pytest.raises(HTTPException) as collision:
        await run(
            accounts,
            TriggerDraft(
                idempotency_key="formula-save-1",
                phrase="Given evidence",
                concept="Bayes normalization",
            ),
        )
    assert collision.value.status_code == 409
    with pytest.raises(HTTPException):
        await run(accounts, formula().model_copy(update={"expression": "changed"}))


@pytest.mark.asyncio
async def test_existing_record_from_other_account_cannot_be_changed(accounts):
    first = await run(accounts, formula())
    with pytest.raises(HTTPException):
        await run(
            accounts,
            formula("formula-other-edit", record_id=first["record"]["id"], expected_version=1),
            owner="learner-b",
        )
    assert (
        await section_records(
            accounts, owner_id="learner-b", section="formulas", collection="formulas"
        )
    )["items"] == []


@pytest.mark.asyncio
async def test_recognition_cue_requires_owned_question_and_preserves_reflex_evidence(accounts):
    db = accounts
    await upsert_records(
        db, owner_id="learner-b", collection="questions", items=[{"id": "private-q"}]
    )
    await upsert_records(db, owner_id="learner-a", collection="questions", items=[{"id": "my-q"}])
    await db.commit()
    with pytest.raises(HTTPException) as hidden:
        await run(
            db,
            TriggerDraft(
                idempotency_key="cue-private-q",
                phrase="At least one",
                concept="Use complement",
                question_ids=["private-q"],
            ),
        )
    assert hidden.value.status_code == 404
    first = await run(
        db,
        TriggerDraft(
            idempotency_key="cue-own-question",
            phrase="At least one",
            concept="Use complement",
            question_ids=["my-q"],
        ),
    )
    assert first["record"]["reflex_time_ms"] is None
    assert first["record"]["question_ids"] == ["my-q"]
    await patch_record(
        db,
        collection="trigger_phrases",
        owner_id="learner-a",
        external_id=first["record"]["id"],
        expected_version=1,
        patch={"reflex_time_ms": 420},
    )
    await db.commit()
    revised = await run(
        db,
        TriggerDraft(
            idempotency_key="cue-revise-phrase",
            record_id=first["record"]["id"],
            expected_version=2,
            phrase="At least one success",
            concept="Use complement",
        ),
    )
    assert revised["record"]["reflex_time_ms"] == 420
    assert revised["record"]["question_ids"] == ["my-q"]


@pytest.mark.asyncio
async def test_journal_analysis_keeps_actual_answer_outcome_and_timing(accounts):
    db = accounts
    original = {
        "id": "journal-q",
        "subject": "OS",
        "outcome": "W-C",
        "answer_text": "B",
        "time_spent_sec": 182,
        "target_time_sec": 120,
    }
    await upsert_records(db, owner_id="learner-a", collection="questions", items=[original])
    await db.commit()
    draft = JournalDraft(
        idempotency_key="journal-analysis-1",
        record_id="journal-q",
        expected_version=1,
        root_cause="concept",
        capture_note="Confused page and frame",
        analysis_provenance="assistant_hypothesis",
    )
    result = await run(db, draft)
    assert all(result["record"][k] == v for k, v in original.items())
    assert result["record"]["analysis_provenance"] == "assistant_hypothesis"
    assert (await run(db, draft))["idempotent_replay"] is True
    assert (
        await db.scalar(select(func.count(Record.id)).where(Record.collection == "pyq_attempts"))
        == 0
    )
    with pytest.raises(ValidationError):
        JournalDraft.model_validate({**draft.model_dump(), "outcome": "R"})


@pytest.mark.asyncio
async def test_syllabus_uses_existing_app_identity_reopens_and_restores_with_history(accounts):
    db = accounts
    await upsert_records(
        db,
        owner_id="learner-a",
        collection="topic_progress",
        items=[
            {
                "id": "legacy-topic-id",
                "subject": "Operating Systems",
                "topic": "Paging",
                "completed_at": "2026-10-10T00:00:00Z",
            }
        ],
    )
    await db.commit()
    draft = SyllabusDraft(
        idempotency_key="syllabus-reopen-1",
        expected_version=1,
        subject="Operating Systems",
        topic="Paging",
        completed=False,
        evidence_note="Need to revisit the page-table derivation",
    )
    result = await run(db, draft)
    assert result["record"]["id"] == "legacy-topic-id"
    assert result["record"]["deleted_at"] is not None
    assert result["mastery_awarded"] is False
    assert (
        await section_records(
            db, owner_id="learner-a", section="syllabus", collection="topic_progress"
        )
    )["items"] == []
    completed = await run(
        db,
        SyllabusDraft(
            idempotency_key="syllabus-restudy-1",
            expected_version=result["record"]["version"],
            subject="Operating Systems",
            topic="Paging",
            completed=True,
            evidence_note="Learner reports finishing the topic",
        ),
    )
    assert completed["record"]["id"] == "legacy-topic-id"
    assert completed["record"]["deleted_at"] is None
    assert completed["record"]["progress_provenance"] == "learner_reported"
    assert (await run(db, draft))["record"]["deleted_at"] is not None
    assert (
        await db.scalar(select(func.count(Record.id)).where(Record.collection == "topic_progress"))
        == 1
    )


@pytest.mark.asyncio
async def test_syllabus_and_weekly_creation_do_not_overwrite_natural_keys(accounts):
    draft = SyllabusDraft(
        idempotency_key="syllabus-complete-1",
        subject="Probability",
        topic="Bayes",
        completed=True,
        evidence_note="Reported studied",
    )
    first = await run(accounts, draft)
    with pytest.raises(HTTPException) as duplicate:
        await run(accounts, draft.model_copy(update={"idempotency_key": "syllabus-other-1"}))
    assert duplicate.value.status_code == 409
    assert first["record"]["version"] == 1
    weekly = WeeklyDraft(
        idempotency_key="weekly-focus-1",
        week_start=date(2026, 10, 12),
        weakest_concept="Paging",
        this_weeks_fix="Practice one unaided derivation",
    )
    saved = await run(accounts, weekly)
    assert saved["record"]["week_start"] == "2026-10-12"
    assert saved["href"] == APP_URL + "/weekly-review"
    assert (await run(accounts, weekly))["idempotent_replay"] is True
    revised = await run(
        accounts,
        WeeklyDraft(
            idempotency_key="weekly-revise-fix",
            week_start=date(2026, 10, 12),
            expected_version=1,
            this_weeks_fix="Add delayed unaided recall",
        ),
    )
    assert revised["record"]["weakest_concept"] == "Paging"
    with pytest.raises(ValidationError):
        WeeklyDraft(
            idempotency_key="weekly-tuesday", week_start=date(2026, 10, 13), this_weeks_fix="Fix"
        )


@pytest.mark.asyncio
async def test_planner_app_shape_edit_reorder_split_and_durable_retry(accounts):
    db = accounts
    draft = planner(
        add_blocks=[block("paging", 60, "08:00"), block("bayes", 30, "10:00")],
        available_min=120,
        protected_buffer_min=20,
    )
    first = await run(db, draft)
    assert first["planned_min"] == 90
    assert first["remaining_min"] == 10
    assert first["record"]["plan"]["sessions"] == first["record"]["sessions"]
    assert first["record"]["revision"] == 1
    split = PlannerDraft(
        idempotency_key="planner-split-1",
        plan_date=draft.plan_date,
        expected_revision=1,
        edit_blocks=[block("paging", 30, "08:00")],
        add_blocks=[block("paging-recall", 30, "09:00")],
        ordered_block_ids=["paging", "paging-recall", "bayes"],
    )
    changed = await run(db, split)
    assert changed["record"]["revision"] == 2
    assert changed["record"]["plan"]["availability"]["protectedBufferMin"] == 20
    assert [s["id"] for s in changed["record"]["sessions"]] == ["paging", "paging-recall", "bayes"]
    assert (await run(db, draft)) == {**first, "idempotent_replay": True}
    with pytest.raises(HTTPException) as stale:
        await run(db, split.model_copy(update={"idempotency_key": "planner-stale-edit"}))
    assert stale.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes,status",
    [
        ({"add_blocks": [block()], "available_min": None, "protected_buffer_min": None}, 422),
        (
            {"add_blocks": [block(duration=90)], "available_min": 100, "protected_buffer_min": 20},
            409,
        ),
        (
            {
                "add_blocks": [block("a", 30, "08:00"), block("b", 30, "08:15")],
                "available_min": 120,
                "protected_buffer_min": 20,
            },
            409,
        ),
        (
            {
                "add_blocks": [block(start="23:50")],
                "available_min": 120,
                "protected_buffer_min": 20,
            },
            409,
        ),
        ({"add_blocks": [block()], "available_min": 30, "protected_buffer_min": 40}, 422),
    ],
)
async def test_planner_refuses_unknown_capacity_overfill_and_overlaps(accounts, changes, status):
    with pytest.raises(HTTPException) as rejected:
        await run(accounts, planner(**changes))
    assert rejected.value.status_code == status
    assert await accounts.scalar(select(func.count(Record.id))) == 0


@pytest.mark.asyncio
async def test_planner_keeps_existing_commitments_and_rejects_outside_windows(accounts):
    db = accounts
    first = await run(
        db, planner(add_blocks=[block("committed", 30)], available_min=120, protected_buffer_min=20)
    )
    record_id = first["record"]["id"]
    plan = first["record"]["plan"]
    plan["sessions"][0]["execution"] = {
        "sessionId": "real-session",
        "startedAt": "2026-10-12T08:00:00Z",
    }
    plan["availability"]["timeWindows"] = [
        {"id": "morning", "label": "Morning", "start": "08:00", "end": "10:00", "energy": "medium"}
    ]
    await patch_record(
        db,
        collection="planner_day_plans",
        owner_id="learner-a",
        external_id=record_id,
        expected_version=1,
        patch={"plan": plan, "revision": 2},
    )
    await db.commit()
    with pytest.raises(HTTPException) as started:
        await run(
            db,
            PlannerDraft(
                idempotency_key="planner-delete-started",
                plan_date=date(2026, 10, 12),
                expected_revision=2,
                remove_block_ids=["committed"],
            ),
        )
    assert started.value.status_code == 409
    with pytest.raises(HTTPException) as outside:
        await run(
            db,
            PlannerDraft(
                idempotency_key="planner-outside-window",
                plan_date=date(2026, 10, 12),
                expected_revision=2,
                add_blocks=[block("late", 30, "12:00")],
            ),
        )
    assert outside.value.status_code == 409


@pytest.mark.asyncio
async def test_http_actions_are_visible_in_existing_app_records_and_account_isolated(accounts):
    db = accounts
    principal = {"user": "learner-a"}

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id=principal["user"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.post(
                "/v1/study-actions", json=formula().model_dump(mode="json")
            )
            assert response.status_code == 200, response.text
            item = response.json()["record"]
            existing = await client.get("/v1/sections/formulas/records/formulas")
            assert existing.json()["items"][0]["id"] == item["id"]
            principal["user"] = "learner-b"
            hidden = await client.get("/v1/sections/formulas/records/formulas")
            assert hidden.json()["items"] == []
            forged = await client.post(
                "/v1/study-actions", json={**formula().model_dump(), "owner_id": "learner-a"}
            )
            assert forged.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_action_schema_forbids_fabricating_evidence_or_choosing_arbitrary_collections():
    adapter = TypeAdapter(StudyAction)
    for raw in [
        {**formula().model_dump(), "forgot_count": 0},
        {**formula().model_dump(), "owner_id": "another-user"},
        {**formula().model_dump(), "collection": "pyq_attempts"},
        {"action": "save_pyq_attempt", "idempotency_key": "fake-attempt-1"},
    ]:
        with pytest.raises(ValidationError):
            adapter.validate_python(raw)
