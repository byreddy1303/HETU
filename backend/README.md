# Hetu API

Production FastAPI backend for Hetu. It replaces the Supabase runtime with:

- FastAPI on Python 3.11, Uvicorn, and uvloop
- Neon PostgreSQL through SQLAlchemy 2.0 `AsyncSession` and `asyncpg`
- Clerk session-token validation through the official Python backend SDK
- Upstash Redis for rate limits, cross-instance realtime fan-out, and queued work
- Cloudflare R2 for direct, presigned file uploads and downloads
- Render Docker web and worker services defined in the repository-root `render.yaml`

The React pages and domain components do not need to know about database tables. The client-facing
boundary is the HTTP/WebSocket API below; a frontend API adapter obtains a Clerk token and attaches
it as `Authorization: Bearer <session-token>`.

## Architecture

The API is the only component allowed to connect to Neon. Browser clients never receive database,
Redis, R2, or Clerk secret credentials. Every record query includes the authenticated Clerk `sub` as
an ownership predicate, including reads, writes, patches, and deletes.

Hetu's heterogeneous learning objects are stored in a versioned `records` table. The record payload
is JSONB, with relational ownership, identity, timestamps, version checks, a unique
`(collection, owner_id, external_id)` key, and a GIN payload index. This keeps the existing domain
shapes intact while moving authorization out of Supabase RLS and into one audited server boundary.
`pyq_attempts` and `learning_events` remain append-only.

The other relational tables have infrastructure-specific responsibilities:

- `users`: Clerk identity projection and profile data
- `file_objects`: R2 object metadata and upload-finalization state
- `background_jobs`: durable job state, retries, and idempotency
- `webhook_receipts`: Clerk webhook replay protection

Upstash Pub/Sub carries user-targeted events between API instances. Each process maintains only its
local WebSocket set. The background worker uses an Upstash sorted set as its wake/schedule queue and
Postgres as the durable job ledger, so a Redis delivery loss can be recovered safely.

## Local setup

1. Create real Neon, Clerk, Upstash, and R2 resources. Copy `.env.example` to `.env` and populate it.
2. Configure the R2 bucket CORS policy for the exact frontend origins and `PUT`, `GET`, and `HEAD`.
3. Create a virtual environment and install exact dependencies:

   ```bash
   cd backend
   python3.11 -m venv .venv
   . .venv/bin/activate
   pip install -r requirements-dev.txt
   alembic upgrade head
   uvicorn app.main:app --reload --port 8000
   ```

4. Start the worker in another shell:

   ```bash
   cd backend
   . .venv/bin/activate
   python -m app.worker
   ```

The API docs are available at `http://localhost:8000/docs` outside production. Liveness and
readiness are `/health/live` and `/health/ready`. Prometheus metrics are `/metrics`.

## Clerk setup

Use Clerk's React SDK for sign-in and call `getToken()` before API requests. Configure the API with:

- `CLERK_SECRET_KEY`: Backend API key. Keep secret.
- `CLERK_JWT_KEY`: Clerk's PEM public JWT key. This makes request validation local/networkless.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated, exact frontend origins. This validates the token's
  authorized-party claim and protects against subdomain-cookie leakage.
- `CLERK_WEBHOOK_SECRET`: signing secret for a Clerk webhook pointed to
  `https://<api-host>/v1/webhooks/clerk`. Subscribe to `user.created`, `user.updated`, and
  `user.deleted`.

The WebSocket handshake must also carry the Clerk bearer token. Same-origin clients can use the
Clerk session cookie. Cross-origin browser clients use WebSocket subprotocols so the token does not
appear in a logged URL: `new WebSocket(url, ['clerk-session', token])`. Non-browser clients may send
the standard `Authorization` header. The server rejects unauthenticated sockets with code `4401`.

## API contract

All `/v1` routes except the Clerk webhook require a Clerk session token.

### User profile

- `GET /v1/me`
- `PATCH /v1/me`

### Versioned records

- `POST /v1/records/{collection}/query`
- `PUT /v1/records/{collection}` — batch upsert, maximum 100 rows
- `PATCH /v1/records/{collection}/{id}`
- `DELETE /v1/records/{collection}/{id}?expected_version=2`

An upsert example:

```json
{
  "items": [
    {
      "id": "734e59ef-d97d-4d66-a96e-a50f097d97d6",
      "subject": "Algorithms",
      "date": "2026-09-19",
      "actual_duration_min": 45,
      "expected_version": 2
    }
  ]
}
```

`expected_version` is optional for last-write-wins compatibility and recommended for interactive
edits. A mismatch returns `409` with the current version. Inserts with an `expected_version` also
return `409`. Existing IDs make retries naturally idempotent.

Queries accept up to eight filters (`eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `is`), ordering,
an opaque cursor, and a limit up to 500:

```json
{
  "filters": [
    {"field": "subject", "op": "eq", "value": "Algorithms"},
    {"field": "date", "op": "gte", "value": "2026-09-01"}
  ],
  "order_by": "date",
  "descending": true,
  "limit": 100
}
```

### R2 files

1. `POST /v1/files/upload-intent` with filename, exact content type, and byte size.
2. Upload directly to the returned R2 URL with `PUT` and the returned headers.
3. `POST /v1/files/{file_id}/complete`. The API issues `HEAD`, verifies size and content type, and
   only then marks the object ready.
4. `GET /v1/files/{file_id}` returns a short-lived signed download URL (or a configured public URL).
5. `DELETE /v1/files/{file_id}` removes the R2 object and tombstones its metadata.

Presigned URLs are bearer capabilities. Keep their lifetime short and do not log them.

### Background jobs and realtime

- `POST /v1/jobs` supports the bounded job kinds `realtime-event`, `delete-file`, and `noop`.
- `GET /v1/jobs/{id}` returns status and retry information.
- `WS /v1/ws` emits `record.upserted`, `record.updated`, and `record.deleted` events for the current
  user. Clients may send `{"type":"ping"}` and receive `{"type":"pong"}`.

Application-specific jobs should be added as explicit handlers in `app/services/jobs.py`; arbitrary
module/function execution is intentionally unsupported.

## Supabase data migration

Authentication IDs change from Supabase UUIDs to Clerk user IDs. Create every user in Clerk first,
then make a JSON map such as:

```json
{
  "2d41a24e-2a04-4dc3-b8a3-1d9ca5fd4d62": "user_31abc..."
}
```

Run a read-only dry run against the old Supabase direct Postgres URL:

```bash
cd backend
SUPABASE_DATABASE_URL='postgresql://...' \
DATABASE_URL='postgresql://...neon.tech/hetu?sslmode=require' \
python scripts/import_supabase.py --user-map ./user-map.json
```

Review every count, then add `--apply`. The importer does not modify Supabase. Shared buddy/chat,
question-share, and study-room data is intentionally excluded because those rows require a
two-party identity reconciliation; migrate them only after both sides have Clerk IDs and their
relationship semantics have been reviewed. Supabase Storage objects must be copied to R2 separately
before importing rows that refer to them.

Keep Supabase read-only until record counts, attachment checksums, and a representative account's
full UI flow have been verified against the new API. Then revoke Supabase browser keys and remove the
old functions.

## Render deployment

The root `render.yaml` creates `hetu-api` and `hetu-worker` from the same Python 3.11 image in the
Singapore region. The web service runs `alembic upgrade head` as its pre-deploy command. Set every
`sync: false` value in the Render environment group before the first deploy.

Before switching traffic:

1. Point Neon and Upstash at regions close to Render's Singapore service.
2. Run the migration and confirm `/health/ready` returns `200`.
3. Configure the Clerk webhook and verify a signed delivery.
4. Exercise a direct R2 upload from each production frontend origin.
5. Confirm the worker completes a `noop` job and that two API instances receive a realtime event.
6. Set `TRUSTED_HOSTS`, `CORS_ORIGINS`, and `CLERK_AUTHORIZED_PARTIES` to exact production values.

## Verification

```bash
cd backend
ruff check .
ruff format --check .
pytest
alembic check
docker build -t hetu-api .
```
