from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PyqBank, PyqCatalogQuestion

OBJECTIVE_TYPES = frozenset({"MCQ", "MSQ", "NAT"})
ANSWER_STATUSES = frozenset({"available", "ambiguous", "marks-to-all", "unsupported"})


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def prepare_catalog_rows(
    questions: list[dict[str, Any]], conflicting_ids: set[str]
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    seen_ids: set[str] = set()
    canonical_by_content: dict[str, str] = {}
    rows: list[dict[str, Any]] = []
    stats: Counter[str] = Counter()
    for question in questions:
        uid = question.get("id")
        if not isinstance(uid, str) or not uid or uid in seen_ids:
            raise ValueError(f"Invalid or duplicate PYQ id: {uid!r}")
        seen_ids.add(uid)
        html = question.get("html")
        if not isinstance(html, str) or not html.strip():
            raise ValueError(f"PYQ {uid} has no question content")
        question_type = str(question.get("type", "UNSUPPORTED")).upper()
        answer_status = question.get("answerStatus")
        if answer_status not in ANSWER_STATUSES:
            raise ValueError(f"PYQ {uid} has invalid answer status: {answer_status!r}")
        marks = question.get("marks")
        if marks is not None and (type(marks) is not int or marks <= 0):
            raise ValueError(f"PYQ {uid} has invalid marks: {marks!r}")
        if question_type in OBJECTIVE_TYPES and answer_status == "available":
            if question.get("answer") is None:
                raise ValueError(f"PYQ {uid} is marked available without an answer")
            integrity_status = "verified" if marks is not None else "unscorable"
        else:
            integrity_status = "unscorable"
        if uid in conflicting_ids:
            integrity_status = "quarantined"

        content_hash = hashlib.sha256(html.strip().encode()).hexdigest()
        duplicate_of = canonical_by_content.get(content_hash)
        canonical_by_content.setdefault(content_hash, uid)
        if duplicate_of:
            stats["duplicates"] += 1
        stats[integrity_status] += 1
        if marks is None:
            stats["missing_marks"] += 1

        rows.append(
            {
                "question_uid": uid,
                "book_slug": str(question.get("bookSlug") or "gate-cse"),
                "year": int(question["year"]),
                "set_number": question.get("set"),
                "number": str(question["number"]),
                "paper_label": str(question["paperLabel"]),
                "subject": str(question["subject"]),
                "subject_slug": str(question["subjectSlug"]),
                "classification_hint": question.get("classificationHint"),
                "topic": str(question["topic"]),
                "topic_slug": str(question["topicSlug"]),
                "subtopics": list(question.get("subtopics") or []),
                "marks": marks,
                "question_type": question_type,
                "choices": question.get("choices"),
                "answer": question.get("answer"),
                "tolerance": question.get("tolerance"),
                "answer_status": str(answer_status),
                "html": html,
                "source_url": str(question.get("sourceUrl") or ""),
                "answer_source": question.get("answerSource"),
                "content_hash": content_hash,
                "source_hash": canonical_hash(question),
                "integrity_status": integrity_status,
                "duplicate_of_uid": duplicate_of,
            }
        )
    stats["total"] = len(rows)
    return rows, dict(stats)


async def active_bank(db: AsyncSession) -> PyqBank:
    bank = await db.scalar(select(PyqBank).where(PyqBank.active.is_(True)))
    if bank is None:
        raise HTTPException(status_code=503, detail="The PYQ catalog has not been imported")
    return bank


def question_payload(question: PyqCatalogQuestion) -> dict[str, Any]:
    quarantined = question.integrity_status == "quarantined"
    return {
        "id": question.question_uid,
        "bookSlug": question.book_slug,
        "year": question.year,
        "set": question.set_number,
        "number": question.number,
        "paperLabel": question.paper_label,
        "subject": question.subject,
        "subjectSlug": question.subject_slug,
        "classificationHint": question.classification_hint,
        "topic": question.topic,
        "topicSlug": question.topic_slug,
        "subtopics": question.subtopics,
        "marks": question.marks,
        "type": "AMBIGUOUS" if quarantined else question.question_type,
        "choices": question.choices,
        "answer": None if quarantined else question.answer,
        "tolerance": question.tolerance,
        "answerStatus": "ambiguous" if quarantined else question.answer_status,
        "html": question.html,
        "sourceUrl": question.source_url,
        "answerSource": question.answer_source,
    }
