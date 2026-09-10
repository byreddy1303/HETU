# Hetu closed learning loop — implementation plan

Status: active  
Owner: repository implementation program  
Started: 2026-08-30  
Last verified: 2026-09-10
Branch: `codex/closed-learning-loop`

This document is the durable source of truth for implementing the complete Planner → PYQ →
Recovery → Mastery program. It intentionally tracks product behavior, data contracts, migration
work, tests, and rollout safeguards in one place so future work can resume without reconstructing
the original audit.

## Current checkpoint

The main local implementation is present. Release acceptance is still active: no production
migration or deployment has been performed in this tranche. Checked implementation tasks below
refer to local code and automated evidence, not a claim of production or physical-device testing.
“Complete” ledger rows have local implementation/test coverage; the whole goal remains active until
Phase 7 and the release gates in [closed-loop-release.md](closed-loop-release.md) are resolved.

Next session must start with the remaining acceptance list, not repeat the feature brainstorm:
physical Android app-kill/resume; authenticated two-device/offline acceptance; keyboard focus and
nested-dialog Escape behavior; complete React/traceability review; and deployment/migration
verification against the intended environment. Preserve every recommendation.

## Objective

Turn Planner, Do Now, PYQ Practice, Journal, Re-attempts, Syllabus, Readiness, and Weekly Review
into one inspectable evidence loop:

```text
available capacity
      ↓
approved day plan
      ↓
exact PYQ / study prescription
      ↓
immutable attempt evidence
      ↓
automatic recovery item
      ↓
blind delayed retrieval
      ↓
transfer check / durable mastery
      ↓
next plan and readiness evidence
```

Completion means every recommendation in the traceability ledger below is implemented, migrated,
tested, documented, and pushed. A recommendation may be changed only when a stronger implementation
preserves its intended user outcome; the decision must be recorded in this file.

## Product principles

1. Mistakes are captured automatically. Analysis enriches recovery but never gates it.
2. One underlying question has one learning identity and one active recovery schedule per learner.
3. Retrieval is blind by default. Any cue or interruption is explicit evidence.
4. Attempt events are append-only. Derived schedule state may change; historical evidence may not.
5. Recommendations explain their reasons and remain user-approved.
6. Planner capacity includes review debt before new work is added.
7. Mastery requires delayed, hint-free evidence or a fresh transfer success—not repetition alone.
8. Metrics distinguish past execution, today's work, and future intention.
9. No streaks, points, reward loops, or opaque rank predictions.
10. Local-first behavior, account isolation, offline use, and honest evidence labels remain intact.

## Design direction

### Subject, audience, and job

Hetu is a GATE CSE evidence ledger for a serious learner targeting AIR <100. The redesigned surfaces
have one job: make the next defensible study action obvious while preserving the provenance of why
it was chosen.

### Existing token system to preserve

- Paper: `#F6F1E9`
- Raised sheet: `#FFFDF9`
- Garnet source mark: `#98182B`
- Antique gold / warning: `#916520`
- Retrieval green: `#48754C`
- Uncertainty violet: `#694E76`
- Display: Bricolage Grotesque
- Body: Schibsted Grotesk
- Evidence / numeric utility: Azeret Mono

The palette, typography, ledger grid, restrained grain, and ink colors are already specific to
Hetu. New UI must extend those tokens instead of introducing a generic productivity-app gradient,
glassmorphism, or unrelated component library.

### Layout concept

Desktop:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ TODAY · 90 MIN AVAILABLE                         12 MIN BUFFER       │
├────────────── evidence rail ─────────────────────────────────────────┤
│ [01 due retrieval]──[02 repair PYQs]──[03 transfer]──[04 reflection]│
├──────────────────────────────────────┬───────────────────────────────┤
│ next action / active workspace       │ why this work · forecast      │
│                                      │ exact evidence reasons         │
└──────────────────────────────────────┴───────────────────────────────┘
```

Mobile:

```text
┌──────────────────────────┐
│ TODAY · 90 MIN           │
│ 78 planned · 12 buffer   │
├──────────────────────────┤
│ 01  Due retrieval   15m  │
│     4 items · must do    │
├──────────────────────────┤
│ 02  DB repair       40m  │
│     8 exact PYQs         │
├──────────────────────────┤
│ Start next action        │
└──────────────────────────┘
```

### Signature element

The evidence rail is the one deliberate visual signature. It is not decorative: every node is a
real state transition—planned, active, committed, recovery due, transfer verified, durable. It must
remain compact, keyboard accessible, and readable without color.

### Design critique before build

The first concept risked becoming a generic card-based “smart dashboard.” The revision keeps the
existing ledger as the dominant metaphor and spends visual emphasis only on the evidence rail. All
other surfaces remain quiet sheets, tables, and action rows. Motion is reserved for advancing an
evidence node or reordering an approved plan, and respects reduced-motion preferences.

## Architecture decisions

### Canonical learning identity

Add `learning_items` as the learner-owned identity for recovery:

- Bank identity: unique `(user_id, source_kind='pyq', question_uid)`.
- Manual identity: unique `(user_id, source_kind='manual', source_question_id)` plus an optional
  stable content fingerprint for future merging.
- Links to the latest source snapshot without rewriting immutable PYQ attempt receipts.
- Carries analysis state, remediation state, and current schedule projection.
- Does not duplicate Journal: Journal rows remain learner-authored diagnoses and may link to one
  learning item.

### Append-only recovery evidence

Add `learning_events` for:

- `created`
- `answer_committed`
- `retrieval_again`
- `retrieval_hard`
- `retrieval_good`
- `retrieval_easy`
- `hint_revealed`
- `deferred`
- `interrupted`
- `analysis_completed`
- `remediation_started`
- `remediation_completed`
- `transfer_assigned`
- `transfer_passed`
- `transfer_failed`
- `mastered`
- `reopened`

Every event stores learner ownership, occurred-at timestamp, local calendar date/timezone, source
attempt where applicable, exact answer/confidence/timing evidence where applicable, and immutable
metadata. Schedule state is derived transactionally into `learning_items` for efficient queries.

### Compatibility with existing re-attempts

- Existing `reattempts` rows remain readable during migration.
- A migration creates/links canonical learning items and imports JSON history as immutable events.
- Current screens read a compatibility projection until all clients use learning items.
- No evidence is discarded; duplicate open ladders for one canonical PYQ are merged conservatively.
- The most conservative active stage/due date wins while every attempt event is retained.

### Recovery grades

The first adaptive implementation is transparent rather than a black-box memory model:

- Again: wrong or blank.
- Hard: correct but over target, low confidence, or assisted.
- Good: correct, within target, hint-free, medium/high confidence.
- Easy: correct, materially under target, high confidence, hint-free, and supported by prior evidence.

Intervals remain exam-aware and deterministic. The legacy D3/D10/D30 ladder is the migration base.
`MASTERED` requires a successful due D30 retrieval or a delayed transfer pass; merely waiting at D30
does not count as stabilized evidence.

### Planner execution contract

Planner blocks gain a typed `launch` prescription and a typed `result` receipt.

PYQ launch fields:

- source book
- subject/topic scope
- cohort (`unseen`, `wrong`, `high-confidence-wrong`, `guessed-correct`, `slow-correct`, `due`,
  `transfer`, or an exact UID subset)
- practice/exam mode
- time and question budgets
- selection seed
- sealed-paper protection

Result fields:

- actual duration
- exact question UIDs
- submitted/correct/wrong/skipped
- exactly scorable marks and coverage
- confidence surprises
- recovery items created
- original target status

### Recommendation engine

Recommendation is a pure, testable compiler over local evidence:

1. Collect due/overdue recovery, pending analysis, weekly focus, syllabus/readiness gaps, formula
   recall, planned P1/P2 work, and new-exposure candidates.
2. Score with disclosed reasons.
3. Respect learner-entered capacity, time windows, energy, and buffer.
4. Build 3–5 bounded actions.
5. Require approval before writing the plan.
6. Snapshot exact question IDs only when a set starts, preserving sealed benchmark constraints.

### Supabase security and API exposure

- Every new public table explicitly enables RLS.
- `authenticated` receives only required grants; `anon` receives none unless a public behavior is
  intentionally documented.
- Update policies always include `USING` and `WITH CHECK` ownership predicates.
- RLS allow/deny tests cover two authenticated users and anon.
- The existing public `SECURITY DEFINER advance_reattempt` function is revoked or replaced with an
  ownership-safe function; no privileged public function is callable by `PUBLIC`.
- Schema changes are created using the Supabase CLI migration workflow.
- Database advisors and migration verification run before completion.

## Delivery phases

### Phase 0 — durable plan and baseline

- [x] Persist this master plan.
- [x] Record baseline test counts and key fixtures.
- [x] Create branch and push initial plan.
- [x] Add a traceability check to keep this file current in every tranche.

### Phase 1 — trustworthy recovery foundation

- [x] Create `learning_items`, `learning_events`, and required linkage columns.
- [x] Add RLS, explicit grants, indexes, constraints, and two-user policy tests.
- [x] Revoke/harden the unsafe retry RPC and fix re-attempt UPDATE `WITH CHECK`.
- [x] Import existing re-attempt JSON history into append-only events.
- [x] Merge duplicate ladders by canonical PYQ identity without losing events.
- [x] Add local Dexie models, indexes, sync mappings, isolation, export, and backup support.
- [x] Create a minimal learning item for every wrong, skipped, guessed-correct, slow-correct, or
      low-confidence attempt in guided practice.
- [x] Create recovery items for weak timed-set/full-paper receipts at exam finalization.
- [x] Keep Journal analysis optional and link later diagnoses to the canonical item.
- [x] Replace device-local retry dates with profile-timezone calendar dates.
- [x] Fix Planner “last 30 days” so future dates are excluded.
- [x] Fix readiness so waiting at D30 is not treated as successful D30 recall.
- [x] Add tests for automatic capture, idempotency, canonical merging, timezone rollover, and honest
      readiness credit.
- [x] Support exact, numeric-tolerance, and inclusive-range evaluation for manual NAT answers.

### Phase 2 — blind and durable recovery

- [x] Hide pattern, trigger, prior answer, and outcome until answer commitment.
- [x] Add explicit “Reveal opening cue,” log hint use, and grade assisted answers Hard.
- [x] Add Again/Hard/Good/Easy grading derived from correctness, time, confidence, and hint use.
- [x] Add explicit Not now / interrupted semantics and durable events.
- [x] Add durable recovery sessions with queue snapshot, timers, drafts, positions, and resume.
- [x] Add bounded 10/20/30-minute and 5-question recovery sprints.
- [x] Prioritize by overdue age, lapse count, confidence surprise, marks, weekly focus, and estimated
      duration while interleaving subjects/patterns.
- [x] Add Must recover today and If time partitions with reason chips.
- [x] Add remediation state after repeated lapses.
- [x] Add corrected-opening-move capture and focused remediation-plan action.
- [x] Add exact same-topic transfer assignment and pass/fail handling.
- [x] Add recovery sprint reports and seven-day forecast.
- [x] Preserve all legacy rows and support compatibility rendering.

### Phase 3 — recommended PYQ practice

- [x] Add seeded, deterministic, stratified question selection.
- [x] Balance mixed sets across subject/topic/year/marks without exposing sealed papers.
- [x] Rank using weakness, confidence, lapse, recency, weekly focus, and planner prescription.
- [x] Add reason chips explaining every selected cohort.
- [x] Add Recommended Set presets: Learn, Diagnose, Repair, Speed, Transfer, Mixed GATE, Full Paper.
- [x] Add live preflight: exact match count, unseen/seen split, cohort split, marks, estimated time,
      distribution, and reserved-paper exclusions.
- [x] Remember last configuration and support named saved prescriptions.
- [x] Add complete searchable PYQ session history.
- [x] Extend confidence ledgers and insights to guided practice.
- [x] Add high-confidence-wrong and confidence-calibration reporting by subject/topic.
- [x] Compare personal pace with mark-based targets and rolling personal baselines.
- [x] Make improvement insights actionable with exact UID subsets.
- [x] Add Practice exact subset, Add to recovery, Analyze first, Plan repair, and Try transfer actions.
- [x] Make exact-set repetition secondary to transfer practice.

### Phase 4 — executable and capacity-aware Planner

- [x] Add daily available minutes, optional time windows, energy, and protected buffer.
- [x] Add planned-versus-available capacity meter and overload guidance.
- [x] Add agenda ordering, optional start time, drag/reorder, and Start next action.
- [x] Add typed launch prescriptions and result receipts to planner blocks.
- [x] Resolve PYQ prescriptions to exact sets at start and feed outcomes back at completion.
- [x] Forecast due recovery load for tomorrow and the next seven/thirty days.
- [x] Estimate future review load when adding a new PYQ block.
- [x] Add Build my day compiler using review debt, weekly focus, readiness, formulas, priorities,
      energy, and capacity.
- [x] Require user approval and show recommendation reasons.
- [x] Make Replicate Yes/Partial/No actionable.
- [x] Add Copy yesterday, Copy last weekday, templates, recurrence, and selected-block copy.
- [x] Add one-tap unfinished-block rollover.
- [x] Add mobile week/agenda view with visible subjects and durations.
- [x] Add plan-vs-actual time/questions/outcomes and estimation calibration by subject/mode.
- [x] Make neglected-subject and weak-topic insights create a block directly.

### Phase 5 — unified Planner durability

- [x] Consolidate legacy `plan_items` / completions with current `planner_day_plans` behavior.
- [x] Migrate manageable recurring items into typed planner templates/blocks.
- [x] Update digest and study-notification functions to the unified source.
- [x] Sync the complete DayPlan, reviews, capacity, launch prescriptions, and results.
- [x] Add versioned conflict handling and deletion tombstones.
- [x] Add durable planner outbox/retry behavior.
- [x] Include planner data in backup/restore and progress export.
- [x] Prevent stale-device resurrection after deletion.
- [ ] Verify multi-device create/update/delete conflicts on authenticated devices (local RPC and outbox simulations pass).

### Phase 6 — longitudinal learning and readiness

- [x] Add wrong-to-clean conversion at 7/30 days.
- [x] Add Again/Hard/Good/Easy and D3/D10/D30 pass rates.
- [x] Add hint-free recall, transfer success, mastered lapse, and remediation conversion.
- [x] Add median/P90 overdue age and backlog burn-down vs new mistakes.
- [x] Add original-to-recovery time improvement.
- [x] Add analysis completion rate and recovery by subject/pattern/root cause.
- [x] Add plan estimation error, rollover rate, and setup-to-start time.
- [x] Feed recovery evidence into Weekly Review and Readiness without double counting.
- [x] Use a durable-recovery north star instead of streaks or raw activity.

### Phase 7 — verification and release

- [x] Unit tests for all pure selection, scheduling, capacity, and analytics logic.
- [x] Component tests for blind retrieval, hints, defer/interruption, presets, preflight, actions,
      planner capacity, rollover, and mobile agenda.
- [x] Integration tests for attempt → learning item → recovery → transfer → mastery.
- [x] Supabase RLS allow/deny tests and database advisors.
- [ ] Offline, refresh, app-kill/resume, and conflict tests.
- [x] Typecheck, lint, complete Vitest suite, bank audit, and Playwright suite.
- [x] Browser screenshots at desktop/mobile widths, dark mode, and reduced motion.
- [ ] Android/native smoke verification for Planner, PYQ, and Recovery.
- [ ] React best-practices review across every edited TSX component.
- [ ] Accessibility review: keyboard, focus, labels, live status, color-independent evidence.
- [x] Update README, deployment docs, data export docs, and migration notes.
- [ ] Verify every traceability item below and remove no requirement silently.

## Traceability ledger

| Recommendation | Phase | Status |
| --- | ---: | --- |
| Automatic weak-attempt capture, including exams | 1 | Complete |
| Journal enrichment never gates recovery | 1 | Complete |
| One canonical learning identity / one schedule | 1 | Complete |
| Append-only learning events | 1 | Complete |
| Blind retrieval and explicit hint evidence | 2 | Complete |
| Failure vs defer vs interruption | 2 | Complete |
| Again/Hard/Good/Easy adaptive grading | 2 | Complete |
| Durable recovery sessions | 2 | Complete |
| Bounded workload-aware recovery sprints | 2 | Complete |
| Remediation/leech state | 2 | Complete |
| Transfer checks before durable mastery | 2–3 | Complete |
| Recommended PYQ set presets | 3 | Complete |
| Seeded stratified question selection | 3 | Complete |
| Live setup preflight | 3 | Complete |
| Confidence-aware selection and reports | 3 | Complete |
| Exact actionable report subsets | 3 | Complete |
| Complete searchable session history | 3 | Complete |
| Capacity-aware Build my day | 4 | Complete |
| Executable planner prescriptions/results | 4 | Complete |
| Review load forecast | 4 | Complete |
| Agenda/time windows/buffer | 4 | Complete |
| Replicate/copy/template/recurrence/rollover | 4–5 | Complete |
| Plan-vs-actual and estimation calibration | 4 | Complete |
| Mobile agenda/week visibility | 4 | Complete |
| Full planner sync, tombstones, outbox, backup | 5 | In progress |
| Unify legacy and current planner sources | 5 | In progress |
| Recovery-focused Weekly Review and Readiness | 6 | Complete |
| Honest past/today/future analytics | 1, 4, 6 | Complete |
| RLS/RPC hardening and explicit API grants | 1 | Complete |
| Manual NAT exact/tolerance/range evaluation | 1 | Complete |
| No passive-only insights; every priority insight has an action | 2–6 | In progress |

## Verification log

Append dated evidence after each tranche. Include commands, pass counts, migrations, screenshots, and
known limitations. Never mark an item complete based only on code inspection.

### 2026-08-30 — audit baseline

- Planner / Do Now targeted baseline: 18 tests passed.
- PYQ targeted baseline: 65 tests passed.
- Worktree was clean before implementation.
- Supabase CLI: 2.100.1.
- Current Supabase changelog reviewed. Relevant platform change: new public tables require explicit
  Data API grants/exposure decisions; Node 22 is already compatible with current client support.
- Official RLS guidance reviewed: public tables require RLS, UPDATE policies require `USING` and
  `WITH CHECK`, and exposed `SECURITY DEFINER` functions require explicit execution control.

### 2026-09-10 — integrated implementation and local acceptance

- `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Final Vitest run: 107 files / 619 tests passed, including the extra malformed-outbox regression.
- `PLAYWRIGHT_PORT=5187 npm run test:e2e`: 3 browser stories passed. They cover
  study-route navigation; explicit Build my day approval, protected buffer, refresh persistence,
  mobile width and reduced motion; real-bank skipped PYQ → canonical due recovery without Journal;
  blind answers, two interruption/resume cycles, saved answer draft, and neutral defer.
- `supabase test db --local`: 2 pgTAP files / 41 tests passed, covering two-user RLS,
  append-only evidence, unsafe RPC denial, Planner revisions, idempotency, conflicts, tombstones,
  explicit recreation, and privacy.
- `npm run test:planner-migration`: 7 assertions passed while replaying the actual Planner
  migration over legacy fixtures inside a rolled-back transaction. Existing reviews and blocks,
  recorded completions, archived legacy rows, and the canonical template envelope are preserved.
- `npm run pyq:audit`: 4,334 questions / 14 subjects / 95 topics audited; the derived taxonomy
  summary was refreshed to match the already-committed bank. No question or answer was rewritten.
  `npm run pyq:marks:audit`: 4,043 GATE rows verified; none missing marks.
- `npm run build:native` passed. This is a Capacitor asset build, **not** physical Android QA.
  `adb devices -l` returned no connected device/emulator, so device acceptance remains open.
- Local security advisors report three inherited warnings: mutable search_path on
  `increment_llm_usage`, public `citext`, and the public access-request INSERT policy. No
  learning/Planner-specific warning was returned. These inherited findings remain documented.
- Build retains an existing ineffective-dynamic-import warning for `account-state.ts`; the
  module is also statically imported. No build error.
- Screenshots are generated by the browser specs in `test-results/`; durable command/test
  references are retained here because generated test artifacts are intentionally ignored.
- Push/email/Telegram reminders use unfinished unified DayPlan blocks and ignore tombstones.
  Completed blocks are omitted; legacy conversion no longer leaves email reading an empty source.
- Backup preflight rejects malformed outbox payloads and cross-account rows before any import.
  Conflict copies remain exportable without being automatically replayed or resurrecting deleted days.
- Remaining: physical-device and authenticated deployment checks, full keyboard/focus review,
  and independent final traceability acceptance. No production release is implied.

## Decision log

### D001 — Preserve Hetu's visual language

Do not restyle the product into a generic dashboard. Extend its existing daylight/dusk ledger,
garnet source mark, antique-gold warning, green retrieval, violet uncertainty, and three-role type
system. The evidence rail is the only new signature pattern.

### D002 — Transparent adaptive logic before a black-box scheduler

Ship deterministic Again/Hard/Good/Easy rules with inspectable inputs first. Collect enough honest
event data before considering a fitted memory model.

### D003 — Canonical recovery identity is separate from Journal diagnosis

Journal remains the learner's causal analysis surface. A learning item is the durable recovery
identity. They link, but neither duplicates nor blocks the other.

### D004 — New tables use explicit grants and tested RLS

This follows current Supabase Data API behavior and prevents accidental exposure if project defaults
change. Privileged public retry RPCs are not part of the new client contract.
