# Hetu Python API

FastAPI + SQLAlchemy/asyncpg + Neon + Clerk + Upstash + R2.

**Status: implemented and tested infrastructure/data-safety layer, not a complete
Supabase replacement.** The React frontend still uses the TypeScript backend in
`../typescript/supabase`. The incomplete cutover is preserved as non-executable
`.draft` files in `experimental/`; it is not shipped in Python deployments.

## Data comes first

Read [DATA_SAFETY.md](docs/DATA_SAFETY.md) before provisioning or migration.
Record writes are revision-checked; deletes retain tombstones and immutable
history; attachments are retained; Clerk deletion cannot purge learning data.
PostgreSQL triggers also guard direct SQL deletes/truncates/history mutation.
Builds and deployments do not run migrations or import existing data.

These protections are not a zero-data-loss guarantee. Independent encrypted
backups, R2 retention, PITR, restricted runtime credentials and recovery drills
are required before production writes. None has been configured on live services
by the local tests.

## Local development

From the repository root:

```sh
cd backends/python
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
# Copy .env.example to .env and configure isolated service credentials.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Python 3.11 remains supported by the Docker image. Vercel uses Python 3.12,
explicitly pinned in `.python-version`. No durable state belongs on the function
filesystem. Use a Neon pooled runtime URL and a direct migration/backup URL.

Run the optional long-lived worker with `python -m app.worker` locally or on a
separate worker host. It is **not** launched by a Vercel function deployment.
Production task scheduling/notification parity is still a cutover blocker.

## Supported HTTP contracts

All `/v1` data routes require a validated Clerk session. Set exact authorized
origins; never expose database, Clerk backend, R2, or Redis secrets to the browser.

| Route | Purpose |
|---|---|
| `GET/PATCH /v1/me` | Authenticated profile |
| `POST /v1/records/{collection}/query` | Owner-scoped live rows, max 500/page |
| `PUT /v1/records/{collection}` | Up to 100 rows, version-checked replacements |
| `PATCH /v1/records/{collection}/{id}` | Version-checked partial update |
| `DELETE /v1/records/{collection}/{id}?expected_version=N` | Recoverable tombstone |
| `GET /v1/records/{collection}/{id}/history` | Latest 100 revisions; paginate with `before_version` |
| `POST /v1/records/{collection}/{id}/restore` | Restore using `revision` and `expected_version` |
| `POST /v1/files/upload-intent` | Unique private R2 upload key and conditional signature |
| `POST /v1/files/{id}/complete` | Verify size/type before making upload available |
| `GET /v1/files/{id}` | Short-lived signed download |
| `DELETE /v1/files/{id}` | Hide metadata; retain R2 bytes |
| `POST /v1/files/{id}/restore` | Verify and restore retained attachment |
| `POST/GET /v1/jobs[/id]` | Durable ledger for bounded job kinds |
| `WS /v1/ws` | Authenticated owner-scoped change notifications |
| `POST /v1/webhooks/clerk` | Verified Clerk identity events |

An existing changed record requires `expected_version`: missing returns 428,
stale returns 409. Identical upserts are retry-safe no-ops. Tombstones require
explicit restore. `learning_events` and `pyq_attempts` are append-only.
Clients must re-query durable records after reconnect; Pub/Sub is not a durable
event log. The full legacy frontend contract is not yet implemented.

## Vercel

Project: **hetu-python-api**. GitHub root directory: **backends/python**.
The existing **hetu** Vite project remains separate and retains its data source.

`vercel.json` deliberately ships with production `MAINTENANCE_MODE=true`:

- `/health/live`: 200 (process alive)
- `/health/ready` and all data routes: 503 (not ready for data)
- WebSocket connections: rejected
- No database/R2/Redis connection or schema migration during startup

Remove the maintenance setting only after all DATA_SAFETY release gates pass.
Configure the real environment securely in Vercel and redeploy. A successful
Vercel build is not evidence of a working database, backup, auth, or migration.
The legacy Render blueprint is retained with automatic deployment disabled.

## Verification

```sh
ruff check app tests alembic scripts
ruff format --check app tests alembic scripts
pytest
# Set HETU_TEST_DATABASE_URL to an isolated migrated PostgreSQL database.
# Tests insert synthetic rows and attempt blocked destructive operations.
# NEVER use a production database.
pytest tests/test_postgres_safety.py
alembic check
```

`scripts/backup_database.py` creates consistent PostgreSQL dumps and manifests
and verifies a separately restored database. See DATA_SAFETY for commands.
`scripts/import_supabase.py` is partial dry-run auditing only; `--apply` refuses
to run until shared-data, identity and attachment migration is completed.
