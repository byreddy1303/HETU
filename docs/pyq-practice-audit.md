# PYQ practice reliability and integrity audit

Audited 27 September 2026 against bank `gate-and-cs-exams-1990-2026-v12-complete-gate-marks`.

The full machine-readable findings are in `references/pyq-practice-audit.json`.
Regenerate them with `node scripts/audit-pyq-practice.mjs --write`. Running the
script without `--write` checks the bank without modifying it. It fails for
repeated IDs, provenance mismatches, or conflicting duplicate keys without a
quarantine entry. Run `npm run pyq:marks:audit` for the separate mark-evidence ledger.

## Confirmed problems and fixes

| Problem | Evidence | Change |
| --- | --- | --- |
| Answer submission could wait indefinitely for optional media | Screenshot capture waited on fonts, image decoding and canvas work; then submission fetched the journal image again | Bound screenshot capture to 1.5 seconds and retain an answer-free fallback plus the question HTML. Reuse the bundled figure path rather than fetching it during submission |
| Recovery work delayed a saved result | Practice and exam submission awaited recovery writes after durable receipt writes | Run idempotent recovery capture in the background and report failures for existing backfill retry |
| A partial batch failure could create duplicate receipts on retry | Receipt, session and journal writes are sequential, not a database transaction | Reuse the saved immutable receipt when retrying a failed submission; preserve legitimate reattempts after a completed skip |
| A bank load failure persisted until page reload | Failed manifest and subject promises remained cached | Evict failed promises, abort bank requests after 15 seconds and offer a manifest retry button |
| Mixed/stale bank versions could be consumed together | The subject loader did not compare payload versions | Validate subject versions and invalidate the pre-mark-reconciliation manifest request key |
| Identical questions can appear under different IDs | Ten exact-content duplicate groups across the bank, including four CSE groups | Deduplicate question content and diagrams before filling new practice sets; reject repeated IDs when constructing a session |
| Identical text has conflicting answer keys | Two CSE duplicate pairs contain A/C disagreement | Quarantine all four rows from automatic grading; keep original bank records and historical receipts intact |
| A stored correct answer could be impossible to select | `go:441` contains a fifth option E in HTML without a `choices` field | Infer explicitly labelled HTML options consistently in single view, multiple view and exam view |
| Written/unsupported archive entries appeared in objective practice | Twenty CSE subjective rows have `answerStatus: available` but a null objective answer | Admit automatically verifiable objective keys to new sets; show an explanation for old saved sets; do not label null correctness as wrong |
| Missing scores were silently hidden | Mark badges and unscorable receipt explanations were conditional on non-null/scorable metadata | Show an explicit unavailable label and explain when historical allocations fall outside modern GATE scoring |
| Disabled submit gave no next step | Multiple view needs answer and confidence | Explain whether an answer or confidence selection is still required; show a saving state during submission |

## Data findings and limits

- The bank contains 4,334 distinct IDs. Distinct IDs do not imply distinct questions.
- All 4,043 GATE rows have a mark allocation, and the existing reconciliation
  audit passes. This checks the recorded evidence/rules, not independent verification
  of every allocation against an original paper.
- 261 supplemental non-GATE questions still have no recorded marks: TIFR 65,
  CMI 122, ISRO 45, IIIT-H PGEE 8, and UGC NET 21. Do not invent a 1/2-mark default.
- 130 rows with structured 2026 PDF-key provenance match the stored paper year,
  set, section, official question number (including the CS offset of 10), and marks.
  This is a provenance mapping check, not a fresh extraction of the PDFs.
- 143 explicit answer-source UID lists contain their question ID. 963 ExamSIDE
  answer-source URLs match the question source URL. Neither proves that the source
  key itself is mathematically correct.
- 82 paper/number collisions exist in supplemental archive metadata. The importer
  reads archive listing positions and detail-page titles; these are not universally
  original paper question numbers. They must be reconciled against original papers
  before using them as official numbering or inferring marks from them.
- Exact duplicate detection retains diagram paths and option order. Reworded
  duplicates and option-reordered copies need a separate semantic/source review.

## Quarantined keys requiring source reconciliation

| Question | Conflicting rows | Stored keys |
| --- | --- | --- |
| GATE CSE 1998 interrupt handling | `es:gate-cse:g3z3rCFxZY6lWpJR`, `es:gate-cse:tgmtl2rqUXbgmFB0` | A / C |
| GATE CSE 2001 program relocation | `es:gate-cse:dz6IpID2jG8YtJBH`, `es:gate-cse:QLXk6o3rDR5I8HYS` | A / C |

The exclusions live in `src/data/pyq-key-conflicts.json`. Both sides are excluded
rather than choosing whichever source happens to load first. Resolving them requires
recording the original paper position, mark allocation and trustworthy answer evidence.

Existing immutable attempts are not rewritten by this change. Old saved sessions
retain their original membership; opening a quarantined question shows that it cannot
be automatically graded. New sets receive content deduplication and eligibility checks.

## Verification scope

Regression tests cover stalled capture, failed/stale bank loads, partial-save retry,
option accessibility, quarantined keys, duplicate-content selection and explicit marks.
The existing PYQ suite covers MCQ/MSQ/NAT evaluation, scoring, navigation, pause/resume,
exam modes, saved drafts and history. Browser verification uses the local sandbox;
it does not certify authenticated production database behavior or independently prove
all archived answers.
