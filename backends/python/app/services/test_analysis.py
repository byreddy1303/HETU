"""A conversation-to-app test handoff, committed as one owner-scoped transaction."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.schemas import RecordQuery
from app.services import recovery
from app.services.concept_review import ReviewDraft, create_review
from app.services.learning_evidence import EvidenceLinkDraft, link_evidence
from app.services.learning_library import (
    CaptureRequest,
    InsightDraft,
    SourceDraft,
    StrictModel,
    capture_learning,
    fingerprint,
    key,
    stable_id,
)
from app.services.question_screenshots import (
    OpenAIFile,
    QuestionCrop,
    download_screenshot,
    question_image,
)
from app.services.realtime import broker
from app.services.records import lock_identity, patch_record, query_records, to_api, upsert_records
from app.services.revision_pack import PackDraft, save_pack
from app.services.study_actions import (
    FormulaDraft,
    PlannerDraft,
    SyllabusDraft,
    TriggerDraft,
    WeeklyDraft,
    execute_action,
)
from app.services.workflows import BriefStart, BriefUpdate, start_workflow, update_workflow


class QuestionDraft(StrictModel):
    ref: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=160)
    topic: str | None = Field(default=None, max_length=300)
    question_text: str = Field(min_length=1, max_length=30000)
    answer_text: str | None = Field(default=None, max_length=30000)
    learner_answer: str | None = Field(default=None, max_length=10000)
    source_ref: str | None = Field(default=None, max_length=500)
    outcome: Literal["R", "RBS", "RBG", "W-C", "W-E", "W-R"] | None = None
    outcome_provenance: Literal["screenshot", "learner_reported"] | None = None
    time_spent_sec: int | None = Field(default=None, ge=0, le=86400, strict=True)
    duration_source: Literal["reported", "unknown"] = "unknown"
    target_time_sec: int = Field(default=120, ge=1, le=86400, strict=True)
    format: Literal["MCQ", "MSQ", "NAT"] | None = None
    capture_note: str | None = Field(default=None, max_length=10000)
    root_cause: Literal["concept", "formula", "reading", "computation", "strategy"] | None = None
    pattern_name: str | None = Field(default=None, max_length=300)
    trigger_sentence: str | None = Field(default=None, max_length=3000)
    analysis_provenance: Literal["learner_reported", "assistant_hypothesis"] = (
        "assistant_hypothesis"
    )
    schedule_recovery: bool = True
    expected_version: int = Field(default=0, ge=0, strict=True)
    screenshot_index: int | None = Field(default=None, ge=0, le=11, strict=True)
    question_crop: QuestionCrop | None = None
    image_is_question_only: bool = False

    @model_validator(mode="after")
    def evidence(self) -> QuestionDraft:
        if (self.outcome is None) != (self.outcome_provenance is None):
            raise ValueError("A logged outcome needs screenshot or learner-reported provenance")
        if (self.time_spent_sec is None) != (self.duration_source == "unknown"):
            raise ValueError("Supply reported time together, or leave duration unknown")
        return self


class DiscussionDraft(StrictModel):
    ref: str = Field(min_length=1, max_length=100)
    insight: InsightDraft
    question_refs: list[str] = Field(default_factory=list, max_length=100)
    schedule_recall: bool = True


class FormulaItem(StrictModel):
    ref: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=300)
    subject: str = Field(min_length=1, max_length=160)
    expression: str = Field(min_length=1, max_length=30000)
    discussion_refs: list[str] = Field(default_factory=list, max_length=40)
    record_id: str | None = Field(default=None, min_length=1, max_length=128)
    expected_version: int = Field(default=0, ge=0, strict=True)


class CueItem(StrictModel):
    ref: str = Field(min_length=1, max_length=100)
    phrase: str = Field(min_length=1, max_length=3000)
    concept: str = Field(min_length=1, max_length=3000)
    question_refs: list[str] = Field(default_factory=list, max_length=100)
    discussion_refs: list[str] = Field(default_factory=list, max_length=40)
    record_id: str | None = Field(default=None, min_length=1, max_length=128)
    expected_version: int = Field(default=0, ge=0, strict=True)


class MockSummary(StrictModel):
    record_id: str | None = Field(default=None, min_length=1, max_length=128)
    expected_version: int = Field(default=0, ge=0, strict=True)
    total_marks: float = Field(allow_inf_nan=False)
    max_marks: float = Field(gt=0, allow_inf_nan=False)
    total_questions: int = Field(ge=1, le=1000, strict=True)
    correct: int = Field(ge=0, strict=True)
    wrong: int = Field(ge=0, strict=True)
    skipped: int = Field(ge=0, strict=True)
    duration_min: int = Field(ge=0, le=1440, strict=True)
    evidence_provenance: Literal["screenshot", "learner_reported"]
    paper_scope: Literal["full_length", "sectional", "topic", "unknown"] = "unknown"
    freshness: Literal["unseen", "partially_seen", "repeated", "unknown"] = "unknown"
    timed: bool | None = None
    closed_book: bool | None = None
    single_sitting: bool | None = None
    scoring_coverage_pct: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def totals(self) -> MockSummary:
        if self.correct + self.wrong + self.skipped != self.total_questions:
            raise ValueError("Correct, wrong and skipped must add up to total_questions")
        if not -self.max_marks <= self.total_marks <= self.max_marks:
            raise ValueError("Score must be within the paper's possible mark range")
        return self


FollowUpAction = Annotated[
    PlannerDraft | WeeklyDraft | SyllabusDraft, Field(discriminator="action")
]


class TestAnalysisDraft(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    test_key: str = Field(min_length=1, max_length=160)
    expected_version: int = Field(default=0, ge=0, strict=True)
    name: str = Field(min_length=1, max_length=300)
    test_date: date
    summary: str = Field(min_length=1, max_length=10000)
    full_analysis: str = Field(min_length=1, max_length=50000)
    sources: list[SourceDraft] = Field(min_length=1, max_length=12)
    questions: list[QuestionDraft] = Field(default_factory=list, max_length=100)
    discussions: list[DiscussionDraft] = Field(default_factory=list, max_length=40)
    formulas: list[FormulaItem] = Field(default_factory=list, max_length=50)
    recognition_cues: list[CueItem] = Field(default_factory=list, max_length=50)
    mock_summary: MockSummary | None = None
    next_steps: list[str] = Field(default_factory=list, max_length=30)
    unresolved: list[str] = Field(default_factory=list, max_length=30)
    follow_up_actions: list[FollowUpAction] = Field(default_factory=list, max_length=10)
    save_revision_pack: bool = True

    @model_validator(mode="after")
    def unique_refs(self) -> TestAnalysisDraft:
        for items in (self.questions, self.discussions, self.formulas, self.recognition_cues):
            refs = [item.ref for item in items]
            if len(refs) != len(set(refs)):
                raise ValueError("Artifact refs must be unique within each kind")
        for text in self.next_steps + self.unresolved:
            if not text.strip() or len(text) > 1000:
                raise ValueError("Next steps and unresolved items need 1–1000 characters")
        # Bound the complete input before any domain operation mutates records.
        if len(self.model_dump_json().encode()) > 750_000:
            raise ValueError("Save large tests in batches under the same test_key")
        return self


async def _row(db: AsyncSession, owner: str, collection: str, record_id: str) -> Record | None:
    return await db.scalar(
        select(Record)
        .where(
            Record.owner_id == owner,
            Record.collection == collection,
            Record.external_id == record_id,
        )
        .execution_options(populate_existing=True)
    )


async def _save(
    db: AsyncSession, owner: str, collection: str, record_id: str, expected: int, data: dict
) -> Record:
    await lock_identity(db, collection, owner, record_id)
    row = await _row(db, owner, collection, record_id)
    current = row.version if row else 0
    if expected != current:
        raise HTTPException(
            409, {"collection": collection, "id": record_id, "current_version": current}
        )
    if row:
        if row.deleted_at:
            raise HTTPException(409, "Restore archived study evidence before editing")
        return await patch_record(
            db,
            collection=collection,
            owner_id=owner,
            external_id=record_id,
            patch=data,
            expected_version=expected,
        )
    return (
        await upsert_records(
            db, collection=collection, owner_id=owner, items=[{"id": record_id, **data}]
        )
    )[0]


async def _pattern(db: AsyncSession, owner: str, question: QuestionDraft) -> Record:
    rows = list(
        await db.scalars(
            select(Record).where(
                Record.owner_id == owner,
                Record.collection == "patterns",
                Record.deleted_at.is_(None),
                Record.data["subject"].as_string() == question.subject,
                Record.data["name"].as_string() == question.pattern_name,
            )
        )
    )
    if len(rows) > 1:
        raise HTTPException(409, "Several patterns match; reconcile them before saving")
    if rows:
        return rows[0]  # Counts are derived live from Journal; preserve measured mastery.
    return await _save(
        db,
        owner,
        "patterns",
        stable_id(
            "test-pattern", fingerprint([key(question.subject), key(question.pattern_name or "")])
        ),
        0,
        {
            "name": question.pattern_name,
            "subject": question.subject,
            "count": 0,
            "is_reflexed": False,
            "mastery_level": 0,
            "first_seen_at": datetime.now(UTC).isoformat(),
        },
    )


def _qualification(mock: MockSummary) -> list[str]:
    reasons = []
    for value, expected, reason in (
        (mock.total_questions, 65, "question-count-not-65"),
        (mock.max_marks, 100, "max-marks-not-100"),
        (mock.paper_scope, "full_length", "paper-scope-not-full-length"),
        (mock.freshness, "unseen", "freshness-not-unseen"),
        (mock.timed, True, "not-timed"),
        (mock.closed_book, True, "not-closed-book"),
        (mock.single_sitting, True, "not-single-sitting"),
        (mock.scoring_coverage_pct, 100, "scoring-coverage-not-100"),
    ):
        if value != expected:
            reasons.append(reason)
    if mock.duration_min == 0:
        reasons.append("low-active-time")
    return reasons


async def save_test_analysis(
    db: AsyncSession,
    *,
    owner_id: str,
    draft: TestAnalysisDraft,
    app_url: str,
    origin: Literal["chatgpt", "app"] = "chatgpt",
    screenshots: list[OpenAIFile] | None = None,
) -> dict[str, Any]:
    """The caller commits once, or rolls back every artifact on any failure.

    The recovery owner lock is always acquired first, matching existing recovery
    and concept-review operations. A stable test identity also stops accidental
    duplicate imports made with a new operation key.
    """
    await recovery.owner_lock(db, owner_id)

    def operation(part: str) -> str:
        return stable_id("test-analysis-operation", f"{draft.idempotency_key}:{part}")

    receipt_id = operation("receipt")
    request_hash = fingerprint(
        {
            "draft": draft.model_dump(mode="json", exclude={"idempotency_key"}, exclude_unset=True),
            "origin": origin,
            "files": [file.file_id for file in screenshots or []],
        }
    )
    await lock_identity(db, "plugin_receipts", owner_id, receipt_id)
    receipt = await _row(db, owner_id, "plugin_receipts", receipt_id)
    if receipt:
        if receipt.data["request_hash"] != request_hash:
            raise HTTPException(409, "Idempotency key was already used for different test content")
        return {**receipt.data["result"], "idempotent_replay": True}
    report_id = stable_id("test-analysis", key(draft.test_key))
    await lock_identity(db, "test_analyses", owner_id, report_id)
    previous = await _row(db, owner_id, "test_analyses", report_id)
    if (
        previous
        and previous.data.get("request_hash") == request_hash
        and draft.expected_version == 0
    ):
        return {**previous.data["receipt"], "idempotent_replay": True}
    if draft.expected_version != (previous.version if previous else 0):
        raise HTTPException(
            409,
            {
                "message": "Read the saved test before adding or editing evidence",
                "test_analysis_id": report_id,
                "current_version": previous.version if previous else 0,
            },
        )
    if previous and previous.deleted_at:
        raise HTTPException(409, "Saved test is archived")
    if previous and previous.data["test_date"] != draft.test_date.isoformat():
        raise HTTPException(409, "Use a distinct test_key for a different test date")
    _, today, _ = await recovery.account_clock(db, owner_id)
    if draft.test_date > today:
        raise HTTPException(422, "A completed test cannot have a future test_date")

    if len(screenshots or []) > 12:
        raise HTTPException(422, "Save at most 12 screenshots per batch")
    images: dict[str, str] = {}
    downloads: dict[int, bytes] = {}
    used_indices = {q.screenshot_index for q in draft.questions if q.screenshot_index is not None}
    if used_indices != set(range(len(screenshots or []))):
        raise HTTPException(422, "Assign each screenshot to a question using screenshot_index")
    for q in draft.questions:
        if q.screenshot_index is None:
            continue
        if q.screenshot_index not in downloads:
            downloads[q.screenshot_index] = await download_screenshot(
                screenshots[q.screenshot_index]
            )
        images[q.ref] = await asyncio.to_thread(
            question_image, downloads[q.screenshot_index], q.question_crop, q.image_is_question_only
        )

    old = previous.data if previous else {}
    maps = {
        kind: dict(old.get("artifact_maps", {}).get(kind, {}))
        for kind in ("questions", "discussions", "formulas", "recognition_cues")
    }
    question_refs = set(maps["questions"]) | {q.ref for q in draft.questions}
    discussion_refs = set(maps["discussions"]) | {d.ref for d in draft.discussions}
    for item in [*draft.discussions, *draft.recognition_cues]:
        if set(item.question_refs) - question_refs:
            raise HTTPException(422, "A question_ref is not present in this test")
    for item in [*draft.formulas, *draft.recognition_cues]:
        if set(item.discussion_refs) - discussion_refs:
            raise HTTPException(422, "A discussion_ref is not present in this test")
    artifacts = {collection: list(ids) for collection, ids in old.get("artifacts", {}).items()}

    def remember(collection: str, record_id: str) -> None:
        ids = artifacts.setdefault(collection, [])
        if record_id not in ids:
            ids.append(record_id)

    snapshots = {q["ref"]: q for q in old.get("questions", [])}
    for q in draft.questions:
        question_id = stable_id("test-question", f"{report_id}:{q.ref}")
        existing_question = await _row(db, owner_id, "questions", question_id)
        if existing_question and q.ref in snapshots:
            q = QuestionDraft.model_validate(
                {**snapshots[q.ref], **q.model_dump(mode="json", exclude_unset=True)}
            )
        snapshots[q.ref] = q.model_dump(mode="json")
        if existing_question and q.outcome is None and existing_question.data.get("outcome") != "U":
            raise HTTPException(409, "A saved test outcome cannot be erased by an unknown outcome")
        data = q.model_dump(
            mode="json", exclude={"ref", "expected_version", "schedule_recovery", "topic"}
        )
        data.update(
            {
                "session_id": stable_id("test-log-session", report_id),
                "subtopic": q.topic,
                "source_year": None,
                "source_ref": q.source_ref or f"Mock · {draft.name} · {q.ref}",
                "image_url": images.get(q.ref)
                or (existing_question.data.get("image_url") if existing_question else None),
                "image_question_only": q.ref in images
                or bool(existing_question and existing_question.data.get("image_question_only")),
                "outcome": q.outcome or "U",
                "time_spent_sec": q.time_spent_sec or 0,
                "mark_decision": None,
                "mark_correct": None,
                "test_analysis_id": report_id,
                "test_date": draft.test_date.isoformat(),
                "capture_origin": origin,
            }
        )
        await _save(db, owner_id, "questions", question_id, q.expected_version, data)
        maps["questions"][q.ref] = question_id
        remember("questions", question_id)
        if q.pattern_name:
            pattern = await _pattern(db, owner_id, q)
            remember("patterns", pattern.external_id)
        if q.schedule_recovery:
            scheduled = await recovery.schedule_question(
                db, owner_id=owner_id, question_id=question_id
            )
            reattempt = scheduled["compatibilityReattempt"]
            practice_only = q.outcome in {None, "R"} and not any(
                entry.get("result") == "fail" for entry in reattempt.get("history", [])
            )
            if reattempt.get("practice_only") != practice_only:
                await _save(
                    db,
                    owner_id,
                    "reattempts",
                    reattempt["id"],
                    reattempt["version"],
                    {"practice_only": practice_only},
                )
            remember("learning_items", scheduled["item"]["id"])
            remember("reattempts", scheduled["compatibilityReattempt"]["id"])

    session_id = stable_id("test-log-session", report_id)
    if artifacts.get("questions"):
        existing = await _row(db, owner_id, "sessions", session_id)
        await _save(
            db,
            owner_id,
            "sessions",
            session_id,
            existing.version if existing else 0,
            {
                "kind": "log",
                "date": draft.test_date.isoformat(),
                "subject": next(iter({q["subject"] for q in snapshots.values()}))
                if len({q["subject"] for q in snapshots.values()}) == 1
                else "Mixed subjects",
                "target_duration_min": existing.data.get("target_duration_min", 0)
                if existing
                else 0,
                "actual_duration_min": existing.data.get("actual_duration_min")
                if existing
                else None,
                "insight": draft.summary,
                "sadhana_done": existing.data.get("sadhana_done", False) if existing else False,
                "interruptions_count": existing.data.get("interruptions_count", 0)
                if existing
                else 0,
                "test_analysis_id": report_id,
                "capture_origin": origin,
            },
        )
        remember("sessions", session_id)

    async def connect(concept_id: str, collection: str, record_id: str) -> None:
        relation_id = stable_id(
            "concept-evidence", fingerprint([concept_id, collection, record_id])
        )
        existing = await _row(db, owner_id, "concept_relations", relation_id)
        if existing and existing.data.get("active"):
            remember("concept_relations", relation_id)
            return
        result = await link_evidence(
            db,
            owner_id=owner_id,
            draft=EvidenceLinkDraft(
                idempotency_key=operation(f"link:{concept_id}:{collection}:{record_id}"),
                source_concept_id=concept_id,
                target_collection=collection,
                target_record_id=record_id,
                rationale=f"Saved while analyzing {draft.name}; links its study evidence.",
                expected_version=existing.version if existing else None,
            ),
        )
        remember("concept_relations", result["id"])

    for discussion in draft.discussions:
        result = await capture_learning(
            db,
            owner_id=owner_id,
            app_url=app_url,
            request=CaptureRequest(
                idempotency_key=operation(f"discussion:{discussion.ref}"),
                sources=draft.sources,
                insights=[discussion.insight],
            ),
        )
        concept_id = result["concept_ids"][0]
        maps["discussions"][discussion.ref] = concept_id
        remember("source_captures", result["source_id"])
        remember("concept_pages", concept_id)
        for insight_id in result["insight_ids"]:
            remember("learning_insights", insight_id)
        for ref in discussion.question_refs:
            if ref in maps["questions"]:
                await connect(concept_id, "questions", maps["questions"][ref])
        if discussion.schedule_recall and discussion.insight.retrieval_question:
            review = await create_review(
                db,
                owner_id=owner_id,
                app_url=app_url,
                draft=ReviewDraft(
                    idempotency_key=operation(f"recall:{discussion.ref}"),
                    concept_id=concept_id,
                    insight_id=result["insight_ids"][0],
                    kind="recall",
                    prompt=discussion.insight.retrieval_question,
                    evaluation_guidance=discussion.insight.evaluation_guidance,
                    question_origin="saved_note",
                    source_ref=draft.name,
                    due_on=today + timedelta(days=3),
                ),
            )
            remember("concept_reviews", review["id"])
            await connect(concept_id, "concept_reviews", review["id"])

    for item in [*draft.formulas, *draft.recognition_cues]:
        is_formula = isinstance(item, FormulaItem)
        kind, collection = (
            ("formulas", "formulas") if is_formula else ("recognition_cues", "trigger_phrases")
        )
        record_id = (
            item.record_id
            or maps[kind].get(item.ref)
            or stable_id(f"test-{kind}", f"{report_id}:{item.ref}")
        )
        fields = item.model_dump(exclude={"ref", "discussion_refs", "question_refs"})
        fields.update({"record_id": record_id, "idempotency_key": operation(f"{kind}:{item.ref}")})
        if not is_formula:
            fields["question_ids"] = [
                maps["questions"][ref] for ref in item.question_refs if ref in maps["questions"]
            ]
        action = FormulaDraft(**fields) if is_formula else TriggerDraft(**fields)
        result = await execute_action(
            db, owner_id=owner_id, draft=action, app_url=app_url, origin=origin
        )
        maps[kind][item.ref] = result["record"]["id"]
        remember(collection, result["record"]["id"])
        for ref in item.discussion_refs:
            await connect(maps["discussions"][ref], collection, result["record"]["id"])

    if draft.mock_summary:
        mock = draft.mock_summary
        mock_id = mock.record_id or old.get("mock_id") or stable_id("test-mock", report_id)
        existing = await _row(db, owner_id, "mock_tests", mock_id)
        if existing and (
            existing.data.get("source_kind") == "pyq_exam"
            or existing.data.get("test_analysis_id") not in {None, report_id}
        ):
            raise HTTPException(409, "This mock belongs to another source report")
        reasons = _qualification(mock)
        data = mock.model_dump(mode="json", exclude={"record_id", "expected_version"})
        data.update(
            {
                "name": draft.name,
                "test_date": draft.test_date.isoformat(),
                "test_analysis_id": report_id,
                "source_kind": "manual",
                "source_pyq_session_id": None,
                "evidence_status": "supporting" if reasons else "qualified",
                "evidence_reasons": reasons,
                "capture_origin": origin,
            }
        )
        if not existing:
            data.update(
                {
                    "subject_scores": [],
                    "mistakes": draft.next_steps[:3],
                    "planner_date": None,
                    "planner_block_id": None,
                }
            )
        await _save(db, owner_id, "mock_tests", mock_id, mock.expected_version, data)
        remember("mock_tests", mock_id)
    else:
        mock_id = old.get("mock_id")
    if mock_id:
        for concept_id in set(maps["discussions"].values()):
            await connect(concept_id, "mock_tests", mock_id)

    follow_up_receipts = list(old.get("follow_up_receipts", []))
    for index, action in enumerate(draft.follow_up_actions):
        action = action.model_copy(update={"idempotency_key": operation(f"follow-up:{index}")})
        result = await execute_action(
            db, owner_id=owner_id, draft=action, app_url=app_url, origin=origin
        )
        if result.get("record"):
            remember(result["collection"], result["record"]["id"])
        follow_up_receipts.append({"action": result["action"], "href": result["href"]})

    unresolved = list(dict.fromkeys([*old.get("unresolved", []), *draft.unresolved]))
    missing = [
        f"{q['ref']}: confirm its original test outcome; it is already saved for re-attempts."
        for q in snapshots.values()
        if q["outcome"] is None
    ]
    for ref, question_id in maps["questions"].items():
        question = await _row(db, owner_id, "questions", question_id)
        if not question.data.get("image_url"):
            missing.append(f"{ref}: add a question-only screenshot; text practice is available.")
    if not mock_id:
        missing.append("Add the test score and correct/wrong/skipped totals when available.")
    next_steps = list(dict.fromkeys([*old.get("next_steps", []), *draft.next_steps]))
    workflow_id = old.get("workflow_id")
    if not workflow_id:
        brief = await start_workflow(
            db,
            owner_id=owner_id,
            app_url=app_url,
            start=BriefStart(
                idempotency_key=operation("workflow"),
                goal=f"Review {draft.name} and follow through on its learning gaps.",
                references=[f"{app_url.rstrip('/')}/mocks/analysis/{report_id}"],
                pending_steps=list(dict.fromkeys([*next_steps, *unresolved, *missing]))[:40],
                success_criteria=[
                    "Review saved explanations and attempt the scheduled recall and recovery work."
                ],
            ),
        )
        workflow_id = brief["id"]
    brief_row = await _row(db, owner_id, "workflow_records", workflow_id)
    if previous:
        # Keep learner-edited workflow progress and append only new, explicit tasks.
        for step in old.get("missing_information", []):
            if step not in missing and step in brief_row.data.get("pending_steps", []):
                await update_workflow(
                    db,
                    owner_id=owner_id,
                    workflow_id=workflow_id,
                    update=BriefUpdate(
                        expected_version=brief_row.version,
                        operation_id=operation(f"resolved:{step}"),
                        remove_pending_step=step,
                    ),
                )
        for step in [*draft.next_steps, *draft.unresolved, *missing]:
            if step not in brief_row.data.get(
                "pending_steps", []
            ) and step not in brief_row.data.get("completed_steps", []):
                await update_workflow(
                    db,
                    owner_id=owner_id,
                    workflow_id=workflow_id,
                    update=BriefUpdate(
                        expected_version=brief_row.version,
                        operation_id=operation(f"step:{step}"),
                        pending_step=step,
                    ),
                )
    await update_workflow(
        db,
        owner_id=owner_id,
        workflow_id=workflow_id,
        update=BriefUpdate(
            expected_version=brief_row.version,
            operation_id=operation("workflow-receipt"),
            completed_step="Saved test analysis and linked study material.",
            receipt={
                "test_analysis_id": report_id,
                "artifact_counts": {k: len(v) for k, v in artifacts.items()},
            },
        ),
    )
    remember("workflow_records", workflow_id)

    pack_id = (
        stable_id("revision-pack", operation("pack"))
        if draft.save_revision_pack
        else old.get("revision_pack_id")
    )
    result = jsonable_encoder(
        {
            "test_analysis_id": report_id,
            "version": draft.expected_version + 1,
            "href": f"{app_url.rstrip('/')}/mocks/analysis/{report_id}",
            "artifact_counts": {k: len(v) for k, v in artifacts.items()},
            "missing_information": missing,
            "unresolved": unresolved,
            "links": {
                "journal": f"{app_url.rstrip('/')}/journal?session={session_id}"
                if artifacts.get("questions")
                else None,
                "workflow": f"{app_url.rstrip('/')}/workflows/{workflow_id}",
                "revision_pack": f"{app_url.rstrip('/')}/revision-pack?pack={pack_id}"
                if pack_id
                else None,
            },
            "idempotent_replay": False,
            "persisted_at": datetime.now(UTC).isoformat(),
        }
    )
    await _save(
        db,
        owner_id,
        "test_analyses",
        report_id,
        draft.expected_version,
        {
            "test_key": draft.test_key,
            "name": draft.name,
            "test_date": draft.test_date.isoformat(),
            "summary": draft.summary,
            "full_analysis": draft.full_analysis,
            "sources": [
                *old.get("sources", []),
                *[
                    s.model_dump(mode="json")
                    for s in draft.sources
                    if s.model_dump(mode="json") not in old.get("sources", [])
                ],
            ],
            "questions": list(snapshots.values()),
            "artifact_maps": maps,
            "artifacts": artifacts,
            "next_steps": next_steps,
            "unresolved": unresolved,
            "missing_information": missing,
            "session_id": session_id if artifacts.get("questions") else None,
            "mock_id": mock_id,
            "workflow_id": workflow_id,
            "revision_pack_id": pack_id,
            "follow_up_receipts": follow_up_receipts,
            "capture_origin": origin,
            "request_hash": request_hash,
            "receipt": result,
        },
    )
    if draft.save_revision_pack:
        await save_pack(
            db,
            owner_id=owner_id,
            app_url=app_url,
            draft=PackDraft(
                idempotency_key=operation("pack"),
                test_analysis_id=report_id,
                limit=20,
            ),
        )
    await upsert_records(
        db,
        collection="plugin_receipts",
        owner_id=owner_id,
        items=[
            {
                "id": receipt_id,
                "request_hash": request_hash,
                "result": result,
            }
        ],
    )
    return result


async def get_test_analysis(
    db: AsyncSession, *, owner_id: str, report_id: str, include_images: bool = False
) -> dict[str, Any]:
    row = await _row(db, owner_id, "test_analyses", report_id)
    if row is None or row.deleted_at:
        raise HTTPException(404, "Saved test analysis not found")
    artifacts = {}
    for collection, ids in row.data["artifacts"].items():
        records = await db.scalars(
            select(Record).where(
                Record.owner_id == owner_id,
                Record.collection == collection,
                Record.external_id.in_(ids),
                Record.deleted_at.is_(None),
            )
        )
        artifacts[collection] = []
        for item in records:
            record = (
                {
                    "id": item.external_id,
                    "version": item.version,
                    "updated_at": item.updated_at,
                }
                if collection in {"source_captures", "learning_insights", "workflow_records"}
                else to_api(item)
            )
            if collection == "questions" and not include_images:
                record["has_image"] = bool(record.pop("image_url", None))
            artifacts[collection].append(record)
    return jsonable_encoder({"report": to_api(row), "artifacts": artifacts})


async def get_question_image(
    db: AsyncSession, *, owner_id: str, report_id: str, question_id: str
) -> dict[str, Any]:
    report = await _row(db, owner_id, "test_analyses", report_id)
    if (
        report is None
        or report.deleted_at
        or question_id not in report.data["artifacts"].get("questions", [])
    ):
        raise HTTPException(404, "Test question not found")
    question = await _row(db, owner_id, "questions", question_id)
    if question is None or question.deleted_at:
        raise HTTPException(404, "Test question not found")
    return {"image_url": question.data.get("image_url")}


async def publish_test_analysis(owner_id: str, result: dict[str, Any]) -> None:
    """Notify open app tabs after commit without broadcasting screenshot bytes."""
    if result["idempotent_replay"]:
        return
    await broker.publish(
        owner_id,
        {
            "type": "broadcast",
            "topic": f"user-sync:{owner_id}",
            "event": "sync_mutation",
            "payload": {"tables": list(result["artifact_counts"])},
        },
    )


async def list_test_analyses(
    db: AsyncSession, *, owner_id: str, limit: int = 25, cursor: str | None = None
) -> dict[str, Any]:
    if not 1 <= limit <= 100:
        raise HTTPException(422, "Limit must be 1–100")
    rows, next_cursor = await query_records(
        db,
        owner_id=owner_id,
        collection="test_analyses",
        query=RecordQuery(limit=limit, cursor=cursor, descending=True),
    )
    return jsonable_encoder(
        {
            "items": [
                {
                    "id": row.external_id,
                    "name": row.data["name"],
                    "test_date": row.data["test_date"],
                    "summary": row.data["summary"],
                    "version": row.version,
                    "question_count": len(row.data["questions"]),
                    "missing_information": row.data["missing_information"],
                    "capture_origin": row.data["capture_origin"],
                }
                for row in rows
            ],
            "next_cursor": next_cursor,
            "complete": next_cursor is None,
        }
    )
