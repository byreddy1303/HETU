#!/usr/bin/env python3
"""Launch HETU after its India-time schedule, retrying failed starts at most every 5 minutes."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

RETRY_SECONDS = 5 * 60


def _app_is_running(executable: Path) -> bool:
    """Include an app opened manually, whose PID is not in our launch marker."""
    try:
        processes = subprocess.run(
            ["/bin/ps", "-axo", "pid=,comm="],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    target = executable.resolve()
    for line in processes.stdout.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) == 2 and fields[0].isdigit() and Path(fields[1]).resolve() == target:
            return True
    return False


def _read_marker(marker: Path) -> dict:
    try:
        value = json.loads(marker.read_text())
    except (FileNotFoundError, ValueError, UnicodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _write_marker(marker: Path, value: dict) -> None:
    temporary = marker.with_suffix(f".{os.getpid()}.tmp")
    try:
        with temporary.open("w") as handle:
            temporary.chmod(0o600)
            json.dump(value, handle)
        temporary.replace(marker)
    finally:
        temporary.unlink(missing_ok=True)


def _recent_attempt(marker: Path, value: dict, date: str, now: dt.datetime) -> bool:
    if value.get("date") != date:
        return False
    try:
        attempted = dt.datetime.fromisoformat(value["attempted_at"])
        if attempted.tzinfo is None:
            return False
    except (KeyError, TypeError, ValueError):
        # Legacy markers only recorded date/PID. Keep a short cooldown, never
        # the former all-day suppression; an actually running app is checked separately.
        try:
            attempted = dt.datetime.fromtimestamp(marker.stat().st_mtime, tz=dt.UTC)
        except FileNotFoundError:
            return False
    age = (now - attempted).total_seconds()
    # Invalid future timestamps must not suppress launches indefinitely.
    return 0 <= age < RETRY_SECONDS


def launch_if_due(data_dir: Path, executable: Path, now: dt.datetime | None = None) -> bool:
    instant = now or dt.datetime.now(dt.UTC)
    local = instant.astimezone(ZoneInfo("Asia/Kolkata"))
    date, time = local.date().isoformat(), local.strftime("%H:%M")
    settings = json.loads((data_dir / "daily-brief.json").read_text())
    if not settings.get("enabled") or not settings.get("autoLaunch"):
        return False
    if time < settings["time"] or settings.get("last_shown_on") == date:
        return False
    marker = data_dir / "daily-brief-launch.json"
    if _app_is_running(executable) or _recent_attempt(marker, _read_marker(marker), date, instant):
        return False
    attempt = {"date": date, "attempted_at": instant.isoformat(), "pid": None}
    # Record before spawning so a missing/broken executable also gets a bounded
    # retry. Only the app's last_shown_on acknowledges successful brief delivery.
    _write_marker(marker, attempt)
    # No shell, no network, and no database write. The app reads the live agenda.
    child = subprocess.Popen(
        [str(executable), "--daily-brief"],
        env={**os.environ, "HETU_DATA_DIR": str(data_dir)},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    _write_marker(marker, {**attempt, "pid": child.pid})
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, type=Path)
    parser.add_argument("--data-dir", required=True, type=Path)
    arguments = parser.parse_args()
    try:
        launch_if_due(arguments.data_dir, arguments.app)
    except (OSError, ValueError, KeyError):
        # launchd retries next minute; the app exposes preferences and delivery errors.
        raise SystemExit(1) from None
