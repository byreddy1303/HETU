# Local foundation release

Scope: the local Electron app, loopback FastAPI service, SQLite workspace and local MCP. Hosted application behavior is gated separately. This release does not migrate the learner's records, introduce a second diagnosis engine, or claim that the larger skill-map and coaching roadmap is complete.

Both Vercel project configurations disable Git-triggered deployment of `main` for this local-only release, as explicitly approved by the owner. Pushing the source must not update either hosted application. A later hosted release needs a deliberate change to that guard; do not remove it as routine cleanup.

## Shared daily decision

Dashboard and Do now mount the same local `TodayActions` component and pure decision adapter. They share a user/date-scoped time choice while the app stays open. The adapter reuses Planner evidence candidates, gives unfinished work and Planner commitments explicit priority, and chooses an action that fits 10, 20 or 30 minutes. Longer actions remain inspectable without changing the approved plan.

Canonical recovery comes from the existing backend's budgeted selector. The advertised selected IDs are passed to the existing domain start command; its saved session identity is used for navigation. Canonical concept reviews do not appear again as separate compatibility obligations. Repairs already scheduled in Planner appear once. An unfinished exam takes precedence and holds new coaching.

Blind queue text uses neutral practice labels rather than saved answer keys, learner explanations or model diagnoses. Automatic repairs recheck current question eligibility through their existing prepare endpoint. Other repairs open their existing activity page. The existing attempt, recovery and repair services continue owning results and next dates.

Loading, failed sources, incomplete scans, exam holds, and failed cache refreshes cannot become a claim that the queue is clear. The component refreshes after learning events, database-cache changes, external-workspace notifications, focus changes and explicit retry. A failed launch stays visible with its error.

## External writes and the open app

The local API broker keeps one SQLite connection and polls `PRAGMA data_version`. Each read transaction ends immediately, and comparisons stay on the same connection. A committed write from another connection, including stdio MCP, sends the existing sync-mutation frame to connected app clients. Reconnection triggers reconciliation; shutdown releases the watcher connection.

Table-backed views use the existing hydrate path. A workspace-change event additionally invalidates the daily queue's domain reads, including study-memory entries that are outside the table cache. No hosted Redis dependency is introduced. This watcher is enabled only for local SQLite.

## Verified backups and health

The startup/hourly launcher and explicit Settings action share one backup service and durable status receipt. The service uses SQLite's online backup API, converts the destination to a standalone rollback-journal file, verifies integrity, writes snapshots atomically, and rotates only after success. An OS lock prevents overlapping jobs. Database damage, interrupted jobs, missing snapshots and copy failures are visible while preserving the last successful snapshot.

Settings shows the last attempt, last successful snapshot, destination and stale/error state. A copy written into the local iCloud Drive folder is described as a local copy; remote upload and off-device restoration are not certified. The UI does not restore over the live workspace. Restore verification uses a disposable database copy in tests.

## Daily desktop brief and local Settings

The owner's requested schedule is 09:00 in Asia/Kolkata, with automatic app launch when fully quit. A macOS LaunchAgent runs a small local clock helper once per minute; the helper starts HETU only when today's brief is due and has not already been launched. The India-time calculation is independent of the Mac's system timezone. A sleeping or logged-out Mac catches up after waking or logging in; the feature does not wake a powered-off machine.

The native popup reads the current local Planner, due canonical/legacy reattempts and concept recall queue. It excludes answers and distinguishes partial counts. Active exams hold the popup, and the running app retries after the hold ends. Preview does not consume the daily delivery. Buttons open Do now, Planner or concept revision through the existing app router. Delivery errors remain retryable and visible in Settings. Preferences can disable the popup or remove automatic launch.

The packaged app must stay at its registered location. Native acceptance uses an isolated workspace and disables automatic launch registration, so tests cannot install a job pointing at fixture data. The installed user job uses the stable delivered app bundle and the personal data directory. A failed app start becomes retryable after five minutes; a running app and successful daily delivery suppress repeated launches.

Local Settings is a dedicated page: daily brief, local workspace/MCP, backups, local model connection, study defaults, appearance, profile and export. Hosted administration, unavailable cloud notification delivery, Android haptics and the unfinished cognitive-provider settings are not mounted there. Hosted Settings retains its existing implementation.

Learning Memory separates study history, practice follow-ups and saved records into focused views. Prepared activities show neutral activity types, subject/topic, time, question count and schedule, with one primary action per row. Sources and history expand on request. Model connection controls live in Settings. Workflow rows and the concept recall queue use the same compact hierarchy; assistant briefs and completed history start collapsed. Dashboard and Do now lead with one shared recommendation, while additional queued work stays grouped behind a disclosure. Populated browser checks cover five views at 390 px and 1024 px with no horizontal overflow or browser exceptions.

## Release checks

The release-assurance workflow checks project type references, lint, frontend tests, bank integrity, Electron runtime tests, interface builds and the isolated SQLite backend suite. Existing PostgreSQL recovery checks remain in the separate safety workflow. All test fixtures are disposable; they do not use the learner's database.

Before delivering a desktop build, verify the compiled local interface with an isolated API/database: open Dashboard/Do now, commit external fixture evidence while the page remains open, launch the advertised blind sprint, pause/resume it, confirm both entry points agree, create and inspect a backup, and check a narrow viewport. Packaging must include the runtime files already referenced by the desktop entry point.

The completed acceptance run passed 151 frontend suites (863 tests), the isolated backend suite (229 passed, 10 PostgreSQL-only checks skipped), 15 Electron tests, type checking, lint and question-bank integrity. The Apple silicon bundle booted its own Python/API/SQLite stack; its local Settings, native brief preview and verified-backup action passed. A real stdio MCP write refreshed an already-open Formulas page without focus or reload.

## Next stages

- Consolidate the unfinished cognitive vault into the existing reflection/repair lifecycle and evaluate diagnoses on reviewed cases.
- Add versioned SQLite schema migrations and pre-upgrade snapshots before changing the persistent schema.
- Pilot a reviewed question-to-skill/prerequisite map, then use completed delayed and fresh checks to evaluate selection quality.
- Add a capture preparation inbox and improve local learning-outcome summaries.

Those stages are intentionally not represented as shipped by this foundation release.
