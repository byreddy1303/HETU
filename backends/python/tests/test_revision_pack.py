from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.api.deps import get_current_user
from app.core.config import Settings, get_settings
from app.core.security import Identity
from app.db.models import Record, User
from app.db.session import get_db
from app.main import app
from app.services.concept_review import ReviewDraft, create_review
from app.services.learning_evidence import EvidenceLinkDraft, link_evidence
from app.services.learning_library import (
    CaptureRequest,
    InsightRevision,
    capture_learning,
    revise_insight,
)
from app.services.records import upsert_records
from app.services.revision_pack import (
    PackDraft,
    PackOptions,
    build_pack,
    get_saved_pack,
    list_saved_packs,
    save_pack,
)
from tests.test_learning_library import capture

APP_URL = "https://hetu.example.test"


async def seed(db):
    db.add_all(
        [User(id="pack-owner", profile={"timezone": "Asia/Kolkata"}), User(id="other-owner")]
    )
    await db.commit()
    saved = await capture_learning(
        db,
        owner_id="pack-owner",
        request=CaptureRequest.model_validate(capture("revision-discussion")),
        app_url=APP_URL,
    )
    for collection, items in {
        "formulas": [
            {
                "id": "f-due",
                "subject": "Probability",
                "name": "Bayes",
                "expression": "P(h|e)",
                "next_review": "2026-10-09",
            },
            {
                "id": "f-future",
                "subject": "Probability",
                "name": "Later",
                "next_review": "2026-10-11",
            },
            {
                "id": "f-invalid",
                "subject": "Probability",
                "name": "No due evidence",
                "next_review": "invalid",
            },
        ],
        "questions": [
            {
                "id": "q-due",
                "subject": "Probability",
                "outcome": "W-C",
                "pattern_name": "Normalization",
                "capture_note": "Forgot the denominator",
            },
            {
                "id": "q-recent",
                "subject": "Probability",
                "outcome": "RBG",
                "pattern_name": "Normalization",
            },
            {
                "id": "q-correct",
                "subject": "Probability",
                "outcome": "R",
                "pattern_name": "Normalization",
            },
            {"id": "q-unknown", "subject": "Probability", "pattern_name": "Normalization"},
        ],
        "reattempts": [
            {"id": "r1", "question_id": "q-due", "stage": "D3", "scheduled_date": "2026-10-08"},
            {"id": "r2", "question_id": "q-due", "stage": "D10", "scheduled_date": "2026-10-09"},
        ],
        "trigger_phrases": [
            {
                "id": "t-seen",
                "subject": "Probability",
                "phrase": "Weighted hypotheses",
                "concept": "Bayes",
                "reflex_time_ms": 900,
            },
            {
                "id": "t-unseen",
                "subject": "Probability",
                "phrase": "Total evidence",
                "concept": "Normalization",
                "reflex_time_ms": None,
            },
        ],
        "weekly_reviews": [
            {
                "id": "w-past",
                "week_start": "2026-10-05",
                "this_weeks_fix": "Check conditioning before normalizing.",
            },
            {"id": "w-future", "week_start": "2026-10-12", "this_weeks_fix": "A future focus"},
        ],
    }.items():
        await upsert_records(db, owner_id="pack-owner", collection=collection, items=items)
    await upsert_records(
        db,
        owner_id="other-owner",
        collection="formulas",
        items=[{"id": "f-secret", "name": "Private formula", "next_review": "2026-10-01"}],
    )
    review = await create_review(
        db,
        owner_id="pack-owner",
        app_url=APP_URL,
        draft=ReviewDraft(
            idempotency_key="revision-review",
            concept_id=saved["concept_ids"][0],
            kind="recall",
            prompt="Explain the normalization step without hints.",
            evaluation_guidance="Hidden evaluation answer",
            question_origin="saved_note",
            due_on=date(2026, 10, 9),
        ),
    )
    await link_evidence(
        db,
        owner_id="pack-owner",
        draft=EvidenceLinkDraft(
            idempotency_key="revision-evidence",
            source_concept_id=saved["concept_ids"][0],
            target_collection="formulas",
            target_record_id="f-due",
            rationale="Use the denominator from this discussion.",
        ),
    )
    await db.commit()
    return saved, review


@pytest.mark.asyncio
async def test_pack_combines_sourced_learning_with_due_work_without_fabricating_activity(db):
    saved, review = await seed(db)
    pack = await build_pack(
        db, owner_id="pack-owner", options=PackOptions(as_of=date(2026, 10, 9)), app_url=APP_URL
    )
    sections = pack["sections"]
    assert sections["weekly_focus"]["id"] == "w-past"
    assert [item["id"] for item in sections["due_formulas"]] == ["f-due"]
    assert sections["triggers"][0]["id"] == "t-unseen"
    assert [item["id"] for item in sections["priority_questions"]] == ["q-due", "q-recent"]
    assert sections["repeated_mistakes"] == [
        {"subject": "Probability", "name": "Normalization", "count": 2}
    ]
    concept = sections["saved_concepts"][0]
    assert concept["id"] == saved["concept_ids"][0]
    assert concept["sources"][0]["id"] == saved["source_id"]
    assert concept["reasoning_origin"] == "learner_stated"
    assert "sum need not be one" in concept["reasoning_correction"]
    assert concept["evidence_links"][0]["record"]["id"] == "f-due"
    assert concept["evidence_links"][0]["record"]["version"] == 1
    assert sections["due_reviews"][0]["id"] == review["id"]
    assert "Hidden evaluation answer" not in str(pack)
    assert "Private formula" not in str(pack)
    assert pack["complete"] is True
    assert "Study chat" not in pack["text"]  # only actual source titles are used
    assert "Why Bayes normalization matters" in pack["text"]
    assert "Full explanation and history:" in pack["text"]
    row = await db.scalar(select(Record).where(Record.collection == "concept_reviews"))
    assert row.version == 1 and row.data["attempts"] == []


@pytest.mark.asyncio
async def test_pack_snapshot_replay_survives_new_learning_and_detects_stale_preview(db):
    saved, _ = await seed(db)
    options = PackOptions(as_of=date(2026, 10, 9), subject="Probability")
    preview = await build_pack(db, owner_id="pack-owner", options=options, app_url=APP_URL)
    draft = PackDraft(
        **options.model_dump(),
        idempotency_key="save-revision-sheet",
        expected_content_hash=preview["content_hash"],
    )
    receipt = await save_pack(db, owner_id="pack-owner", draft=draft, app_url=APP_URL)
    await db.commit()
    await revise_insight(
        db,
        owner_id="pack-owner",
        insight_id=saved["insight_ids"][0],
        revision=InsightRevision(
            expected_version=1,
            revision_reason="Improved after discussion",
            core_idea="Normalize the weighted evidence.",
        ),
    )
    await db.commit()
    replay = await save_pack(db, owner_id="pack-owner", draft=draft, app_url=APP_URL)
    assert replay["id"] == receipt["id"] and replay["idempotent_replay"] is True
    assert replay["snapshot"] == receipt["snapshot"]
    read = await get_saved_pack(db, owner_id="pack-owner", pack_id=receipt["id"])
    assert read["snapshot"]["sections"]["saved_concepts"][0]["version"] == 1
    assert "Normalize the weighted evidence." not in read["snapshot"]["text"]
    with pytest.raises(HTTPException) as stale:
        await save_pack(
            db,
            owner_id="pack-owner",
            draft=draft.model_copy(update={"idempotency_key": "stale-revision-sheet"}),
            app_url=APP_URL,
        )
    assert stale.value.status_code == 409
    with pytest.raises(HTTPException) as conflict:
        await save_pack(
            db, owner_id="pack-owner", draft=draft.model_copy(update={"limit": 5}), app_url=APP_URL
        )
    assert conflict.value.status_code == 409
    assert (
        await db.scalar(select(func.count(Record.id)).where(Record.collection == "revision_packs"))
        == 1
    )
    with pytest.raises(HTTPException) as other:
        await get_saved_pack(db, owner_id="other-owner", pack_id=receipt["id"])
    assert other.value.status_code == 404
    assert (await list_saved_packs(db, owner_id="other-owner"))["items"] == []


@pytest.mark.asyncio
async def test_pack_timezone_and_partial_retrieval_are_explicit(db, monkeypatch):
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 10, 9, 20, tzinfo=UTC)
            return value.astimezone(tz) if tz else value

    await seed(db)
    monkeypatch.setattr("app.services.revision_pack.datetime", FixedDatetime)
    pack = await build_pack(db, owner_id="pack-owner", options=PackOptions(), app_url=APP_URL)
    assert pack["as_of"] == "2026-10-10" and pack["timezone"] == "Asia/Kolkata"
    monkeypatch.setattr("app.services.revision_pack.SCAN_LIMIT", 1)
    partial = await build_pack(
        db, owner_id="pack-owner", options=PackOptions(limit=1), app_url=APP_URL
    )
    assert partial["complete"] is False
    assert partial["scan"]["formulas"]["complete"] is False
    assert "Partial retrieval" in partial["text"]
    filtered = await build_pack(
        db, owner_id="pack-owner", options=PackOptions(subject="Other subject"), app_url=APP_URL
    )
    assert filtered["sections"]["saved_concepts"] == []


@pytest.mark.asyncio
async def test_revision_pack_api_auth_ownership_and_write_boundary(db):
    await seed(db)
    principal = {"id": "pack-owner"}

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id=principal["id"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, environment="test", clerk_secret_key="sk_test_configured"
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            assert (await client.get("/v1/revision-pack")).status_code == 401
            app.dependency_overrides[get_current_user] = override_user
            preview = await client.get("/v1/revision-pack?as_of=2026-10-09&subject=Probability")
            assert preview.status_code == 200, preview.text
            draft = {
                "idempotency_key": "http-revision-sheet",
                "as_of": "2026-10-09",
                "subject": "Probability",
                "expected_content_hash": preview.json()["content_hash"],
            }
            response = await client.post("/v1/revision-pack/saved", json=draft)
            assert response.status_code == 200, response.text
            pack_id = response.json()["id"]
            assert (await client.post("/v1/revision-pack/saved", json=draft)).json()[
                "idempotent_replay"
            ] is True
            assert (
                await client.patch(
                    f"/v1/records/revision_packs/{pack_id}",
                    json={"data": {"snapshot": {}}, "expected_version": 1},
                )
            ).status_code == 403
            assert (
                await client.post(
                    "/v1/compat/tables/revision_packs/upsert",
                    json={"values": [{"id": pack_id, "snapshot": {}}]},
                )
            ).status_code == 403
            listed = (await client.get("/v1/revision-pack/saved?limit=1")).json()
            assert listed["items"][0]["id"] == pack_id
            principal["id"] = "other-owner"
            assert (await client.get(f"/v1/revision-pack/saved/{pack_id}")).status_code == 404
            assert (await client.get("/v1/revision-pack/saved")).json()["items"] == []
    finally:
        app.dependency_overrides.clear()
