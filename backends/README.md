# Backend separation

- [`python/`](python/): new FastAPI backend, independently deployed to Vercel.
- [`typescript/`](typescript/): original Supabase/Deno TypeScript backend and SQL.

Both directories are tracked in the same GitHub repository, on `main`. The React
application remains at the repository root. Its current production API is still
the legacy backend. The folder move does not copy, migrate, or delete remote data.

The Python service is intentionally deployed in maintenance mode until service
credentials, complete contract parity, migration verification and backup recovery
gates pass. See [`python/docs/DATA_SAFETY.md`](python/docs/DATA_SAFETY.md).
