from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest

from app.services.local_backup import BackupFailure, backup_status
from scripts.backup_local_db import backup_database


def test_backup_database_creates_verified_snapshot(tmp_path: Path):
    # Setup test database with sample table and row
    source_db = tmp_path / "test_hetu.db"
    backup_dir = tmp_path / "backups"

    conn = sqlite3.connect(source_db)
    with conn:
        conn.execute("CREATE TABLE test_data (id TEXT PRIMARY KEY, value TEXT);")
        conn.execute("INSERT INTO test_data VALUES ('1', 'gate_prep');")
    conn.close()

    # Perform backup
    backup_file = backup_database(
        source_db=source_db,
        backup_dir=backup_dir,
        keep_count=3,
        sync_icloud=False,
    )

    assert backup_file.exists()
    assert (backup_dir / "hetu_latest.db").exists()

    # Verify content in the backup file
    verify_conn = sqlite3.connect(backup_file)
    cur = verify_conn.cursor()
    cur.execute("SELECT value FROM test_data WHERE id = '1';")
    rows = cur.fetchall()
    verify_conn.close()

    assert rows == [("gate_prep",)]


def test_backup_restores_committed_wal_receipts_without_changing_the_live_database(tmp_path: Path):
    source_db = tmp_path / "active.db"
    backup_dir = tmp_path / "backups"
    restored_db = tmp_path / "restored.db"
    live = sqlite3.connect(source_db)
    try:
        assert live.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        live.execute("PRAGMA wal_autocheckpoint=0")
        with live:
            live.execute("CREATE TABLE receipts (id TEXT PRIMARY KEY, answer TEXT NOT NULL)")
            live.execute("INSERT INTO receipts VALUES ('attempt-1', 'B')")
        # Keep the writer open: the committed receipt is still in the WAL sidecar.
        assert Path(f"{source_db}-wal").stat().st_size > 0

        snapshot = backup_database(source_db, backup_dir, sync_icloud=False)
        with live:
            live.execute("INSERT INTO receipts VALUES ('attempt-2', 'D')")

        # Restore to a new destination; opening a backup must never replace live evidence.
        shutil.copy2(snapshot, restored_db)
        with sqlite3.connect(restored_db) as restored:
            assert restored.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
            assert restored.execute("SELECT * FROM receipts ORDER BY id").fetchall() == [
                ("attempt-1", "B")
            ]
        assert live.execute("SELECT * FROM receipts ORDER BY id").fetchall() == [
            ("attempt-1", "B"),
            ("attempt-2", "D"),
        ]
    finally:
        live.close()


def test_backup_rejects_missing_source_without_creating_an_empty_database(tmp_path: Path):
    source_db = tmp_path / "missing.db"
    backup_dir = tmp_path / "backups"
    with pytest.raises(BackupFailure, match="database is unavailable"):
        backup_database(source_db, backup_dir, sync_icloud=False)
    assert not source_db.exists()
    assert not list(backup_dir.glob("*.db"))
    assert backup_status(source_db, backup_dir)["state"] == "error"
