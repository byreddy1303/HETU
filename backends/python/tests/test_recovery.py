from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import PyqBank, PyqCatalogQuestion, Record, User
from app.db.session import get_db
from app.main import app
from app.services import recovery
from app.services.pyq_catalog import prepare_catalog_rows
from app.services.pyq_practice import PyqAttemptDraft, submit_pyq_attempt
from app.services.records import require_generic_mutation_allowed, upsert_records
from app.services.recovery_engine import build_sprint, derive_grade, forecast, transition
from tests.test_pyq_catalog import sample_question

NOW = datetime(2026, 10, 10, 18, 31, tzinfo=UTC)  # 11 October in Kolkata
TODAY = date(2026, 10, 11)
APP = "https://hetu.test"


async def setup(db, monkeypatch):
    monkeypatch.setattr(recovery, "now_utc", lambda: NOW)
    db.add_all([User(id="one", profile={"timezone": "Asia/Kolkata"}), User(id="two")])
    questions = [
        sample_question(),
        sample_question(id="gate:test:2", html="<p>Fresh sorting question</p>"),
        sample_question(id="gate:test:3", html="<p>Sealed sorting question</p>"),
    ]
    rows, _ = prepare_catalog_rows(questions, set())
    db.add(
        PyqBank(
            version="v1",
            manifest={"benchmarkPapers": [{"questionUids": ["gate:test:3"]}]},
            question_count=3,
            source_hash="test",
            active=True,
        )
    )
    db.add_all(PyqCatalogQuestion(bank_version="v1", **row) for row in rows)
    await db.commit()


async def due_item(db, stage="D3", lapses=0):
    attempt = await submit_pyq_attempt(
        db,
        owner_id="one",
        draft=PyqAttemptDraft(
            idempotency_key=f"original-wrong-{stage}-{lapses}",
            question_uid="gate:test:1",
            decision="MARK",
            selected_answer="A",
        ),
        app_url=APP,
    )
    capture = await recovery.capture_attempt(db, owner_id="one", attempt_id=attempt["id"])
    row = await recovery.owned(db, "one", "learning_items", capture["item"]["id"])
    row = (
        await upsert_records(
            db,
            owner_id="one",
            collection="learning_items",
            items=[
                {
                    "id": row.external_id,
                    "expected_version": row.version,
                    **row.data,
                    "stage": stage,
                    "scheduled_date": TODAY.isoformat(),
                    "lapse_count": lapses,
                }
            ],
        )
    )[0]
    await db.commit()
    return row


async def start(db, key="start-recovery-test"):
    result = await recovery.start_session(
        db, owner_id="one", draft=recovery.SessionStart(idempotency_key=key), app_url=APP
    )
    await db.commit()
    return result["session"]


def answer(session, key="answer-recovery-test", **overrides):
    return recovery.RecoveryAnswer(
        idempotency_key=key,
        expected_version=session["version"],
        expected_index=session["current_index"],
        item_id=session["item_ids"][session["current_index"]],
        **{
            "answer": "B",
            "confidence": "medium",
            "duration_ms": 85000,
            "duration_source": "reported",
            **overrides,
        },
    )


def test_grade_parity_and_evidence_qualification():
    base = dict(
        correct=True,
        blank=False,
        seconds=60,
        target_seconds=90,
        confidence="high",
        assisted=False,
        prior_successes=1,
    )
    assert derive_grade(**base)["grade"] == "easy"
    assert derive_grade(**{**base, "assisted": True}) == {
        "grade": "hard",
        "reasons": ["opening cue revealed"],
    }
    assert derive_grade(**{**base, "seconds": 114})["grade"] == "hard"
    assert derive_grade(**{**base, "seconds": None})["grade"] == "good"
    item = recovery.initial_item(
        item_id="item",
        subject="Algorithms",
        topic="Sorting",
        today=TODAY,
        reasons=["wrong"],
        stage="D30",
        scheduled_date=TODAY.isoformat(),
    )
    assisted = transition(
        item, grade="hard", today=TODAY, occurred_at=NOW.isoformat(), qualification="canonical"
    )
    assert assisted["item"]["successful_retrieval_count"] == 0
    reported = transition(
        item, grade="good", today=TODAY, occurred_at=NOW.isoformat(), qualification="reported"
    )
    assert reported["mastered"] is False
    due = transition(
        item, grade="good", today=TODAY, occurred_at=NOW.isoformat(), qualification="canonical"
    )
    assert due["mastered"] is True
    early = transition(
        {**item, "scheduled_date": (TODAY + timedelta(days=1)).isoformat()},
        grade="good",
        today=TODAY,
        occurred_at=NOW.isoformat(),
        qualification="canonical",
    )
    assert early["mastered"] is False
    assert early["item"]["scheduled_date"] == (TODAY + timedelta(days=1)).isoformat()
    failed = transition(
        {**item, "lapse_count": 2},
        grade="again",
        today=TODAY,
        occurred_at=NOW.isoformat(),
        qualification="canonical",
    )
    assert failed["item"]["recovery_state"] == "remediation"


def test_feasible_sprints_never_overfill_first_question_and_ignore_paused_load():
    def candidate(id_, seconds, state="active"):
        return {
            "item": recovery.initial_item(
                item_id=id_,
                subject=id_,
                topic=None,
                today=TODAY,
                reasons=[],
                scheduled_date=TODAY.isoformat(),
                recovery_state=state,
            ),
            "estimatedSeconds": seconds,
        }

    candidates = [candidate("huge", 601), candidate("fits", 90), candidate("paused", 90, "paused")]
    sprint = build_sprint(candidates, "minutes-10", TODAY)
    assert [row["item"]["id"] for row in sprint["selected"]] == ["fits"]
    assert sprint["estimatedSeconds"] == 90 and sprint["deferredCount"] == 1
    assert forecast(candidates, TODAY, 1)[0]["itemCount"] == 2


@pytest.mark.asyncio
async def test_actual_capture_hint_override_and_retry_receipts(db, monkeypatch):
    await setup(db, monkeypatch)
    item = await due_item(db)
    session = await start(db)
    original = recovery.SessionStart(idempotency_key="start-recovery-test")
    assert (await recovery.start_session(db, owner_id="one", draft=original, app_url=APP))[
        "idempotent_replay"
    ]
    prompt = await recovery.get_session(db, owner_id="one", session_id=session["id"])
    assert prompt["prompt"]["question"]["answer"] is None
    hint = await recovery.reveal_hint(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=recovery.SessionCommand(
            idempotency_key="hint-recovery-test",
            expected_version=session["version"],
            expected_index=0,
            item_id=item.external_id,
        ),
    )
    await db.commit()
    response = answer(hint["session"], assistance="none")  # Persisted cue overrides this claim.
    result = await recovery.record_answer(
        db, owner_id="one", session_id=session["id"], draft=response, app_url=APP
    )
    await db.commit()
    assert result["grade"]["grade"] == "hard"
    assert result["item"]["stage"] == "D3" and result["item"]["successful_retrieval_count"] == 0
    assert result["events"][0]["hint_used"] is True
    assert result["events"][0]["metadata"]["previous_stage"] == "D3"
    assert result["attempt"]["recovery_session_id"] == session["id"]
    assert result["session"]["status"] == "completed"
    replay = await recovery.record_answer(
        db, owner_id="one", session_id=session["id"], draft=response, app_url=APP
    )
    assert replay["idempotent_replay"] and replay["item"]["version"] == result["item"]["version"]
    with pytest.raises(HTTPException) as changed:
        await recovery.record_answer(
            db,
            owner_id="one",
            session_id=session["id"],
            draft=response.model_copy(update={"answer": "A"}),
            app_url=APP,
        )
    assert changed.value.status_code == 409
    with pytest.raises(HTTPException) as other:
        await recovery.get_session(db, owner_id="two", session_id=session["id"])
    assert other.value.status_code == 404


@pytest.mark.asyncio
async def test_due_d30_and_fresh_transfer_are_the_only_canonical_mastery_routes(db, monkeypatch):
    await setup(db, monkeypatch)
    item = await due_item(db, "D30")
    session = await start(db)
    result = await recovery.record_answer(
        db, owner_id="one", session_id=session["id"], draft=answer(session), app_url=APP
    )
    await db.commit()
    assert result["item"]["recovery_state"] == "mastered"
    assert [row["event_type"] for row in result["events"]] == ["retrieval_good", "mastered"]
    assert result["events"][0]["metadata"]["previous_stage"] == "D30"
    transferred = await recovery.assign_transfer(
        db,
        owner_id="one",
        item_id=item.external_id,
        draft=recovery.TransferDraft(
            idempotency_key="transfer-recovery-test", expected_version=result["item"]["version"]
        ),
    )
    await db.commit()
    assert transferred["events"][0]["metadata"]["transfer_question_uid"] == "gate:test:2"
    assert transferred["item"]["scheduled_date"] == "2026-10-14"
    monkeypatch.setattr(recovery, "now_utc", lambda: NOW + timedelta(days=3))
    session = await start(db, "transfer-session-test")
    result = await recovery.record_answer(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=answer(session, "transfer-answer-test"),
        app_url=APP,
    )
    await db.commit()
    assert result["item"]["recovery_state"] == "mastered"
    assert result["item"]["transfer_passed_at"] is not None
    assert [row["event_type"] for row in result["events"]] == [
        "retrieval_good",
        "transfer_passed",
        "mastered",
    ]
    assert result["events"][0]["metadata"]["fresh_transfer"] is True
    # Recovery receipts cannot create a second identity for the transfer question.
    await recovery.reconcile_recovery(db, owner_id="one")
    items = list(
        await db.scalars(
            select(Record).where(Record.collection == "learning_items", Record.owner_id == "one")
        )
    )
    assert len(items) == 1


@pytest.mark.asyncio
async def test_checkpoint_never_advances_and_defer_interrupt_are_neutral(db, monkeypatch):
    await setup(db, monkeypatch)
    item = await due_item(db)
    session = await start(db)
    interrupted = await recovery.checkpoint_session(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=recovery.SessionCheckpoint(
            idempotency_key="interrupted-test",
            expected_version=session["version"],
            expected_index=0,
            item_id=item.external_id,
            action="interrupt",
            elapsed_ms=10000,
            reason="App closed",
        ),
    )
    await db.commit()
    resumed = await recovery.checkpoint_session(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=recovery.SessionCheckpoint(
            idempotency_key="resumed-test",
            expected_version=interrupted["session"]["version"],
            expected_index=0,
            item_id=item.external_id,
            action="resume",
        ),
    )
    await db.commit()
    with pytest.raises(HTTPException) as wrong_draft:
        await recovery.checkpoint_session(
            db,
            owner_id="one",
            session_id=session["id"],
            draft=recovery.SessionCheckpoint(
                idempotency_key="draft-wrong-test",
                expected_version=resumed["session"]["version"],
                expected_index=0,
                item_id=item.external_id,
                action="draft",
                draft_answer={"itemId": "another-item"},
            ),
        )
    assert wrong_draft.value.status_code == 409
    deferred = await recovery.defer_item(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=recovery.SessionDefer(
            idempotency_key="deferred-test",
            expected_version=resumed["session"]["version"],
            expected_index=0,
            item_id=item.external_id,
            reason="Need pen and paper",
        ),
    )
    await db.commit()
    assert (
        deferred["item"]["lapse_count"] == 0 and deferred["item"]["successful_retrieval_count"] == 0
    )
    assert deferred["item"]["scheduled_date"] == "2026-10-12"
    assert deferred["session"]["status"] == "completed"


@pytest.mark.asyncio
async def test_authenticated_http_uses_same_grading_and_rejects_old_position(db, monkeypatch):
    await setup(db, monkeypatch)
    await due_item(db)

    async def database():
        yield db

    async def identity():
        return Identity(user_id="one")

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = identity
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            overview = await client.get("/v1/recovery")
            assert overview.json()["as_of"] == "2026-10-11"
            started = await client.post(
                "/v1/recovery/sessions", json={"idempotency_key": "http-start-test"}
            )
            assert started.status_code == 200
            session = started.json()["session"]
            payload = answer(session).model_dump()
            result = await client.post(
                f"/v1/recovery/sessions/{session['id']}/answers", json=payload
            )
            assert result.status_code == 200, result.text
            assert result.json()["item"]["stage"] == "D10"
            assert (
                await client.post(f"/v1/recovery/sessions/{session['id']}/answers", json=payload)
            ).json()["idempotent_replay"]
            payload["idempotency_key"] = "http-new-stale-test"
            assert (
                await client.post(f"/v1/recovery/sessions/{session['id']}/answers", json=payload)
            ).status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_legacy_ladder_history_and_due_date_survive_reconciliation(db, monkeypatch):
    await setup(db, monkeypatch)
    await upsert_records(
        db,
        collection="questions",
        owner_id="one",
        items=[
            {
                "id": "logged",
                "subject": "Algorithms",
                "subtopic": "Sorting",
                "source_ref": "Other · MCQ",
                "question_text": "Choose a sorting method",
                "answer_text": "B",
                "target_time_sec": 90,
            }
        ],
    )
    original = {
        "id": "legacy",
        "question_id": "logged",
        "stage": "D10",
        "scheduled_date": "2026-10-01",
        "history": [
            {"date": "2026-09-21", "result": "clean", "selectedAnswer": "B", "timeSpent": 60}
        ],
    }
    await upsert_records(db, collection="reattempts", owner_id="one", items=[original])
    await db.commit()
    result = await recovery.reconcile_recovery(db, owner_id="one")
    await db.commit()
    assert result["complete"]
    row = await recovery.owned(db, "one", "reattempts", "legacy")
    assert all(row.data[k] == v for k, v in original.items() if k != "id")
    item_id = row.data["learning_item_id"]
    item = await recovery.owned(db, "one", "learning_items", item_id)
    assert item.data["stage"] == "D10" and item.data["scheduled_date"] == "2026-10-01"
    assert item.data["mastered_at"] is None
    count = len((await recovery.item_detail(db, owner_id="one", item_id=item_id))["events"])
    await recovery.reconcile_recovery(db, owner_id="one")
    await db.commit()
    assert len((await recovery.item_detail(db, owner_id="one", item_id=item_id))["events"]) == count
    assert (
        recovery.logged_verdict((await recovery.owned(db, "one", "questions", "logged")).data, "B")
        is True
    )


@pytest.mark.asyncio
async def test_repeated_lapse_requires_real_remediation_and_cannot_bypass_versions(db, monkeypatch):
    await setup(db, monkeypatch)
    item = await due_item(db, "D10", 2)
    session = await start(db)
    result = await recovery.record_answer(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=answer(session, answer="A", reported_correct=True),
        app_url=APP,
    )
    await db.commit()
    assert result["grade"]["grade"] == "again"
    assert result["item"]["lapse_count"] == 3
    assert result["item"]["recovery_state"] == "remediation"
    assert [event["event_type"] for event in result["events"]] == [
        "retrieval_again",
        "remediation_started",
    ]
    draft = recovery.RemediationDraft(
        idempotency_key="remediation-test",
        expected_version=result["item"]["version"],
        corrected_opening_move="Write the invariant before selecting a sort.",
        focused_plan="Solve two contrasting invariant questions, then recall in three days.",
    )
    saved = await recovery.remediate(db, owner_id="one", item_id=item.external_id, draft=draft)
    await db.commit()
    assert saved["item"]["stage"] == "D3" and saved["item"]["successful_retrieval_count"] == 0
    assert (await recovery.remediate(db, owner_id="one", item_id=item.external_id, draft=draft))[
        "idempotent_replay"
    ]
    for collection in ("learning_items", "learning_events", "recovery_sessions", "reattempts"):
        with pytest.raises(HTTPException) as blocked:
            require_generic_mutation_allowed(collection)
        assert blocked.value.status_code == 403
