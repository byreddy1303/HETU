# Closed learning loop — release and recovery notes

The implementation checkpoint is in [the master plan](closed-learning-loop-plan.md). This document
describes the remaining acceptance work and the safe rollout sequence. A passing local build is not
evidence that the production database, deployed functions, or Android devices have been upgraded.

## Release order

1. Export the signed-in account from Settings and retain an independent database backup. Check the
   intended project and its migration history before any remote command.
2. Apply the recovery foundation and unified Planner migrations to a test environment first:
   `20260830030146_closed_learning_loop_foundation.sql` and
   `20260902051324_unified_planner_durability.sql`. The foundation file was previously an empty
   scaffold in Git. If an environment already recorded that empty version, **do not rewrite its
   migration history**: create and test a forward repair migration containing the missing schema.
3. Run the RLS and legacy fixture checks locally, then verify equivalent authenticated requests in
   the intended test environment. The Planner client requires the versioned mutation RPC and the
   new revision/deletion columns before it is released.
4. Deploy `study-notifications`, `daily-digest`, `telegram-webhook`, and `compute-readiness` with the
   database changes. Reminder readers now use unified DayPlans, ignore tombstones, and omit completed
   blocks. Readiness calculation version 3 excludes unproven D30 mastery.
5. Release the frontend and native assets only after the backend checks pass. Verify an ordinary
   learner account as well as the owner account; service-role success does not establish RLS safety.
6. Complete the device acceptance checklist below and append evidence to the master plan. Remote
   rollout must be deliberate; this implementation tranche did not deploy production changes.

Legacy `plan_items` are retained and archived after conversion, not deleted. Active one-offs and
recorded completions become dated blocks. Active recurrence becomes typed templates without
inventing an unlimited calendar of past or future work. Existing DayPlan reviews survive merging.

Do not schedule automatic mastery advancement. `schedule-reattempts` is an existing no-op stub;
elapsed days alone must not advance recall or erase overdue debt. Retrieval evidence drives the
adaptive schedule on the learner's profile calendar.

## Verification commands

Run from the repository with dependencies installed and local Docker/Supabase available:

```bash
npm run plan:check
npm run typecheck
npm run lint
npm test
npm run pyq:audit
npm run pyq:marks:audit
npm run build
npm run build:native
npm run test:e2e
supabase test db --local
npm run test:planner-migration
supabase db advisors --local --type security --level warn
```

The browser suite uses the local sandbox and the bundled real question bank. It does not send
notifications or write production data. It now covers approval/buffer/refresh, mobile rendering,
skipped PYQ capture without Journal, blind recovery, repeated interruption, saved drafts, and defer.
The SQL fixtures use transactions and roll back their seeded accounts and learning data.

Known inherited advisor warnings are `increment_llm_usage` search_path, public `citext`, and the
public access-request insert policy. Review separately; do not describe this as a zero-warning audit.
The build's `account-state.ts` dynamic/static import warning is non-blocking but remains a follow-up.

## Device and accessibility acceptance — still required

- Two authenticated clients: create/edit/delete a day, edit while another write is in flight,
  reconnect the stale client, and verify deleted days stay deleted. Check explicit recreation at
  the acknowledged revision and confirm conflicting local work is retained in the backup.
- Offline: edit capacity, reviews, typed PYQ blocks and templates; interrupt practice and recovery;
  close the app; reopen and reconnect. Confirm queue order, answers, elapsed work, hints, and the
  Planner receipt converge without duplicate attempt events.
- Android WebView: subject picker, nested modal dismissal, system Back, keyboard resize, app
  background/kill, process restart, and recovery resume on a physical device or configured emulator.
  `build:native` and mocked native component tests do not satisfy this requirement.
- Keyboard and screen reader: focus entry/trapping/restoration in the day dialog and nested subject
  picker; Escape must dismiss only the top dialog. Finish this audit before calling Phase 7 complete.
- Recheck mobile agenda and editor, desktop dark/light, reduced motion, labels, visible focus, and
  screen-reader announcements against the installed production assets.
- Perform a final row-by-row audit of all 31 recommendations. Confirm priority actions lead to
  exact relevant work, not merely another passive summary.

## Backup version 3 and conflicts

Settings exports owner-scoped study rows (including canonical learning items, append-only learning
events, and recovery sessions), full DayPlans, deletion tombstones, pending Planner mutations,
conflict copies, and typed templates. The file contains personal study data; store it privately.

Restore into the same signed-in account. Version 1/2 study-row imports remain supported. Version 3
Planner imports require an explicit active account, reject malformed intent and mixed-account rows
before writing, and merge versioned plans rather than replacing newer local work. Immutable receipts
are never overwritten. Restored outbox entries do not start network activity until normal flushing.

Deletion is a retained tombstone, not a physical row delete. A stale device cannot silently recreate
that day. Its conflicting local snapshot is retained as a diagnostic/recovery copy in the exported
`planner.conflicts` array, with the remote plan or tombstone and mutation identity. Conflict copies
are **not replayed** on import: inspect them and explicitly recreate/copy desired work against the
  current revision. Keep backups until conflicts are reconciled. Do not delete tombstones to resolve
an error, and do not bypass the versioned RPC with direct table writes.

Progress export is an analysis report with Planner summaries, not a replacement for the full JSON
backup. Use Settings backup for restoration.

## Rollback

Prefer a forward fix. Releasing an old frontend against the new Planner revision trigger can cause
old direct-upsert clients to fail. Keep the database schema, learning evidence, and tombstones
intact; never roll back by dropping learning tables, deleting history, or clearing pending writes.
If a deployment is rolled back, verify that its client understands the versioned mutation contract.
