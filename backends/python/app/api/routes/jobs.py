from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.db.models import BackgroundJob
from app.schemas import JobCreate, JobResponse
from app.services.jobs import create_job, enqueue_job

router = APIRouter()


def _response(job: BackgroundJob) -> JobResponse:
    return JobResponse(
        id=job.id,
        kind=job.kind,
        status=job.status,
        attempts=job.attempts,
        run_at=job.run_at,
        finished_at=job.finished_at,
        last_error=job.last_error,
    )


@router.post("", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_job(payload: JobCreate, identity: CurrentUser, db: DbDep) -> JobResponse:
    job = await create_job(
        db,
        kind=payload.kind,
        payload=payload.payload,
        owner_id=identity.user_id,
        run_at=payload.run_at,
        idempotency_key=(
            f"{identity.user_id}:{payload.idempotency_key}" if payload.idempotency_key else None
        ),
    )
    await db.commit()
    await enqueue_job(job)
    return _response(job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, identity: CurrentUser, db: DbDep) -> JobResponse:
    job = await db.scalar(
        select(BackgroundJob).where(
            BackgroundJob.id == job_id,
            BackgroundJob.owner_id == identity.user_id,
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _response(job)
