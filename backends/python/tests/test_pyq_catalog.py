from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

import app.services.pyq_catalog as pyq_catalog
from app.services.pyq_catalog import (
    CatalogQuestion,
    active_bank,
    build_catalog,
    catalog_question,
    prepare_catalog_rows,
    question_payload,
    search_catalog,
)

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


def install_catalog(monkeypatch, questions, conflicting_ids=(), manifest=None):
    """Inject a purpose-built in-memory bank through the catalog seam."""
    resolved = {"bankVersion": "v1", **(manifest or {})}
    bank = build_catalog(
        manifest=resolved,
        questions=list(questions),
        conflicting_ids=set(conflicting_ids),
    )
    monkeypatch.setattr(pyq_catalog, "load_catalog", lambda: bank)
    return bank


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
    row = CatalogQuestion(
        **prepare_catalog_rows([sample_question()], {"gate:test:1"})[0][0], ordinal=0
    )
    payload = question_payload(row)
    assert payload["answer"] is None
    assert payload["answerStatus"] == "ambiguous"
    assert payload["type"] == "AMBIGUOUS"


def test_missing_active_catalog_is_explicit(monkeypatch) -> None:
    def missing():
        raise FileNotFoundError("bank not bundled")

    monkeypatch.setattr(pyq_catalog, "load_catalog", missing)
    with pytest.raises(HTTPException) as exc_info:
        active_bank()
    assert exc_info.value.status_code == 503


def test_catalog_search_filters_and_preserves_answer_integrity(monkeypatch) -> None:
    first = sample_question()
    second = sample_question(
        id="gate:test:2", year=2025, topicSlug="graphs", html="<p>Graph traversal?</p>"
    )
    install_catalog(monkeypatch, [first, second], {"gate:test:2"})

    found = search_catalog(subject_slug="algorithms", year_from=2026, limit=1)
    assert found["total_matches"] == 1
    assert found["items"][0]["id"] == "gate:test:1"
    assert "answer" not in found["items"][0]
    assert found["complete"] is True
    quarantined = catalog_question("gate:test:2")
    assert quarantined["answer"] is None
    assert quarantined["answerStatus"] == "ambiguous"


def test_shipped_bank_passes_server_validation() -> None:
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


def test_bundled_bank_is_in_sync_with_public_source() -> None:
    # The served catalog reads app/data/pyq; it must not drift from the authored
    # public/pyq source that the site ships.
    manifest = json.loads((ROOT / "public/pyq/manifest.json").read_text())
    bundled = Path(pyq_catalog.DATA_DIR)
    sources = [ROOT / "public/pyq/manifest.json", ROOT / "src/data/pyq-key-conflicts.json"]
    targets = [bundled / "manifest.json", bundled / "pyq-key-conflicts.json"]
    for subject in manifest["subjects"]:
        rel = subject["file"].lstrip("/")
        sources.append(ROOT / "public" / rel)
        targets.append(bundled / Path(rel).relative_to("pyq"))
    for source, target in zip(sources, targets, strict=True):
        assert target.is_file(), f"missing bundled copy: {target}"
        assert target.read_bytes() == source.read_bytes(), f"drift: {source}"


def test_bundled_bank_loads_through_catalog_seam() -> None:
    bank = pyq_catalog.load_catalog()
    manifest = json.loads((ROOT / "public/pyq/manifest.json").read_text())
    assert bank.version == manifest["bankVersion"]
    assert bank.question_count == manifest["questionCount"] == 4334


@pytest.mark.asyncio
async def test_catalog_http_contract_reads_bundled_json_without_catalog_database() -> None:
    from app.api.deps import get_current_user
    from app.core.security import Identity
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app

    async def signed_in():
        return Identity(user_id="catalog-reader")

    async def unexpected_db():
        raise AssertionError("Catalog routes must not query the database after authentication")
        yield  # Make this a dependency generator, matching get_db.

    assert "pyq_banks" not in Base.metadata.tables
    assert "pyq_catalog_questions" not in Base.metadata.tables
    app.dependency_overrides[get_current_user] = signed_in
    app.dependency_overrides[get_db] = unexpected_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.get("/v1/pyq/manifest")
            assert response.status_code == 200
            manifest = response.json()
            assert manifest["questionCount"] == 4334
            for subject in manifest["subjects"]:
                response = await client.get(
                    f"/v1/pyq/subjects/{subject['slug']}",
                    params={"bank_version": manifest["bankVersion"]},
                )
                assert response.status_code == 200
                payload = response.json()
                assert payload["bankVersion"] == manifest["bankVersion"]
                assert len(payload["questions"]) == subject["count"]
            question = payload["questions"][0]
            response = await client.get(f"/v1/pyq/questions/{question['id']}")
            assert response.status_code == 200
            assert response.json() == question
            response = await client.get("/v1/pyq/search", params={"limit": 1})
            assert response.status_code == 200
            assert response.json()["total_matches"] == 4334
            assert "answer" not in response.json()["items"][0]
            assert (
                await client.get("/v1/pyq/subjects/algorithms?bank_version=stale")
            ).status_code == 409
            assert (await client.get("/v1/pyq/subjects/not-a-subject")).status_code == 404
            assert (await client.get("/v1/pyq/questions/not-a-question")).status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
