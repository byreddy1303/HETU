"""Mirror the shipped JSON question bank into the deployed API bundle.

The question bank is authored once in `public/pyq` (the website serves it as
static JSON) and mirrored under `app/data/pyq` so the API bundle is
self-contained. The catalog does not live in PostgreSQL; user data and historical
attempt snapshots remain there. Run this after `npm run pyq:build` (or any edit to
`public/pyq`), then commit the refreshed copy.

Usage: python scripts/sync_pyq_bank_data.py [--check]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_ROOT.parents[1]
SOURCE_BANK = REPOSITORY_ROOT / "public" / "pyq"
SOURCE_CONFLICTS = REPOSITORY_ROOT / "src" / "data" / "pyq-key-conflicts.json"
TARGET_BANK = BACKEND_ROOT / "app" / "data" / "pyq"


def bank_files(bank_dir: Path) -> list[Path]:
    return sorted(
        [bank_dir / "manifest.json", *bank_dir.glob("subjects/*.json")],
        key=lambda path: path.name,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the bundled copy matches the source bank without writing",
    )
    args = parser.parse_args()

    if not (SOURCE_BANK / "manifest.json").is_file():
        print(f"Source bank missing: {SOURCE_BANK}", file=sys.stderr)
        return 1

    manifest = json.loads((SOURCE_BANK / "manifest.json").read_text())
    expected = [SOURCE_BANK / "manifest.json"]
    for subject in manifest["subjects"]:
        expected.append(REPOSITORY_ROOT / "public" / subject["file"].lstrip("/"))

    mismatches: list[str] = []
    for source in expected:
        target = TARGET_BANK / source.relative_to(SOURCE_BANK)
        if not target.is_file():
            mismatches.append(f"missing {target.relative_to(BACKEND_ROOT)}")
        elif target.read_bytes() != source.read_bytes():
            mismatches.append(f"differs {target.relative_to(BACKEND_ROOT)}")
    conflicts_target = TARGET_BANK / "pyq-key-conflicts.json"
    if not conflicts_target.is_file():
        conflicts_target_missing = True
    else:
        conflicts_target_missing = conflicts_target.read_bytes() != SOURCE_CONFLICTS.read_bytes()
    if conflicts_target_missing:
        mismatches.append("differs app/data/pyq/pyq-key-conflicts.json")

    if args.check:
        if mismatches:
            print("\n".join(mismatches), file=sys.stderr)
            print(
                "Run `python scripts/sync_pyq_bank_data.py` to refresh the bundle.",
                file=sys.stderr,
            )
            return 1
        print(f"Bundled bank matches {len(expected)} source files.")
        return 0

    if TARGET_BANK.exists():
        shutil.rmtree(TARGET_BANK)
    (TARGET_BANK / "subjects").mkdir(parents=True)
    for source in expected:
        shutil.copyfile(source, TARGET_BANK / source.relative_to(SOURCE_BANK))
    shutil.copyfile(SOURCE_CONFLICTS, conflicts_target)
    print(f"Synced {len(expected)} bank files into {TARGET_BANK.relative_to(BACKEND_ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
