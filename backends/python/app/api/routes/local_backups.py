"""Personal desktop backup health; no arbitrary paths or restore operations."""

from __future__ import annotations

import ipaddress
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.engine import make_url
from starlette.concurrency import run_in_threadpool

from app.api.deps import SettingsDep
from app.core.config import Settings
from app.core.security import authenticate_http_request
from app.services.local_backup import BackupBusy, BackupFailure, backup_database, backup_status


async def require_local_backup(request: Request, settings: SettingsDep) -> None:
    host = request.client.host if request.client else ""
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if not (settings.environment == "local" and loopback):
        raise HTTPException(403, "Backups are available only in the personal desktop workspace.")
    url = make_url(settings.sqlalchemy_database_url)
    if (
        url.get_backend_name() != "sqlite"
        or not url.database
        or url.database == ":memory:"
        or url.query
    ):
        raise HTTPException(403, "A local file-backed SQLite workspace is required.")
    await authenticate_http_request(request, settings)


router = APIRouter(dependencies=[Depends(require_local_backup)])


def _paths(settings: Settings) -> tuple[Path, Path]:
    source = Path(make_url(settings.sqlalchemy_database_url).database).expanduser().resolve()
    return source, source.parent / "backups"


@router.get("/status")
async def status(settings: SettingsDep, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return await run_in_threadpool(backup_status, *_paths(settings))


@router.post("/run")
async def run(settings: SettingsDep, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    source, directory = _paths(settings)
    try:
        await run_in_threadpool(backup_database, source, directory)
    except BackupBusy as cause:
        raise HTTPException(409, str(cause)) from cause
    except (BackupFailure, OSError) as cause:
        raise HTTPException(
            503, "Backup did not complete. Refresh backup health for the saved status."
        ) from cause
    return await run_in_threadpool(backup_status, source, directory)
