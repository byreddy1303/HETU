# HETU ChatGPT plugin implementation checklist

This file tracks actual delivery. A checked item means code and a meaningful test exist;
it does not mean production data has been migrated or a ChatGPT account connected.

## Release sequence

- [x] Inspect repository agreements, specification, working tree, Python service, and frontend boundary.
- [x] Run a clean Python baseline and document existing frontend test failures.
- [x] Establish authenticated Python MCP transport and capability discovery in isolated tests.
- [x] Complete capture → durable storage → Library view → detailed retrieval → revision with retry safety in code and isolated tests.
- [ ] Link knowledge to Journal, patterns, formulas, triggers, revision and actual retrieval practice.
- [ ] Expose tested planning, diagnosis, sessions, PYQ, mock, weekly, syllabus, heatmap, calibration, and readiness workflows.
- [ ] Expose tested Buddy, settings, notifications, exports/imports, recovery, and owner operations.
- [ ] Verify full migration, backup restore, account isolation, and production credentials before live writes.
- [ ] Install and test authenticated connection in ChatGPT Work; publish only after release gates pass.
- [ ] Commit task files on `main` and push `origin main`.

## Current architecture and data safety

- Production frontend still uses the legacy backend. The Clerk/FastAPI adapter is committed on `main` but has not passed the live data migration and cutover gates.
- Python has a `records` store with owner scoping, optimistic versions, tombstones, and revision snapshots. Its import is an intentionally partial dry run. Maintenance mode disables hosted data access by default.
- New learning data should use the existing Python record transaction and revision trail. No production cutover may turn off maintenance until the gates in `backends/python/docs/DATA_SAFETY.md` pass.
- Frontend baseline on 2026-09-27: 695 tests passed, 9 failed across 4 files, before plugin edits. Failures concern trusted device, planner cloud, and topic progress behavior in the pre-existing working tree.
- Current frontend suite on 2026-09-28: 705 existing tests passed. A new Library interaction test also passed, exercising an uncertain save retry, reuse of the same idempotency key, and display of the persisted concept and source (706 total when run together).

## Implemented and verified in isolated environments

- Python MCP transport advertises OAuth protected-resource metadata and per-tool scopes. The verifier requires an approved client, Clerk OAuth token, user subject, read/write scope, and the exact resource audience. The account resolves to the existing HETU owner; model-supplied owner IDs are not accepted.
- “Save to HETU” captures immutable sources, distinct structured insights, concept pages, retry receipts, and revision history in one transaction. Search and detail return complete explanations and source links. A test saves through authenticated MCP, reads the same concept through the app API, and searches from a later MCP call.
- Durable task briefs retain original goals, constraints, corrections, completed/pending steps and receipts. Concept recall/transfer records require actual responses and label assistance and evaluator provenance. The React Library, Workflows, Concept review, and Do now due review panel compile.
- Mapped section records are owner scoped, filterable, paginated, and inspectable with revision history. Their overview explicitly marks section coverage as partial. This does not implement computed view scores or all actions.
- Disposable PostgreSQL migration, preservation tests, Alembic schema check, backup and isolated restore content comparison passed on 2026-09-27. After the separately landed identity and PYQ catalog migrations, the disposable database passed Alembic check, 47 PostgreSQL tests, and a fresh isolated restore content comparison on 2026-09-28.
- A local Codex plugin package validates. Its MCP URL points to localhost for development. No live Clerk OAuth token or ChatGPT Work connection has been exercised.
- The mounted FastAPI endpoint returned protected-resource metadata and challenged an unauthenticated `/mcp` request over local HTTP on 2026-09-28. This is transport verification, not a live Clerk login.

## Release blockers

- Complete the data inventory and real-account migration, identity reconciliation, object backup, independent production backup/restore, restricted credentials, and frontend parity checks in `backends/python/docs/DATA_SAFETY.md`.
- Configure and verify Clerk OAuth resource audience, scopes, ChatGPT client ID/callback, stable HTTPS Python endpoint, production role credentials and deployment. Until then production maintenance mode stays on.
- Build and test domain actions for all remaining sections. Current section tools expose only mapped records and cannot honestly claim whole-app operation.

## Section inventory

`Existing` means the current application or Python compatibility layer has at least a relevant operation. It is not a claim of complete MCP coverage.

| Section | Existing seam | Required plugin/domain work | Verified |
| --- | --- | --- | --- |
| Dashboard | React aggregates over records | Evidence drilldown and recommendations | No |
| Do now | React queue and recovery logic | Selection and outcome actions | No |
| Planner | Python planner mutation and React planner | Capacity, split, move, reconcile | No |
| Sessions and quick capture | Python records and React session pages | Safe start, answer, completion actions | No |
| PYQ | React bank, scoring, attempts | Python canonical scoring and exam provenance | No |
| Mocks | React mocks and records | Question-level analysis and follow-through | No |
| Journal | `questions` records and React Journal | Linked analysis edits | No |
| Patterns | `patterns` records and React Patterns | Evidence-backed pattern actions | No |
| Recovery | `learning_items`, events, reattempts | Python response, help, scheduling rules | No |
| Weekly review | `weekly_reviews` records | Evidence comparison and saved actions | No |
| Heatmap | React derived view | Evidence drilldown and underlying actions | No |
| Calibration | React derived view | Answer/skip and pace analysis | No |
| Readiness | React derived view, snapshots | Qualified evidence, recompute | No |
| References | bundled notes and account documents | Source retrieval and annotations | No |
| Revision pack | React generator | Python assembly and export | No |
| Syllabus | `topic_progress` records | Coverage state with evidence | No |
| Trigger drill | `trigger_phrases` records | Run and record mixed drills | No |
| Formulas | `formulas` records | Structured read/write/history | No |
| Learning Library and topic pages | Not present | Capture, organize, revise, retrieve, UI, MCP | No |
| Buddy | Python domain tables and React Buddy | Authorized reads, explicit sharing | No |
| Settings and reminders | account and notification records | Validated preferences and connection state | No |
| Export/import/recovery | React backup and Python history | Complete audited migration, restore | No |
| Owner administration | Python access routes | MCP owner operations and audit | No |

## Preparation gap inventory

| Learner problem | Planned observable benefit | App and MCP workflow | Verification |
| --- | --- | --- | --- |
| Insights from discussion disappear | Recall a sourced explanation later | Library capture, topic page, search/detail, edit | Save, app display, later retrieval, revision test |
| Missing prerequisite is hidden | Name and address specific missing step | Concept links and diagnostic questions | Diagnosis tied to learner response |
| Reading is mistaken for recall | Delayed unaided retrieval is visible | Concept review items and response history | Hint/solution does not count as independent recall |
| Repeated examples mask poor transfer | Distinct unseen result is tracked | Transfer question and linked attempt | Provenance distinguishes unseen from coached |
| Exam decisions lose marks | Pace and answer/skip habit is explicit | Calibration and mock analysis | Compare actual attempts |
| Mock analysis has no follow-through | Each priority issue has a later check | Mock → issue → practice → reassessment | Linked work and outcome |
| Plans overfill available time | Work fits real capacity and due reviews | Planner and Do now actions | Capacity and conflict tests |
