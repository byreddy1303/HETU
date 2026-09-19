from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import BackgroundJob, FileObject, Record, User
from app.services.realtime import broker
from app.services.redis import get_redis
from app.services.storage import delete_object

log = structlog.get_logger()


async def create_job(
    db: AsyncSession,
    *,
    kind: str,
    payload: dict[str, Any],
    owner_id: str | None,
    run_at: datetime | None = None,
    idempotency_key: str | None = None,
) -> BackgroundJob:
    if idempotency_key:
        existing = await db.scalar(
            select(BackgroundJob).where(BackgroundJob.idempotency_key == idempotency_key)
        )
        if existing is not None:
            return existing
    job = BackgroundJob(
        id=str(uuid4()),
        kind=kind,
        owner_id=owner_id,
        payload=payload,
        run_at=run_at or datetime.now(UTC),
        max_attempts=get_settings().worker_max_attempts,
        idempotency_key=idempotency_key,
    )
    db.add(job)
    await db.flush()
    return job


async def enqueue_job(job: BackgroundJob) -> None:
    redis = get_redis()
    if redis is None:
        return
    try:
        await redis.zadd(
            get_settings().redis_jobs_key,
            {job.id: job.run_at.timestamp()},
        )
    except Exception:
        log.exception("background_job_enqueue_failed", job_id=job.id)


async def pop_due_job_id() -> str | None:
    redis = get_redis()
    if redis is None:
        return None
    now = datetime.now(UTC).timestamp()
    items = await redis.zrange(get_settings().redis_jobs_key, 0, 0, withscores=True)
    if not items:
        return None
    first = items[0]
    job_id = first[0] if isinstance(first, (list, tuple)) else first
    score = float(first[1]) if isinstance(first, (list, tuple)) and len(first) > 1 else 0
    if score > now:
        return None
    removed = await redis.zrem(get_settings().redis_jobs_key, job_id)
    return str(job_id) if removed else None


async def claim_job(db: AsyncSession, job_id: str) -> BackgroundJob | None:
    job = await db.scalar(
        select(BackgroundJob).where(BackgroundJob.id == job_id).with_for_update(skip_locked=True)
    )
    if job is None or job.status != "queued" or job.run_at > datetime.now(UTC):
        return None
    job.status = "running"
    job.attempts += 1
    job.locked_at = datetime.now(UTC)
    await db.commit()
    return job


async def execute_job(db: AsyncSession, job: BackgroundJob) -> None:
    try:
        if job.kind == "realtime-event":
            if not job.owner_id:
                raise ValueError("realtime-event requires an owner")
            await broker.publish(job.owner_id, job.payload)
        elif job.kind == "delete-file":
            file_id = str(job.payload.get("file_id", ""))
            file = await db.scalar(
                select(FileObject).where(
                    FileObject.id == file_id,
                    FileObject.owner_id == job.owner_id,
                )
            )
            if file is not None and file.status != "deleted":
                await delete_object(file.object_key)
                file.status = "deleted"
        elif job.kind == "purge-user":
            if not job.owner_id:
                raise ValueError("purge-user requires an owner")
            files = list(
                (
                    await db.scalars(select(FileObject).where(FileObject.owner_id == job.owner_id))
                ).all()
            )
            for file in files:
                if file.status != "deleted":
                    await delete_object(file.object_key)
                await db.delete(file)
            await db.execute(delete(Record).where(Record.owner_id == job.owner_id))
            await db.execute(
                delete(BackgroundJob).where(
                    BackgroundJob.owner_id == job.owner_id,
                    BackgroundJob.id != job.id,
                )
            )
            user = await db.get(User, job.owner_id)
            if user is not None:
                user.email = None
                user.username = None
                user.display_name = None
                user.profile = {}
        elif job.kind == "noop":
            pass
        else:
            raise ValueError(f"Unsupported job kind: {job.kind}")
        job.status = "succeeded"
        job.finished_at = datetime.now(UTC)
        job.last_error = None
        await db.commit()
    except Exception as exc:
        await db.rollback()
        job = await db.get(BackgroundJob, job.id)
        if job is None:
            raise
        job.last_error = str(exc)[:4000]
        if job.attempts >= job.max_attempts:
            job.status = "failed"
            job.finished_at = datetime.now(UTC)
        else:
            job.status = "queued"
            job.run_at = datetime.now(UTC) + timedelta(seconds=min(2**job.attempts, 300))
        await db.commit()
        if job.status == "queued":
            await enqueue_job(job)
        log.exception("background_job_failed", job_id=job.id, kind=job.kind)


async def recover_jobs(db: AsyncSession) -> int:
    stale_before = datetime.now(UTC) - timedelta(minutes=10)
    jobs = list(
        (
            await db.scalars(
                select(BackgroundJob).where(
                    (BackgroundJob.status == "queued")
                    | (
                        (BackgroundJob.status == "running")
                        & (BackgroundJob.locked_at < stale_before)
                    )
                )
            )
        ).all()
    )
    for job in jobs:
        if job.status == "running":
            job.status = "queued"
            job.run_at = datetime.now(UTC)
        await enqueue_job(job)
    if jobs:
        await db.commit()
    return len(jobs)
