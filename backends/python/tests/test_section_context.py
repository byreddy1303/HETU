from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db.models import User
from app.schemas import QueryFilter, RecordQuery
from app.services.records import upsert_records
from app.services.section_context import (
    SECTION_COLLECTIONS,
    section_overview,
    section_record_detail,
    section_records,
)


@pytest.mark.asyncio
async def test_section_evidence_is_owner_scoped_paginated_and_detailed(db) -> None:
    db.add_all([User(id="owner-a"), User(id="owner-b")])
    await db.commit()
    await upsert_records(
        db,
        collection="formulas",
        owner_id="owner-a",
        items=[
            {"id": "formula-1", "name": "Bayes", "expression": "posterior"},
            {"id": "formula-2", "name": "Variance", "expression": "E[X²]-E[X]²"},
        ],
    )
    await db.commit()
    assert "readiness" in SECTION_COLLECTIONS
    overview = await section_overview(db, owner_id="owner-a", section="formulas")
    assert overview["collections"][0]["count"] == 2
    assert overview["coverage"] == "mapped_records_only"
    assert overview["section_complete"] is False
    other = await section_overview(db, owner_id="owner-b", section="formulas")
    assert other["collections"][0]["state"] == "empty"
    first = await section_records(
        db, owner_id="owner-a", section="formulas", collection="formulas", limit=1
    )
    assert len(first["items"]) == 1
    assert first["complete"] is False
    second = await section_records(
        db,
        owner_id="owner-a",
        section="formulas",
        collection="formulas",
        cursor=first["next_cursor"],
        limit=1,
    )
    assert len(second["items"]) == 1
    assert second["complete"] is True
    filtered = await section_records(
        db,
        owner_id="owner-a",
        section="formulas",
        collection="formulas",
        query=RecordQuery(filters=[QueryFilter(field="name", value="Bayes")], limit=10),
    )
    assert [item["id"] for item in filtered["items"]] == ["formula-1"]
    detail = await section_record_detail(
        db,
        owner_id="owner-a",
        section="formulas",
        collection="formulas",
        record_id=first["items"][0]["id"],
        include_history=True,
    )
    assert detail["item"]["name"]
    assert detail["history"][0]["version"] == 1
    with pytest.raises(HTTPException) as denied:
        await section_record_detail(
            db,
            owner_id="owner-b",
            section="formulas",
            collection="formulas",
            record_id=first["items"][0]["id"],
        )
    assert denied.value.status_code == 404
    with pytest.raises(HTTPException) as unmapped:
        await section_records(db, owner_id="owner-a", section="formulas", collection="questions")
    assert unmapped.value.status_code == 403
