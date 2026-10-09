from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import Record, RecordRevision, User
from app.db.session import get_db
from app.main import app
from app.services.learning_evidence import EvidenceLinkDraft, link_evidence
from app.services.learning_library import CaptureRequest, capture_learning, learning_detail
from app.services.records import upsert_records
from tests.test_learning_library import capture


@pytest.mark.asyncio
async def test_evidence_links_http_ownership_history_and_delayed_retry(db):
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    await db.commit()
    saved = await capture_learning(
        db,
        owner_id="learner-a",
        request=CaptureRequest.model_validate(capture()),
        app_url="https://hetu.test",
    )
    concept_id = saved["concept_ids"][0]
    for owner, record_id in [
        ("learner-a", "formula-1"),
        ("learner-a", "formula-2"),
        ("learner-b", "secret"),
    ]:
        await upsert_records(
            db,
            owner_id=owner,
            collection="formulas",
            items=[
                {
                    "id": record_id,
                    "name": "Bayes denominator",
                    "expression": "P(E) = sum P(E|H)P(H)",
                }
            ],
        )
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id="learner-a")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    draft = {
        "idempotency_key": "evidence-test-one",
        "source_concept_id": concept_id,
        "target_collection": "formulas",
        "target_record_id": "formula-1",
        "rationale": "This formula is the normalizing constant discussed here.",
    }
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            found = await client.get("/v1/learning/evidence?collection=formulas&q=bayes&limit=1")
            assert found.status_code == 200
            assert found.json()["total_matches"] == 2
            assert found.json()["next_offset"] == 1
            assert found.json()["complete"] is True
            assert (
                await client.get("/v1/learning/evidence?collection=account_state")
            ).status_code == 422
            assert (await client.get("/v1/learning/evidence/formulas/secret")).status_code == 404
            foreign = await client.post(
                "/v1/learning/evidence-links", json={**draft, "target_record_id": "secret"}
            )
            assert foreign.status_code == 404
            created = await client.post("/v1/learning/evidence-links", json=draft)
            assert created.status_code == 200, created.text
            assert created.json()["version"] == 1
            detail = (await client.get(f"/v1/learning/concepts/{concept_id}")).json()
            assert detail["links"] == []
            assert detail["evidence_links"][0]["evidence"]["title"] == "Bayes denominator"
            assert detail["evidence_links_complete"] is True
            evidence = await client.get("/v1/learning/evidence/formulas/formula-1")
            assert evidence.json()["item"]["expression"] == "P(E) = sum P(E|H)P(H)"
            revised = await client.post(
                "/v1/learning/evidence-links",
                json={
                    **draft,
                    "idempotency_key": "evidence-test-two",
                    "expected_version": 1,
                    "active": False,
                },
            )
            assert revised.status_code == 200
            assert revised.json()["version"] == 2
            retry = await client.post("/v1/learning/evidence-links", json=draft)
            assert retry.json()["idempotent_replay"] is True
            assert retry.json()["version"] == 1
            current = await learning_detail(db, owner_id="learner-a", concept_id=concept_id)
            assert current["evidence_links"][0]["active"] is False
            conflict = await client.post(
                "/v1/learning/evidence-links", json={**draft, "rationale": "Changed content"}
            )
            assert conflict.status_code == 409
            stale = await client.post(
                "/v1/learning/evidence-links",
                json={
                    **draft,
                    "idempotency_key": "evidence-test-stale",
                    "expected_version": 1,
                },
            )
            assert stale.status_code == 409
            missing_version = await client.post(
                "/v1/learning/evidence-links",
                json={**draft, "idempotency_key": "evidence-test-version"},
            )
            assert missing_version.status_code == 428
            row = await db.scalar(select(Record).where(Record.collection == "concept_relations"))
            history = (
                await db.scalars(select(RecordRevision).where(RecordRevision.record_id == row.id))
            ).all()
            assert {item.version for item in history} == {1, 2}
            assert (
                await client.patch(
                    f"/v1/records/concept_relations/{row.external_id}",
                    json={"data": {"active": True}, "expected_version": 2},
                )
            ).status_code == 403
            target = await db.scalar(
                select(Record).where(
                    Record.collection == "formulas", Record.external_id == "formula-1"
                )
            )
            target.deleted_at = datetime.now(UTC)
            await db.commit()
            unavailable = await learning_detail(db, owner_id="learner-a", concept_id=concept_id)
            assert unavailable["evidence_links"][0]["evidence"] is None
            # A deleted target can still be disconnected without losing link history.
            removed = await link_evidence(
                db,
                owner_id="learner-a",
                draft=EvidenceLinkDraft.model_validate(
                    {
                        **draft,
                        "idempotency_key": "evidence-delete-target",
                        "expected_version": 2,
                        "active": False,
                    }
                ),
            )
            assert removed["version"] == 3
            with pytest.raises(HTTPException) as denied:
                await link_evidence(
                    db, owner_id="learner-b", draft=EvidenceLinkDraft.model_validate(draft)
                )
            assert denied.value.status_code == 404
    finally:
        app.dependency_overrides.clear()
