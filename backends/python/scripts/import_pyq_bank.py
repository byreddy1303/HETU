from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import func, insert, select, update

from app.db.models import PyqBank, PyqCatalogQuestion
from app.db.session import get_engine, get_session_factory
from app.services.pyq_catalog import canonical_hash, prepare_catalog_rows

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def load_bank(source: Path) -> tuple[dict, list[dict], set[str]]:
    manifest = json.loads((source / "manifest.json").read_text())
    questions: list[dict] = []
    for subject in manifest["subjects"]:
        payload = json.loads((REPOSITORY_ROOT / "public" / subject["file"].lstrip("/")).read_text())
        if payload["bankVersion"] != manifest["bankVersion"]:
            raise ValueError(f"Mixed bank versions in {subject['file']}")
        questions.extend(payload["questions"])
    conflicts = json.loads(
        (REPOSITORY_ROOT / "src" / "data" / "pyq-key-conflicts.json").read_text()
    )
    return manifest, questions, {uid for group in conflicts for uid in group["ids"]}


async def import_bank(check_only: bool) -> None:
    manifest, questions, conflicts = load_bank(REPOSITORY_ROOT / "public" / "pyq")
    rows, stats = prepare_catalog_rows(questions, conflicts)
    if len(rows) != manifest["questionCount"]:
        raise ValueError("Manifest question count does not match subject payloads")
    version = manifest["bankVersion"]
    bank_hash = canonical_hash({"manifest": manifest, "questions": questions})
    print({"bank_version": version, **stats, "source_hash": bank_hash})
    if check_only:
        return

    async with get_session_factory()() as db:
        existing = await db.get(PyqBank, version)
        if existing is not None:
            count = await db.scalar(
                select(func.count()).select_from(PyqCatalogQuestion).where(
                    PyqCatalogQuestion.bank_version == version
                )
            )
            if existing.source_hash != bank_hash or count != len(rows):
                raise RuntimeError("Existing PYQ bank differs from the immutable source")
            print({"status": "already-imported", "rows": count})
            return

        await db.execute(update(PyqBank).where(PyqBank.active.is_(True)).values(active=False))
        db.add(
            PyqBank(
                version=version,
                manifest=manifest,
                question_count=len(rows),
                source_hash=bank_hash,
                active=True,
            )
        )
        await db.flush()
        chunk_size = 500
        for start in range(0, len(rows), chunk_size):
            chunk = [{"bank_version": version, **row} for row in rows[start : start + chunk_size]]
            await db.execute(insert(PyqCatalogQuestion), chunk)
        await db.commit()
        print({"status": "imported", "rows": len(rows)})


async def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and import the immutable PYQ catalog")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        await import_bank(args.check_only)
    finally:
        await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(main())
