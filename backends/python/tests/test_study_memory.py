from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, User
from app.services.records import require_generic_mutation_allowed
from app.services.study_memory import (
    ExamSubmissionDraft, StudyMemoryDraft, commit_exam, context_for_attempt, export_memory, get_entry, list_entries, save_entry,
)


def draft(**changes) -> StudyMemoryDraft:
    return StudyMemoryDraft.model_validate({
        "kind": "reflection", "title": "My graph reasoning", "content": "I assumed connectivity.",
        "data": {"failure_stage": "recognition", "reveal_state": "before"},
        "state": "draft", "evidence_kind": "learner", "expected_version": 0, **changes,
    })


async def seed(db):
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    db.add_all([
        Record(owner_id="learner-a", collection="pyq_sessions", external_id="exam-a", data={"question_uids": ["q1"]}),
        Record(owner_id="learner-b", collection="pyq_sessions", external_id="exam-b", data={"question_uids": ["q2"]}),
        Record(owner_id="learner-a", collection="pyq_attempts", external_id="attempt-a", data={"pyq_session_id": "exam-a", "question_uid": "q1", "question_snapshot": {"html": "<p>Exact frozen question</p>"}}),
        Record(owner_id="learner-b", collection="pyq_attempts", external_id="attempt-b", data={"pyq_session_id": "exam-b", "question_uid": "q2"}),
    ])
    await db.commit()


@pytest.mark.asyncio
async def test_draft_persists_without_diagnosis_and_versions_are_replay_safe(db):
    await seed(db)
    payload = draft(attempt_id="attempt-a", session_id="exam-a", question_uid="q1")
    first = await save_entry(db, owner_id="learner-a", entry_id="reflection-a", draft=payload)
    await db.commit()
    assert first["version"] == 1
    replay = await save_entry(db, owner_id="learner-a", entry_id="reflection-a", draft=payload)
    assert replay["version"] == 1
    updated = await save_entry(db, owner_id="learner-a", entry_id="reflection-a", draft=draft(**{**payload.model_dump(), "expected_version": 1, "content": "I overlooked a second component."}))
    await db.commit()
    assert updated["version"] == 2
    with pytest.raises(HTTPException) as stale:
        await save_entry(db, owner_id="learner-a", entry_id="reflection-a", draft=payload)
    assert stale.value.status_code == 409
    # Read through a new session, rather than the original identity map.
    async with AsyncSession(bind=db.bind) as reopened:
        result = await get_entry(reopened, owner_id="learner-a", entry_id="reflection-a")
        assert result["entry"]["content"] == "I overlooked a second component."
        assert len(result["history"]) == 2
        assert any(row["content"] == "I assumed connectivity." for row in result["history"])


@pytest.mark.asyncio
async def test_owned_links_cannot_mix_exams_questions_or_accounts(db):
    await seed(db)
    for changes in [
        {"attempt_id": "attempt-b"},
        {"attempt_id": "attempt-a", "question_uid": "q2"},
        {"attempt_id": "attempt-a", "session_id": "exam-b"},
        {"session_id": "exam-a", "data": {"reviewed_attempt_ids": ["attempt-b"]}},
        {"session_id": "exam-a", "data": {"revealed_attempt_ids": ["attempt-b"]}},
        {"data": {"active_session_id": "exam-b"}},
    ]:
        with pytest.raises(HTTPException) as invalid:
            await save_entry(db, owner_id="learner-a", entry_id="bad-link", draft=draft(**changes))
        assert invalid.value.status_code == 422
    await save_entry(db, owner_id="learner-a", entry_id="private", draft=draft())
    with pytest.raises(HTTPException) as missing:
        await get_entry(db, owner_id="learner-b", entry_id="private")
    assert missing.value.status_code == 404
    assert (await list_entries(db, owner_id="learner-b"))["total"] == 0


@pytest.mark.asyncio
async def test_two_exam_reviews_resume_independently(db):
    await seed(db)
    db.add(Record(owner_id="learner-a", collection="pyq_sessions", external_id="exam-a2", data={"question_uids": []}))
    await db.commit()
    for session in ("exam-a", "exam-a2"):
        await save_entry(db, owner_id="learner-a", entry_id=f"review:{session}", draft=draft(kind="exam_review", session_id=session, content=f"Reflection for {session}", data={"reviewed_attempt_ids": ["attempt-a"] if session == "exam-a" else []}))
    await db.commit()
    first = await list_entries(db, owner_id="learner-a", session_id="exam-a")
    second = await list_entries(db, owner_id="learner-a", session_id="exam-a2")
    assert first["items"][0]["data"]["reviewed_attempt_ids"] == ["attempt-a"]
    assert second["items"][0]["content"] == "Reflection for exam-a2"


@pytest.mark.asyncio
async def test_verification_is_immutable_but_identical_retry_is_safe(db):
    await seed(db)
    check = draft(kind="verification", state="completed", data={"answer": "A counterexample", "evaluated_by": "self", "hint_used": True})
    first = await save_entry(db, owner_id="learner-a", entry_id="check", draft=check)
    assert (await save_entry(db, owner_id="learner-a", entry_id="check", draft=check))["version"] == first["version"]
    with pytest.raises(HTTPException) as immutable:
        await save_entry(db, owner_id="learner-a", entry_id="check", draft=draft(kind="verification", expected_version=1, content="replace result"))
    assert immutable.value.status_code == 409


@pytest.mark.asyncio
async def test_search_paginates_all_rows_and_treats_wildcards_literally(db):
    await seed(db)
    for index in range(110):
        await save_entry(db, owner_id="learner-a", entry_id=f"note:{index}", draft=draft(title=f"Concept {index}", content=f"Searchable proof {index}"))
    await save_entry(db, owner_id="learner-a", entry_id="literal", draft=draft(content="100% independent"))
    await db.commit()
    page = await list_entries(db, owner_id="learner-a", q="Searchable proof", limit=100)
    rest = await list_entries(db, owner_id="learner-a", q="Searchable proof", limit=100, offset=100)
    assert page["total"] == 110 and page["has_more"]
    assert len(rest["items"]) == 10 and not rest["has_more"]
    literal = await list_entries(db, owner_id="learner-a", q="%")
    assert [row["id"] for row in literal["items"]] == ["literal"]


@pytest.mark.asyncio
async def test_context_and_export_retain_sources_without_other_accounts(db):
    await seed(db)
    await save_entry(db, owner_id="learner-a", entry_id="thought", draft=draft(data={"source_attempt_ids": ["attempt-a"]}))
    await save_entry(db, owner_id="learner-b", entry_id="other", draft=draft(content="Private other learner"))
    await db.commit()
    context = await context_for_attempt(db, owner_id="learner-a", attempt_id="attempt-a")
    assert context["question_snapshot"]["html"] == "<p>Exact frozen question</p>"
    assert context["provenance"]["model_used"] is False
    exported = await export_memory(db, owner_id="learner-a")
    assert exported["schema"] == "hetu.study-memory.v1"
    assert [row["id"] for row in exported["entries"]] == ["thought"]
    assert [row["id"] for row in exported["attempt_receipts"]] == ["attempt-a"]


def test_memory_must_use_validated_domain_api():
    with pytest.raises(HTTPException) as denied:
        require_generic_mutation_allowed("study_memory")
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_atomic_exam_validates_all_receipts_while_session_is_active(db, monkeypatch):
    await seed(db)
    session = Record(owner_id="learner-a", collection="pyq_sessions", external_id="atomic-exam",
                     data={"status": "active", "config": {"mode": "exam"}, "question_uids": ["q1", "q2"]})
    db.add(session)
    await db.commit()
    seen = []

    async def validator(connection, *, owner_id, row, allow_paused_exam):
        assert owner_id == "learner-a" and session.data["status"] == "active"
        assert allow_paused_exam is True
        seen.append(row["question_uid"])
        if row.get("invalid"):
            raise HTTPException(422, "Invalid answer metadata")

    monkeypatch.setattr("app.services.study_memory.validate_app_attempt", validator)
    receipt = lambda q: {"id": f"atomic:{q}", "user_id": "learner-a", "question_uid": q, "pyq_session_id": "atomic-exam"}
    payload = {"session": {"id": "atomic-exam", "status": "completed", "config": {"mode": "exam"}, "question_uids": ["q1", "q2"]},
               "canonical_session": {"id": "atomic-exam", "kind": "pyq"}, "attempts": [receipt("q1"), {**receipt("q2"), "invalid": True}]}
    with pytest.raises(HTTPException):
        await commit_exam(db, owner_id="learner-a", draft=ExamSubmissionDraft.model_validate(payload))
    assert session.data["status"] == "active"
    from sqlalchemy import select
    assert not (await db.scalars(select(Record).where(Record.external_id == "atomic:q1"))).all()
    payload["attempts"][1].pop("invalid")
    result = await commit_exam(db, owner_id="learner-a", draft=ExamSubmissionDraft.model_validate(payload))
    await db.commit()
    assert result["committed"] and session.data["status"] == "completed"
    assert seen == ["q1", "q2", "q1", "q2"]
    replay = await commit_exam(db, owner_id="learner-a", draft=ExamSubmissionDraft.model_validate(payload))
    assert replay["attempt_ids"] == ["atomic:q1", "atomic:q2"]


@pytest.mark.asyncio
async def test_repair_results_are_calculated_from_linked_canonical_attempts(db):
    await seed(db)
    repair = await save_entry(db, owner_id="learner-a", entry_id="repair", draft=draft(kind="repair"))
    from sqlalchemy import select
    session = await db.scalar(select(Record).where(Record.external_id == "exam-a", Record.collection == "pyq_sessions"))
    session.data = {**session.data, "config": {"memoryRepairId": repair["id"]}}
    attempt = await db.scalar(select(Record).where(Record.external_id == "attempt-a", Record.collection == "pyq_attempts"))
    attempt.data = {**attempt.data, "mark_correct": True, "mark_decision": "MARK", "time_spent_sec": 42}
    await db.commit()
    result = await save_entry(db, owner_id="learner-a", entry_id="result", draft=draft(kind="verification", repair_id="repair", session_id="exam-a", data={"correct": 99, "judged": 99, "mastery_claim": True}))
    assert result["data"]["correct"] == result["data"]["judged"] == 1
    assert result["data"]["active_time_sec"] == 42
    assert result["data"]["mastery_claim"] is False
    assert result["data"]["calculated_from"] == "canonical_attempt_receipts"
