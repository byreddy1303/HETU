# Personal GATE preparation pilot

Implemented 13 November 2026 for the local desktop workspace. This release delivers daily usability and the first three reviewed skill workflows from the personal GATE vision. Broader skill coverage and learning-effectiveness claims remain future work.

## What changed

- Today leads with one saved action, a durable daily 10/20/30/45/60-minute choice, contextual session labels, and an explicit way to set practice aside for today. It preserves answers and never parks an unfinished exam. Retrieval-item counts and activity counts have distinct explanations.
- Five primary destinations—Today, Practice, Review, Knowledge, Progress—organize the existing tools. The detailed dashboard remains available under Progress and loads separately from Today. Practice prioritizes unfinished sessions ahead of the private test-series catalog.
- Three skill areas cover cache address fields, page-replacement decisions, and sliding-window limits. Thirty question mappings are pinned to source hashes. Six original teaching exercises ask learners to commit a contrast pair before seeing explanations. Mapping provenance is assistant review, not certification of an official answer key.
- Diagnostic drafts autosave serially against acknowledged revisions, resume after navigation, and retain unsaved responses on failure. Submission and confirmation are replay-safe. Learners record their own assessment, including uncertainty or no observed difficulty; the app does not infer a psychological cause.
- Prepared practice uses the existing repair and receipt lifecycle. A backend transaction binds one session to one skill activity, protects its question set, and rejects premature follow-ups, duplicate starts, and coaching during unfinished exams. Fresh selection excludes prior recorded attempts, exact content duplicates, changed mappings, and all benchmark-paper content.
- Results distinguish current performance, fresh application, delayed application, and missing evidence. Application counts require no prior recorded attempts and an explicit learner report of answering without help. Accuracy uses immutable attempt snapshots. Pace, confidence calibration, mastery, and rank remain unestablished by this small pilot.
- Successful checks retain the existing 3/7/14/30-day schedule; failures schedule remaining questions for retry. No second scheduler was introduced. Model availability is not required for this deterministic workflow.
- SQLite schema version 1 adds indexes only after a verified local snapshot. A newer schema is rejected without modification. Local workflow writers serialize before reading mutable state. Recent receipts cannot displace older unfinished repairs from the engine queue. Automatic desktop backups now explicitly stay local.

## Verification

- Frontend: 887 tests across 153 files passed, plus TypeScript and ESLint checks.
- Backend: 242 passed, 10 PostgreSQL-only tests skipped; changed Python files passed Ruff.
- Desktop: 17 runtime tests passed; the macOS app packaged successfully with its bundled Python runtime. Packaged Today and Skills screens were inspected in a disposable desktop profile.
- New browser-to-local-API suite: diagnostic draft save/reload, blind submission, confirmation, practice launch/reload, three committed skips, completion, assistance report, automatic retry, and narrow navigation. It creates and removes an isolated SQLite test workspace; personal study data is never used.
- Schema tests verify snapshot integrity, repeat startup, preserved rows, and refusal to open a newer schema. Concurrency tests verify simultaneous diagnostic starts resolve to one draft.
- The older `test:e2e` harness still targets the retired sandbox login and fails its missing hosted configuration prerequisite in a clean checkout. It does not validate the local desktop release. The new local suite is run with `npm run test:local-skills`; `HETU_TEST_PYTHON` can select a prepared backend interpreter.

## Installed verification

The updated `/Applications/HETU.app` was reopened against the original local workspace on port 8765. Health reports local storage, schema version is 1, and SQLite integrity is `ok`. All 79 pre-existing attempt, question, practice-session, and study-memory records matched their pre-update content hashes. Today correctly displayed the original paused practice and due retrieval queue. A verified pre-update database snapshot and the previous application bundle were retained locally for rollback.

## Boundaries and next acceptance gate

There are only three mapped skills. Recorded exposure cannot establish that a learner has never seen a question outside HETU. The short contrasts are teaching exercises; repeating them is not a fresh diagnostic. Assistance is self-reported. Bounded histories explicitly report truncation, and missing conditions do not count as independent application. No personal learning gain has yet been measured.

Use the pilot during ordinary preparation, then compare delayed application, recurring errors, and administration time over roughly two weeks. Expand the mapping only after reviewing question relevance and observing a useful learning flow. Skill-driven planning, deeper mock debrief integration, wider capture/search/labs, and empirical learning-effectiveness evaluation remain subsequent stages.
