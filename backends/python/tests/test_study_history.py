from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.db.models import Record, User
from app.services.study_history import get_history_detail, list_history


async def seed(db):
    db.add_all([User(id="owner"), User(id="other")])
    await db.flush()


def record(collection, id_, data=None, owner="owner", **extra):
    return Record(collection=collection, owner_id=owner, external_id=id_, data=data or {}, **extra)


@pytest.mark.asyncio
async def test_history_sql_paginates_all_existing_collections_without_large_payloads(db):
    await seed(db)
    for i in range(111):
        db.add(
            record(
                "questions" if i % 2 else "study_memory",
                f"e{i:03}",
                {
                    "title": f"Concept {i}",
                    "question_text": f"Question {i}",
                    "created_at": "2026-10-17T01:00:00Z",
                    "image_url": "data:image/png;base64,huge-payload",
                    "screenshot_url": "private-shot",
                    "correct_answer": "secret-key",
                    "api_key": "credential",
                },
            )
        )
    db.add_all(
        [
            record("study_memory", "private", {"title": "Private"}, owner="other"),
            record("study_memory", "deleted", {"title": "Deleted"}, deleted_at=datetime.now(UTC)),
            record("unrelated", "hidden", {"title": "Hidden"}),
        ]
    )
    await db.commit()
    first = await list_history(db, owner_id="owner", limit=100)
    last = await list_history(db, owner_id="owner", limit=100, offset=100)
    assert first["total"] == last["total"] == 111
    assert first["has_more"] is True and last["has_more"] is False
    assert len(first["items"]) == 100 and len(last["items"]) == 11
    assert len({row["id"] for row in [*first["items"], *last["items"]]}) == 111
    serialized = json.dumps(first, default=str)
    assert (
        "huge-payload" not in serialized
        and "private-shot" not in serialized
        and "secret-key" not in serialized
    )
    assert "correct_answer" not in serialized and "api_key" not in serialized
    assert all(row["id"] == f"{row['collection']}:{row['record_id']}" for row in first["items"])
    assert (await list_history(db, owner_id="other"))["total"] == 1


@pytest.mark.asyncio
async def test_literal_search_and_source_filters_connect_legacy_journal_receipts(db):
    await seed(db)
    db.add_all(
        [
            record(
                "pyq_sessions",
                "set",
                {
                    "status": "active",
                    "config": {"subjectSlug": "algorithms", "topicSlug": "graphs"},
                    "question_uids": ["q1", "q2"],
                },
            ),
            record(
                "pyq_attempts",
                "receipt",
                {
                    "question_uid": "q1",
                    "pyq_session_id": "set",
                    "subject": "algorithms",
                    "question_snapshot": {
                        "topic": "graphs",
                        "html": "<p>100%_independent</p><script>hidden script</script>",
                    },
                    "mark_decision": "MARK",
                },
            ),
            record(
                "questions",
                "journal",
                {
                    "source_pyq_attempt_id": "receipt",
                    "session_id": "set",
                    "subject": "algorithms",
                    "subtopic": "graphs",
                    "capture_note": "100%_independent reflection",
                },
            ),
            record("questions", "near", {"question_text": "100XXXindependent"}),
            record(
                "pyq_attempts", "other-receipt", {"question_uid": "private-question"}, owner="other"
            ),
            record("questions", "invalid-reference", {"source_pyq_attempt_id": "other-receipt"}),
        ]
    )
    await db.commit()
    literal = await list_history(db, owner_id="owner", q="%_")
    assert {row["record_id"] for row in literal["items"]} == {"receipt", "journal"}
    assert "hidden script" not in json.dumps(literal, default=str)
    filtered = await list_history(
        db,
        owner_id="owner",
        subject="algorithms",
        topic="graphs",
        session_id="set",
        question_uid="q1",
    )
    assert {row["record_id"] for row in filtered["items"]} == {"receipt", "journal", "set"}
    assert (await list_history(db, owner_id="owner", question_uid="private-question"))["total"] == 0
    sessions = await list_history(db, owner_id="owner", collection="pyq_sessions")
    assert sessions["items"][0]["state"] == "active"
    assert "skip" not in sessions["items"][0]["title"].lower()
    assert sessions["items"][0]["href"] == "/session/set/review"


@pytest.mark.asyncio
async def test_detail_owner_isolation_and_bounded_sanitized_sources(db):
    await seed(db)
    db.add_all(
        [
            record(
                "pyq_attempts",
                "a",
                {
                    "question_uid": "q",
                    "pyq_session_id": "s",
                    "correct_answer": ["A"],
                    "screenshot_url": "private",
                    "question_snapshot": {
                        "html": "<p>Question</p><style>hidden</style>",
                        "answer_source": {"key": "A"},
                    },
                    "selected_answer": ["B"],
                },
            ),
            record("pyq_sessions", "s", {"status": "completed"}),
            record(
                "study_memory",
                "thinking",
                {
                    "title": "Thinking",
                    "attempt_id": "a",
                    "question_uid": "q",
                    "data": {"source_attempt_ids": ["a"]},
                    "content": "<b>I thought so</b>",
                },
            ),
            record(
                "study_memory",
                "array-link",
                {"title": "Repair", "data": {"source_attempt_ids": ["a"]}},
            ),
            record(
                "study_memory",
                "not-a-link",
                {"title": "Different", "data": {"source_attempt_ids": ["aa"]}},
            ),
            record("study_memory", "private-thinking", {"attempt_id": "a"}, owner="other"),
            record(
                "concept_pages",
                "concept",
                {
                    "concept": "Connectivity",
                    "source_ids": ["capture", "private-capture"],
                    "insight_ids": ["insight"],
                    "explanation": "x" * 80_000,
                    "secret_token": "private",
                },
            ),
            record(
                "learning_insights",
                "insight",
                {"concept_id": "concept", "core_idea": "Connectivity condition"},
            ),
            record(
                "source_captures",
                "capture",
                {
                    "sources": [
                        {
                            "title": "Discussion",
                            "excerpt": "<b>Original reasoning</b>",
                            "url": "https://example.org/source",
                        }
                    ]
                },
            ),
            record(
                "source_captures",
                "private-capture",
                {"sources": [{"title": "Private discussion"}]},
                owner="other",
            ),
        ]
    )
    await db.commit()
    detail = await get_history_detail(
        db, owner_id="owner", collection="pyq_attempts", record_id="a"
    )
    assert {row["record_id"] for row in detail["linked_memory"]} == {"thinking", "array-link"}
    assert [row["record_id"] for row in detail["sources"]] == ["s"]
    assert detail["evidence"]["selected_answer"] == ["B"]
    assert detail["evidence"]["question_snapshot"]["html"] == "Question"
    assert "correct_answer" not in detail["evidence"] and "screenshot_url" not in detail["evidence"]
    assert "answer_source" not in detail["evidence"]["question_snapshot"]
    concept = await get_history_detail(
        db, owner_id="owner", collection="concept_pages", record_id="concept"
    )
    assert {row["record_id"] for row in concept["sources"]} == {"capture", "insight"}
    assert concept["evidence_truncated"] is True and len(concept["evidence"]["explanation"]) <= 6000
    assert "secret_token" not in concept["evidence"]
    capture = await get_history_detail(
        db, owner_id="owner", collection="source_captures", record_id="capture"
    )
    assert capture["evidence"]["sources"][0]["excerpt"] == "Original reasoning"
    for collection, record_id in [
        ("pyq_attempts", "a"),
        ("source_captures", "capture"),
        ("unrelated", "id"),
    ]:
        with pytest.raises(HTTPException) as error:
            await get_history_detail(
                db, owner_id="other", collection=collection, record_id=record_id
            )
        assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_detail_relations_are_explicitly_bounded(db):
    await seed(db)
    db.add(record("pyq_attempts", "a", {"question_uid": "q"}))
    db.add_all(
        record("study_memory", f"m{i}", {"title": f"Note {i}", "attempt_id": "a"})
        for i in range(60)
    )
    await db.commit()
    detail = await get_history_detail(
        db, owner_id="owner", collection="pyq_attempts", record_id="a"
    )
    assert len(detail["linked_memory"]) == 50 and detail["related_truncated"] is True


@pytest.mark.asyncio
async def test_all_ten_sources_have_working_projections_and_concept_filters(db):
    await seed(db)
    rows = [
        record("study_memory", "memory", {"title": "Thinking", "state": "draft"}),
        record("pyq_attempts", "attempt", {"question_uid": "q", "mark_decision": "SKIP"}),
        record("pyq_sessions", "session", {"status": "paused"}),
        record("questions", "journal", {"question_text": "Journal"}),
        record("formulas", "formula", {"name": "Euler", "expression": "V-E+F=2"}),
        record(
            "concept_pages",
            "concept",
            {
                "concept": "Tree",
                "summary": "Connected and acyclic",
                "subject": "Discrete Mathematics",
                "topic": "Graphs",
            },
        ),
        record("learning_insights", "insight", {"concept": "Tree", "core_idea": "Unique paths"}),
        record("concept_reviews", "review", {"concept_id": "concept", "prompt": "Define a tree"}),
        record("learning_items", "item", {"subject": "Algorithms", "recovery_state": "active"}),
        record(
            "mock_tests", "mock", {"name": "15 question test", "source_pyq_session_id": "session"}
        ),
    ]
    db.add_all(rows)
    await db.commit()
    result = await list_history(db, owner_id="owner")
    assert result["total"] == 10
    indexed = {item["collection"]: item for item in result["items"]}
    assert indexed["formulas"]["excerpt"] == "V-E+F=2"
    assert indexed["concept_pages"]["excerpt"] == "Connected and acyclic"
    assert indexed["concept_reviews"]["subject"] == "Discrete Mathematics"
    assert indexed["concept_reviews"]["href"] == "/concept-review/review"
    assert indexed["learning_items"]["state"] == "active"
    assert indexed["pyq_attempts"]["state"] == "SKIP"
    assert indexed["pyq_sessions"]["state"] == "paused"
    filtered = await list_history(
        db, owner_id="owner", subject="Discrete Mathematics", topic="Graphs"
    )
    assert {item["record_id"] for item in filtered["items"]} == {"concept", "review"}
    with pytest.raises(HTTPException):
        await list_history(db, owner_id="owner", collection="secrets")
