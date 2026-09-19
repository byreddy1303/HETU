FROM python:3.11.13-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.11.13-slim-bookworm AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

RUN groupadd --system --gid 10001 hetu \
    && useradd --system --uid 10001 --gid hetu --create-home hetu

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=hetu:hetu alembic.ini ./
COPY --chown=hetu:hetu alembic ./alembic
COPY --chown=hetu:hetu app ./app

USER hetu
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --loop uvloop --http httptools --proxy-headers --forwarded-allow-ips='*'"]
