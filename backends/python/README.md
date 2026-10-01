# Hetu Python API

FastAPI + SQLAlchemy/asyncpg + Neon + Clerk + Upstash + R2.

**Status: the authenticated data, sharing, buddy, planner, access-request, and
realtime compatibility contracts are implemented and tested.** Production stays
in maintenance mode until existing Supabase identities and rows are reconciled,
imported, counted, and recovery-tested. Notification delivery and private file
uploads require their provider credentials and runtime workers before those
features can be enabled.

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
Do not expose notification controls as available until the worker and delivery
providers are configured.

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
| `POST /v1/compat/tables/{table}/query` | Owner-scoped legacy query contract |
| `POST /v1/compat/tables/{table}/{operation}` | Owner-scoped legacy mutations |
| `POST /v1/compat/rpc/{name}` | Buddy, planner, readiness and settings RPCs |
| `WS /v1/ws` | Authenticated owner-scoped change notifications |
| `POST /v1/webhooks/clerk` | Verified Clerk identity events |
| `POST /v1/learning/captures` | Transactional sourced concept and insight capture |
| `GET /v1/learning/search`, `GET /v1/learning/concepts/{id}` | Search and detailed explanation, sources, and revisions |
| `PATCH /v1/learning/insights/{id}` | Version-checked learning revision |
| `/v1/workflows`, `/v1/concept-reviews`, `/v1/sections` | Task briefs, actual recall history, mapped record evidence |
| `GET /v1/pyq/search`, `GET /v1/pyq/questions/{id}` | Filtered versioned bank search and question detail |
| `POST /v1/pyq/attempts` | Canonically scored, immutable individual answer receipt |

An existing changed record requires `expected_version`: missing returns 428,
stale returns 409. Identical upserts are retry-safe no-ops. Tombstones require
explicit restore. `learning_events` and `pyq_attempts` are append-only.
Clients must re-query durable records after reconnect; Pub/Sub is not a durable
event log. Private file routes return 503 until object storage is configured.
Learning, workflow, and concept-review collections reject generic `/records`
and compatibility mutations; their validated domain routes own those writes.
New PYQ attempt records also reject generic record writes. The React compatibility
write path checks its v3 snapshot, answer key, scoring fields, timing, and active
session association against the Python bank before accepting a receipt.

## ChatGPT MCP boundary

Set `MCP_RESOURCE_URL`, `CLERK_OAUTH_ISSUER`, and an exact
`MCP_ALLOWED_CLIENT_IDS` allowlist to mount Streamable HTTP at `/mcp`. The URL
must be the canonical resource identifier advertised in OAuth protected resource
metadata. Hosted connections require HTTPS. The Clerk OAuth application must
issue `hetu:read` and `hetu:write` scopes and carry that resource identifier in
the verified token audience. Tokens lacking an exact audience, approved client,
required scope, or user subject are rejected. MCP tools resolve the authenticated
Clerk subject to HETU's internal owner ID; callers cannot supply another owner.

The MCP server currently provides sourced learning capture/retrieval/revision,
owner-checked concept links (related ideas, contrasts, extensions, and acyclic
prerequisites), durable task briefs, concept recall responses, versioned PYQ
search and individual answer submission, and explicitly partial record context
for mapped sections.
PYQ detail hides its key by default; a quarantined key is never exposed. The
bundled local plugin is under
[`plugins/hetu-chatgpt`](../../plugins/hetu-chatgpt); its HTTP URL is a local
development endpoint until a production URL is verified. It has not been
installed in ChatGPT or cleared for production writes. Whole-app actions,
complete migration, and live OAuth reconnection remain release work tracked in
[`docs/hetu-plugin-implementation.md`](../../docs/hetu-plugin-implementation.md).

## Vercel

Project: **hetu-python-api**. GitHub root directory: **backends/python**.
The existing **hetu** Vite project remains separate. It switches only when
`VITE_BACKEND=fastapi` is explicitly configured; there is no silent fallback.

Settings detect the Vercel deployment environment: Production uses `production`
and Preview uses `staging`. Both default to maintenance mode unless
`MAINTENANCE_MODE=false` is explicitly configured for that environment:

- `/health/live`: 200 (process alive)
- `/health/ready` and all data routes: 503 (not ready for data)
- WebSocket connections: rejected
- No database/R2/Redis connection or schema migration during startup

Enable production data access only after all DATA_SAFETY release gates pass.
Preview may use separately provisioned staging resources for synthetic tests.
Configure the real environment securely in Vercel and redeploy. A successful
Vercel build is not evidence of a working database, backup, auth, or migration.
The legacy Render blueprint is retained with automatic deployment disabled.

See [STAGING.md](docs/STAGING.md) for the provisioned Preview resources,
credential boundaries, verification results, and remaining production work.

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
`scripts/import_supabase.py` remains dry-run auditing only; `--apply` refuses to
run until shared-data, identity and attachment migration is completed. This is
an intentional data-loss barrier, not a deploy-time migration.
