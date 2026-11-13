"""Reviewed question-to-skill links and original teaching contrasts.

The mapping is not certification of the source answer key. Changed bank content
fails closed until its mapping is reviewed again.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException

from app.services.pyq_catalog import active_bank


@lru_cache(maxsize=1)
def curriculum() -> dict:
    return json.loads(
        (Path(__file__).resolve().parents[1] / "data/skill-curriculum.json").read_text()
    )


def skill_by_id(skill_id: str) -> dict:
    for skill in curriculum()["skills"]:
        if skill["id"] == skill_id:
            return skill
    raise HTTPException(404, "This skill is not in the reviewed curriculum.")


def mapped_uids(skill_id: str) -> list[str]:
    bank = active_bank()
    return [
        item["uid"]
        for item in skill_by_id(skill_id)["questions"]
        if item["uid"] in bank.by_uid
        and bank.by_uid[item["uid"]].source_hash == item["source_hash"]
    ]


def select_skill_questions(
    skill_id: str, seen: set[str], *, fresh: bool = True, source_uids: list[str] | None = None
) -> list[str]:
    bank = active_bank()
    # Always reserve benchmark content for this pilot, including partially exposed papers.
    reserved = {
        uid
        for paper in bank.manifest.get("benchmarkPapers", [])
        for uid in paper.get("questionUids", [])
    }
    hashes = {bank.by_uid[uid].content_hash for uid in seen if uid in bank.by_uid}
    selected = []
    for uid in mapped_uids(skill_id):
        question = bank.by_uid[uid]
        if (
            uid in reserved
            or question.integrity_status != "verified"
            or question.answer_status != "available"
            or question.duplicate_of_uid
            or question.question_type not in {"MCQ", "MSQ", "NAT"}
        ):
            continue
        if fresh and (uid in seen or question.content_hash in hashes):
            continue
        if not fresh and uid not in (source_uids or []):
            continue
        selected.append(uid)
        hashes.add(question.content_hash)
        if len(selected) == 3:
            break
    return selected


def public_skill(skill: dict, *, feedback: bool = False) -> dict:
    result = {
        key: skill[key] for key in ("id", "title", "subject", "topic", "prerequisites", "review")
    }
    result["question_uids"] = mapped_uids(skill["id"])
    result["mapped_count"] = len(mapped_uids(skill["id"]))
    result["mapping_count"] = len(skill["questions"])
    result["probes"] = [
        {
            key: value
            for key, value in probe.items()
            if feedback or key not in {"answer", "explanation"}
        }
        for probe in skill["probes"]
    ]
    if feedback:
        result.update(principle=skill["principle"], contrast=skill["contrast"])
    return result
