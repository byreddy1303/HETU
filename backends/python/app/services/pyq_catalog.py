from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
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


async def search_catalog(
    db: AsyncSession,
    *,
    subject_slug: str | None = None,
    topic_slug: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    text: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    if not 1 <= limit <= 100 or offset < 0 or len(text) > 200:
        raise HTTPException(422, "Use limit 1–100, offset >= 0, and text <= 200 characters")
    if year_from and year_to and year_from > year_to:
        raise HTTPException(422, "year_from must not exceed year_to")
    bank = await active_bank(db)
    conditions = [PyqCatalogQuestion.bank_version == bank.version]
    if subject_slug:
        conditions.append(PyqCatalogQuestion.subject_slug == subject_slug)
    if topic_slug:
        conditions.append(PyqCatalogQuestion.topic_slug == topic_slug)
    if year_from is not None:
        conditions.append(PyqCatalogQuestion.year >= year_from)
    if year_to is not None:
        conditions.append(PyqCatalogQuestion.year <= year_to)
    if text.strip():
        escaped = text.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(PyqCatalogQuestion.html.ilike(f"%{escaped}%", escape="\\"))
    total = await db.scalar(select(func.count()).select_from(PyqCatalogQuestion).where(*conditions))
    rows = (
        await db.scalars(
            select(PyqCatalogQuestion)
            .where(*conditions)
            .order_by(
                PyqCatalogQuestion.year.desc(),
                PyqCatalogQuestion.paper_label,
                PyqCatalogQuestion.number,
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()
    count = int(total or 0)
    return {
        "bank_version": bank.version,
        "items": [
            {
                "id": row.question_uid,
                "year": row.year,
                "paper_label": row.paper_label,
                "subject": row.subject,
                "subject_slug": row.subject_slug,
                "topic": row.topic,
                "topic_slug": row.topic_slug,
                "marks": row.marks,
                "type": row.question_type,
                "answer_status": row.answer_status,
                "integrity_status": row.integrity_status,
                "source_url": row.source_url,
                "preview_html": row.html[:500],
            }
            for row in rows
        ],
        "total_matches": count,
        "next_offset": offset + limit if offset + limit < count else None,
        "complete": True,
    }


async def catalog_question(db: AsyncSession, question_uid: str) -> dict[str, Any]:
    bank = await active_bank(db)
    question = await db.scalar(
        select(PyqCatalogQuestion).where(
            PyqCatalogQuestion.bank_version == bank.version,
            PyqCatalogQuestion.question_uid == question_uid,
        )
    )
    if question is None:
        raise HTTPException(404, "Unknown PYQ question")
    return {"bank_version": bank.version, **question_payload(question)}
