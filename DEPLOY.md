# HETU deployment

HETU's application backend is Python/FastAPI. The React website and Capacitor
Android app use that API and its shared online PostgreSQL database. Clerk owns
login sessions. Redis supports rate limiting and realtime transport. Application
records, preferences, drafts, PYQ history and inline study images are durable in
Postgres; browser memory is a temporary view of server data.

## Projects and configuration

- Website: Vercel project `hetu`, repository root, https://hetu-app.vercel.app.
- Python: Vercel project `hetu-python-api`, root `backends/python`,
  https://hetu-python-api.vercel.app.
- Website variables: `VITE_BACKEND=fastapi`, `VITE_API_URL=/api`, and
  `VITE_CLERK_PUBLISHABLE_KEY`. The website's `/api` rewrite forwards to Python.
- Android variables: the same backend and Clerk key, with the absolute
  `VITE_API_URL=https://hetu-python-api.vercel.app`. Copy `.env.capacitor.example`
  to `.env.capacitor.local` and fill in the publishable key before building.
- Backend credentials belong only in the Python project's environment. Use the
  restricted `hetu_app` Postgres role; migration-owner credentials must never be
  deployed. Preview resources are isolated from production.

Missing API or login configuration blocks startup/builds. It must never select
another backend or enable device-only saves. Network failures are visible; writes
are not automatically replayed after a timeout because the server may have saved
an operation whose response was lost.

## Release

Use the current Vercel CLI (`npm i -g vercel@latest`). Run frontend typecheck,
lint, tests and build, plus Python Ruff and pytest. Database migrations run as a
separate operator step; deploys never run them automatically.

Create a production deployment with `vercel deploy --prod --skip-domain`.
Specify `--project hetu-python-api` from the repository root for Python so Vercel
applies its configured root directory once. Verify the deployment before
`vercel promote <deployment-url>`. Keep maintenance/previous deployments available
while resolving release failures. Do not restore a backup over production.

For native builds run `npm run android:apk` or the signed release workflow.
An existing APK does not receive JavaScript/API configuration changes just because
the website was deployed; it must be updated. Both clients then use the same
account IDs and database. Device app-shell assets and login cookies are separate
from durable study data.

## Migration and recovery

The legacy TypeScript/Supabase directory is retained as an archive for migration
and recovery evidence and excluded from deployments. The Supabase SDK and legacy
frontend auth flow are removed. `scripts/deploy.sh` is retired.

Before final cutover, stop legacy writes and scheduled jobs, take a final export,
reconcile all source records and identities into Postgres, and run an encrypted
backup. Verify authenticated isolation, catalog loading, study writes, retries,
reload persistence and Android configuration before declaring completion.

Encrypted daily database backups run in GitHub Actions. See
[backup recovery](backends/python/docs/backup-recovery.md) and
[data preservation](backends/python/docs/DATA_SAFETY.md).

Email delivery was deferred by the owner. Invitations can be shared manually.
Telegram and push delivery controls are unavailable in the Python frontend until
those delivery workers are implemented and configured. Generic R2 attachments are
optional and need a production bucket; existing study images are inline Postgres
records. These unavailable integrations must not fall back to the archived backend.
