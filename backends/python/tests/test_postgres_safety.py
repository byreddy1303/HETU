"""Run only against a disposable database with migrations already applied."""

import asyncio
import os
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import EntityRevision, Record, RecordRevision, User
from app.services.learning_evidence import EvidenceLinkDraft, link_evidence
from app.services.learning_library import (
    CaptureRequest,
    ConceptLinkDraft,
    capture_learning,
    learning_detail,
    link_concepts,
)
from app.services.records import patch_record, upsert_records

URL = os.getenv("HETU_TEST_DATABASE_URL")
if URL:
    parsed = urlsplit(URL)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.path != "/hetu_test":
        raise pytest.UsageError("Safety integration tests require local disposable hetu_test")
pytestmark = pytest.mark.skipif(not URL, reason="Requires disposable migrated PostgreSQL")


@pytest.mark.asyncio
async def test_concurrent_writers_and_database_guards():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
            user = await db.get(User, owner)
            user.profile = {"study_target": 120}
            await db.commit()
            history = list(
                await db.scalars(
                    select(EntityRevision)
                    .where(EntityRevision.entity == "users", EntityRevision.entity_id == owner)
                    .order_by(EntityRevision.id)
                )
            )
            assert len(history) == 2
            assert history[0].snapshot["profile"] == {}
            assert history[1].snapshot["profile"] == {"study_target": 120}

        async def create():
            async with factory() as db:
                rows = await upsert_records(
                    db,
                    collection="questions",
                    owner_id=owner,
                    items=[{"id": "q", "answer": "original"}],
                )
                await db.commit()
                return rows[0].id

        first, second = await asyncio.gather(create(), create())
        assert first == second

        async def update(value):
            async with factory() as db:
                try:
                    await patch_record(
                        db,
                        collection="questions",
                        owner_id=owner,
                        external_id="q",
                        patch={"answer": value},
                        expected_version=1,
                    )
                    await db.commit()
                    return 200
                except HTTPException as exc:
                    await db.rollback()
                    return exc.status_code

        assert sorted(await asyncio.gather(update("a"), update("b"))) == [200, 409]
        async with factory() as db:
            revisions = list(
                await db.scalars(select(RecordRevision).where(RecordRevision.record_id == first))
            )
            assert len(revisions) == 2
            assert revisions[0].snapshot["answer"] == "original"
        for sql in (
            "DELETE FROM records WHERE owner_id = :owner",
            "DELETE FROM users WHERE id = :owner",
            "DELETE FROM record_revisions WHERE owner_id = :owner",
            "UPDATE record_revisions SET version=99 WHERE owner_id = :owner",
            "UPDATE records SET data='{}'::jsonb WHERE owner_id = :owner",
            "TRUNCATE records CASCADE",
            "TRUNCATE entity_revisions",
        ):
            async with factory() as db:
                with pytest.raises(DBAPIError):
                    await db.execute(text(sql), {"owner": owner})
                await db.rollback()
        async with factory() as db:
            assert await db.scalar(select(Record).where(Record.id == first)) is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_concept_links_use_postgres_identity_locks_and_revision_history():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
            saved = await capture_learning(
                db,
                owner_id=owner,
                request=CaptureRequest(
                    idempotency_key=f"postgres-capture-{owner}",
                    sources=[{"kind": "manual", "title": "Disposable relationship test"}],
                    insights=[
                        {
                            "subject": "Test subject",
                            "topic": "Prerequisites",
                            "concept": "Foundations",
                            "core_idea": "Foundation concept.",
                            "full_explanation": "Foundation explanation.",
                        },
                        {
                            "subject": "Test subject",
                            "topic": "Applications",
                            "concept": "Derived method",
                            "core_idea": "Derived concept.",
                            "full_explanation": "Derived explanation.",
                        },
                    ],
                ),
                app_url="https://hetu.example.test",
            )
            foundation_id, derived_id = saved["concept_ids"]
            relationship = ConceptLinkDraft(
                idempotency_key=f"postgres-link-{owner}",
                source_concept_id=foundation_id,
                target_concept_id=derived_id,
                relation="prerequisite_for",
                rationale="The derived method depends on this foundation.",
            )
            created = await link_concepts(db, owner_id=owner, draft=relationship)
            await db.commit()
            revised = await link_concepts(
                db,
                owner_id=owner,
                draft=relationship.model_copy(
                    update={
                        "idempotency_key": f"postgres-link-revision-{owner}",
                        "expected_version": 1,
                        "rationale": "This prerequisite supports the derived method.",
                    }
                ),
            )
            await db.commit()
            assert revised["version"] == 2
            relation_record = await db.scalar(
                select(Record).where(
                    Record.collection == "concept_relations",
                    Record.owner_id == owner,
                    Record.external_id == created["id"],
                )
            )
            assert relation_record is not None
            history = list(
                await db.scalars(
                    select(RecordRevision)
                    .where(RecordRevision.record_id == relation_record.id)
                    .order_by(RecordRevision.version)
                )
            )
            assert [row.version for row in history] == [1, 2]
            assert (
                history[0].snapshot["rationale"] == "The derived method depends on this foundation."
            )
            detail = await learning_detail(db, owner_id=owner, concept_id=derived_id)
            assert detail["links"][0]["other_concept"]["id"] == foundation_id
            assert (
                detail["links"][0]["rationale"] == "This prerequisite supports the derived method."
            )
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_evidence_links_concurrent_receipts_and_revisions():
    engine = create_async_engine(URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner = str(uuid4())
    try:
        async with factory() as db:
            db.add(User(id=owner))
            await db.commit()
            saved = await capture_learning(
                db,
                owner_id=owner,
                app_url="https://hetu.test",
                request=CaptureRequest.model_validate(
                    {
                        "idempotency_key": "pg-evidence-concept",
                        "sources": [{"kind": "manual", "title": "Probability study"}],
                        "insights": [
                            {
                                "subject": "Probability",
                                "topic": "Bayes",
                                "concept": "Normalization",
                                "core_idea": "Divide by the evidence.",
                                "full_explanation": "Normalize prior times likelihood.",
                            }
                        ],
                    }
                ),
            )
            await upsert_records(
                db,
                collection="formulas",
                owner_id=owner,
                items=[{"id": "formula", "name": "Bayes rule", "expression": "P(H|E)"}],
            )
            await db.commit()
        draft = EvidenceLinkDraft(
            idempotency_key="pg-evidence-connection",
            source_concept_id=saved["concept_ids"][0],
            target_collection="formulas",
            target_record_id="formula",
            rationale="Formula for the saved explanation.",
        )

        async def create():
            async with factory() as db:
                result = await link_evidence(db, owner_id=owner, draft=draft)
                await db.commit()
                return result

        first, second = await asyncio.gather(create(), create())
        assert first["id"] == second["id"]
        assert sorted([first["idempotent_replay"], second["idempotent_replay"]]) == [False, True]

        async def revise(suffix):
            async with factory() as db:
                try:
                    result = await link_evidence(
                        db,
                        owner_id=owner,
                        draft=draft.model_copy(
                            update={
                                "idempotency_key": f"pg-evidence-edit-{suffix}",
                                "expected_version": 1,
                                "rationale": f"Updated rationale {suffix}",
                            }
                        ),
                    )
                    await db.commit()
                    return result["version"]
                except HTTPException as exc:
                    await db.rollback()
                    return exc.status_code

        assert sorted(await asyncio.gather(revise("a"), revise("b"))) == [2, 409]
        async with factory() as db:
            replay = await link_evidence(db, owner_id=owner, draft=draft)
            assert replay["version"] == 1
            detail = await learning_detail(db, owner_id=owner, concept_id=draft.source_concept_id)
            assert detail["evidence_links"][0]["version"] == 2
            assert detail["evidence_links"][0]["evidence"]["title"] == "Bayes rule"
            row = await db.scalar(
                select(Record).where(
                    Record.owner_id == owner, Record.collection == "concept_relations"
                )
            )
            revisions = (
                await db.scalars(select(RecordRevision).where(RecordRevision.record_id == row.id))
            ).all()
            assert {item.version for item in revisions} == {1, 2}
    finally:
        await engine.dispose()
