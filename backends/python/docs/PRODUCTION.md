# Production cutover verification

Verified on 2026-10-10 (Asia/Kolkata). This document supersedes the historical
September staging observations. The application release builds on `328162d`,
following `372da6c`, `4407c4b`, and `caab390` for Supabase removal and bounded
username login, with an additional identity-read concurrency correction.

## Runtime

- Website: https://hetu-app.vercel.app, React/Vite on Vercel project `hetu`.
- Backend: https://hetu-python-api.vercel.app, Python/FastAPI on Vercel project
  `hetu-python-api`, root `backends/python`.
- One online Neon PostgreSQL database stores application records, preferences,
  drafts, PYQ catalog/attempts, histories and existing inline study images.
- Clerk supplies production login sessions. A Python proxy serves it through
  `/__clerk` on the website; Android uses the absolute website proxy URL.
  Private username-to-email lookup preserves existing username login without
  exposing email or bypassing provider password/verification checks.
- Python verifies session signatures with `CLERK_JWT_KEY`, matched to the live
  production signing key. Keep this public key configured and refresh it when
  Clerk rotates signing keys. It avoids remote JWKS lookup latency on API calls.
  `CLERK_SECRET_KEY` remains server-only in the Python project for provider API
  operations. The website's unnecessary secret and Supabase variables are removed.
- Established account mappings are resolved with one read query. Parallel data
  loads do not acquire the account-mapping write lock or update its activity
  timestamp on every request. Legacy mapping creation still locks and rechecks.
- Missing API/login configuration blocks startup. Failed requests time out and
  offer recovery. There is no offline-only study-data save fallback. Browser
  memory holds temporary server views; authentication cookies and cached app
  assets are still used. Android must receive the new APK to change its runtime.

## Migration and data gates

The old Supabase database is retained as a read-only recovery archive, with no
runtime dependency from either replacement client. Its 43 public tables and
`auth.users` reject writes; all five old cron jobs are inactive. The write guard
was verified with a no-row UPDATE. `ops/retire_legacy_supabase.sql` records the
operation and its recovery inverse preserves the prior cron states.

After freezing writes, the final public export imported and compared **1,680
source rows with zero mismatches**. All four original account profiles and
Clerk mappings were checked. Permanent HETU UUIDs and bcrypt password digests
were preserved; the final digest comparison required zero additional updates.
Supabase storage contained no buckets or objects requiring migration.

Authenticated production checks using two disposable accounts exercised online
writes and reload reads, account isolation, stale-version rejection, append-only
history, tombstones, explicit restoration, canonical PYQ scoring and idempotency.
The frontend regression suite passed 127 files / 716 tests; backend checks passed
74 tests on disposable PostgreSQL, with no Alembic schema drift. Signup validation
was subsequently aligned to Clerk's 15-character minimum and its focused checks
passed. The Android debug build succeeds and its bundle contains the Python API
and production login proxy, with no legacy Supabase endpoint.

The active question catalog has **4,334 questions**. GATE source sets have no
missing marks. Four suspect source questions are quarantined; linked duplicates
are excluded from selection. Supplemental non-GATE sources include 261 questions
without reliable marks and remain explicitly unscored. These values are not
invented. Structural checks and canonical scoring do not constitute a manual
subject-expert review of every published answer key.

## Recovery evidence

Final backup: `cutover-backup-20261010T032009Z.aesgcm`, private Vercel Blob path
`backups/2026-10-10/`. Encrypted upload/download byte comparison passed. The backup
was decrypted with the offline recipient key, restored into a newly created,
isolated PostgreSQL 18 database, and every public table's row count and content
hash matched the snapshot manifest. Production was not modified by the drill.

Daily encrypted GitHub Actions backups are scheduled at 02:17 UTC. Application
and backup credentials are restricted separately; the decryption private key is
not in CI or the storage account. See [data safety](DATA_SAFETY.md) and
[backup recovery](backup-recovery.md) for recovery limits and procedures.

## Deliberate remaining limits

- Email delivery was deferred by the owner. Invitations can be shared manually;
  email verification/recovery cannot be promised without configured delivery.
- Python Telegram/push delivery workers are not implemented/configured. Their
  frontend controls are disabled; they do not contact the retired backend.
- Generic R2 uploads need a production bucket. Existing inline study images
  remain online in Postgres.
- The rebuilt Android APK's configuration and compilation are verified; physical
  device sign-in has not been tested and older installed APKs require replacement.
- The frontend is React/TypeScript, the application backend is Python, and managed
  authentication is Clerk. This migration does not replace those with Python or
  eliminate the device storage needed for login sessions and app assets.
