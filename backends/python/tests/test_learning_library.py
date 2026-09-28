from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.deps import get_current_user
from app.core.security import Identity
from app.db.models import User
from app.db.session import get_db
from app.main import app
from app.services.learning_library import CaptureRequest


def capture(key: str = "save-conversation-1") -> dict:
    return {
        "idempotency_key": key,
        "sources": [
            {
                "kind": "conversation",
                "title": "Why Bayes normalization matters",
                "conversation_id": "conversation-17",
                "excerpt": "I previously assumed the likelihoods already summed to one.",
            }
        ],
        "insights": [
            {
                "subject": "Probability",
                "topic": "Bayesian inference",
                "concept": "Posterior normalization",
                "aliases": ["Bayes denominator"],
                "core_idea": "Normalize likelihood times prior across the hypotheses.",
                "full_explanation": (
                    "For each hypothesis h, multiply P(e|h) by P(h). "
                    "The sum across all h is P(e), which normalizes the posterior. "
                    "This also works when likelihoods do not sum to one."
                ),
                "reasoning_origin": "learner_stated",
                "prior_reasoning": (
                    "I assumed likelihoods already formed a distribution over hypotheses."
                ),
                "reasoning_correction": (
                    "Likelihoods are conditioned on each hypothesis; their sum need not be one."
                ),
                "intuition": "Divide weights by their total mass.",
                "examples": ["Two hypotheses with weights 0.2 and 0.6 become 0.25 and 0.75."],
                "recognition_cues": ["Evidence changes the relative weights."],
                "retrieval_question": "Why do we divide by P(e)?",
            }
        ],
    }


def test_source_urls_reject_script_and_credential_links() -> None:
    for url in ("javascript:alert(1)", "https://user:pass@example.com/notes"):
        payload = capture()
        payload["sources"][0]["url"] = url
        with pytest.raises(ValidationError):
            CaptureRequest.model_validate(payload)


@pytest.mark.asyncio
async def test_authenticated_capture_search_detail_revise_and_account_boundary(db) -> None:
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    await db.commit()
    principal = {"id": "learner-a"}

    async def override_db():
        yield db

    async def override_user():
        return Identity(user_id=principal["id"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            saved = await client.post("/v1/learning/captures", json=capture())
            assert saved.status_code == 200, saved.text
            receipt = saved.json()
            assert len(receipt["concept_ids"]) == len(receipt["insight_ids"]) == 1
            assert receipt["links"][0].endswith(receipt["concept_ids"][0])

            retry = await client.post("/v1/learning/captures", json=capture())
            assert retry.status_code == 200
            assert retry.json()["idempotent_replay"] is True
            assert retry.json()["source_id"] == receipt["source_id"]

            conflict = await client.post(
                "/v1/learning/captures",
                json={**capture(), "sources": [{"kind": "manual", "title": "Different"}]},
            )
            assert conflict.status_code == 409

            search = await client.get("/v1/learning/search?q=bayes%20denominator")
            assert search.status_code == 200
            assert search.json()["complete"] is True
            assert [row["id"] for row in search.json()["items"]] == receipt["concept_ids"]

            detail = await client.get(
                f"/v1/learning/concepts/{receipt['concept_ids'][0]}?include_history=true"
            )
            assert detail.status_code == 200
            assert detail.json()["complete"] is True
            assert "likelihoods do not sum" in detail.json()["insights"][0]["full_explanation"]
            assert detail.json()["sources"][0]["sources"][0]["conversation_id"] == "conversation-17"

            generic_edit = await client.patch(
                f"/v1/records/learning_insights/{receipt['insight_ids'][0]}",
                json={"data": {"full_explanation": "overwrite"}, "expected_version": 1},
            )
            assert generic_edit.status_code == 403
            compat_edit = await client.post(
                "/v1/compat/tables/concept_pages/upsert",
                json={"values": [{"id": receipt["concept_ids"][0], "summary": "overwrite"}]},
            )
            assert compat_edit.status_code == 403

            revised = await client.patch(
                f"/v1/learning/insights/{receipt['insight_ids'][0]}",
                json={
                    "expected_version": 1,
                    "revision_reason": "Added a counterexample",
                    "full_explanation": "Weights 0.2 and 0.6 normalize to 0.25 and 0.75.",
                },
            )
            assert revised.status_code == 200
            assert revised.json()["version"] == 2
            stale = await client.patch(
                f"/v1/learning/insights/{receipt['insight_ids'][0]}",
                json={"expected_version": 1, "revision_reason": "stale", "core_idea": "wrong"},
            )
            assert stale.status_code == 409
            history = await client.get(
                f"/v1/records/learning_insights/{receipt['insight_ids'][0]}/history"
            )
            assert [row["version"] for row in history.json()] == [2, 1]
            assert "likelihoods do not sum" in history.json()[1]["full_explanation"]

            principal["id"] = "learner-b"
            assert (await client.get("/v1/learning/search?q=bayes")).json()["items"] == []
            assert (
                await client.get(f"/v1/learning/concepts/{receipt['concept_ids'][0]}")
            ).status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_repeated_save_with_new_key_does_not_duplicate_insight(db) -> None:
    from app.services.learning_library import CaptureRequest, capture_learning, learning_detail

    db.add(User(id="learner"))
    await db.commit()
    first = await capture_learning(
        db,
        owner_id="learner",
        request=CaptureRequest.model_validate(capture()),
        app_url="https://app.test",
    )
    await db.commit()
    second = await capture_learning(
        db,
        owner_id="learner",
        request=CaptureRequest.model_validate(capture("save-conversation-2")),
        app_url="https://app.test",
    )
    await db.commit()
    assert first["source_id"] == second["source_id"]
    assert first["insight_ids"] == second["insight_ids"]
    detail = await learning_detail(db, owner_id="learner", concept_id=first["concept_ids"][0])
    assert len(detail["insights"]) == len(detail["sources"]) == 1
    assert detail["insights"][0]["version"] == 1
