from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import PyqBank, PyqCatalogQuestion, Record, User
from app.db.session import get_db
from app.main import app
from app.schemas import CompatMutation
from app.services.compat import _mutate_records
from app.services.pyq_catalog import prepare_catalog_rows
from app.services.pyq_practice import PyqAttemptDraft, submit_pyq_attempt
from app.services.records import require_generic_mutation_allowed
from tests.test_pyq_catalog import sample_question


@pytest.mark.asyncio
async def test_canonical_pyq_attempt_scoring_retries_and_owner_boundary(db) -> None:
    questions = [
        sample_question(),
        sample_question(
            id="gate:test:msq", html="<p>Select all</p>", type="MSQ", answer=["A", "C"]
        ),
        sample_question(
            id="gate:test:nat",
            html="<p>Calculate</p>",
            type="NAT",
            answer=2.5,
            choices=None,
            tolerance={"abs": 0.1},
            marks=2,
        ),
        sample_question(id="gate:test:missing", html="<p>Missing marks</p>", marks=None),
        sample_question(id="gate:test:ambiguous", html="<p>Conflicting key</p>"),
    ]
    rows, _ = prepare_catalog_rows(questions, {"gate:test:ambiguous"})
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    db.add(
        PyqBank(
            version="v1", manifest={}, question_count=len(rows), source_hash="hash", active=True
        )
    )
    db.add_all(PyqCatalogQuestion(bank_version="v1", **row) for row in rows)
    await db.commit()

    async def submit(key: str, uid: str, selected, decision="MARK"):
        result = await submit_pyq_attempt(
            db,
            owner_id="learner-a",
            draft=PyqAttemptDraft(
                idempotency_key=key,
                question_uid=uid,
                selected_answer=selected,
                decision=decision,
            ),
            app_url="https://hetu.example",
        )
        await db.commit()
        return result

    wrong = await submit("mcq-wrong-one", "gate:test:1", "A")
    assert wrong["score_thirds"] == -1
    assert wrong["scoring_status"] == "scored"
    assert wrong["negative_applied"] is True
    assert wrong["confidence"] == "high"
    assert wrong["attempt_number"] == 1
    assert wrong["question_snapshot"]["question_uid"] == "gate:test:1"
    assert wrong["question_snapshot"]["answer_status"] == "available"
    replay = await submit("mcq-wrong-one", "gate:test:1", "A")
    assert replay["id"] == wrong["id"]
    assert replay["idempotent_replay"] is True
    with pytest.raises(HTTPException) as conflict:
        await submit("mcq-wrong-one", "gate:test:1", "B")
    assert conflict.value.status_code == 409
    await db.rollback()

    with pytest.raises(HTTPException) as invalid_number:
        await submit("nat-not-a-number", "gate:test:nat", "two point five")
    assert invalid_number.value.status_code == 422
    await db.rollback()
    with pytest.raises(HTTPException) as foreign_session:
        await submit_pyq_attempt(
            db,
            owner_id="learner-a",
            draft=PyqAttemptDraft(
                idempotency_key="foreign-session-one",
                question_uid="gate:test:1",
                decision="MARK",
                selected_answer="B",
                session_id="not-owned-or-active",
            ),
            app_url="https://hetu.example",
        )
    assert foreign_session.value.status_code == 422
    await db.rollback()

    correct = await submit("mcq-correct-two", "gate:test:1", "B")
    assert correct["score_thirds"] == 3
    assert correct["attempt_number"] == 2
    msq = await submit("msq-wrong-one", "gate:test:msq", ["A"])
    assert msq["score_thirds"] == 0
    assert msq["mark_correct"] is False
    nat = await submit("nat-near-one", "gate:test:nat", 2.55)
    assert nat["score_thirds"] == 6
    missing = await submit("missing-mark-one", "gate:test:missing", "B")
    assert missing["scoring_status"] == "unscorable"
    assert missing["reason"] == "missing-marks"
    ambiguous = await submit("ambiguous-one", "gate:test:ambiguous", "B")
    assert ambiguous["scoring_status"] == "unscorable"
    assert ambiguous["correct_answer"] is None
    skipped = await submit("mcq-skip-one", "gate:test:1", None, "SKIP")
    assert skipped["score_thirds"] == 0
    assert skipped["mark_correct"] is None

    # The existing React write path is checked against the same bank and score.
    app_row = {
        **correct,
        "id": "browser-attempt-one",
        "attempt_number": 4,
        "time_spent_ms": 1500,
        "time_spent_sec": 2,
        "sync_status": "synced",
    }
    for metadata in ("user_id", "version", "created_at", "updated_at", "idempotent_replay", "url"):
        app_row.pop(metadata, None)
    app_row.pop("request_hash", None)
    persisted = await _mutate_records(
        db, "pyq_attempts", "upsert", "learner-a", CompatMutation(values=[app_row])
    )
    await db.commit()
    assert persisted[0]["score_thirds"] == 3
    assert persisted[0]["id"] == "browser-attempt-one"
    replayed = await _mutate_records(
        db, "pyq_attempts", "upsert", "learner-a", CompatMutation(values=[app_row])
    )
    assert replayed[0]["id"] == "browser-attempt-one"
    with pytest.raises(HTTPException) as fake_score:
        await _mutate_records(
            db,
            "pyq_attempts",
            "upsert",
            "learner-a",
            CompatMutation(values=[{**app_row, "id": "fake-score", "score_thirds": 999}]),
        )
    assert fake_score.value.status_code == 409
    await db.rollback()
    with pytest.raises(HTTPException) as generic_write:
        require_generic_mutation_allowed("pyq_attempts")
    assert generic_write.value.status_code == 403

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id="learner-a")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            via_app = await client.post(
                "/v1/pyq/attempts",
                json={
                    "idempotency_key": "app-pyq-attempt-one",
                    "question_uid": "gate:test:1",
                    "decision": "MARK",
                    "selected_answer": "B",
                },
            )
            assert via_app.status_code == 200, via_app.text
            assert via_app.json()["score_thirds"] == 3
    finally:
        app.dependency_overrides.clear()

    other_rows = (
        await db.scalars(
            select(Record).where(
                Record.collection == "pyq_attempts", Record.owner_id == "learner-b"
            )
        )
    ).all()
    assert other_rows == []
