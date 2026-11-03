"""Private desktop question books, kept outside the bundled/public PYQ bank."""

from __future__ import annotations

import copy
import os
from collections import Counter
from pathlib import Path


def local_test_bank_path() -> Path | None:
    if os.environ.get("ENVIRONMENT") != "local" or not os.environ.get("HETU_DATA_DIR"):
        return None
    return Path(os.environ["HETU_DATA_DIR"]) / "test-series-bank.json"


def merge_local_test_bank(manifest: dict, questions: list[dict], extra: dict) -> dict:
    """Add separately labelled books without modifying official book metadata."""
    result = copy.deepcopy(manifest)
    existing_books = {book["slug"] for book in result["books"]}
    existing_ids = {question["id"] for question in questions}
    for book in extra.get("books", []):
        slug = book["slug"]
        if not slug.startswith("local-test-series-") or slug in existing_books:
            raise ValueError("Local test books need unique local-test-series- identities")
        existing_books.add(slug)
        items = book["questions"]
        if not items:
            raise ValueError("A local test book must contain questions")
        for question in items:
            if question["id"] in existing_ids or question.get("bookSlug") != slug:
                raise ValueError("Local question identity conflicts with the catalog")
            existing_ids.add(question["id"])
        subjects = []
        for subject_slug in dict.fromkeys(q["subjectSlug"] for q in items):
            selected = [q for q in items if q["subjectSlug"] == subject_slug]
            topics = Counter(q["topicSlug"] for q in selected)
            subject = {
                "slug": subject_slug, "label": selected[0]["subject"],
                "count": len(selected), "file": f"{subject_slug}.json",
                "topics": [
                    {"slug": topic, "label": next(q["topic"] for q in selected if q["topicSlug"] == topic), "count": count}
                    for topic, count in topics.items()
                ],
            }
            subjects.append(subject)
            combined = next((s for s in result["subjects"] if s["slug"] == subject_slug), None)
            if combined is None:
                result["subjects"].append(copy.deepcopy(subject))
            else:
                combined["count"] += len(selected)
                for topic in subject["topics"]:
                    found = next((t for t in combined["topics"] if t["slug"] == topic["slug"]), None)
                    if found:
                        found["count"] += topic["count"]
                    else:
                        combined["topics"].append(copy.deepcopy(topic))
        years = Counter(q["year"] for q in items)
        statuses = {status: sum(q["answerStatus"] == status for q in items)
                    for status in ("available", "ambiguous", "marks-to-all", "unsupported")}
        result["books"].append({
            "slug": slug, "label": book["label"], "shortLabel": "Test Series",
            "description": "Imported local test questions. Uses the source-provided answer key.",
            "difficultyFloor": "mixed", "sourceClass": "user-import",
            "source": "Local test screenshots", "sourceUrl": "",
            "count": len(items), "firstYear": min(years), "lastYear": max(years),
            "answerStatuses": statuses,
            "years": [{"year": year, "count": count} for year, count in sorted(years.items())],
            "subjects": subjects,
        })
        questions.extend(items)
    result["questionCount"] = len(questions)
    years = Counter(q["year"] for q in questions)
    result["years"] = [{"year": year, "count": count} for year, count in sorted(years.items())]
    result["firstYear"], result["lastYear"] = min(years), max(years)
    result["answerStatuses"] = dict(Counter(q["answerStatus"] for q in questions))
    return result
