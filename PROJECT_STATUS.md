# AIR Journal — Project Status and Handoff

Last updated: 2026-08-08 (Asia/Kolkata)

This is the first file to read when resuming work. Update it after every release,
deployment, or material change of plan. `BUILD.md` remains the product specification;
this file records what is actually finished, what is currently in progress, and what
must happen next.

## Current repository state

- Branch: `main`
- Last pushed product-code baseline: `af68f87` (`S20: prevent stale PYQ manifest crashes`)
- Production web deployment `dpl_92n7B3euFDpsNRqtHPHz4z1tWB63` is Ready at
  `https://air-journal-omega.vercel.app`.
- The pushed baseline includes the Android/mobile production work, automatic installed-PWA
  release activation, and the Telegram `/today` command recorded in its history.

## Topic-wise PYQ practice — deployed

- All 2,388 bundled question IDs now have exactly one canonical subject and topic.
- The bank is split into 14 subject archives and 95 selectable topic buckets; raw source
  tags remain attached only for provenance.
- PYQ setup supports one topic, an entire subject, or all mixed subjects without changing
  answer concealment, immutable attempt receipts, or offline behavior.
- C Programming and Data Structure are separate archives. Seventeen obsolete Software
  Engineering questions remain visible under Other / Optional rather than being mislabeled.
- Engineering Mathematics contains Linear Algebra, Calculus, and Probability & Statistics;
  probability is not grouped under Discrete Mathematics.
- `public/pyq/taxonomy-audit.json` records 2,388 unique questions and zero unclassified rows.
- Responsive local-browser QA passed at mobile and desktop sizes; a selected Sorting set
  opened with a merge-sort question and produced no browser console errors.
- The manifest and subject JSON requests are bank-versioned and network-first so an older
  installed service worker cannot mix stale taxonomy data with a new application bundle.
- Supabase migrations `20260807000001`, `20260807000002`, and `20260808000001` are applied
  remotely; durable PYQ sessions and immutable attempt receipts can sync across devices.

Release follow-up: rebuild Android only if shipping a new bundled-shell artifact; the
live-shell Android release receives the deployed web content automatically.

## PYQ 1990+ and ECE/EE Digital Logic expansion — implemented locally, release pending

- Expanded CSE coverage to 1990–2026, selecting the larger audited source for sparse
  pre-2002 paper years instead of stacking duplicate archives.
- Added 259 in-syllabus Digital Logic questions from GATE ECE and GATE EE: 189 ECE and
  70 EE, restricted to Number System, Boolean Algebra, Combinational Circuit, and
  Sequential Circuit.
- Explicitly excluded converter, memory, logic-family, microprocessor, Hamming-code,
  architecture, transistor-level, Markov-chain, and analog-wrapper questions.
- Regenerated the bank as `gate-1990-2026-v5-ece-ee-digital-logic`; all 3,170 IDs are
  unique and present exactly once across 14 subjects and 95 topics.
- Added `npm run pyq:audit` to verify every stored classification against the canonical
  classifier, all subject/topic totals, all manual corrections, and every bank version.
- The bank contains 3,076 gradeable answers; 94 special-status questions retain honest
  ambiguous, marks-to-all, or unsupported states without fabricated keys.

### Local audit verification

Run on 2026-08-08 before the expansion commit:

- `npm run pyq:audit` — passed; 3,170 unique questions, 160 locked corrections
- `npm run typecheck` — passed
- `npm run lint` — passed with zero warnings
- `npm run test` — 25 files passed, 140 tests passed
- `npm run build` — passed; PWA precache generated successfully

Release follow-up: deploy the regenerated static PYQ bank and app assets before calling
the expanded coverage live. No Supabase schema change is required.

### Current verification

Run on 2026-08-08 against commit `af68f87`:

- `npm run typecheck` — passed
- `npm run lint` — passed with zero warnings
- `npm run test` — 25 files passed, 140 tests passed
- `npm run build` — passed; PWA precache generated successfully

These checks do not mean the readiness edge function has been deployed or that current web
assets have been rebuilt into a new bundled Android release.

## Dashboard and Analysis refinement — implemented locally, release pending

Only existing Dashboard and Analysis capabilities were enhanced:

- Dashboard now leads with one context-aware action, separates due-now work from
  seven-day mistake-surface movement, removes duplicate prompts, uses profile-timezone
  day/week buckets, and labels stale weekly fixes.
- Patterns sorts by unresolved burden, exposes not-clean/open evidence, previews merge
  impact, and supports safe in-page undo with corrected counts.
- Re-attempts defines clean completion, compares target and elapsed time, advances to
  the next due question, and groups upcoming work without repeated scans.
- Weekly Review separates mistake volume from miss rate and reflects saved step state.
- Heatmap has open-ended and 7/30/90-day ranges, row denominators, concentration sorting,
  relative color semantics, and a working unspecified-cause Journal drill-down.
- Calibration combines MARK and 50/50 evidence, treats skipped questions as zero in
  policy expected value, separates answered-only EV, and requires four committed answers
  before recommending a policy.
- Readiness is evidence-tempered, confidence-labelled, deterministic, snapshot-aware,
  and ordered around next moves. Exam-score/rank estimates are collapsed and explicitly
  experimental. The weekly Supabase computation is implemented with client/edge parity.
- The first-run walkthrough now persists dismissal before navigation, eliminating the
  asynchronous reopen race found during responsive browser QA.

Release follow-up: deploy the readiness edge function/config in the intended Supabase
environment, push the local commits, deploy the web build, and perform physical Android
QA before rebuilding or distributing an APK/AAB. The local environment did not have the
Deno CLI, so the edge function was verified through shared-score parity tests, TypeScript,
ESLint, and Vitest rather than `deno check`.

## Shipped and pushed baseline

The pushed app includes the production-oriented Android/mobile pass:

- Capacitor Android app with application ID `in.airjournal.app`
- Mobile-first spacing, navigation and responsive component layouts
- Bottom navigation: Home, Log, Sessions, Journal, Planner and More
- Native back-navigation handling and haptics
- Question-first Re-attempt flow with an attempt timer
- Dashboard Due Today navigation into Re-attempts
- Overdue work rolls forward until completed
- Empty sessions are not logged and Last Session reflects a real session
- Mobile heatmap layout and overlap fixes
- Signed release APK workflow documented in `ANDROID.md`

The web app and Android wrapper share product code, but Android-only presentation and
native behavior are scoped so they do not change the desktop website layout.

Installed PWA copies now check for a release immediately, on resume, and every 15 minutes. When a
new service worker takes control of an already-open app, the page reloads once without
asking the learner to refresh or reinstall. The production bundle at
`https://air-journal-omega.vercel.app` was verified to contain this behavior on
2026-07-22.

## Implemented in code — deployment/release pending

Commit `0c9570d` adds a private concealed-answer feature:

- Optional `questions.answer_text` storage and TypeScript types
- Answer capture in manual Log and timed Sessions
- A shared concealed `AnswerReveal` control
- Answer reveal in Journal and Session Review
- Re-attempt answer reveal only after the attempt timer finishes
- Tests ensuring Buddy question sharing never includes the answer
- Migration: `supabase/migrations/20260722000001_question_answers.sql`

Relevant areas include `BUILD.md`, `DECISIONS.md`, question/source
draft models, `QuestionEditor`, Log, Session Active/Review, Journal, Re-attempts,
database types, tests, and the migration above.

Before calling this feature deployed and released:

1. Review the whole diff and confirm the reveal UX on a physical Android phone.
2. Apply/test the Supabase migration in the intended environment.
3. Verify offline creation, sync, editing, logout isolation, and multi-device hydration.
4. Confirm Buddy payloads omit `answer_text` at every boundary.
5. Re-run typecheck, lint, unit tests, production web build, and Android device QA.
6. Build and distribute a new web/Android release only after the checks above pass.

## Android release artifacts

### Live-shell automatic web-update APK

- Version: `1.1.1` (`versionCode 4`)
- Path: `android/app/build/outputs/apk/release/airjournal-live-release.apk`
- SHA-256: `5d3deed3c8b0176d43ab3574fb0f914dea3c0a37134559d16ee132a2818e9df9`
- Embedded origin: `https://air-journal-omega.vercel.app`
- Package: `in.airjournal.app`
- Signing certificate matches the previous signed Play bundle.
- Purpose: install once, then receive React/CSS/content releases from Vercel without
  another APK installation. Native changes still require a new APK.
- Migration warning: sync every pending local row in the old bundled APK before installing;
  the live shell uses the production HTTPS WebView origin and requires an online first launch.

### Existing direct-share installation upgrade

- Version: `1.1.1` (`versionCode 4`)
- Path: `android/app/build/outputs/apk/release/airjournal-live-friend.apk`
- SHA-256: `43474a4afb6cf0b3c67301d9c4a71ea94d96ea86d77f83b89ed93cd9c05424e6`
- Signing certificate matches the original direct-share APK so it installs in place
  without clearing the learner's app data.
- Verified installed and running on the connected Motorola test device.

### Existing direct-install APK

- Version: `1.0.0` (`versionCode 1`)
- Path: `android/app/build/outputs/apk/release/airjournal-release.apk`
- Purpose: direct/sideload installation

### Prepared Google Play bundle

- Version: `1.0.1` (`versionCode 2`)
- Path: `android/app/build/outputs/bundle/release/app-release.aab`
- Size when verified: approximately 1.9 MB
- Build task: signed `bundleRelease`
- Signature check: `jarsigner -verify` passed on 2026-07-22
- Purpose: Google Play Internal Testing; an AAB cannot be installed directly like an APK

The 1.0.1 AAB was produced before commit `0c9570d`. The concealed-answer feature is
**not** part of that Play build. Rebuild with a higher version code after its migration,
production build, native sync, and device QA are complete.

### Signing safety

- Upload keystore is outside the Git repository under the workspace `release/` folder.
- Signing credentials are in ignored `android/keystore.properties`.
- Never print, copy into documentation, or commit passwords, aliases, `.env` files,
  keystores, or `keystore.properties`.
- Back up the keystore and credentials securely before making a Play App Signing choice.

## Google Play Internal Testing — current plan

Goal: the friend installs AIR Journal once from the Play testing link and later receives
updates through Google Play instead of downloading a new APK each time.

Current state:

- Signed 1.0.1 AAB is ready.
- Play Console setup/upload has not started.
- Chrome control is working and Play Console was opened on 2026-07-22 under
  `kalyankrishnareddyb@gmail.com`.
- Google blocks developer-account creation until 2-step verification is enabled for
  that Google account. The Play Console setup page is open at that handoff point.
- The friend's Google account email is still needed when configuring the tester list.

Next Play steps:

1. Enable 2-step verification for `kalyankrishnareddyb@gmail.com`, then return to the
   open Play Console setup page.
2. Complete Google Play developer registration.
3. If developer registration, payment, identity verification, or legal acceptance is
   required, hand control to the user. Do not accept or pay automatically.
4. Create `AIR Journal` as an Android app using package `in.airjournal.app`.
5. Configure **Internal testing only**; do not publish to Production.
6. Pause at Play App Signing. Decide whether to import the existing signing key or let
   Play generate a new app-signing key. This choice is long-lived and affects whether
   the currently sideloaded APK can be updated in place.
7. Upload the signed AAB, add tester Gmail addresses, create the release, and share the
   opt-in link.
8. Verify install, sign-in, cloud sync, navigation, timers, haptics and back behavior on
   a physical phone.

If Play uses a different app-signing key from the sideloaded APK, the friend will need to
uninstall the sideloaded build once and install the Play build. Confirm cloud sync/export
before uninstalling so local-only data is not lost.

## Future Android update workflow

For each Play update:

1. Finish and verify the source changes.
2. Run `npm run typecheck`, `npm run lint`, `npm run test -- --run`, and the production build.
3. Sync the latest web assets into Capacitor Android.
4. Increment `versionCode` above every previously distributed code. Since code 4 is already
   distributed, the next Play bundle should use at least code 5.
5. Build a signed release AAB.
6. Upload it to the Internal testing track and roll it out to testers.

Google Play then distributes the update; testers with Play auto-update enabled normally
receive it automatically.

## Resume checklist

At the start of the next session:

```bash
cd "/Users/bkalyankrishnareddy/Desktop/GATE PREP/air-journal"
git status --short --branch
git log -3 --oneline --decorate
```

Then read, in order:

1. `PROJECT_STATUS.md`
2. `AGENTS.md`
3. `BUILD.md`
4. `ANDROID.md` for release work
5. `DECISIONS.md` for product tradeoffs

Preserve unrelated working-tree changes and never use destructive Git commands to make
the repository look clean.
