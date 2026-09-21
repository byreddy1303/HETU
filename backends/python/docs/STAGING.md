# Python staging services

Provisioned on 2026-09-20 for the **Preview** environment of the Vercel project
`hetu-python-api`. This is an isolated test environment; the live React app still
uses Supabase. Existing accounts and learning data have not been migrated.

Verified Preview deployment:
<https://hetu-python-bqsxe7pue-byreddy1303s-projects.vercel.app>
(Vercel Deployment Protection remains enabled.)

| Service | Resource | Purpose |
| --- | --- | --- |
| Neon | `hetu-staging`, database `neondb`, AWS Ohio | PostgreSQL 18; schema revision `202609200001` |
| Upstash | `hetu-staging`, Free plan, AWS Ohio | Redis rate limits and event delivery |
| Cloudflare R2 | Private bucket `hetu-staging`, APAC | Uploaded files; token `hetu-python-staging` is scoped to this bucket |
| Clerk | Development instance `moving-chow-3954.clerk.accounts.dev` | Session verification with its RSA public key |

Neon's default branch is named `production` **inside the staging project**. That
branch name does not make it Hetu's production database. The free Neon project's
console reported six hours of restore history at provisioning time.

## Credentials and deployment

Vercel Preview holds `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, and `CLERK_JWT_KEY`. Secret credentials are stored as
sensitive variables. No Neon owner credential or Clerk admin secret is deployed.

The Neon application role is `hetu_app_staging`. It can read, insert, and update
application tables and insert the history rows required by database triggers.
It cannot own application tables, create schema objects, delete/truncate tables,
create roles/databases, or bypass row-level security. Schema migrations use the
separate Neon owner login, never the application URL.

Preview explicitly sets `ENVIRONMENT=staging` and `MAINTENANCE_MODE=false`.
`TRUSTED_HOSTS=*.vercel.app` permits Vercel's deployment hostnames.
Without an explicit override, both Vercel Preview and Production default to
maintenance mode. Production has no staging service credentials.

The Redis namespaces are `hetu:staging:events:v1` and `hetu:staging:jobs:v1`.
Clerk authorized parties and API/R2 CORS currently allow only
`http://localhost:5173` and `http://localhost:4173`. These are allowed **client
origins**, not database locations. The backend, database, Redis, and bucket are
hosted online. Add an exact hosted frontend origin to all three allowlists when
connecting a staging frontend; do not use wildcard origins.

R2 browser access allows GET/HEAD/PUT with `Content-Type` and `If-None-Match`,
exposes `ETag`, and retains private bucket access.

## Verification and remaining scope

Direct checks exercised the restricted PostgreSQL role, record writes, immutable
revision capture, and stale-write rejection. Synthetic database changes were
rolled back. Redis answered PING. R2 signed upload/download and byte comparison
passed, conditional overwrite replay was rejected, and unsigned access failed.
A small synthetic object remains under `_verification/2026-09-20/`; no personal
files were uploaded. The Clerk public key was matched against the instance's
live JWKS.

The deployed Preview returned HTTP 200 from `/health/ready` with both database
and Redis checks `ok`. `/v1/me` returned HTTP 401 with `SESSION_TOKEN_MISSING`
without a Clerk session. R2 preflights accepted the two configured origins and
rejected an unrelated origin. Local Python validation passed lint/format checks
and 26 tests; the existing disposable-local-PostgreSQL test was skipped. The
separate checks above exercised the actual Neon staging database.

These checks do not establish a completed user sign-in flow, frontend contract
parity, production backup/recovery readiness, or a working scheduled worker.
Clerk webhook setup, independent backups, R2 retention locks, production
resources, full migration, and cutover remain subject to
[DATA_SAFETY.md](DATA_SAFETY.md). Do not use staging for the only copy of real
learning data or promote this deployment to production.
