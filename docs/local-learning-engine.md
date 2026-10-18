# Local model learning engine

Built 2026-10-18. Entry points: **Learning Memory → Your next study actions → Local model connection**, and the prepared activities in **Do now**.

## What runs automatically

When local learning is enabled, HETU checks on app open, after saved practice changes or memory saves, and every minute while the app is visible. The trigger returns immediately; the local backend runs model inference separately from request handling and without holding a database session open. One job per account and one model job per backend process prevent duplicate concurrent work.

The engine reads owned, completed PYQ sessions and reliably scored capture-v3 receipts. It uses the frozen historical question, submitted answer, key, exact integer-third score, confidence, available timing, linked reflections (including deferred ones), and bounded saved concept/finding/profile context. It separates incomplete work and missing reasoning from an actual failed response. Active or paused exams defer new model analysis. Completed exam answers enter coaching only after their key is revealed in the exam review or the independent review is finished.

The local model proposes up to three activities addressing incorrect answers or submitted skips. HETU verifies the response schema, source ownership, topic consistency, evidence versions, configuration revision, and available queue capacity before saving. Code constructs the factual observation from receipts; model prose remains an explicitly unverified explanation. A correct answer cannot become an error source. Unknown or bonus scoring cannot become evidence of failure. No model output can edit attempts, fabricate responses, or certify mastery.

Supported proposals become open, source-linked repair activities with canonical bank questions and a due date. Existing assistant-prepared drafts can be reused while retaining their text and revision history. Uncovered errors remain available for a later batch when a queue slot opens. The queue permits at most three activities due now; later checks remain dated and linked.

Starting an activity rechecks question availability and exposure. Original retries explicitly permit familiar questions. Fresh checks exclude seen content, duplicate content, unanswerable keys, and sealed benchmark papers. Eligible same-topic questions are ranked by overlap with the source question text. This is an approximate match, recorded as unverified skill matching; it is not a curated prerequisite or misconception map.

Completed linked practice is reconciled from actual session receipts without a result-recording click. The engine creates an immutable verification, finishes the originating activity, and prepares the next check. Unresolved errors, skips, absent submissions, or uncertain scoring return after one day. Consecutive accurate checks use intervals of 3, 7, 14, and 30 days. After three accurate checks, the next activity also examines accuracy and pace; timing and assistance still retain their limits. These are transparent rules, not a fitted retention model. Follow-ups become automatic activity/Planner candidates rather than silently adding timed commitments to a full day.

The model also receives bounded history for the same questions: correct, wrong and skipped counts from up to 80 completed, reliably scored practice receipts. These counts describe recorded practice, not lifetime totals or a proven recurring cause. After an unsuccessful linked practice, the next local cycle reconsiders the existing follow-up using its latest failed/skipped receipts. It can revise the diagnostic method and success criterion while preserving the due date, result chain, and single activity identity. Missing or unscorable submissions retain the conservative rule-based follow-up. Configuration, session, receipt, reflection and activity versions are checked again before saving; an intervening edit rejects the model response.

## Connection and controls

Ollama uses its native `/api/tags` and schema-constrained `/api/chat` APIs. LM Studio or another local OpenAI-compatible server uses `/v1/models` and `/v1/chat/completions`. Connection discovery, selection, enable/pause, retry, and status controls live in the learning panel. Enabling a connection starts a catch-up check. Changing or pausing the configuration invalidates an in-flight response.

Endpoints accept only loopback addresses, ignore proxy environment variables, block redirects, reject advertised cloud/remote and embedding-only models, and bound input/output sizes and model timeouts. No paid provider fallback or fabricated local diagnosis is used. The local model application must be running; offline and malformed-output states explain the failure while preserving study evidence. The application never downloads a model automatically.

Configuration and processing checkpoints use an owner-scoped private Record collection, outside ordinary Memory lists and the generic records API. Generated findings, repairs, and verifications use the existing revisioned `study_memory` boundary. Private endpoints are available only from a loopback client in a local SQLite workspace.

The analysis scans at most the latest 120 receipts, with batches limited to 12 sources and a bounded character budget. It supports the completed-PYQ loop first. Standalone prose without a graded attempt does not automatically become a diagnosed error or a completed learning activity. Generated free-text tutoring/assessment, semantic retrieval across the entire archive, and a reviewed skill/prerequisite graph remain later work.

## Verification

Coverage includes local URL restrictions, remote/embedding model exclusion, structured-output validation, offline/redirect/truncated responses, owner isolation, exam deferral, configuration changes during inference, idempotent activity creation, immutable frozen scoring, automatic result reconciliation, dated fresh/error follow-ups, current question eligibility, sealed/duplicate exclusions, UI connection controls, and lifecycle cleanup.

The implementation milestone passed 104 frontend tests across 18 suites and 69 targeted backend tests. The latter includes bounded practice history, replay-safe refinement of failed retries, pausing during refinement, and changed session eligibility. TypeScript, targeted ESLint, Ruff, and desktop packaging also passed.

Browser acceptance uses an isolated SQLite copy and real local inference. It checks activity preparation, Do now navigation, actual question submission, automatic result/follow-up creation without pressing the result button, and a narrow mobile layout. Packaged acceptance runs the bundled backend, Python runtime, and compiled UI. Synthetic acceptance attempts never return to the learner's database.

API references: [Ollama model discovery](https://docs.ollama.com/api/tags), [chat](https://docs.ollama.com/api/chat), and [structured output](https://docs.ollama.com/capabilities/structured-outputs).
