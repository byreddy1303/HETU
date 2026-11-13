import sqlite3

import pytest

from app.services.local_schema import migrate_database


def test_upgrade_snapshots_data_and_is_repeatable(tmp_path):
    path = tmp_path / "hetu.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE records(id INTEGER PRIMARY KEY, owner_id TEXT, collection "
            "TEXT, data JSON, deleted_at TEXT)"
        )
        db.execute(
            "INSERT INTO records(owner_id,collection,data) VALUES "
            "('owner','study_memory','{\"important\":true}')"
        )
    migrate_database(path)
    snapshots = list((tmp_path / "schema-upgrades" / "before-v1").glob("hetu_backup_*.db"))
    assert len(snapshots) == 1
    with sqlite3.connect(snapshots[0]) as backup:
        assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert backup.execute("SELECT count(*) FROM records").fetchone()[0] == 1
    migrate_database(path)
    assert len(list((tmp_path / "schema-upgrades" / "before-v1").glob("hetu_backup_*.db"))) == 1
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version FROM hetu_schema_version").fetchone()[0] == 1
        assert db.execute("SELECT json_extract(data,'$.important') FROM records").fetchone()[0] == 1
        db.execute("UPDATE hetu_schema_version SET version=999")
    with pytest.raises(RuntimeError, match="newer HETU"):
        migrate_database(path)
