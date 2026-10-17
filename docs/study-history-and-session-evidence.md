# Connected history and session evidence

Built 2026-10-17, without an in-app model provider.

## What changed

Learning Memory now opens on **All study history**. It indexes ten existing source types: learning memory, PYQ attempts, PYQ sessions, Journal questions, formulas, library concepts, saved insights, concept checks, recovery items, and mock tests. This is a read-only projection of the original records; it does not manufacture memory entries or duplicate historical attempts.

Search, collection, subject/topic, selected-question, and session filters run in SQL with real counts and pagination. Source details include bounded original evidence, direct sources, and linked learning memory. Images, embedded media, answer keys, and credential fields are omitted from previews. Related collections and previews report truncation explicitly. Original record links remain available. Dates are normalized to UTC before display in the learner's timezone.

Session review now begins with a coverage-first synthesis. A completed practice set can have fewer submitted receipts than selected questions. The report distinguishes **submitted**, **explicitly skipped**, and **not submitted**, including ungraded saved drafts. The older detailed PYQ report has the same distinction, so its skipped count cannot contradict the synthesis.

The synthesis shows exact frozen scoring coverage, marks only on scored submissions, high-confidence errors, uncertain correct answers, correct responses exceeding the existing marks-based time target, topic groupings, and time concentrations. Measured, reported, unknown, and unsubmitted-draft timing remain distinct. It never derives active time from a gap between wall-clock dates. Bonus, ambiguous, legacy, or inconsistent scoring metadata cannot silently become evidence of failure.

Saved thinking, written explanations, deferred assessments, and finished reviews are displayed separately. Learner-stated mechanisms remain attributed; a correctness result does not invent its cause. At most three explainable next actions can be saved as stable repair drafts. Retrying or reopening an action uses the existing repair. Scheduling is a separate learner action.

## Official bank correction

The source question `go:460798` was incorrectly typed MCQ. Its matching question is official GATE 2025 CS2 master Q47, which is **MSQ, D, two marks**. The archive's display number37 excludes General Aptitude and stays unchanged.

- Official paper: https://gate2025.iitr.ac.in/doc/2025/2025_QP/CS2.pdf (PDF page36).
- Official answer key: https://gate2025.iitr.ac.in/doc/2025/2025_Key/CS2_Keys.pdf.

An audited builder override and bank version `v13-official-cs2-q47` make the correction durable. Public and backend bank copies remain identical. All other question contents remain unchanged; shard version changes invalidate cached bank data. The additional structured official source is reflected in provenance counts. Existing attempt snapshots and scores are never rewritten.

## Verification and limits

Regression coverage includes the 15-selected/6-submitted case, exact third-mark scoring, explicit skips, ambiguous and bonus keys, unknown and nonfinite timing, duplicate receipts, owner/session isolation, deferred reasoning, stable repair saves, history filtering, more than 100 results, bounded source detail, and the official MSQ correction. The staged source passes 96 frontend tests and 35 backend tests, TypeScript, targeted ESLint, Ruff, bank mirror checks, and the taxonomy audit.

Browser acceptance uses an isolated SQLite copy: it checks the real evidence shape, source navigation, repair replay, and a 390px layout. The rebuilt macOS package passes the same browser flow using its bundled backend, Python runtime, and compiled UI, with no browser errors. Production learner answers and reflections are preserved.

This is a direct-source history, not a complete transitive knowledge graph. Manual non-PYQ sessions, weekly reviews, and trigger drills are not yet indexed here. Semantic retrieval, reviewed skill/prerequisite mapping, automatic diagnosis, telemetry beyond existing receipts, and adaptive retention models remain later work. Reflection autosave still retains every acknowledged version; checkpoint coalescing is a separate improvement.
