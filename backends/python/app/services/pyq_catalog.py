"""Versioned PYQ catalog served from the bundled JSON question bank.

The question bank is authored once as JSON (`public/pyq`) and mirrored into
`app/data/pyq` by `scripts/sync_pyq_bank_data.py`. Catalog content is not
stored in PostgreSQL; account data and historical attempt snapshots remain
there. Removing the duplicate catalog reduces database storage usage. This module keeps a read-only
in-memory view of the bundled bank and exposes the same validation, scoring,
and payload shapes the database-backed catalog used to serve.

All catalog reads route through :func:`load_catalog`, a single overridable seam
that tests patch to inject a purpose-built bank.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import HTTPException

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "pyq"

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


@dataclass(frozen=True)
class CatalogQuestion:
    """One immutable question row of the bundled bank.

    The attribute surface mirrors the retired ``PyqCatalogQuestion`` model so the
    scoring and payload helpers work unchanged.
    """

    question_uid: str
    book_slug: str
    year: int
    set_number: int | None
    number: str
    paper_label: str
    subject: str
    subject_slug: str
    classification_hint: dict[str, Any] | None
    topic: str
    topic_slug: str
    subtopics: list[str]
    marks: int | None
    question_type: str
    choices: list[str] | None
    answer: Any
    tolerance: dict[str, Any] | None
    answer_status: str
    html: str
    source_url: str
    answer_source: Any
    content_hash: str
    source_hash: str
    integrity_status: str
    duplicate_of_uid: str | None
    ordinal: int = 0


@dataclass(frozen=True)
class CatalogBank:
    """The active bundled question bank."""

    version: str
    manifest: dict[str, Any]
    question_count: int
    source_hash: str
    questions: tuple[CatalogQuestion, ...]
    by_uid: dict[str, CatalogQuestion] = field(repr=False)
    by_subject: dict[str, tuple[CatalogQuestion, ...]] = field(repr=False)

    @property
    def active(self) -> bool:
        return True


def build_catalog(
    *,
    manifest: dict[str, Any],
    questions: list[dict[str, Any]],
    conflicting_ids: set[str],
) -> CatalogBank:
    """Build an immutable in-memory bank from raw question dicts."""
    version = manifest["bankVersion"]
    rows, _stats = prepare_catalog_rows(questions, conflicting_ids)
    catalog = tuple(CatalogQuestion(**row, ordinal=index) for index, row in enumerate(rows))
    by_uid = {question.question_uid: question for question in catalog}
    if len(by_uid) != len(catalog):
        raise ValueError("Duplicate PYQ id in bundled bank")
    by_subject: dict[str, list[CatalogQuestion]] = {}
    for question in catalog:
        by_subject.setdefault(question.subject_slug, []).append(question)
    ordered_subjects = {
        slug: tuple(sorted(items, key=lambda q: (q.year, q.paper_label, q.ordinal)))
        for slug, items in by_subject.items()
    }
    return CatalogBank(
        version=version,
        manifest=manifest,
        question_count=len(catalog),
        source_hash=canonical_hash({"manifest": manifest, "questions": questions}),
        questions=catalog,
        by_uid=by_uid,
        by_subject=ordered_subjects,
    )


_CACHED: CatalogBank | None = None


def _read_bundled_bank() -> CatalogBank:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text())
    questions: list[dict[str, Any]] = []
    for subject in manifest["subjects"]:
        payload = json.loads((DATA_DIR / "subjects" / Path(subject["file"]).name).read_text())
        if payload["bankVersion"] != manifest["bankVersion"]:
            raise ValueError(f"Mixed bank versions in {subject['file']}")
        questions.extend(payload["questions"])
    conflicts = json.loads((DATA_DIR / "pyq-key-conflicts.json").read_text())
    conflicting_ids = {uid for group in conflicts for uid in group["ids"]}
    if len(questions) != manifest["questionCount"]:
        raise ValueError("Manifest question count does not match subject payloads")
    return build_catalog(manifest=manifest, questions=questions, conflicting_ids=conflicting_ids)


def load_catalog() -> CatalogBank:
    """Return the cached bundled bank.

    This is the single seam tests patch to inject a purpose-built bank; every
    catalog accessor resolves it at call time through this module's globals.
    """
    global _CACHED
    if _CACHED is None:
        _CACHED = _read_bundled_bank()
    return _CACHED


def active_bank() -> CatalogBank:
    try:
        return load_catalog()
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=503, detail="The bundled PYQ catalog is unavailable"
        ) from exc


def question_payload(question: CatalogQuestion) -> dict[str, Any]:
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


def search_catalog(
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
    bank = active_bank()
    needle = text.strip().lower()
    matches = [
        question
        for question in bank.questions
        if (subject_slug is None or question.subject_slug == subject_slug)
        and (topic_slug is None or question.topic_slug == topic_slug)
        and (year_from is None or question.year >= year_from)
        and (year_to is None or question.year <= year_to)
        and (not needle or needle in question.html.lower())
    ]
    matches.sort(key=lambda q: (-q.year, q.paper_label, q.number))
    count = len(matches)
    window = matches[offset : offset + limit]
    return {
        "bank_version": bank.version,
        "items": [
            {
                "id": question.question_uid,
                "year": question.year,
                "paper_label": question.paper_label,
                "subject": question.subject,
                "subject_slug": question.subject_slug,
                "topic": question.topic,
                "topic_slug": question.topic_slug,
                "marks": question.marks,
                "type": question.question_type,
                "answer_status": question.answer_status,
                "integrity_status": question.integrity_status,
                "source_url": question.source_url,
                "preview_html": question.html[:500],
            }
            for question in window
        ],
        "total_matches": count,
        "next_offset": offset + limit if offset + limit < count else None,
        "complete": True,
    }


def catalog_question(question_uid: str) -> dict[str, Any]:
    bank = active_bank()
    question = bank.by_uid.get(question_uid)
    if question is None:
        raise HTTPException(404, "Unknown PYQ question")
    return {"bank_version": bank.version, **question_payload(question)}


def catalog_subject(subject_slug: str) -> tuple[CatalogQuestion, ...]:
    questions = active_bank().by_subject.get(subject_slug)
    if not questions:
        raise HTTPException(404, "Unknown PYQ subject")
    return questions


def bank_question(question_uid: str, version: str | None = None) -> CatalogQuestion:
    bank = active_bank()
    if version and version != bank.version:
        raise HTTPException(409, "PYQ bank changed; assign a current transfer question")
    question = bank.by_uid.get(question_uid)
    if question is None:
        raise HTTPException(404, "Recovery question is unavailable in the current bank")
    return question


def transfer_candidate(
    source: CatalogQuestion,
    *,
    excluded_uids: set[str],
    required_uid: str | None = None,
) -> CatalogQuestion | None:
    """Pick an unseen, answerable same-topic transfer outside the sealed reserve."""
    candidates = [
        question
        for question in active_bank().by_subject.get(source.subject_slug, ())
        if question.topic_slug == source.topic_slug
        and question.question_uid != source.question_uid
        and question.content_hash != source.content_hash
        and question.answer_status == "available"
        and question.integrity_status != "quarantined"
        and question.question_type in OBJECTIVE_TYPES
        and question.question_uid not in excluded_uids
        and (required_uid is None or question.question_uid == required_uid)
    ]
    candidates.sort(key=lambda q: q.question_uid)
    return candidates[0] if candidates else None
