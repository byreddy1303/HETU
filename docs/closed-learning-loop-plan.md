# Hetu closed learning loop — implementation plan

Status: active  
Owner: repository implementation program  
Started: 2026-08-30  
Branch: `codex/closed-learning-loop`

This document is the durable source of truth for implementing the complete Planner → PYQ →
Recovery → Mastery program. It intentionally tracks product behavior, data contracts, migration
work, tests, and rollout safeguards in one place so future work can resume without reconstructing
the original audit.

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
- [ ] Create branch and push initial plan.
- [ ] Add a traceability check to keep this file current in every tranche.

### Phase 1 — trustworthy recovery foundation

- [ ] Create `learning_items`, `learning_events`, and required linkage columns.
- [ ] Add RLS, explicit grants, indexes, constraints, and two-user policy tests.
- [ ] Revoke/harden the unsafe retry RPC and fix re-attempt UPDATE `WITH CHECK`.
- [ ] Import existing re-attempt JSON history into append-only events.
- [ ] Merge duplicate ladders by canonical PYQ identity without losing events.
- [ ] Add local Dexie models, indexes, sync mappings, isolation, export, and backup support.
- [ ] Create a minimal learning item for every wrong, skipped, guessed-correct, slow-correct, or
      low-confidence attempt in guided practice.
- [ ] Create recovery items for weak timed-set/full-paper receipts at exam finalization.
- [ ] Keep Journal analysis optional and link later diagnoses to the canonical item.
- [ ] Replace device-local retry dates with profile-timezone calendar dates.
- [ ] Fix Planner “last 30 days” so future dates are excluded.
- [ ] Fix readiness so waiting at D30 is not treated as successful D30 recall.
- [ ] Add tests for automatic capture, idempotency, canonical merging, timezone rollover, and honest
      readiness credit.
- [ ] Support exact, numeric-tolerance, and inclusive-range evaluation for manual NAT answers.

### Phase 2 — blind and durable recovery

- [ ] Hide pattern, trigger, prior answer, and outcome until answer commitment.
- [ ] Add explicit “Reveal opening cue,” log hint use, and grade assisted answers Hard.
- [ ] Add Again/Hard/Good/Easy grading derived from correctness, time, confidence, and hint use.
- [ ] Add explicit Not now / interrupted semantics and durable events.
- [ ] Add durable recovery sessions with queue snapshot, timers, drafts, positions, and resume.
- [ ] Add bounded 10/20/30-minute and 5-question recovery sprints.
- [ ] Prioritize by overdue age, lapse count, confidence surprise, marks, weekly focus, and estimated
      duration while interleaving subjects/patterns.
- [ ] Add Must recover today and If time partitions with reason chips.
- [ ] Add remediation state after repeated lapses.
- [ ] Add corrected-opening-move capture and focused remediation-plan action.
- [ ] Add exact same-topic transfer assignment and pass/fail handling.
- [ ] Add recovery sprint reports and seven-day forecast.
- [ ] Preserve all legacy rows and support compatibility rendering.

### Phase 3 — recommended PYQ practice

- [ ] Add seeded, deterministic, stratified question selection.
- [ ] Balance mixed sets across subject/topic/year/marks without exposing sealed papers.
- [ ] Rank using weakness, confidence, lapse, recency, weekly focus, and planner prescription.
- [ ] Add reason chips explaining every selected cohort.
- [ ] Add Recommended Set presets: Learn, Diagnose, Repair, Speed, Transfer, Mixed GATE, Full Paper.
- [ ] Add live preflight: exact match count, unseen/seen split, cohort split, marks, estimated time,
      distribution, and reserved-paper exclusions.
- [ ] Remember last configuration and support named saved prescriptions.
- [ ] Add complete searchable PYQ session history.
- [ ] Extend confidence ledgers and insights to guided practice.
- [ ] Add high-confidence-wrong and confidence-calibration reporting by subject/topic.
- [ ] Compare personal pace with mark-based targets and rolling personal baselines.
- [ ] Make improvement insights actionable with exact UID subsets.
- [ ] Add Practice exact subset, Add to recovery, Analyze first, Plan repair, and Try transfer actions.
- [ ] Make exact-set repetition secondary to transfer practice.

### Phase 4 — executable and capacity-aware Planner

- [ ] Add daily available minutes, optional time windows, energy, and protected buffer.
- [ ] Add planned-versus-available capacity meter and overload guidance.
- [ ] Add agenda ordering, optional start time, drag/reorder, and Start next action.
- [ ] Add typed launch prescriptions and result receipts to planner blocks.
- [ ] Resolve PYQ prescriptions to exact sets at start and feed outcomes back at completion.
- [ ] Forecast due recovery load for tomorrow and the next seven/thirty days.
- [ ] Estimate future review load when adding a new PYQ block.
- [ ] Add Build my day compiler using review debt, weekly focus, readiness, formulas, priorities,
      energy, and capacity.
- [ ] Require user approval and show recommendation reasons.
- [ ] Make Replicate Yes/Partial/No actionable.
- [ ] Add Copy yesterday, Copy last weekday, templates, recurrence, and selected-block copy.
- [ ] Add one-tap unfinished-block rollover.
- [ ] Add mobile week/agenda view with visible subjects and durations.
- [ ] Add plan-vs-actual time/questions/outcomes and estimation calibration by subject/mode.
- [ ] Make neglected-subject and weak-topic insights create a block directly.

### Phase 5 — unified Planner durability

- [ ] Consolidate legacy `plan_items` / completions with current `planner_day_plans` behavior.
- [ ] Migrate manageable recurring items into typed planner templates/blocks.
- [ ] Update digest and study-notification functions to the unified source.
- [ ] Sync the complete DayPlan, reviews, capacity, launch prescriptions, and results.
- [ ] Add versioned conflict handling and deletion tombstones.
- [ ] Add durable planner outbox/retry behavior.
- [ ] Include planner data in backup/restore and progress export.
- [ ] Prevent stale-device resurrection after deletion.
- [ ] Verify multi-device create/update/delete conflicts.

### Phase 6 — longitudinal learning and readiness

- [ ] Add wrong-to-clean conversion at 7/30 days.
- [ ] Add Again/Hard/Good/Easy and D3/D10/D30 pass rates.
- [ ] Add hint-free recall, transfer success, mastered lapse, and remediation conversion.
- [ ] Add median/P90 overdue age and backlog burn-down vs new mistakes.
- [ ] Add original-to-recovery time improvement.
- [ ] Add analysis completion rate and recovery by subject/pattern/root cause.
- [ ] Add plan estimation error, rollover rate, and setup-to-start time.
- [ ] Feed recovery evidence into Weekly Review and Readiness without double counting.
- [ ] Use a durable-recovery north star instead of streaks or raw activity.

### Phase 7 — verification and release

- [ ] Unit tests for all pure selection, scheduling, capacity, and analytics logic.
- [ ] Component tests for blind retrieval, hints, defer/interruption, presets, preflight, actions,
      planner capacity, rollover, and mobile agenda.
- [ ] Integration tests for attempt → learning item → recovery → transfer → mastery.
- [ ] Supabase RLS allow/deny tests and database advisors.
- [ ] Offline, refresh, app-kill/resume, and conflict tests.
- [ ] Typecheck, lint, complete Vitest suite, bank audit, and Playwright suite.
- [ ] Browser screenshots at desktop/mobile widths, dark mode, and reduced motion.
- [ ] Android/native smoke verification for Planner, PYQ, and Recovery.
- [ ] React best-practices review across every edited TSX component.
- [ ] Accessibility review: keyboard, focus, labels, live status, color-independent evidence.
- [ ] Update README, deployment docs, data export docs, and migration notes.
- [ ] Verify every traceability item below and remove no requirement silently.

## Traceability ledger

| Recommendation | Phase | Status |
| --- | ---: | --- |
| Automatic weak-attempt capture, including exams | 1 | Pending |
| Journal enrichment never gates recovery | 1 | Pending |
| One canonical learning identity / one schedule | 1 | Pending |
| Append-only learning events | 1 | Pending |
| Blind retrieval and explicit hint evidence | 2 | Pending |
| Failure vs defer vs interruption | 2 | Pending |
| Again/Hard/Good/Easy adaptive grading | 2 | Pending |
| Durable recovery sessions | 2 | Pending |
| Bounded workload-aware recovery sprints | 2 | Pending |
| Remediation/leech state | 2 | Pending |
| Transfer checks before durable mastery | 2–3 | Pending |
| Recommended PYQ set presets | 3 | Pending |
| Seeded stratified question selection | 3 | Pending |
| Live setup preflight | 3 | Pending |
| Confidence-aware selection and reports | 3 | Pending |
| Exact actionable report subsets | 3 | Pending |
| Complete searchable session history | 3 | Pending |
| Capacity-aware Build my day | 4 | Pending |
| Executable planner prescriptions/results | 4 | Pending |
| Review load forecast | 4 | Pending |
| Agenda/time windows/buffer | 4 | Pending |
| Replicate/copy/template/recurrence/rollover | 4–5 | Pending |
| Plan-vs-actual and estimation calibration | 4 | Pending |
| Mobile agenda/week visibility | 4 | Pending |
| Full planner sync, tombstones, outbox, backup | 5 | Pending |
| Unify legacy and current planner sources | 5 | Pending |
| Recovery-focused Weekly Review and Readiness | 6 | Pending |
| Honest past/today/future analytics | 1, 4, 6 | Pending |
| RLS/RPC hardening and explicit API grants | 1 | Pending |
| Manual NAT exact/tolerance/range evaluation | 1 | Pending |
| No passive-only insights; every priority insight has an action | 2–6 | Pending |

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
