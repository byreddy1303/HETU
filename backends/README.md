# HETU backend

`python/` contains the FastAPI application API. The root React frontend and
Capacitor Android app both use its shared online PostgreSQL database. Clerk
verifies account sessions, with permanent HETU user IDs resolved in Postgres.

`typescript/` is the archived Supabase/Deno implementation. It is retained for
migration and recovery evidence and excluded from deployments. It is not a
runtime alternative. The frontend has no Supabase SDK or PIN/edge-function login
flow.

The website forwards `/api/:path*` to
`https://hetu-python-api.vercel.app/:path*`. Android uses that absolute API URL.
API responses bypass the SPA/service-worker navigation cache. Application records
and preferences are saved online; frontend repositories are temporary memory.

See [deployment instructions](../DEPLOY.md),
[data preservation](python/docs/DATA_SAFETY.md), and
[backup recovery](python/docs/backup-recovery.md). The migration's completion
requires final source reconciliation and authenticated live verification; an API
health response alone does not establish that a website or installed APK has
switched backends.
