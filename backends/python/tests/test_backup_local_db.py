from __future__ import annotations

import sqlite3
from pathlib import Path

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
