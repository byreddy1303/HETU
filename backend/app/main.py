from __future__ import annotations

import time
from contextlib import asynccontextmanager
from uuid import uuid4

import sentry_sdk
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, make_asgi_app
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.router import api_router, root_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import close_database
from app.services.realtime import broker
from app.services.redis import check_rate_limit, close_redis

settings = get_settings()
configure_logging(settings.log_level)
log = structlog.get_logger()

REQUESTS = Counter("hetu_http_requests_total", "HTTP requests", ("method", "path", "status"))
DURATION = Histogram(
    "hetu_http_request_duration_seconds", "HTTP request latency", ("method", "path")
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_runtime()
    await broker.start()
    log.info("api_started", version=settings.app_version, environment=settings.environment)
    yield
    await broker.stop()
    await close_redis()
    await close_database()
    log.info("api_stopped")


if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment,
        release=f"hetu-api@{settings.app_version}",
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_host_list)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))[:128]
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    start = time.perf_counter()

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            too_large = int(content_length) > 2 * 1024 * 1024
        except ValueError:
            too_large = True
        if too_large:
            return JSONResponse(
                status_code=413, content={"detail": "API request body is too large"}
            )

    rate_result = None
    if request.url.path.startswith(settings.api_prefix) and not request.url.path.endswith(
        "/webhooks/clerk"
    ):
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        identifier = forwarded or (request.client.host if request.client else "unknown")
        rate_result = await check_rate_limit(identifier)
        if not rate_result.allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={
                    "Retry-After": str(max(rate_result.reset_epoch - int(time.time()), 1)),
                    "X-RateLimit-Limit": str(rate_result.limit),
                    "X-RateLimit-Remaining": str(rate_result.remaining),
                    "X-RateLimit-Reset": str(rate_result.reset_epoch),
                    "X-Request-ID": request_id,
                },
            )

    response = await call_next(request)
    route = request.scope.get("route")
    path_template = getattr(route, "path", request.url.path)
    elapsed = time.perf_counter() - start
    REQUESTS.labels(request.method, path_template, response.status_code).inc()
    DURATION.labels(request.method, path_template).observe(elapsed)
    response.headers["X-Request-ID"] = request_id
    if rate_result:
        response.headers["X-RateLimit-Limit"] = str(rate_result.limit)
        response.headers["X-RateLimit-Remaining"] = str(rate_result.remaining)
        response.headers["X-RateLimit-Reset"] = str(rate_result.reset_epoch)
    log.info(
        "request_complete",
        method=request.method,
        path=path_template,
        status=response.status_code,
        duration_ms=round(elapsed * 1000, 2),
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_exception", method=request.method, path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "version": settings.app_version}


app.include_router(root_router)
app.include_router(api_router, prefix=settings.api_prefix)
app.mount("/metrics", make_asgi_app())
