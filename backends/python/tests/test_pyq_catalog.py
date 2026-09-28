from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.db.models import PyqCatalogQuestion
from app.services.pyq_catalog import active_bank, prepare_catalog_rows, question_payload

ROOT = Path(__file__).resolve().parents[3]


def sample_question(**overrides):
    question = {
        "id": "gate:test:1",
        "bookSlug": "gate-cse",
        "year": 2026,
        "set": 1,
        "number": "1",
        "paperLabel": "GATE CSE 2026 Set 1",
        "subject": "Algorithms",
        "subjectSlug": "algorithms",
        "topic": "Sorting",
        "topicSlug": "sorting",
        "subtopics": ["sorting"],
        "marks": 1,
        "type": "MCQ",
        "choices": ["A", "B", "C", "D"],
        "answer": "B",
        "tolerance": None,
        "answerStatus": "available",
        "html": "<p>Which option is correct?</p>",
        "sourceUrl": "https://example.test/paper",
        "answerSource": {"kind": "official"},
    }
    question.update(overrides)
    return question


def test_catalog_validation_tracks_marks_duplicates_and_conflicts() -> None:
    first = sample_question()
    duplicate = sample_question(id="gate:test:2")
    missing_marks = sample_question(id="gate:test:3", html="<p>Another question</p>", marks=None)

    rows, stats = prepare_catalog_rows([first, duplicate, missing_marks], {"gate:test:2"})

    assert stats == {
        "verified": 1,
        "duplicates": 1,
        "quarantined": 1,
        "unscorable": 1,
        "missing_marks": 1,
        "total": 3,
    }
    assert rows[1]["duplicate_of_uid"] == "gate:test:1"
    assert rows[1]["integrity_status"] == "quarantined"


def test_catalog_rejects_available_objective_question_without_answer() -> None:
    with pytest.raises(ValueError, match="without an answer"):
        prepare_catalog_rows([sample_question(answer=None)], set())


def test_quarantined_payload_never_exposes_conflicting_key() -> None:
    row = PyqCatalogQuestion(
        bank_version="v1",
        **prepare_catalog_rows([sample_question()], {"gate:test:1"})[0][0],
    )
    payload = question_payload(row)
    assert payload["answer"] is None
    assert payload["answerStatus"] == "ambiguous"
    assert payload["type"] == "AMBIGUOUS"


@pytest.mark.asyncio
async def test_missing_active_catalog_is_explicit(db) -> None:
    with pytest.raises(HTTPException) as exc_info:
        await active_bank(db)
    assert exc_info.value.status_code == 503


def test_shipped_bank_passes_server_import_validation() -> None:
    manifest = json.loads((ROOT / "public/pyq/manifest.json").read_text())
    questions = []
    for subject in manifest["subjects"]:
        subject_path = ROOT / "public" / subject["file"].lstrip("/")
        questions.extend(json.loads(subject_path.read_text())["questions"])
    conflicts = json.loads((ROOT / "src/data/pyq-key-conflicts.json").read_text())
    rows, stats = prepare_catalog_rows(
        questions, {uid for conflict in conflicts for uid in conflict["ids"]}
    )
    assert len(rows) == manifest["questionCount"] == 4334
    assert stats["missing_marks"] == 261
    assert stats["quarantined"] == 4
    assert stats["duplicates"] == 13
