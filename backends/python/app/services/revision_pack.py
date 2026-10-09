"""Sourced revision sheets assembled by the same domain API for HETU and MCP."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from pydantic import Field
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record, User
from app.services.learning_evidence import EVIDENCE_SECTIONS, evidence_summary
from app.services.learning_library import StrictModel, _owned, fingerprint, key, stable_id
from app.services.records import lock_identity, to_api, upsert_records

SCAN_LIMIT = 2000
REVISION_OUTCOMES = {"RBS", "RBG", "W-C", "W-E", "W-R"}
PACK_COLLECTIONS = (
    "weekly_reviews",
    "formulas",
    "trigger_phrases",
    "questions",
    "reattempts",
    "concept_pages",
    "concept_reviews",
)


class PackOptions(StrictModel):
    as_of: date | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=160)
    limit: int = Field(default=10, ge=1, le=20)


class PackDraft(PackOptions):
    idempotency_key: str = Field(min_length=8, max_length=128)
    expected_content_hash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _date(value: Any) -> str | None:
    try:
        return date.fromisoformat(_text(value)).isoformat()
    except ValueError:
        return None


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _view(row: Record, fields: tuple[str, ...], path: str, app_url: str) -> dict[str, Any]:
    return {
        "id": row.external_id,
        "version": row.version,
        "updated_at": _utc(row.updated_at).isoformat(),
        "collection": row.collection,
        "url": f"{app_url.rstrip('/')}{path}",
        **{field: row.data.get(field) for field in fields},
    }


async def build_pack(
    db: AsyncSession, *, owner_id: str, options: PackOptions, app_url: str
) -> dict[str, Any]:
    user = await db.get(User, owner_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, "HETU account is unavailable")
    timezone = _text(user.profile.get("timezone")) or "Asia/Kolkata"
    try:
        zone = ZoneInfo(timezone)
    except ZoneInfoNotFoundError as cause:
        raise HTTPException(422, "Account timezone is invalid; update it in Settings") from cause
    today = (options.as_of or datetime.now(zone).date()).isoformat()
    scanned: dict[str, list[Record]] = {}
    scan: dict[str, dict[str, Any]] = {}
    for collection in PACK_COLLECTIONS:
        query = select(Record).where(
            Record.owner_id == owner_id,
            Record.collection == collection,
            Record.deleted_at.is_(None),
        )
        rows = (
            await db.scalars(
                query.order_by(Record.updated_at.desc(), Record.external_id).limit(SCAN_LIMIT + 1)
            )
        ).all()
        scanned[collection] = list(rows[:SCAN_LIMIT])
        scan[collection] = {
            "records_scanned": min(len(rows), SCAN_LIMIT),
            "complete": len(rows) <= SCAN_LIMIT,
        }

    def matches(row: Record) -> bool:
        return not options.subject or key(_text(row.data.get("subject"))) == key(options.subject)

    questions = [row for row in scanned["questions"] if matches(row)]
    question_by_id = {row.external_id: row for row in questions}
    due_ids = list(
        dict.fromkeys(
            _text(row.data.get("question_id"))
            for row in sorted(
                scanned["reattempts"], key=lambda row: _text(row.data.get("scheduled_date"))
            )
            if row.data.get("stage") != "MASTERED"
            and (_date(row.data.get("scheduled_date")) or "9999") <= today
        )
    )
    due_questions = [question_by_id[id_] for id_ in due_ids if id_ in question_by_id]
    recent_mistakes = [
        row
        for row in questions
        if row.data.get("outcome") in REVISION_OUTCOMES and row.external_id not in due_ids
    ]
    priority_questions = due_questions + recent_mistakes
    formulas = sorted(
        [
            row
            for row in scanned["formulas"]
            if matches(row) and (_date(row.data.get("next_review")) or "9999") <= today
        ],
        key=lambda row: (_text(row.data.get("next_review")), row.external_id),
    )
    triggers = sorted(
        [row for row in scanned["trigger_phrases"] if matches(row)],
        key=lambda row: (
            row.data.get("reflex_time_ms") is not None,
            -(
                row.data.get("reflex_time_ms")
                if type(row.data.get("reflex_time_ms")) in {int, float}
                else 0
            ),
            row.external_id,
        ),
    )
    pattern_counts = Counter(
        (_text(row.data.get("subject")), key(_text(row.data.get("pattern_name"))))
        for row in questions
        if row.data.get("outcome") in REVISION_OUTCOMES
        and _text(row.data.get("pattern_name")).strip()
    )
    pattern_names = {
        (_text(row.data.get("subject")), key(_text(row.data.get("pattern_name")))): _text(
            row.data.get("pattern_name")
        )
        for row in reversed(questions)
    }
    repeated = sorted(
        [
            {"subject": subject, "name": pattern_names[(subject, pattern)], "count": count}
            for (subject, pattern), count in pattern_counts.items()
            if count >= 2
        ],
        key=lambda item: (-item["count"], item["name"]),
    )
    pages = [
        row for row in scanned["concept_pages"] if matches(row) and not row.data.get("archived_at")
    ]
    page_by_id = {row.external_id: row for row in pages}
    reviews = sorted(
        [
            row
            for row in scanned["concept_reviews"]
            if row.data.get("concept_id") in page_by_id
            and (_date(row.data.get("due_on")) or "9999") <= today
        ],
        key=lambda row: (_text(row.data.get("due_on")), row.external_id),
    )
    due_concept_ids = {row.data.get("concept_id") for row in reviews}
    pages.sort(
        key=lambda row: (
            row.external_id not in due_concept_ids,
            -_utc(row.updated_at).timestamp(),
            row.external_id,
        )
    )
    selected_pages = pages[: options.limit]
    selected_ids = [row.external_id for row in selected_pages]
    insight_rows = (
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "learning_insights",
                    Record.deleted_at.is_(None),
                    Record.data["concept_id"].as_string().in_(selected_ids),
                )
                .order_by(Record.updated_at.desc(), Record.external_id)
                .limit(201)
            )
        ).all()
        if selected_ids
        else []
    )
    primary_insights: dict[str, Record] = {}
    for row in insight_rows[:200]:
        primary_insights.setdefault(row.data["concept_id"], row)
    source_ids = {id_ for row in selected_pages for id_ in row.data.get("source_ids", [])[-5:]}
    sources = (
        (
            await db.scalars(
                select(Record).where(
                    Record.owner_id == owner_id,
                    Record.collection == "source_captures",
                    Record.deleted_at.is_(None),
                    Record.external_id.in_(source_ids),
                )
            )
        ).all()
        if source_ids
        else []
    )
    source_by_id = {row.external_id: row for row in sources}
    relations = (
        (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner_id == owner_id,
                    Record.collection == "concept_relations",
                    Record.deleted_at.is_(None),
                    Record.data["source_concept_id"].as_string().in_(selected_ids),
                    Record.data["relation"].as_string() == "study_evidence",
                    Record.data["active"].as_boolean().is_(True),
                )
                .order_by(Record.updated_at.desc(), Record.external_id)
                .limit(201)
            )
        ).all()
        if selected_ids
        else []
    )
    target_ids = {
        (row.data.get("target_collection"), row.data.get("target_record_id"))
        for row in relations[:200]
        if row.data.get("target_collection") in EVIDENCE_SECTIONS
    }
    targets = (
        (
            await db.scalars(
                select(Record).where(
                    Record.owner_id == owner_id,
                    Record.deleted_at.is_(None),
                    tuple_(Record.collection, Record.external_id).in_(target_ids),
                )
            )
        ).all()
        if target_ids
        else []
    )
    target_by_id = {(row.collection, row.external_id): row for row in targets}
    concepts = []
    for page in selected_pages:
        insight = primary_insights.get(page.external_id)
        data = insight.data if insight else {}
        source_refs = []
        for source_id in page.data.get("source_ids", [])[-5:]:
            source = source_by_id.get(source_id)
            if source:
                source_refs.append(
                    {
                        "id": source.external_id,
                        "version": source.version,
                        "captured_at": source.data.get("captured_at"),
                        "sources": [
                            {
                                "title": item.get("title"),
                                "url": item.get("url"),
                                "kind": item.get("kind"),
                            }
                            for item in source.data.get("sources", [])
                        ],
                    }
                )
        cues = data.get("recognition_cues", [])
        evidence = []
        for relation in relations[:200]:
            if relation.data.get("source_concept_id") != page.external_id:
                continue
            target = target_by_id.get(
                (relation.data.get("target_collection"), relation.data.get("target_record_id"))
            )
            evidence.append(
                {
                    "link_id": relation.external_id,
                    "link_version": relation.version,
                    "rationale": relation.data.get("rationale"),
                    "record": evidence_summary(target) if target else None,
                    "target_collection": relation.data.get("target_collection"),
                    "target_record_id": relation.data.get("target_record_id"),
                }
            )
        concepts.append(
            {
                **_view(
                    page,
                    ("subject", "topic", "concept", "summary"),
                    f"/learning-library/{page.external_id}",
                    app_url,
                ),
                "insight_id": insight.external_id if insight else None,
                "insight_version": insight.version if insight else None,
                "reasoning_origin": data.get("reasoning_origin", "none"),
                "reasoning_correction": data.get("reasoning_correction"),
                "recognition_cues": cues[:3],
                "recognition_cue_count": len(cues),
                "retrieval_question": data.get("retrieval_question"),
                "sources": source_refs,
                "sources_complete": len(page.data.get("source_ids", [])) <= 5
                and len(source_refs) == len(page.data.get("source_ids", [])),
                "due_review": page.external_id in due_concept_ids,
                "evidence_links": evidence,
                "evidence_links_complete": len(relations) <= 200,
            }
        )
    latest_review = max(
        [
            row
            for row in scanned["weekly_reviews"]
            if (_date(row.data.get("week_start")) or "9999") <= today
        ],
        key=lambda row: _text(row.data.get("week_start")),
        default=None,
    )
    sections = {
        "weekly_focus": _view(
            latest_review, ("this_weeks_fix", "week_start"), "/weekly-review", app_url
        )
        if latest_review
        else None,
        "due_formulas": [
            _view(row, ("subject", "name", "expression", "next_review"), "/formulas", app_url)
            for row in formulas[: options.limit]
        ],
        "triggers": [
            _view(
                row, ("subject", "phrase", "concept", "reflex_time_ms"), "/trigger-drill", app_url
            )
            for row in triggers[: options.limit]
        ],
        "repeated_mistakes": repeated[: options.limit],
        "priority_questions": [
            _view(
                row,
                ("subject", "subtopic", "source_ref", "capture_note", "outcome", "pattern_name"),
                "/journal",
                app_url,
            )
            for row in priority_questions[: options.limit]
        ],
        "saved_concepts": concepts,
        # Keep evaluation guidance and previous solutions out of a recall sheet.
        "due_reviews": [
            _view(
                row,
                ("concept_id", "kind", "prompt", "due_on", "question_origin"),
                f"/concept-review/{row.external_id}",
                app_url,
            )
            for row in reviews[: options.limit]
        ],
    }
    totals = {
        "due_formulas": len(formulas),
        "triggers": len(triggers),
        "repeated_mistakes": len(repeated),
        "priority_questions": len(priority_questions),
        "saved_concepts": len(pages),
        "due_reviews": len(reviews),
    }
    pack = {
        "schema_version": "revision-pack-v1",
        "as_of": today,
        "timezone": timezone,
        "subject": options.subject,
        "limit": options.limit,
        "sections": sections,
        "totals_within_scan": totals,
        "scan": scan,
        "complete": all(item["complete"] for item in scan.values())
        and len(insight_rows) <= 200
        and len(relations) <= 200,
        "has_more": {section: count > options.limit for section, count in totals.items()},
    }
    pack["content_hash"] = fingerprint(pack)
    pack["retrieved_at"] = datetime.now(UTC).isoformat()
    return {**pack, "text": pack_text(pack)}


def pack_text(pack: dict[str, Any]) -> str:
    sections = pack["sections"]
    lines = [f"HETU REVISION PACK · {pack['as_of']}", f"Timezone: {pack['timezone']}", ""]
    focus = sections["weekly_focus"]
    if focus and focus.get("this_weeks_fix"):
        lines.extend(["THIS WEEK", focus["this_weeks_fix"], ""])
    for heading, section, fields in (
        ("DUE FORMULAS", "due_formulas", ("subject", "name", "expression")),
        ("TRIGGER PHRASES", "triggers", ("phrase", "concept")),
        ("REPEATED MISTAKES", "repeated_mistakes", ("subject", "name", "count")),
        (
            "PRIORITY QUESTIONS",
            "priority_questions",
            ("subject", "subtopic", "source_ref", "capture_note"),
        ),
        ("DUE RECALL AND TRANSFER", "due_reviews", ("kind", "prompt", "due_on", "url")),
    ):
        lines.append(heading)
        lines.extend(
            "- " + " · ".join(str(item[field]) for field in fields if item.get(field) is not None)
            for item in sections[section]
        )
        if not sections[section]:
            lines.append("- None in this pack")
        lines.append("")
    lines.append("SAVED DISCUSSIONS")
    for concept in sections["saved_concepts"]:
        lines.extend(
            [
                f"{concept['subject']} / {concept['topic']} / {concept['concept']}",
                _text(concept.get("summary")),
            ]
        )
        if concept.get("reasoning_correction"):
            lines.append(
                f"Reasoning correction ({concept['reasoning_origin']}): "
                f"{concept['reasoning_correction']}"
            )
        lines.extend(f"Recognition cue: {cue}" for cue in concept["recognition_cues"])
        if concept.get("retrieval_question"):
            lines.append(f"Recall question: {concept['retrieval_question']}")
        for source in concept["sources"]:
            lines.extend(
                f"Source: {item.get('title') or 'Untitled'} · "
                f"{item.get('url') or source['captured_at'] or source['id']}"
                for item in source["sources"]
            )
        for evidence in concept["evidence_links"]:
            title = evidence["record"]["title"] if evidence["record"] else "Unavailable record"
            lines.append(f"Linked study evidence: {title} · {evidence['rationale']}")
        lines.extend([f"Full explanation and history: {concept['url']}", ""])
    if not sections["saved_concepts"]:
        lines.append("- No saved discussions in this pack")
    if not pack["complete"]:
        lines.extend(["", "Partial retrieval: older records may be missing."])
    if any(pack["has_more"].values()):
        lines.extend(
            ["", "Selected revision items only; more records exist in the linked sections."]
        )
    return "\n".join(lines)


def _saved_view(row: Record, replay: bool = False) -> dict[str, Any]:
    return {
        **to_api(row),
        "snapshot": {**row.data["snapshot"], "text": pack_text(row.data["snapshot"])},
        "idempotent_replay": replay,
    }


async def save_pack(
    db: AsyncSession, *, owner_id: str, draft: PackDraft, app_url: str
) -> dict[str, Any]:
    pack_id = stable_id("revision-pack", draft.idempotency_key)
    await lock_identity(db, "revision_packs", owner_id, pack_id)
    request_hash = fingerprint(draft.model_dump(mode="json", exclude={"idempotency_key"}))
    existing = await _owned(db, "revision_packs", owner_id, pack_id)
    if existing:
        if existing.data["request_hash"] != request_hash:
            raise HTTPException(409, "Pack key was reused for different options")
        return _saved_view(existing, replay=True)
    pack = await build_pack(
        db,
        owner_id=owner_id,
        options=PackOptions.model_validate(
            draft.model_dump(exclude={"idempotency_key", "expected_content_hash"})
        ),
        app_url=app_url,
    )
    if draft.expected_content_hash and draft.expected_content_hash != pack["content_hash"]:
        raise HTTPException(409, "Revision evidence changed; refresh the preview before saving")
    pack.pop("text")
    saved = (
        await upsert_records(
            db,
            collection="revision_packs",
            owner_id=owner_id,
            items=[
                {
                    "id": pack_id,
                    "request_hash": request_hash,
                    "subject": draft.subject,
                    "as_of": pack["as_of"],
                    "snapshot": pack,
                    "url": f"{app_url.rstrip('/')}/revision-pack?pack={pack_id}",
                }
            ],
        )
    )[0]
    return _saved_view(saved)


async def get_saved_pack(db: AsyncSession, *, owner_id: str, pack_id: str) -> dict[str, Any]:
    row = await _owned(db, "revision_packs", owner_id, pack_id)
    if row is None:
        raise HTTPException(404, "Revision pack not found")
    return _saved_view(row)


async def list_saved_packs(
    db: AsyncSession, *, owner_id: str, limit: int = 25, offset: int = 0
) -> dict[str, Any]:
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(422, "Use limit 1–100 and offset >= 0")
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.owner_id == owner_id,
                Record.collection == "revision_packs",
                Record.deleted_at.is_(None),
            )
            .order_by(Record.created_at.desc(), Record.external_id)
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    return {
        "items": [
            {
                "id": row.external_id,
                "as_of": row.data["as_of"],
                "subject": row.data.get("subject"),
                "url": row.data["url"],
                "created_at": row.created_at.isoformat(),
            }
            for row in rows[:limit]
        ],
        "next_offset": offset + limit if len(rows) > limit else None,
        "complete": len(rows) <= limit,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
