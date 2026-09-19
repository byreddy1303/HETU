from __future__ import annotations

import math
import time
from dataclasses import dataclass
from functools import lru_cache

import structlog
from upstash_redis.asyncio import Redis

from app.core.config import get_settings

log = structlog.get_logger()


@lru_cache
def get_redis() -> Redis | None:
    settings = get_settings()
    if not settings.redis_configured:
        return None
    return Redis(
        url=settings.upstash_redis_rest_url,
        token=settings.upstash_redis_rest_token.get_secret_value(),
    )


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset_epoch: int


async def check_rate_limit(identifier: str) -> RateLimitResult:
    settings = get_settings()
    redis = get_redis()
    now = int(time.time())
    window = settings.rate_limit_window_seconds
    reset = (math.floor(now / window) + 1) * window
    if redis is None:
        return RateLimitResult(
            True, settings.rate_limit_requests, settings.rate_limit_requests, reset
        )

    key = f"hetu:ratelimit:{now // window}:{identifier}"
    try:
        count = int(await redis.incr(key))
        if count == 1:
            await redis.expire(key, window + 1)
        remaining = max(settings.rate_limit_requests - count, 0)
        return RateLimitResult(
            count <= settings.rate_limit_requests, settings.rate_limit_requests, remaining, reset
        )
    except Exception:
        log.exception("rate_limit_unavailable")
        if settings.rate_limit_fail_open:
            return RateLimitResult(True, settings.rate_limit_requests, 0, reset)
        return RateLimitResult(False, settings.rate_limit_requests, 0, reset)


async def close_redis() -> None:
    redis = get_redis()
    if redis is not None:
        close = getattr(redis, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result
