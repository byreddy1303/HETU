from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import __version__
from app.api.deps import DbDep
from app.schemas import HealthResponse
from app.services.redis import get_redis

router = APIRouter()


@router.get("/health/live", response_model=HealthResponse, include_in_schema=False)
async def liveness() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__, checks={"process": "ok"})


@router.get("/health/ready", response_model=HealthResponse, include_in_schema=False)
async def readiness(db: DbDep) -> HealthResponse:
    checks: dict[str, str] = {}
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = "error"
        raise HTTPException(status_code=503, detail={"status": "error", "checks": checks}) from exc

    redis = get_redis()
    if redis is None:
        checks["redis"] = "not-configured"
        return HealthResponse(status="degraded", version=__version__, checks=checks)
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = "error"
        raise HTTPException(status_code=503, detail={"status": "error", "checks": checks}) from exc
    return HealthResponse(status="ok", version=__version__, checks=checks)
