from __future__ import annotations

from copy import deepcopy

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import Record, RecordRevision, User
from app.db.session import get_db
from app.main import app
from app.services import recovery
from app.services.records import upsert_records
from app.services.revision_pack import get_saved_pack
from app.services.test_analysis import TestAnalysisDraft as AnalysisDraft
from app.services.test_analysis import get_test_analysis, list_test_analyses, save_test_analysis


def analysis() -> dict:
    return {
        "idempotency_key": "coa-test-analysis-001",
        "test_key": "go-classes-coa-2-2026-10-10",
        "name": "GO Classes COA test 2",
        "test_date": "2026-10-10",
        "summary": "Distinguish byte offsets from word offsets.",
        "full_analysis": "Q7: The block offset counts bytes. Use log2(block size in bytes).",
        "sources": [
            {
                "kind": "conversation",
                "title": "COA test screenshots and discussion",
                "conversation_id": "conversation-coa-2",
                "excerpt": "Q7: A cache has 64-byte blocks.",
            }
        ],
        "questions": [
            {
                "ref": "Q7",
                "subject": "COA",
                "topic": "Cache",
                "question_text": "How many offset bits for a 64-byte block?",
                "answer_text": "6",
                "format": "NAT",
                "learner_answer": "4",
                "outcome": "W-C",
                "outcome_provenance": "screenshot",
                "root_cause": "concept",
                "pattern_name": "Byte versus word offsets",
                "capture_note": "Count addressable bytes.",
            }
        ],
        "discussions": [
            {
                "ref": "cache-offset",
                "question_refs": ["Q7"],
                "insight": {
                    "subject": "COA",
                    "topic": "Cache",
                    "concept": "Block offset",
                    "core_idea": "Count addressable units.",
                    "full_explanation": (
                        "A byte-addressed machine needs log2(bytes per block) offset bits."
                    ),
                    "reasoning_origin": "assistant_hypothesis",
                    "recognition_cues": ["Byte-addressed cache"],
                    "retrieval_question": "Why does a 64-byte block need 6 offset bits?",
                    "evaluation_guidance": "Explain the 64 distinct byte addresses.",
                },
            }
        ],
        "formulas": [
            {
                "ref": "offset-bits",
                "subject": "COA",
                "name": "Block offset bits",
                "expression": "offset = log2(block size / addressable unit)",
                "discussion_refs": ["cache-offset"],
            }
        ],
        "recognition_cues": [
            {
                "ref": "byte-cue",
                "phrase": "Byte-addressed cache",
                "concept": "Count bytes per block before taking log2.",
                "question_refs": ["Q7"],
                "discussion_refs": ["cache-offset"],
            }
        ],
        "mock_summary": {
            "total_marks": 7,
            "max_marks": 10,
            "total_questions": 10,
            "correct": 7,
            "wrong": 2,
            "skipped": 1,
            "duration_min": 30,
            "paper_scope": "topic",
            "evidence_provenance": "screenshot",
        },
        "next_steps": ["Redo cache offset questions without the explanation."],
    }


async def seed(db) -> None:
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    await db.commit()


@pytest.mark.asyncio
async def test_atomic_handoff_links_app_records_and_test_specific_pack(db):
    await seed(db)
    await upsert_records(
        db,
        collection="formulas",
        owner_id="learner-a",
        items=[
            {
                "id": "unrelated-formula",
                "name": "Unrelated",
                "subject": "OS",
                "expression": "other",
                "next_review": "2000-01-01",
            }
        ],
    )
    result = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(analysis()),
        app_url="https://hetu.test",
    )
    await db.commit()
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=result["test_analysis_id"])
    report, artifacts = detail["report"], detail["artifacts"]
    assert result["version"] == report["version"] == 1
    assert result["missing_information"] == [
        "Q7: add a question-only screenshot; text practice is available."
    ]
    assert report["sources"][0]["conversation_id"] == "conversation-coa-2"
    assert artifacts["source_captures"][0]["version"] == 1
    assert "sources" not in artifacts["source_captures"][0]
    assert artifacts["questions"][0]["learner_answer"] == "4"
    assert artifacts["questions"][0]["duration_source"] == "unknown"
    assert artifacts["questions"][0]["session_id"] == report["session_id"]
    assert artifacts["sessions"][0]["kind"] == "log"
    assert artifacts["mock_tests"][0]["evidence_status"] == "supporting"
    assert artifacts["patterns"][0]["mastery_level"] == 0
    assert artifacts["reattempts"][0]["stage"] == "D3"
    assert artifacts["concept_reviews"][0]["attempts"] == []
    assert artifacts["trigger_phrases"][0]["question_ids"] == [artifacts["questions"][0]["id"]]
    assert {r["target_collection"] for r in artifacts["concept_relations"]} == {
        "questions",
        "formulas",
        "trigger_phrases",
        "mock_tests",
        "concept_reviews",
    }
    pack = await get_saved_pack(db, owner_id="learner-a", pack_id=report["revision_pack_id"])
    assert pack["snapshot"]["test_analysis_id"] == report["id"]
    assert [f["name"] for f in pack["snapshot"]["sections"]["due_formulas"]] == [
        "Block offset bits"
    ]
    assert "Unrelated" not in pack["snapshot"]["text"]
    assert (await list_test_analyses(db, owner_id="learner-a"))["items"][0]["id"] == report["id"]
    assert (await list_test_analyses(db, owner_id="learner-b"))["items"] == []
    with pytest.raises(HTTPException) as error:
        await get_test_analysis(db, owner_id="learner-b", report_id=report["id"])
    assert error.value.status_code == 404
    count = await db.scalar(select(func.count(Record.id)).where(Record.owner_id == "learner-a"))
    retry = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(analysis()),
        app_url="https://hetu.test",
    )
    assert retry["idempotent_replay"] is True
    duplicate = {**analysis(), "idempotency_key": "different-operation-same-test"}
    assert (
        await save_test_analysis(
            db,
            owner_id="learner-a",
            draft=AnalysisDraft.model_validate(duplicate),
            app_url="https://hetu.test",
        )
    )["idempotent_replay"] is True
    assert (
        await db.scalar(select(func.count(Record.id)).where(Record.owner_id == "learner-a"))
        == count
    )


@pytest.mark.asyncio
async def test_unknown_outcomes_are_preserved_then_added_without_duplicating_prior_work(db):
    await seed(db)
    draft = analysis()
    draft["questions"].append(
        {"ref": "Q8", "subject": "COA", "question_text": "Unreadable result screenshot."}
    )
    draft.pop("mock_summary")
    result = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(draft),
        app_url="https://hetu.test",
    )
    await db.commit()
    assert len(result["missing_information"]) == 4
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=result["test_analysis_id"])
    assert len(detail["report"]["questions"]) == 2
    assert len(detail["artifacts"]["questions"]) == 2
    assert len(detail["artifacts"]["reattempts"]) == 2
    assert any(q["outcome"] == "U" for q in detail["artifacts"]["questions"])
    addition = {
        **draft,
        "idempotency_key": "coa-add-question-8",
        "expected_version": 1,
        "questions": [
            {
                "ref": "Q8",
                "subject": "COA",
                "question_text": "Unreadable result screenshot.",
                "outcome": "R",
                "outcome_provenance": "learner_reported",
                "expected_version": 1,
            }
        ],
        "discussions": [],
        "formulas": [],
        "recognition_cues": [],
    }
    saved = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(addition),
        app_url="https://hetu.test",
    )
    await db.commit()
    assert saved["version"] == 2
    assert len(saved["missing_information"]) == 3
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=saved["test_analysis_id"])
    assert len(detail["artifacts"]["questions"]) == 2
    assert len(detail["artifacts"]["formulas"]) == len(detail["artifacts"]["concept_reviews"]) == 1
    old_retry = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(draft),
        app_url="https://hetu.test",
    )
    assert old_retry["version"] == 1 and old_retry["idempotent_replay"]
    report_revisions = list(
        await db.scalars(
            select(RecordRevision).where(
                RecordRevision.record_id
                == select(Record.id)
                .where(Record.collection == "test_analyses", Record.owner_id == "learner-a")
                .scalar_subquery()
            )
        )
    )
    assert len(report_revisions) == 2


@pytest.mark.asyncio
async def test_later_annotations_keep_answers_outcomes_timing_and_review_history(db):
    await seed(db)
    initial = analysis()
    initial["questions"][0].update(time_spent_sec=42, duration_source="reported")
    result = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(initial),
        app_url="https://hetu.test",
    )
    await db.commit()
    addition = {
        **initial,
        "idempotency_key": "later-question-annotation",
        "expected_version": 1,
        "questions": [
            {
                "ref": "Q7",
                "subject": "COA",
                "question_text": initial["questions"][0]["question_text"],
                "expected_version": 1,
                "capture_note": "Retain this for repeated recall.",
            }
        ],
        "discussions": [],
        "formulas": [],
        "recognition_cues": [],
        "mock_summary": None,
    }
    await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(addition),
        app_url="https://hetu.test",
    )
    await db.commit()
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=result["test_analysis_id"])
    question = detail["artifacts"]["questions"][0]
    assert question["answer_text"] == "6" and question["learner_answer"] == "4"
    assert question["outcome"] == "W-C" and question["time_spent_sec"] == 42
    assert question["duration_source"] == "reported" and question["format"] == "NAT"
    assert detail["report"]["questions"][0]["outcome"] == "W-C"
    assert len(detail["artifacts"]["reattempts"]) == 1
    assert len(detail["artifacts"]["concept_reviews"]) == 1


@pytest.mark.asyncio
async def test_failure_in_later_action_rolls_back_every_artifact_and_receipt(db):
    await seed(db)
    draft = analysis()
    draft["follow_up_actions"] = [
        {
            "action": "edit_planner_day",
            "idempotency_key": "planner-test-action",
            "plan_date": "2026-10-12",
            "expected_revision": 0,
            "available_min": 10,
            "protected_buffer_min": 5,
            "add_blocks": [{"subject": "COA", "duration_min": 30, "target": "Cache review"}],
        }
    ]
    with pytest.raises(HTTPException) as error:
        await save_test_analysis(
            db,
            owner_id="learner-a",
            draft=AnalysisDraft.model_validate(draft),
            app_url="https://hetu.test",
        )
    assert error.value.status_code == 409
    await db.rollback()
    assert await db.scalar(select(func.count(Record.id))) == 0
    draft.pop("follow_up_actions")
    saved = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(draft),
        app_url="https://hetu.test",
    )
    await db.commit()
    assert saved["artifact_counts"]["questions"] == 1
    changed = {**draft, "summary": "Different summary under the same operation key"}
    with pytest.raises(HTTPException) as error:
        await save_test_analysis(
            db,
            owner_id="learner-a",
            draft=AnalysisDraft.model_validate(changed),
            app_url="https://hetu.test",
        )
    assert error.value.status_code == 409


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d["questions"][0].update(outcome_provenance=None),
        lambda d: d["questions"][0].update(time_spent_sec=42),
        lambda d: d["questions"].append(deepcopy(d["questions"][0])),
        lambda d: d["mock_summary"].update(correct=100),
        lambda d: d["mock_summary"].update(total_marks=float("nan")),
    ],
)
def test_invalid_or_unsupported_evidence_is_rejected(mutation):
    draft = analysis()
    mutation(draft)
    with pytest.raises(ValidationError):
        AnalysisDraft.model_validate(draft)


@pytest.mark.asyncio
async def test_http_handoff_retrieval_ownership_and_generic_write_protection(db):
    await seed(db)
    principal = {"owner": "learner-a"}

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id=principal["owner"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            saved = await client.post("/v1/test-analyses", json=analysis())
            assert saved.status_code == 200, saved.text
            report_id = saved.json()["test_analysis_id"]
            detail = await client.get(f"/v1/test-analyses/{report_id}")
            assert detail.status_code == 200
            assert detail.json()["artifacts"]["formulas"][0]["name"] == "Block offset bits"
            question_id = detail.json()["artifacts"]["questions"][0]["id"]
            image_path = f"/v1/test-analyses/{report_id}/questions/{question_id}/image"
            assert (await client.get(image_path)).json() == {"image_url": None}
            assert (
                await client.get(f"/v1/test-analyses/{report_id}/questions/not-in-this-test/image")
            ).status_code == 404
            denied = await client.patch(
                f"/v1/records/test_analyses/{report_id}",
                json={"expected_version": 1, "data": {"summary": "Bypass"}},
            )
            assert denied.status_code == 403
            annotation = {
                **analysis(),
                "idempotency_key": "http-question-annotation",
                "expected_version": 1,
                "questions": [
                    {
                        "ref": "Q7",
                        "subject": "COA",
                        "question_text": "Updated question text.",
                        "capture_note": "Keep existing evidence.",
                        "expected_version": 1,
                    }
                ],
                "discussions": [],
                "formulas": [],
                "recognition_cues": [],
                "mock_summary": None,
            }
            edited = await client.post("/v1/test-analyses", json=annotation)
            assert edited.status_code == 200, edited.text
            current = (await client.get(f"/v1/test-analyses/{report_id}")).json()
            assert current["artifacts"]["questions"][0]["answer_text"] == "6"
            assert current["artifacts"]["questions"][0]["outcome"] == "W-C"
            changed = deepcopy(annotation)
            changed["questions"][0]["answer_text"] = None
            assert (await client.post("/v1/test-analyses", json=changed)).status_code == 409
            principal["owner"] = "learner-b"
            assert (await client.get(f"/v1/test-analyses/{report_id}")).status_code == 404
            assert (await client.get(image_path)).status_code == 404
            assert (await client.get("/v1/test-analyses")).json()["items"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_saved_question_can_be_attempted_repeatedly_with_separate_history(db, monkeypatch):
    from datetime import UTC, datetime

    await seed(db)
    now = datetime(2026, 10, 12, 4, tzinfo=UTC)
    monkeypatch.setattr(recovery, "now_utc", lambda: now)
    result = await save_test_analysis(
        db,
        owner_id="learner-a",
        draft=AnalysisDraft.model_validate(analysis()),
        app_url="https://hetu.test",
    )
    await db.commit()
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=result["test_analysis_id"])
    item_id = next(
        row["id"] for row in detail["artifacts"]["learning_items"] if row["source_kind"] == "manual"
    )
    for number, day, answer in [(1, 15, "4"), (2, 18, "6")]:
        now = datetime(2026, 10, day, 4, tzinfo=UTC)
        started = await recovery.start_session(
            db,
            owner_id="learner-a",
            app_url="https://hetu.test",
            draft=recovery.SessionStart(
                idempotency_key=f"test-repeat-session-{number}", item_ids=[item_id]
            ),
        )
        session = started["session"]
        prompt = await recovery.get_session(db, owner_id="learner-a", session_id=session["id"])
        assert prompt["prompt"]["answer_hidden"] is True
        assert "answer_text" not in prompt["prompt"]["question"]
        await recovery.record_answer(
            db,
            owner_id="learner-a",
            session_id=session["id"],
            app_url="https://hetu.test",
            draft=recovery.RecoveryAnswer(
                idempotency_key=f"test-repeat-answer-{number}",
                expected_version=session["version"],
                expected_index=0,
                item_id=item_id,
                answer=answer,
                confidence="medium",
                duration_ms=60000,
                duration_source="reported",
            ),
        )
        await db.commit()
    detail = await get_test_analysis(db, owner_id="learner-a", report_id=result["test_analysis_id"])
    reattempt = detail["artifacts"]["reattempts"][0]
    assert [entry["result"] for entry in reattempt["history"]] == ["fail", "clean"]
    assert detail["artifacts"]["questions"][0]["outcome"] == "W-C"
