# Practical repair release

The first outcome-focused hardening phase connects an existing mistake pack to a
small daily focus, an independent check, bank application, and a scheduled return.
It does not certify mastery or claim a measured learning gain.

## What the learner can do

- Keep up to three repairs in view. Suggested targets favor unfinished work,
  due dates, and repeated observations; an explicit selection stays saved.
- Open a selected due repair from Today. A ten-minute balanced session has one
  activity, so changing tools does not consume the session.
- Distinguish an accurate helped answer from an independent answer. Only an
  all-correct round reported without help extends the interval to 3, 7, 14, or
  30 days. Helped, unknown-condition, and unsuccessful rounds return the next day.
- Optionally record what needs attention and one action to try next. Uncertainty
  is a valid assessment. Repeated unsuccessful rounds make this choice visible;
  the application does not infer a psychological cause from a score.
- After independent success, open linked bank application when eligible questions
  exist. After submission, report conditions once to schedule the next check.
  Responses are already saved even if the conditions report is interrupted.
- Inspect fresh independent bank results separately from original exercise
  results. Delayed bank evidence additionally requires an interval of at least
  three days to have elapsed before the session starts.

## Evidence and compatibility boundaries

Historical answers, existing due dates, and pending packs are retained. New
scheduling rules apply when a future round is submitted; old streaks are not
reclassified as independent successes. Started daily plans retain completion.

First submitted bank answers determine application results; a corrected second
answer cannot replace the first error. Skips stay in the fresh-question denominator. Prior exposure by question ID or content
hash disqualifies freshness. Helped and unknown-condition work remain visible
without counting as independent application. The conditions report is immutable
once saved, and identical retries are idempotent.

Question selection outside the reviewed skill curriculum uses topic and text
matching, not a certified match to a mistake mechanism. When no eligible fresh
question exists, no application is invented. Repeated generated exercises remain
recognizable as repeated exposure. Bounded history scans conservatively withhold
freshness when completeness cannot be established. There is no global mastery
percentage, and short-session time is a plan, not a completion-time guarantee.

Formula edits now carry the revision captured when editing began; conflicting
updates keep the newer server content and the user's unsaved draft. Explicit
expected revisions are honored by the compatibility API. Other legacy versionless
callers retain their existing behavior; universal conflict handling is a later
compatibility migration. Delayed cache refreshes protect acknowledged changes
and deletions across all tables, including newly committed attempt receipts.

## Release evidence

Regression coverage includes assistance-sensitive scheduling, first-answer
integrity, fresh and delayed eligibility, prior exposure, ownership, version
conflicts, idempotent saves, focus persistence, immutable receipts, and delayed
cache reads. Local browser journeys exercise real SQLite endpoints, reloads,
focus choices, an original repair through bank application, and both narrow and
desktop layouts. These browser journeys now run in Release assurance CI alongside
the existing frontend, backend, bank, and Electron checks.

Local release checks passed on 2026-11-16: 896 frontend tests, 276 backend tests
(10 PostgreSQL-specific checks skipped), 17 Electron tests, eight browser journeys,
TypeScript checks, lint, and the 4,334-question bank audit. The packaged macOS
app also passed a disposable-workspace save, hidden-key, and restart check.

All automated fixtures use disposable local workspaces. The installed desktop
workspace is verified separately without answering learner questions. Private
records and backups are excluded from the repository.

## Decide whether it helps after use

For an initial two-week pilot, choose one to three real targets and use the normal
study flow. Evaluate these questions using the saved denominators and dates:

1. Do due checks actually get completed, or do the same targets stay untouched?
2. Do first, fresh answers without help improve, including returns after a delay?
3. Does a saved next action lead to a different approach after a repeated error?
4. Can a short session begin and finish with little navigation or bookkeeping?
5. Are unrelated syllabus practice and full-paper work still happening?

These are decision criteria, not promised effects. A small or unmatched sample
cannot establish a learning gain. If targets remain untouched, reduce the visible
focus or friction. If retries improve but fresh application does not, revisit the
explanation, recognition practice, and question match rather than extending the
interval. If repairs crowd out new coverage, reduce repair time. Extend reviewed
skill mapping and mock-analysis work only after this loop is useful in practice.
