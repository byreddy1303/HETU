#!/usr/bin/env python3
"""Automated, crash-safe SQLite backup with integrity verification and rotation.

Uses SQLite's Online Backup API to safely capture a consistent snapshot of hetu.db
even while the desktop application and MCP server are writing to it in WAL mode.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Direct invocation works in both a checkout and the packaged backend.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.local_backup import backup_database, backup_status, default_data_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Backup HETU SQLite database safely.")
    parser.add_argument(
        "--source",
        type=Path,
        default=default_data_dir() / "hetu.db",
        help="Path to source hetu.db",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=default_data_dir() / "backups",
        help="Directory to store backup files",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=14,
        help="Number of backup snapshots to keep (default: 14)",
    )
    parser.add_argument(
        "--no-icloud",
        action="store_true",
        help="Disable automatic copy to iCloud Drive",
    )

    args = parser.parse_args()

    try:
        backup_path = backup_database(
            source_db=args.source,
            backup_dir=args.backup_dir,
            keep_count=args.keep,
            sync_icloud=not args.no_icloud,
        )
        size_kb = round(backup_path.stat().st_size / 1024, 2)
        print(f"SUCCESS: Backup verified and created at {backup_path} ({size_kb} KB)")
        status = backup_status(args.source, args.backup_dir)
        if status["last_error"]:
            print(f"WARNING: {status['last_error']}", file=sys.stderr)
    except Exception:
        print(
            "ERROR: Backup did not complete. Check backup health in HETU Settings.", file=sys.stderr
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
