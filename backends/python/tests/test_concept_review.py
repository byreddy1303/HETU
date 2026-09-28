from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db.models import User
from app.services.concept_review import (
    ReviewDraft,
    ReviewResponse,
    create_review,
    get_review,
    list_reviews,
    record_review_response,
)
from app.services.learning_library import CaptureRequest, capture_learning
from tests.test_learning_library import capture


@pytest.mark.asyncio
async def test_recall_records_actual_assistance_and_transfer_provenance(db) -> None:
    db.add_all([User(id="learner"), User(id="another")])
    await db.commit()
    saved = await capture_learning(
        db,
        owner_id="learner",
        request=CaptureRequest.model_validate(capture()),
        app_url="https://hetu.test",
    )
    await db.commit()
    draft = ReviewDraft(
        idempotency_key="recall-bayes-1",
        concept_id=saved["concept_ids"][0],
        insight_id=saved["insight_ids"][0],
        kind="recall",
        prompt="Why divide by P(e)?",
        evaluation_guidance="Normalize all hypothesis weights.",
        question_origin="saved_note",
    )
    review = await create_review(db, owner_id="learner", draft=draft, app_url="https://hetu.test")
    await db.commit()
    assert (await create_review(db, owner_id="learner", draft=draft, app_url="https://hetu.test"))[
        "idempotent_replay"
    ] is True
    assert await list_reviews(db, owner_id="another") == []
    with pytest.raises(HTTPException) as missing:
        await get_review(db, owner_id="another", review_id=review["id"])
    assert missing.value.status_code == 404

    assisted = ReviewResponse(
        expected_version=1,
        attempt_id="first-assisted-attempt",
        answer="Weights divided by total after viewing guidance",
        assistance="solution",
        evaluation="correct",
        evaluated_by="self",
    )
    result = await record_review_response(
        db, owner_id="learner", review_id=review["id"], response=assisted
    )
    await db.commit()
    assert result["version"] == 2
    assert result["unaided_correct_count"] == 0
    assert result["attempts"][0]["independent_transfer"] is False
    assert "mastery" not in result
    assert (
        await record_review_response(
            db, owner_id="learner", review_id=review["id"], response=assisted
        )
    )["idempotent_replay"] is True

    unaided = ReviewResponse(
        expected_version=2,
        attempt_id="second-unaided-attempt",
        answer="The denominator is the evidence probability.",
        assistance="none",
        evaluation="correct",
        evaluated_by="self",
    )
    result = await record_review_response(
        db, owner_id="learner", review_id=review["id"], response=unaided
    )
    await db.commit()
    assert result["unaided_correct_count"] == 1
    with pytest.raises(HTTPException) as stale:
        await record_review_response(
            db,
            owner_id="learner",
            review_id=review["id"],
            response=ReviewResponse(
                expected_version=2,
                attempt_id="third-stale-attempt",
                answer="Answer",
                assistance="none",
                evaluation="ungraded",
                evaluated_by="self",
            ),
        )
    assert stale.value.status_code == 409

    transfer = await create_review(
        db,
        owner_id="learner",
        app_url="https://hetu.test",
        draft=ReviewDraft(
            idempotency_key="transfer-bayes-1",
            concept_id=saved["concept_ids"][0],
            kind="transfer",
            prompt="A new Bayes problem",
            question_origin="new_variant",
        ),
    )
    await db.commit()
    result = await record_review_response(
        db,
        owner_id="learner",
        review_id=transfer["id"],
        response=ReviewResponse(
            expected_version=1,
            attempt_id="unseen-variant-1",
            answer="My calculation",
            assistance="none",
            evaluation="ungraded",
            evaluated_by="self",
        ),
    )
    assert result["attempts"][0]["independent_transfer"] is True
