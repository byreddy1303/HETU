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

## Standing request: each HETU chat visit

The user explicitly requested on 2026-11-15 that future HETU visits review the local
mistake log and prepare a few corrective problems for each kind of mistake.

- At the beginning of a substantive HETU visit, run `python3 scripts/practice-visit.py
  --include-context` against the installed app. It checks local storage, reads the
  mistake groups, and idempotently prepares three original problems for supported
  groups. Existing packs and their due dates are retained; do not flood the queue.
- Inspect the returned groups and any uncovered sources. For uncovered groups,
  read the linked local attempt/question/reflection through the local API and
  author two or three original, answer-checked exercises through
  `POST /v1/practice-coach/authored-packs`. See `docs/efficient-practice.md`.
  Include a recognition case, an application, and a boundary where useful.
- Verify the saved pack through the same local API. Keep keys hidden until the
  learner submits. Distinguish topic association, the user's assessment, and an
  assistant hypothesis; do not invent a cause or certify mastery.
- Never change historical attempts, answer a drill on the user's behalf, expose
  sealed exams, upload study records, or replace a pending pack simply to create
  something new. During an active/paused exam, respect the coaching hold.
- This is a standing instruction for active HETU conversations, not a background
  chat-open trigger or a guarantee that unrelated projects load this file.
