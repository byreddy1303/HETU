from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import local_backups
from app.core.config import Settings, get_settings
from app.services import local_backup


def make_database(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE attempts (id TEXT PRIMARY KEY, response TEXT)")
        connection.execute("INSERT INTO attempts VALUES ('real-receipt', 'B')")


def test_health_preserves_last_good_snapshot_after_a_failure(tmp_path, monkeypatch):
    source, folder = tmp_path / "hetu.db", tmp_path / "backups"
    make_database(source)
    snapshot = local_backup.backup_database(source, folder, sync_icloud=False)
    healthy = local_backup.backup_status(source, folder)
    assert healthy["state"] == "ready"
    assert healthy["last_backup"]["file_available"]
    assert healthy["last_backup"]["integrity"] == "ok"
    assert healthy["cloud_copy"]["state"] == "disabled"
    monkeypatch.setattr(
        local_backup,
        "_verify",
        lambda _path: (_ for _ in ()).throw(OSError("private SQL must not leak")),
    )
    with pytest.raises(local_backup.BackupFailure):
        local_backup.backup_database(source, folder, sync_icloud=False)
    failed = local_backup.backup_status(source, folder)
    assert failed["state"] == "error"
    assert failed["last_success_at"] == healthy["last_success_at"]
    assert failed["last_backup"]["path"] == str(snapshot)
    assert failed["last_backup"]["file_available"]
    assert "private SQL" not in json.dumps(failed)
    assert not list(folder.glob("*.tmp"))


def test_cloud_copy_failure_is_visible_without_claiming_remote_backup(tmp_path, monkeypatch):
    source, folder, cloud = tmp_path / "hetu.db", tmp_path / "backups", tmp_path / "cloud"
    make_database(source)
    monkeypatch.setattr(local_backup, "_icloud_directory", lambda: cloud)
    original_copy = local_backup._copy_verified

    def copy(source, target):
        if target.parent == cloud:
            raise OSError("offline")
        original_copy(source, target)

    monkeypatch.setattr(local_backup, "_copy_verified", copy)
    local_backup.backup_database(source, folder)
    status = local_backup.backup_status(source, folder)
    assert status["state"] == "warning"
    assert status["cloud_copy"]["state"] == "failed"
    assert status["last_backup"]["file_available"]
    assert status["restore_verified"] is False


def test_lock_rotation_and_missing_snapshot_health(tmp_path):
    source, folder = tmp_path / "hetu.db", tmp_path / "backups"
    make_database(source)
    with local_backup._backup_lock(folder):
        with pytest.raises(local_backup.BackupBusy):
            local_backup.backup_database(source, folder, sync_icloud=False)
    for _ in range(3):
        snapshot = local_backup.backup_database(source, folder, keep_count=2, sync_icloud=False)
    assert len(list(folder.glob("hetu_backup_*.db"))) == 2
    snapshot.unlink()
    status = local_backup.backup_status(source, folder)
    assert status["state"] == "error"
    assert status["last_backup"]["file_available"] is False


def test_backup_endpoints_reject_hosted_and_remote_clients(tmp_path):
    source = tmp_path / "hetu.db"
    make_database(source)
    app = FastAPI()
    app.include_router(local_backups.router, prefix="/v1/local-backups")
    settings = Settings(
        _env_file=None, environment="test", database_url=f"sqlite+aiosqlite:///{source}"
    )
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        assert client.get("/v1/local-backups/status").status_code == 403
    settings = Settings(
        _env_file=None, environment="local", database_url=f"sqlite+aiosqlite:///{source}"
    )
    with TestClient(app, client=("203.0.113.10", 1234)) as client:
        assert client.post("/v1/local-backups/run").status_code == 403
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        result = client.get("/v1/local-backups/status")
        assert result.status_code == 200
        assert result.headers["Cache-Control"] == "no-store"
        assert result.json()["state"] == "never"
        assert (
            client.post(
                "/v1/local-backups/run", headers={"Origin": "https://untrusted.example"}
            ).status_code
            == 403
        )
