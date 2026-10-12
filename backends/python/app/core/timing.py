"""Per-request latency breakdown exposed as a standard ``Server-Timing`` header.

Browser devtools show these segments next to each API call, so slow clicks can
be attributed to rate limiting, database round trips or application work
without adding logging to every route. Measurement is read-only: nothing here
changes what a request reads or writes.
"""

from __future__ import annotations

import time
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine

_QUERY_STARTS_KEY = "hetu_query_starts"


@dataclass(slots=True)
class RequestTiming:
    rate_limit_ms: float = 0.0
    db_ms: float = 0.0
    db_queries: int = 0


# The middleware stores one mutable accumulator per request. SQLAlchemy's async
# greenlets inherit the request context, so cursor events update the same object.
_current: ContextVar[RequestTiming | None] = ContextVar("hetu_request_timing", default=None)


def start_request_timing() -> RequestTiming:
    timing = RequestTiming()
    _current.set(timing)
    return timing


def _record_query(conn: Any) -> None:
    starts = conn.info.get(_QUERY_STARTS_KEY)
    if not starts:
        return
    started = starts.pop()
    timing = _current.get()
    if timing is not None:
        timing.db_ms += (time.perf_counter() - started) * 1000
        timing.db_queries += 1


def instrument_engine(engine: AsyncEngine) -> None:
    sync_engine = engine.sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        conn.info.setdefault(_QUERY_STARTS_KEY, []).append(time.perf_counter())

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        _record_query(conn)

    @event.listens_for(sync_engine, "handle_error")
    def _error(exception_context):  # noqa: ANN001
        connection = exception_context.connection
        if connection is not None:
            _record_query(connection)


def server_timing_header(timing: RequestTiming, total_ms: float) -> str:
    return ", ".join(
        (
            f"rl;dur={timing.rate_limit_ms:.1f}",
            f'db;dur={timing.db_ms:.1f};desc="{timing.db_queries} queries"',
            f"app;dur={total_ms:.1f}",
        )
    )
