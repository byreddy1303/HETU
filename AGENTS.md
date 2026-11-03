# Repository working agreements

Every AI agent must read this file before making or pushing any change to this repository.

## Primary restriction: local HETU only

- Work only with the local HETU desktop app and its local database. This applies to all HETU reads, imports, saves, edits, and verification.
- Do not use the hosted HETU website, cloud account, or remote HETU connector, and do not upload or sync study data to them, unless the user explicitly requests an exception for that task.
- Prefer the desktop app's local API or local MCP server. Verify that the connection uses the desktop workspace before reading or writing; a tool named HETU is not sufficient evidence that it is local.
- The standard macOS database is `~/Library/Application Support/hetu/hetu.db`, and the standard local API is `http://127.0.0.1:8765`. Respect an explicitly configured desktop data directory or port; do not create a separate workspace accidentally.
- Verify saves in the same local workspace the desktop app uses. If the local app or service is unavailable, resolve the local issue or report the blocker; never fall back to hosted storage.
- This restriction concerns the HETU application and study data. The repository commit and GitHub push requirements below still apply; never commit the local database or private study data.

## Repository changes

- After completing any user-requested change to this repository, commit all task-related changes and push them to `main` on `origin` before the final response.
- All changes must land on `main`. Do not create, commit to, or push any other branch unless the user explicitly asks.
- Before pushing, run `git status` and confirm `main` is current with `origin/main`; push using `git push origin main`.
- Never include unrelated pre-existing or user-authored changes in that commit. If committing or pushing fails, preserve the work and clearly report the exact blocker.
