from __future__ import annotations

import asyncio
import signal
import time
from contextlib import suppress

import structlog

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import close_database, get_session_factory
from app.services.jobs import claim_job, execute_job, pop_due_job_id, recover_jobs
from app.services.redis import close_redis, get_redis

log = structlog.get_logger()


async def run_worker() -> None:
    settings = get_settings()
    settings.validate_runtime()
    if get_redis() is None:
        raise RuntimeError("Upstash Redis is required by the background worker")

    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stopping.set)

    async with get_session_factory()() as db:
        recovered = await recover_jobs(db)
        log.info("worker_started", recovered_jobs=recovered)
    last_recovery = time.monotonic()

    while not stopping.is_set():
        try:
            if time.monotonic() - last_recovery >= 30:
                async with get_session_factory()() as db:
                    recovered = await recover_jobs(db)
                    if recovered:
                        log.info("worker_recovered_jobs", count=recovered)
                last_recovery = time.monotonic()
            job_id = await pop_due_job_id()
            if not job_id:
                try:
                    await asyncio.wait_for(stopping.wait(), timeout=settings.worker_poll_seconds)
                except TimeoutError:
                    pass
                continue
            async with get_session_factory()() as db:
                job = await claim_job(db, job_id)
                if job is not None:
                    await execute_job(db, job)
        except Exception:
            log.exception("worker_iteration_failed")
            await asyncio.sleep(min(settings.worker_poll_seconds * 2, 10))

    await close_redis()
    await close_database()
    log.info("worker_stopped")


def main() -> None:
    configure_logging(get_settings().log_level)
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
