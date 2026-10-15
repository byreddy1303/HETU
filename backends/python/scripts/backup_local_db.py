#!/usr/bin/env python3
"""Automated, crash-safe SQLite backup with integrity verification and rotation.

Uses SQLite's Online Backup API to safely capture a consistent snapshot of hetu.db
even while the desktop application and MCP server are writing to it in WAL mode.
"""

from __future__ import annotations

import argparse
import datetime
import os
import shutil
import sqlite3
import sys
from pathlib import Path


def default_data_dir() -> Path:
    if os.environ.get("HETU_DATA_DIR"):
        return Path(os.environ["HETU_DATA_DIR"]).expanduser().resolve()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "hetu"
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(app_data) / "hetu"
    return Path.home() / ".local" / "share" / "hetu"


def backup_database(
    source_db: Path,
    backup_dir: Path,
    keep_count: int = 14,
    sync_icloud: bool = True,
) -> Path:
    if not source_db.exists():
        raise FileNotFoundError(f"Database not found at {source_db}")

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"hetu_backup_{timestamp}.db"

    # 1. Perform online backup using SQLite's native backup API
    src_conn = sqlite3.connect(source_db)
    dst_conn = sqlite3.connect(backup_file)

    try:
        with dst_conn:
            src_conn.backup(dst_conn, pages=250)
    finally:
        dst_conn.close()
        src_conn.close()

    # 2. Verify integrity of the backup file
    verify_conn = sqlite3.connect(backup_file)
    try:
        cur = verify_conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        result = cur.fetchall()
        if result != [("ok",)]:
            backup_file.unlink(missing_ok=True)
            raise RuntimeError(f"Backup verification failed: {result}")
    finally:
        verify_conn.close()

    # 3. Create or update a 'latest.db' copy for quick reference
    latest_file = backup_dir / "hetu_latest.db"
    try:
        shutil.copy2(backup_file, latest_file)
    except OSError:
        pass

    # 4. Optional sync to iCloud Drive if available on macOS
    if sync_icloud and sys.platform == "darwin":
        icloud_base = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
        icloud_dir = icloud_base / "HetuBackups"
        if icloud_dir.parent.exists():
            try:
                icloud_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup_file, icloud_dir / backup_file.name)
            except OSError:
                pass  # CloudDocs might be disabled or read-only

    # 5. Rotate backups: retain only the latest `keep_count`
    existing_backups = sorted(
        backup_dir.glob("hetu_backup_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old_backup in existing_backups[keep_count:]:
        try:
            old_backup.unlink()
        except OSError:
            pass

    return backup_file


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
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
