from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db.models import User
from app.services.learning_library import (
    CaptureRequest,
    ConceptLinkDraft,
    capture_learning,
    learning_detail,
    link_concepts,
)
from tests.test_learning_library import capture


@pytest.mark.asyncio
async def test_concept_links_are_owned_versioned_idempotent_and_acyclic(db) -> None:
    db.add_all([User(id="learner-a"), User(id="learner-b")])
    await db.commit()
    first = await capture_learning(
        db,
        owner_id="learner-a",
        request=CaptureRequest.model_validate(capture("save-first-concept")),
        app_url="https://hetu.example.test",
    )
    second_payload = capture("save-second-concept")
    second_payload["insights"][0].update(
        topic="Conditional probability",
        concept="Conditional probability",
        core_idea="Condition on the information already observed.",
    )
    second = await capture_learning(
        db,
        owner_id="learner-a",
        request=CaptureRequest.model_validate(second_payload),
        app_url="https://hetu.example.test",
    )
    first_id, second_id = first["concept_ids"][0], second["concept_ids"][0]
    draft = ConceptLinkDraft(
        idempotency_key="prerequisite-link-1",
        source_concept_id=second_id,
        target_concept_id=first_id,
        relation="prerequisite_for",
        rationale="Conditional probability is needed to understand the Bayesian update.",
    )

    created = await link_concepts(db, owner_id="learner-a", draft=draft)
    assert created["version"] == 1
    replay = await link_concepts(db, owner_id="learner-a", draft=draft)
    assert replay["id"] == created["id"]
    assert replay["idempotent_replay"] is True

    target_detail = await learning_detail(db, owner_id="learner-a", concept_id=first_id)
    assert target_detail["links"][0]["direction"] == "incoming"
    assert target_detail["links"][0]["other_concept"]["id"] == second_id
    assert target_detail["links"][0]["relation"] == "prerequisite_for"

    revised = await link_concepts(
        db,
        owner_id="learner-a",
        draft=draft.model_copy(
            update={
                "idempotency_key": "prerequisite-link-2",
                "expected_version": 1,
                "rationale": (
                    "Conditional probability supplies the evidence update used by Bayes' rule."
                ),
            }
        ),
    )
    assert revised["version"] == 2
    with pytest.raises(HTTPException) as stale:
        await link_concepts(
            db,
            owner_id="learner-a",
            draft=draft.model_copy(
                update={
                    "idempotency_key": "prerequisite-link-stale",
                    "expected_version": 1,
                    "rationale": "Stale rationale",
                }
            ),
        )
    assert stale.value.status_code == 409

    with pytest.raises(HTTPException) as cycle:
        await link_concepts(
            db,
            owner_id="learner-a",
            draft=ConceptLinkDraft(
                idempotency_key="prerequisite-link-cycle",
                source_concept_id=first_id,
                target_concept_id=second_id,
                relation="prerequisite_for",
                rationale="Would close a cycle.",
            ),
        )
    assert cycle.value.status_code == 409

    with pytest.raises(HTTPException) as foreign:
        await link_concepts(db, owner_id="learner-b", draft=draft)
    assert foreign.value.status_code == 404

    inactive = await link_concepts(
        db,
        owner_id="learner-a",
        draft=draft.model_copy(
            update={
                "idempotency_key": "prerequisite-unlink-1",
                "expected_version": 2,
                "active": False,
            }
        ),
    )
    assert inactive["active"] is False
    assert (await learning_detail(db, owner_id="learner-a", concept_id=first_id))["links"][0][
        "active"
    ] is False
