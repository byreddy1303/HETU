# Backend separation

- [`python/`](python/): new FastAPI backend, independently deployed to Vercel.
- [`typescript/`](typescript/): original Supabase/Deno TypeScript backend and SQL.

Both directories are tracked in the same GitHub repository, on `main`. The React
application remains at the repository root. Its current production API is still
the legacy backend. The folder move does not copy, migrate, or delete remote data.

The Python service is intentionally deployed in maintenance mode until service
credentials, complete contract parity, migration verification and backup recovery
gates pass. See [`python/docs/DATA_SAFETY.md`](python/docs/DATA_SAFETY.md).

## Live-site Python routing

The web project's Vercel configuration forwards `/api/:path*` to the Python
production service at `https://hetu-python-api.vercel.app/:path*`. For example,
`https://hetu-app.vercel.app/api/health/live` reaches Python's process health
check. API responses bypass the SPA/service-worker navigation fallback and
are not cached.

This connects the service to the site's domain; it does **not** migrate accounts
or change the frontend's Supabase client. The Python readiness endpoint
(`/api/health/ready`) and `/api/v1/me` still return 503 while production data
access is disabled. Process liveness alone is not a completed backend cutover.

As verified on 2026-09-21, the Python Vercel project has service credentials only
in Preview, with no production environment variables. The live frontend still
uses Supabase authentication, records, RPCs, storage and realtime. Completing
the replacement requires production resources, production Clerk domain/DNS,
the frontend/domain adapter, verified account/data/attachment migration, and the
recovery checks in the data-safety document. The experimental drafts are not
enabled by this routing change.
