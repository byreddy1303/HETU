# Learning Memory and the no-provider study loop

Built on 2026-10-16. This milestone makes the learning evidence and follow-up loop usable before buying an AI API. It does not require a model, API key, or provider account.

## What the learner can use

- **Learning Memory (`/memory`)**: searchable, paginated records for thinking reflections, exam reviews, concepts, findings, repairs, verification results, and learning context. The existing learning library remains the source library and is linked from this hub.
- **Thinking after each practice PYQ**: record the actual reasoning, the difficult step, a suspected mechanism, a corrected principle, and an optional diagnostic response. The record saves immediately. Deferring saves its contents and status. The default cause is unassessed, rather than an invented diagnosis.
- **A separate post-mortem for each exam**: capture the initial recollection, work through every submitted question, and resume the selected question and reviewed count. Priority uses recorded correctness, confidence, skips, and time. Answer keys are revealed explicitly, and exposure is remembered across reloads. The full answer report remains available.
- **Concept records and closed-book checks**: keep conditions, prerequisites, examples, counterexamples, a recall prompt, and evaluation guidance. During a check the saved explanation and guidance are hidden. The response, guidance use, self-assessment, and elapsed wall time survive a reload. Finishing appends an immutable verification record and sets the next recall date.
- **Focused repairs**: record the target, reason, activity, duration, due date, question count, and success criterion. Select real, gradable, subject/topic-matched bank questions, add the activity to Planner, and launch that selected practice. Fresh transfer excludes questions with recorded prior exposure. Sealed benchmark papers stay protected.
- **Results and the next check**: link submitted practice receipts back to the repair. Correct, judged, skipped, and recorded-time totals come from canonical backend receipts. Finishing prepares a next-day investigation after unresolved errors or a delayed check after accurate practice. This follow-up is a candidate until the learner schedules it.
- **Recurring difficulties**: three distinct completed reflections with the same learner-assessed mechanism, stage, subject, and topic create one 20-minute Pattern Sprint for tomorrow in the learner's timezone. It uses real eligible bank questions and records when none are available. Stable identities prevent duplicate repairs and Planner blocks. Retrying after a Planner failure finishes the existing activity's scheduling.

## Evidence and persistence

`study_memory` is an owner-scoped, domain-managed collection in the existing database. Every save uses the Record revision boundary and optimistic concurrency. An identical retry is safe; a different stale update conflicts. Verification records cannot be rewritten. The generic records API cannot bypass memory validation.

Attempt, session, repair, and source links are validated for the authenticated owner. Exam-reviewed and answer-revealed attempt IDs must belong to that exam. Raw learner explanations, recorded events, deterministic rules, and model interpretations have separate provenance labels. Existing repeated-correct evidence is displayed as **Repeated correct**, without presenting it as demonstrated retention or transfer.

Exam submission now has one transaction for immutable attempt receipts and completed session records. Each receipt is validated while the saved exam is still active; a failed validation cannot leave a partially submitted exam. The client refreshes canonical tables after acknowledgement.

The memory hub can export the full memory, revision snapshots, and linked attempt receipts as JSON. This is a portable evidence export, not an import that can overwrite attempts. Full workspace recovery uses the existing SQLite backup workflow.

## Interfaces ready for future AI

- `GET /v1/study-memory/entries`: owner-scoped filters and SQL text search, with real pagination and totals.
- `GET /v1/study-memory/entries/{id}`: current entry and paginated revision history.
- `PUT /v1/study-memory/entries/{id}`: validated, versioned saves.
- `GET /v1/study-memory/context?attempt_id=...`: frozen question snapshot, canonical attempt, related memory, and provenance. A bounded response reports whether more memory exists.
- `GET /v1/study-memory/export`: complete evidence export.
- `POST /v1/study-memory/exams/submit`: atomic exam finalization.

The future coach can read these sources before proposing a diagnosis or repair. This milestone does not call a language model or automatically grade free-text reasoning.

## Verification

- TypeScript typecheck and targeted ESLint pass.
- The staged source also passes the 44 frontend tests and 21 backend memory/library/recovery tests independently of the other unfinished workspace edits. This commit includes the missing `database_errors` helper already imported by the tracked server, so that clean backend startup can load the new routes.
- 44 frontend tests across seven suites pass, covering persistence, reveal history, honest evidence conditions, question selection, Planner preservation/deduplication, recurrence/calendar handling, export pagination, and existing PYQ/review behavior.
- 26 backend tests across memory, library, recovery, and cognitive services pass. Memory cases cover owner isolation, stale writes, revision reopening, immutable verification, more than 100 search results, literal wildcard search, source export, atomic exam submission, and canonical repair aggregates.
- Isolated browser acceptance uses a temporary SQLite database and blocks non-loopback requests. It verifies concept creation/recall draft reopening, two independent exam review histories, a selected-question repair launch, an actual answer and deferred reflection, result linking, and a prepared follow-up.
- The desktop packaging command succeeds. A separate online backup and restore retains the memory records, source records, and revision rows, with SQLite integrity checks passing.
- The final package's bundled Python runtime and compiled interface pass concept creation, a closed-book recall with notes/sidebar snippets hidden, immutable verification, and a downloaded JSON evidence export, with no browser errors.

## Remaining development

The memory timeline currently contains these new memory records and links to the existing library and session views; it is not yet a merged event stream of every historical application record. Search is paginated SQL text search, without a semantic index. Question selection establishes subject/topic matching, not a reviewed mapping of every question to a cognitive trap. Concept responses remain explicitly self-assessed.

Further work includes reviewed prerequisite and trap mappings, richer reading/derivation/check timing, calculator and scratchpad evidence, attachment ingestion, calibrated retention/transfer models, and the provider-backed coaching interface. Those larger roadmap items are not marked complete by this milestone.
