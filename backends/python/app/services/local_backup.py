"""Verified SQLite snapshots and durable health shared by desktop and API backups.

The status file describes local files only. Copying into iCloud Drive does not
prove that iCloud uploaded the file or that another device can restore it.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import uuid
from pathlib import Path


class BackupBusy(RuntimeError):
    pass


class BackupFailure(RuntimeError):
    pass


def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat()


def default_data_dir() -> Path:
    if os.environ.get("HETU_DATA_DIR"):
        return Path(os.environ["HETU_DATA_DIR"]).expanduser().resolve()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "hetu"
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(app_data) / "hetu"
    return Path.home() / ".local" / "share" / "hetu"


def _write_status(directory: Path, value: dict) -> None:
    temporary = directory / f".backup-status-{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, directory / "backup-status.json")
    finally:
        temporary.unlink(missing_ok=True)


def _read_status(source: Path, directory: Path) -> dict:
    empty = {
        "version": 1,
        "state": "never",
        "source": str(source),
        "backup_dir": str(directory),
        "last_attempt_at": None,
        "last_success_at": None,
        "last_error": None,
        "last_backup": None,
        "cloud_copy": {"state": "unavailable", "path": None},
    }
    try:
        saved = json.loads((directory / "backup-status.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return empty
    except (OSError, ValueError):
        return {**empty, "state": "error", "last_error": "Backup health could not be read."}
    if not isinstance(saved, dict) or saved.get("source") != str(source):
        return {**empty, "state": "error", "last_error": "Backup health needs a new snapshot."}
    return {**empty, **saved}


@contextlib.contextmanager
def _backup_lock(directory: Path):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (directory / ".backup.lock").open("a+b") as lock:
        os.chmod(directory / ".backup.lock", 0o600)
        try:
            if sys.platform == "win32":
                import msvcrt

                lock.seek(0)
                if not lock.read(1):
                    lock.write(b"0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as cause:
            raise BackupBusy("A backup is already running. Refresh its status shortly.") from cause
        try:
            yield
        finally:
            if sys.platform == "win32":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def backup_status(source_db: Path, backup_dir: Path) -> dict:
    source = source_db.expanduser().resolve()
    directory = backup_dir.expanduser().resolve()
    value = _read_status(source, directory)
    snapshot = value.get("last_backup")
    if isinstance(snapshot, dict):
        path = Path(snapshot.get("path", ""))
        try:
            available = (
                path.parent == directory
                and path.is_file()
                and path.stat().st_size == snapshot.get("size_bytes")
            )
        except OSError:
            available = False
        value["last_backup"] = {**snapshot, "file_available": available}
        if not available and value["state"] != "running":
            value["state"] = "error"
            value["last_error"] = (
                "The last verified snapshot is missing or has changed. Create a new backup."
            )
    # A crashed process releases the OS lock even if it left a running receipt.
    if value["state"] == "running":
        try:
            with _backup_lock(directory):
                value["state"] = "error"
                value["last_error"] = "The last backup was interrupted. Create a new backup."
        except BackupBusy:
            pass
        except OSError:
            value["state"] = "error"
            value["last_error"] = "The backup folder is unavailable."
    try:
        success = dt.datetime.fromisoformat(value["last_success_at"])
        value["stale"] = (dt.datetime.now(dt.UTC) - success).total_seconds() > 2 * 3600
    except (TypeError, ValueError):
        value["stale"] = True
    value["restore_verified"] = False
    return value


def _verify(path: Path) -> None:
    with contextlib.closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise BackupFailure("The snapshot failed SQLite integrity verification.")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_verified(source: Path, target: Path) -> None:
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        shutil.copyfile(source, temporary)
        os.chmod(temporary, 0o600)
        if _sha256(source) != _sha256(temporary):
            raise BackupFailure("The backup copy did not match the verified snapshot.")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _icloud_directory() -> Path | None:
    if sys.platform != "darwin":
        return None
    base = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
    return base / "HetuBackups" if base.is_dir() else None


def backup_database(
    source_db: Path,
    backup_dir: Path,
    keep_count: int = 14,
    sync_icloud: bool = True,
) -> Path:
    """Create an atomic, verified snapshot; never open the source for writes."""
    if keep_count < 1:
        raise ValueError("At least one backup must be retained.")
    source = source_db.expanduser().resolve()
    directory = backup_dir.expanduser().resolve()
    with _backup_lock(directory):
        previous = _read_status(source, directory)
        state = {**previous, "state": "running", "last_attempt_at": _now(), "last_error": None}
        _write_status(directory, state)
        name = dt.datetime.now(dt.UTC).strftime("hetu_backup_%Y%m%d_%H%M%S_%f.db")
        snapshot = directory / name
        temporary = directory / f".{name}.{uuid.uuid4().hex}.tmp"
        try:
            if not source.is_file():
                raise BackupFailure("The local database is unavailable. Reopen HETU and try again.")
            with contextlib.closing(
                sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True)
            ) as original:
                with contextlib.closing(sqlite3.connect(temporary)) as target:
                    os.chmod(temporary, 0o600)
                    original.backup(target, pages=250)
                    # A snapshot is one portable file, independent of WAL sidecars.
                    target.execute("PRAGMA journal_mode=DELETE")
            _verify(temporary)
            os.replace(temporary, snapshot)
            state.update(
                {
                    "state": "ready",
                    "last_success_at": _now(),
                    "last_backup": {
                        "path": str(snapshot),
                        "created_at": state["last_attempt_at"],
                        "size_bytes": snapshot.stat().st_size,
                        "sha256": _sha256(snapshot),
                        "integrity": "ok",
                    },
                    "cloud_copy": {
                        "state": "disabled" if not sync_icloud else "unavailable",
                        "path": None,
                    },
                }
            )
            try:
                _copy_verified(snapshot, directory / "hetu_latest.db")
            except (OSError, BackupFailure):
                state.update(
                    state="warning",
                    last_error="The snapshot is verified, but its latest-file copy failed.",
                )
            cloud = _icloud_directory() if sync_icloud else None
            if cloud is not None:
                try:
                    cloud.mkdir(parents=True, exist_ok=True)
                    _copy_verified(snapshot, cloud / name)
                    state["cloud_copy"] = {
                        "state": "copied",
                        "path": str(cloud / name),
                        "verified_at": _now(),
                    }
                except (OSError, BackupFailure):
                    state["cloud_copy"] = {"state": "failed", "path": str(cloud)}
                    state.update(
                        state="warning",
                        last_error=(
                            "The iCloud Drive copy failed. "
                            "The verified local snapshot is available."
                        ),
                    )
            _write_status(directory, state)
            # Rotation happens only after a verified snapshot and its receipt exist.
            for old in sorted(directory.glob("hetu_backup_*.db"), reverse=True)[keep_count:]:
                with contextlib.suppress(OSError):
                    old.unlink()
            return snapshot
        except Exception as cause:
            message = (
                str(cause)
                if isinstance(cause, BackupFailure)
                else (
                    "The database backup failed. "
                    "Check the database and backup folder, then try again."
                )
            )
            state.update(state="error", last_error=message)
            # Failure reporting must never serialize SQLite exceptions, SQL, or data.
            with contextlib.suppress(OSError):
                _write_status(directory, state)
            raise BackupFailure(message) from cause
        finally:
            temporary.unlink(missing_ok=True)
