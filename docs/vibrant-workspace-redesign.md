# Vibrant local workspace and stable Today

Completed on 2026-11-14 for the local desktop app.

## Interface

The shared workspace now uses a lighter, simpler layout with indigo primary actions, violet skill accents, and coral mock-review accents. Light and dark themes share the same hierarchy. Headers, buttons, navigation, practice setup, study hubs, and skill cards use flatter surfaces and consistent spacing. Today leads with one next action, followed by three study directions and compact shortcuts. Local save status stays readable without displaying a constantly changing timestamp.

## Today refresh fix

Database hydration previously replaced rows and notified subscribers even when the incoming records were identical. This could feed background learning work back into another refresh. Today also replaced its usable queue with a loading state whenever a background request started.

Hydration now compares stored JSON values and preserves row and snapshot identities when nothing changed. Real inserts, edits, and removals still notify subscribers. Today subscribes to its relevant tables, retains a usable queue during background refreshes, and updates planner revision only when reconciliation changes a commitment. Initial loading and owner/budget changes still wait for the appropriate snapshot.

## Verification

- Frontend: 153 test files, 888 tests passed, including unchanged-data hydration and a delayed background request that keeps the current action mounted.
- Desktop: 17 tests passed; TypeScript, ESLint, and macOS desktop packaging passed.
- Browser: four local checks passed. They cover a complete skill/practice/result flow, narrow navigation, seven screens at 390px and 1280px in both themes, and idle Today behavior with the local learning worker and realtime connection running.
- The idle regression check allows startup reconciliation to finish, then observes ten seconds without a loading transition and with bounded recovery requests. Normal periodic checks and updates after real study changes remain enabled.
- The installed desktop build was opened against the existing local workspace. Today remained settled during observation; local readiness and SQLite integrity checks passed. Hashes of the 79 original records in the four checked study collections were unchanged.

The previous application and a SQLite backup were retained locally before installing the updated build. No private study records or database files are included in the repository. These checks cover the observed regression and the tested flows; broader roadmap features and learning-effectiveness claims remain outside this release.
