# HETU ChatGPT plugin implementation checklist

This file tracks actual delivery. A checked item means code and a meaningful test exist;
it does not mean production data has been migrated or a ChatGPT account connected.

## Release sequence

- [x] Inspect repository agreements, specification, working tree, Python service, and frontend boundary.
- [x] Run a clean Python baseline and document existing frontend test failures.
- [x] Establish authenticated Python MCP transport and capability discovery in isolated tests.
- [x] Create invite-only Clerk accounts through Python and fail closed when an external identity has no HETU owner mapping.
- [x] Complete capture → durable storage → Library view → detailed retrieval → revision with retry safety in code and isolated tests.
- [x] Give saved ChatGPT discussions a clear dashboard destination and keep a concept page current when a linked insight improves.
- [x] Link saved concepts through a validated app and MCP operation, including cycle-safe prerequisite relationships.
- [x] Connect saved concepts to existing Journal, pattern, formula, trigger, attempt, mock and review evidence through the app and MCP.
- [x] Assemble and save sourced discussion revision packs through shared Python APIs, app, and MCP.
- [ ] Complete canonical recovery follow-through and extended pack depth/time-budget options.
- [ ] Expose tested planning, diagnosis, sessions, PYQ, mock, weekly, syllabus, heatmap, calibration, and readiness workflows.
- [x] Expose canonical PYQ search, detail, answer submission, score validation, and app receipt review as a first PYQ slice.
- [ ] Expose tested Buddy, settings, notifications, exports/imports, recovery, and owner operations.
- [ ] Verify full migration, backup restore, account isolation, and production credentials before live writes.
- [ ] Install and test authenticated connection in ChatGPT Work; publish only after release gates pass.
- [ ] Commit task files on `main` and push `origin main`.

## Current architecture and data safety

- The separately landed frontend cutover (`372da6c`) removes the Supabase runtime and consumes Python. The subsequent production Clerk proxy (`4407c4b`) supports the existing Vercel-managed authentication application. Deployment reachability is distinct from the recovery and full parity evidence still required below.
- Python has a `records` store with owner scoping, optimistic versions, tombstones, and revision snapshots. The real COPY-dump importer (`source_import.py`) and import ledger supersede the older partial dry-run script. Hosted maintenance mode defaults closed; a live audit observed production explicitly enabled. This plugin task has not changed that setting.
- New learning data should use the existing Python record transaction and revision trail. No production cutover may turn off maintenance until the gates in `backends/python/docs/DATA_SAFETY.md` pass.
- Frontend baseline on 2026-09-27: 695 tests passed, 9 failed across 4 files, before plugin edits. Failures concern trusted device, planner cloud, and topic progress behavior in the pre-existing working tree.
- Current frontend suite on 2026-09-28: 705 existing tests passed. A new Library interaction test also passed, exercising an uncertain save retry, reuse of the same idempotency key, and display of the persisted concept and source (706 total when run together).
- On 2026-10-01, the full Python test suite passed with the disposable PostgreSQL safety checks enabled (61 tests); Ruff checks and format verification, Alembic schema check, TypeScript typecheck, ESLint, production build, and the full frontend suite (127 files, 711 tests) passed.

## Implemented and verified in isolated environments

- Python MCP transport advertises OAuth protected-resource metadata and per-tool scopes. The verifier requires an approved client, Clerk OAuth token, user subject, read/write scope, and the exact resource audience. The account resolves to the existing HETU owner; model-supplied owner IDs are not accepted.
- “Save to HETU” captures immutable sources, distinct structured insights, concept pages, retry receipts, and revision history in one transaction. Search and detail return complete explanations and source links. A test saves through authenticated MCP, reads the same concept through the app API, and searches from a later MCP call.
- Concept links now connect existing owner-scoped Library entries as related ideas, contrasts, extensions, or directed prerequisites. The Library can create, revise, deactivate, and navigate links. Prerequisite cycles are rejected; edits use optimistic versions and leave revision history. Tests cover the authenticated MCP operation, app interaction, account isolation, retry, stale writes, and cycle rejection. Links into study records are provided by the evidence workflow below.
- Saved concepts can now link to existing Journal entries, patterns, formulas, triggers, PYQ attempts, mocks, re-attempts, recovery items, and concept reviews. The app searches records, previews full evidence, saves a rationale, reads linked content, and deactivates versioned links. The same Python domain operations power `search_study_evidence`, `get_study_evidence`, and `link_study_evidence` in MCP. Durable receipts preserve retry results even after subsequent edits. HTTP/MCP ownership and scope tests, app retry/read/remove tests, and PostgreSQL concurrent creation and stale-write tests passed. This does not create attempts or infer mastery.
- Revision Pack now uses the Python domain for both the app and MCP: due formulas, triggers, recurring Journal mistakes, priority questions, saved concepts with reasoning/cues/sources/evidence, due recall/transfer prompts, and the latest applicable weekly focus. It uses the account timezone, exposes bounded retrieval and selection limits, and keeps answers/evaluation guidance out of recall prompts. Saved packs are immutable API snapshots with source versions, a content hash, optimistic preview verification, owner-scoped retrieval, and durable retry results. Copy and browser Print/PDF use the shared generated text. HTTP/MCP/app tests verify the same snapshot; PostgreSQL tests prove concurrent saves create one snapshot and later retries preserve it after source edits. Detailed/time-budget pack options remain outstanding.
- The dashboard now has a Saved discussions launch tile and card, with the same destination in desktop and mobile navigation and workspace search. Connected Python accounts see recent concepts and links into the Library. Legacy accounts see an explicit connection status instead of invented Library content. Tests verify the card and that later discussions refresh the current page while preserving both source captures and the earlier insight revision.
- Invite-only signup validates an active single-use invitation and its bound email, creates the internal HETU owner and Clerk user, and stores their identity mapping. A failed external signup rolls back the HETU transaction and attempts to remove a partially created Clerk account. Unknown Clerk subjects cannot create owners at first sign-in. Tests mock Clerk calls; no real Clerk account has been created or connected in production.
- Durable task briefs retain original goals, constraints, corrections, completed/pending steps and receipts. Concept recall/transfer records require actual responses and label assistance and evaluator provenance. The React Library, Workflows, Concept review, and Do now due review panel compile.
- Mapped section records are owner scoped, filterable, paginated, and inspectable with revision history. Their overview explicitly marks section coverage as partial. This does not implement computed view scores or all actions.
- Disposable PostgreSQL migration, preservation tests, Alembic schema check, backup and isolated restore content comparison passed on 2026-09-27. After the separately landed identity and PYQ catalog migrations, the disposable database passed Alembic check, 47 PostgreSQL tests, and a fresh isolated restore content comparison on 2026-09-28.
- A local Codex plugin package validates. Its MCP URL points to localhost for development. No live Clerk OAuth token or ChatGPT Work connection has been exercised.
- The Python PYQ catalog supports filtered search, detail, and versioned answer submission through authenticated HTTP and MCP. The app's compatibility writes for new v3 attempts validate the canonical bank snapshot, key, score, and timing; generic record writes cannot bypass that check. An app panel displays ChatGPT attempts with the question, actual answer, source, and timing provenance. PostgreSQL tests cover exact MCQ/MSQ/NAT scoring, quarantined and incomplete keys, replay, owner isolation, and tampered app receipts. The mounted MCP test exercises authenticated search, write, and replay with a synthetic bank. This covers individual PYQ answers, not set assembly, exam sessions, or linked recovery.
- The mounted FastAPI endpoint returned protected-resource metadata and challenged an unauthenticated `/mcp` request over local HTTP on 2026-09-28. This is transport verification, not a live Clerk login.

## Release blockers

- Complete the data inventory and real-account migration, identity reconciliation, object backup, independent production backup/restore, restricted credentials, and frontend parity checks in `backends/python/docs/DATA_SAFETY.md`.
- Configure and verify Clerk OAuth resource audience, scopes, exact ChatGPT client ID/callback, HTTPS MCP endpoint, and production role credentials. MCP-specific production environment variables are absent and its metadata endpoint returned 404 at the audit. Keep this boundary disabled until its release gates pass; the separately enabled app is not proof of those gates.
- Build and test domain actions for all remaining sections. Current section tools expose only mapped records and cannot honestly claim whole-app operation.

## Section inventory

`Existing` means the current application or Python compatibility layer has at least a relevant operation. It is not a claim of complete MCP coverage.

| Section | Existing seam | Required plugin/domain work | Verified |
| --- | --- | --- | --- |
| Dashboard | React aggregates over records | Evidence drilldown and recommendations | No |
| Do now | React queue and recovery logic | Selection and outcome actions | No |
| Planner | Python planner mutation and React planner | Capacity, split, move, reconcile | No |
| Sessions and quick capture | Python records and React session pages | Safe start, answer, completion actions | No |
| PYQ | React bank, scoring, attempts | Python catalog search/detail and canonical individual attempts are implemented; set assembly, exam provenance, recovery linkage remain | Partial |
| Mocks | React mocks and records | Question-level analysis and follow-through | No |
| Journal | `questions` records and React Journal | Linked analysis edits | No |
| Patterns | `patterns` records and React Patterns | Evidence-backed pattern actions | No |
| Recovery | `learning_items`, events, reattempts | Python response, help, scheduling rules | No |
| Weekly review | `weekly_reviews` records | Evidence comparison and saved actions | No |
| Heatmap | React derived view | Evidence drilldown and underlying actions | No |
| Calibration | React derived view | Answer/skip and pace analysis | No |
| Readiness | React derived view, snapshots | Qualified evidence, recompute | No |
| References | bundled notes and account documents | Source retrieval and annotations | No |
| Revision pack | Shared Python assembly, immutable snapshots, app copy/Print/PDF, MCP build/save/list/detail | Extended depth/time-budget options and live connected verification | Partial |
| Syllabus | `topic_progress` records | Coverage state with evidence | No |
| Trigger drill | `trigger_phrases` records | Run and record mixed drills | No |
| Formulas | `formulas` records | Structured read/write/history | No |
| Learning Library and topic pages | Python capture/revision, acyclic concept links, React Library, dashboard entry | Merge/split, archive/restore, linked revision packs, and live connected verification remain | Partial |
| Buddy | Python domain tables and React Buddy | Authorized reads, explicit sharing | No |
| Settings and reminders | account and notification records | Validated preferences and connection state | No |
| Export/import/recovery | React backup and Python history | Complete audited migration, restore | No |
| Owner administration | Python access routes | MCP owner operations and audit | No |

## Preparation gap inventory

| Learner problem | Planned observable benefit | App and MCP workflow | Verification |
| --- | --- | --- | --- |
| Insights from discussion disappear | Recall a sourced explanation later | Library capture, topic page, search/detail, edit | Save, app display, later retrieval, revision test |
| Related ideas stay disconnected | See prerequisites and useful concept relationships across saved discussions | Link Library concepts with owner checks, revision history, and cycle-safe prerequisites | Cross-account, retry, stale-write, app/MCP, and cycle tests |
| Missing prerequisite is hidden | Name and address specific missing step | Concept links and diagnostic questions | Diagnosis tied to learner response |
| Reading is mistaken for recall | Delayed unaided retrieval is visible | Concept review items and response history | Hint/solution does not count as independent recall |
| Repeated examples mask poor transfer | Distinct unseen result is tracked | Transfer question and linked attempt | Provenance distinguishes unseen from coached |
| Exam decisions lose marks | Pace and answer/skip habit is explicit | Calibration and mock analysis | Compare actual attempts |
| Mock analysis has no follow-through | Each priority issue has a later check | Mock → issue → practice → reassessment | Linked work and outcome |
| Plans overfill available time | Work fits real capacity and due reviews | Planner and Do now actions | Capacity and conflict tests |

## Current continuation — 2026-10-09

- Revision Pack and OAuth verification hardening: all 72 Python tests passed with disposable PostgreSQL, including owner/scope checks, stale previews, delayed retries and concurrent snapshot writes. Ruff lint passed. All nine edited Python files passed format checks; the global format check reports two separately authored Clerk proxy files. The full current frontend suite passed (126 files, 713 tests), along with ESLint and the TypeScript production build. The count reflects the separately landed runtime cutover's removal of obsolete tests.
- The Clerk opaque-token verifier now checks explicit revocation/expiry flags and Clerk's finite, future `expiration` field. Unmapped Clerk subjects fail closed; subject IDs cannot silently become internal owner IDs. Invalid/missing flags, expired/nonfinite values, and cross-account access are tested.
- The current account can access the existing production application through Vercel's `hetu-production-auth` integration. Its application is `app_3JuZZ3c9KOVxl97UCvk0NlEMJJB`, production instance `ins_3JuZZ4EbWwRnDrIVoPQa6pSS3Rq`; the pasted manual development application is distinct. Existing production accounts are preserved. OAuth applications/scopes are empty, PKCE is enabled, opaque tokens are selected, audience binding and CIMD publication are currently disabled. Dashboard discovery uses `https://hetu-app.vercel.app/__clerk/.well-known/openid-configuration`; verify its live issuer before configuring MCP.
- Live Python health reported DB/Redis ready and `/v1/me` rejected anonymous access. MCP discovery returned 404 and the production environment list lacked MCP resource/issuer/client settings. No live Clerk OAuth grant or ChatGPT save has been completed.
- Public GitHub evidence confirms encrypted daily backup jobs succeeded on October 6–8, including [October 8 run 37753416652](https://github.com/byreddy1303/HETU/actions/runs/37753416652). Their upload/download hash checks do not establish an independent production restore drill, object backup, retention, restricted runtime roles, or complete real-owner reconciliation. Those release gates remain pending verification.
- Next: finish canonical recovery domain parity and app/MCP follow-through, then planning/diagnosis and remaining section operations. Resolve live recovery/identity evidence and prepare the exact scoped ChatGPT connection before enabling MCP writes. Keep this checklist current; the complete specification remains the delivery target.
