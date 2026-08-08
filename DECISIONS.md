# Decision log

Append-only log of choices made during build that were NOT pre-specified in `BUILD.md`. Include date, choice, alternatives considered, and reason.

Format:

```
## YYYY-MM-DD — <short title>
**Chose**: <option>
**Rejected**: <other options>
**Reason**: <one sentence>
```

---

## 2026-07-17 — Repo location

**Chose**: subfolder `air-journal/` inside existing `Random/` repo.
**Rejected**: standalone new repo.
**Reason**: user already has a `Random/` catch-all; migrating to standalone is trivial later if desired.

## 2026-07-17 — Package manager

**Chose**: npm.
**Rejected**: pnpm, yarn, bun.
**Reason**: ubiquitous, Vercel default, no lockfile drama.

## 2026-07-17 — Repo location (supersedes earlier entry)

**Chose**: standalone git repo at `GATE PREP/air-journal/`.
**Rejected**: subfolder of a `Random/` repo.
**Reason**: no `Random/` repo exists on this machine; the build contract requires per-step commits, so the app gets its own repo.

## 2026-07-17 — Local Node version

**Chose**: build with local Node 26 (spec says 20 LTS).
**Rejected**: installing nvm + Node 20 locally.
**Reason**: all tooling used is Node-20-compatible; Vercel deploy target stays Node 20. Zero user attention required.

## 2026-07-17 — Invite-only enforcement mechanism

**Chose**: GoTrue signup enabled; a BEFORE INSERT trigger on `auth.users` rejects signups without a valid invite token (first-ever account exempt as owner bootstrap). AFTER INSERT trigger provisions profile, consumes invite, pairs buddies. Google OAuth is sign-in only.
**Rejected**: `enable_signup=false` + a service-role `redeem-invite` edge function.
**Reason**: keeps enforcement fully server-side (F1.1) with no extra edge function and no service-role key in more places.

## 2026-07-17 — Client-generated UUID primary keys

**Chose**: `crypto.randomUUID()` client-side becomes the canonical Postgres PK.
**Rejected**: `local_id` remap table from BUILD.md §5.5.
**Reason**: offline-first inserts need stable ids for FK chains before sync; client UUIDs make remapping unnecessary (simpler, fewer failure modes).

## 2026-07-17 — Session question-count target is ephemeral

**Chose**: keep the F2.1 question-count choice in the Zustand session store only.
**Rejected**: adding a `question_count` column to `sessions`.
**Reason**: the locked schema (§5.1) has no such column; the count only shapes in-session progress display.

## 2026-07-17 — Dev-only local sandbox on Auth screen

**Chose**: when Supabase env is missing AND `import.meta.env.DEV`, Auth offers "Enter local sandbox" (Dexie-only synthetic user).
**Rejected**: blocking all UI work until Supabase credentials exist.
**Reason**: lets the whole app be built and visually verified offline; unreachable in production builds.

## 2026-07-17 — Buddy tables are online-only

**Chose**: buddy/shared tables (buddies, shared_insights, question_shares, study_rooms) read via React Query from Supabase; not mirrored in Dexie.
**Rejected**: full offline mirror of buddy data.
**Reason**: §4 only requires offline-first for the user's own solo flow; buddy features are inherently online (realtime presence).

## 2026-07-17 — Re-attempt advancement is computed client-side

F3.3 says the server calls `advance_reattempt(id, result)`. Doing that from the client would break offline-first (result taggable offline) and double-apply once the row upsert syncs. Instead the client applies an identical pure transition (`src/lib/reattempt.ts advance()`) and persists via the normal sync path; the SQL function remains for server-side jobs (nightly cron). Semantics are byte-identical, verified by reattempt.test.ts.

## 2026-07-17 — Design pivot: dark instrument-panel → sunlit rank notebook

**Chose**: user-directed aesthetic override. Warm paper palette, red-pen vermilion brand, subject ink colors, highlighter motifs, springy micro-interactions (`motion` lib added). BUILD.md §2.8, §10, §17 amended in place.
**Rejected**: keeping the locked dark tokens; also rejected switching frameworks (FastAPI/other frontend) — stack unchanged.
**Reason**: user clarified "never look vibe-coded" meant colorful + magical + effortless, not dark minimal. Behavioral bans (no streaks, no emojis, no engagement bait, no gamified rewards) remain.

## 2026-07-18 — Extend tag flow with source metadata + question format

**Chose**: new SourceStep at head of TagFlow captures subject override, source kind (PYQ / Go Classes Quiz+DPP+Weekly / GATE Overflow / Other), PYQ year (past 35) + set (2014+), question number, format (MCQ/MSQ/NAT), marks (1/2 → target_time_sec 90s/180s), image upload for non-PYQ (client-compressed JPEG data URL on `image_url`).
**Rejected**: adding new schema columns for `source_kind`, `question_format`, `marks`.
**Reason**: `source_ref` and `image_url` are already free-form on the frozen schema. Encoding kind+year+set+qnum+format into a canonical `source_ref` (prefix-matchable for filter) keeps the schema stable; images ride the same offline sync path as any other row without needing Supabase Storage first. Journal filters + display parse the same canonical form.

## 2026-07-18 — Defer S18–S24 (LLM stack) until API keys land

**Chose**: build S25 (Weekly review) and later analytics/PWA steps ahead of S18–S24.
**Rejected**: strict S18 → S44 order per CLAUDE.md.
**Reason**: S18 rate-limit logic can be written and unit-tested with mocked fetch, but the provider adapters (Groq / Gemini / OpenRouter / Cerebras) can't be end-to-end verified without secrets, and S20–S24 UI is worthless without a working router. The tagging + weekly-review + re-attempt loop stands on its own — that's the mistake-surface engine. LLM assist is an augment; it will slot in later without churning the pages we ship now.

## 2026-07-18 — Scope amendment: production access flow + first-run UX + ambient insight (user-directed)

**Chose**: append three feature blocks to §7 — F1.4 request-access + email approval, F3.5 dashboard hero (name greeting + rotating one-liner + Groq weekly-read card), F8.5 production hardening (rate limits, deliverability, isolation audit, ops docs) — plus a first-run onboarding pass across every empty state so a stranger can gain value without reading BUILD.md.
**Rejected**: honouring §7 as frozen; deferring "aesthetic + production-ready + stranger-friendly" to a v2.
**Reason**: user's product standard is "production-ready features, not half-baked, easy for someone who knows nothing." Same precedent as the 2026-07-17 sunlit pivot — user is the authority; contract amends by explicit direction, not silent creep. Non-negotiables (§2), hard bans (§17), invite-only auth stay intact — the /request-access flow does not create accounts, it only lets outsiders ASK; owner still approves.

## 2026-07-18 — Email delivery via Resend, owner via env

**Chose**: Resend (esm.sh import in Deno edge functions) for owner-notify + invite-send + decline-send. Owner email lives in `OWNER_EMAIL` edge secret; owner identity in-DB is "first signed-up user" via `public.is_owner()` SQL helper.
**Rejected**: Supabase Auth's built-in SMTP (limited, and unrelated to transactional mail), Gmail SMTP via edge fn (deliverability worst, app-password fragile), SendGrid (older SDK, 100/day cap).
**Reason**: Resend has the best Deno DX, 3k free/mo covers the growth curve for a niche personal tool, and DKIM/SPF setup is a one-time onboarding. `is_owner()` avoids adding an `is_owner` column while keeping RLS enforceable server-side.

## 2026-07-21 — Remove provider-backed AI and strengthen Buddy

**Chose**: remove all AI-facing routes, calls, settings, secrets, generated variations, and synthesis surfaces. Keep Formulas and Trigger Drill as local/manual workflows. Move Buddy directly below Planner, add unread/live previews, strict request controls, latest-message loading, connection recovery, safer question payloads, and recipient-only read receipts. Add deterministic dashboard learning notes based on due work and observed outcomes/root causes.

**Reason**: direct user scope change. The resulting product has less maintenance and distraction while preserving the study loop and improving the one human collaboration surface.

## 2026-07-21 — Preserve Buddy history during production migration

**Chose**: remove the two table truncations from the still-unapplied `20260719000001` migration while retaining its case-insensitive duplicate guards and invite validation.

**Reason**: a normal production release must not erase existing Buddy pairs or messages. The remote migration ledger confirms this version has never run, so correcting the migration before its first production application is the safest additive path.

## 2026-07-21 — Opt-in Telegram daily study digest

**Chose**: replace the inactive WhatsApp path with a Telegram bot connected through a 15-minute one-time link. Deliver at most one study-only digest per local day, with separate idempotency from email and `/stop` support in Telegram.

**Rejected**: unofficial WhatsApp Web automation, user-pasted Telegram chat IDs, browser push, and motivational engagement messages.

**Reason**: Telegram is free at this two-user volume, while webhook-bound chat IDs, explicit opt-in, and narrow digest content keep delivery reliable and consistent with the product's low-distraction purpose.

## 2026-07-21 — Centralize Telegram settings and simplify day planning

**Chose**: keep Telegram connection, account status, delivery time, timezone, test delivery, disconnect, and the daily master switch in Settings only. Reduce the day modal to Study sessions and Review while retaining legacy local fields in storage for backward compatibility.

**Rejected**: notification controls inside Planner and the Day structure, Mindset & energy, and Non-study task sections.

**Reason**: direct user direction. Planner should carry only the study-planning workflow; delivery configuration belongs to a single, predictable control surface.

## 2026-07-21 — Android shell with current Capacitor runtime

**Chose**: Capacitor 8, Android package `in.airjournal.app`, one shared React build, edge-to-edge safe-area CSS, native lifecycle handling, and opt-out haptics.

**Rejected**: a remote-only WebView wrapper, a separate React Native rewrite, and the unmaintained Capacitor 7 line.

**Reason**: Capacitor preserves AIR Journal's tested local-first implementation while providing a maintained Android runtime and a clean path to native behavior without duplicating product logic; the required Node baseline moves from 20 to 22.

## 2026-07-21 — Bright data rails and parallel background hydration

**Chose**: retain the sunlit notebook identity with a brighter morning-paper palette, one shared table alignment system, compound IndexedDB indexes for common scoped lookups, and parallel deduplicated Supabase pulls.

**Rejected**: a generic white dashboard redesign and claims of literal O(1) remote fetching.

**Reason**: local keyed reads can be constant-time or logarithmic, but network latency and returned row count remain real. Parallel stale-while-revalidate hydration keeps the interface immediate while preserving complete multi-device sync semantics.

## 2026-07-22 — Private concealed answers for question verification

**Chose**: store an optional owner-only `questions.answer_text`, capture it in both Log and timed Sessions, and render it through one shared reveal control. Re-attempts do not render the reveal until the timer is finished; Journal and Session Review keep it concealed by default.

**Rejected**: placing answers in source metadata, auto-revealing after a timer, or including answers in Buddy question payloads.

**Reason**: one canonical field keeps offline sync and editing predictable, while an explicit reveal protects retrieval practice and prevents accidental spoilers.

## 2026-07-22 — User-directed live-shell Android release

**Chose**: add an explicitly named signed APK variant that loads the production HTTPS app and receives web-code releases through the existing Vercel/PWA update path.

**Rejected**: claiming the previously installed bundled APK could be updated remotely, or using the live shell for native plugin and permission changes.

**Reason**: the user explicitly prioritized one-time APK installation and direct future web updates; isolating this behavior to a separate build command keeps the normal offline-bundled release available and makes the online-first/origin-migration tradeoff explicit.

## 2026-07-22 — Confirm fully untagged question logs

**Chose**: interrupt a new Log or Session save only when both Pattern and Trigger are blank. The confirmation returns directly to tagging by default but preserves an explicit "Save without tags" override.

**Rejected**: making either field mandatory, warning when only one is blank, or using the browser's native confirmation popup.

**Reason**: one recognition cue is enough to keep a question useful, while a deliberate override preserves the sub-30-second flow for legitimate exceptions.

## 2026-08-02 — Evidence-first Dashboard and Analysis refinement

**Chose**: improve only the existing Dashboard, Patterns, Re-attempts, Weekly Review, Heatmap, Calibration, and Readiness surfaces; use the learner's profile timezone for calendar buckets, order content by unresolved work, disclose denominators and evidence confidence, temper sparse readiness inputs, require four committed calibration answers, and keep exam-score/rank estimates collapsed and explicitly experimental.

**Rejected**: adding new analytics pages, goals, notifications, leaderboards, opaque readiness certainty, or optimistic scores from missing data.

**Reason**: direct user direction to enhance the existing Dashboard and Analysis only; clearer evidence and one-action hierarchy reduce the chance that sparse or duplicated signals steer GATE preparation incorrectly.

## 2026-08-02 — Full PYQ practice bank inside AIR Journal

**Chose**: bundle every audited GATE CSE question from 2002–2026 as a subject-indexed, local-first practice bank with original options and diagrams, explicit answer provenance/status, committed answer capture, and an optional handoff into the existing AIR Journal analysis flow.

**Rejected**: a paper-download archive, question summaries, fabricated keys for defective papers, a second analytics model, and dependence on a live third-party question API during practice.

**Reason**: direct user clarification that AIR Journal itself should be the PYQ practice place, while preserving its existing mistake-analysis semantics and offline-first behavior.

## 2026-08-08 — Versioned immutable PYQ attempt receipts

**Chose**: capture each committed bank attempt as a versioned, immutable row containing the exact learner response, official key, bank/question snapshot, start/commit timestamps, and millisecond duration; keep known pre-fix rows explicitly marked as legacy.
**Rejected**: relying only on the mutable bundled bank, storing rounded time alone, or silently treating earlier session-era `selected_answer` values as trustworthy.
**Reason**: an honest attempt log must remain auditable across bank releases and retries without fabricating learner responses that cannot be recovered.

## 2026-08-08 — Decision-first dashboard instrument panel

**Chose**: widen only the desktop Dashboard, lead with one context-aware action, chart the trailing seven-day mistake surface, compress practice targets into one rail, and visualize the latest session as an outcome ring.
**Rejected**: a cosmetic card reskin, adding new analytics pages, goal/streak widgets, and a dense grid of equally weighted statistics.
**Reason**: the Dashboard should answer “what should I do next?” before it explains movement, while keeping due work, weekly focus, and session evidence visibly distinct.

## 2026-08-08 — One canonical topic for every bundled PYQ

**Chose**: classify all 2,388 audited questions into the user-provided GATE CSE subject/topic taxonomy, retain the noisy source tags only as provenance, split C Programming from Data Structure, and expose mixed-subject, complete-subject, and single-topic practice scopes. Keep the 17 obsolete Software Engineering questions in a clearly named Other / Optional archive rather than forcing them into an unrelated current topic.

**Rejected**: filtering directly on source tags, allowing a question to count in several practice topics, silently dropping optional-era questions, or inventing a misleading match for those questions.

**Reason**: one deterministic canonical topic makes counts, progress, Journal analysis, and repeatable practice sets stable while preserving every audited question exactly once.

## 2026-08-08 — Correct Engineering Mathematics topic boundary

**Chose**: define Engineering Mathematics as Linear Algebra, Calculus, and Probability & Statistics; move every mathematics probability question out of Discrete Mathematics and fold legacy numerical-method questions into Calculus.

**Rejected**: retaining the screenshot's Probability Theory placement under Discrete Mathematics or exposing Numerical Method as a fourth Engineering Mathematics topic.

**Reason**: direct user correction establishes the canonical practice taxonomy and keeps the subject picker aligned with the intended GATE preparation structure.

## 2026-08-08 — Content-first PYQ taxonomy corrections

**Chose**: review all 2,388 bundled PYQs against their full question text, lock 160 question-specific corrections with reasons, and make the primary tested concept win over wrapper concepts and noisy cross-link tags. The review also restores all 23 Software Engineering questions to Other / Optional; the earlier count of 17 omitted six that had leaked into unrelated subjects.

**Rejected**: trusting source-tag order as semantic truth, duplicating mixed questions across several topics, or silently accepting broad fallback topics when the question text identifies a more precise canonical topic.

**Reason**: topic-wise practice is only useful when every question has one stable, defensible home and future bank regeneration cannot reintroduce known errors.

## 2026-08-08 — Historical CSE coverage and syllabus-bounded ECE/EE Digital Logic

**Chose**: extend the local-first CSE bank to 1990, use the larger audited archive for each sparse pre-2002 year, and supplement Digital Logic with ECE and EE questions only when the primary concept maps to the project's four existing Digital Logic topics. Preserve descriptive questions with unsupported grading and store every diagram locally.

**Rejected**: treating one token question as complete year coverage, combining two older CSE archives without de-duplication, importing entire electronics folders, or admitting ADC/DAC, semiconductor memory, logic families, microprocessors, communications coding, transistor-level electronics, and analog wrappers because a source site placed them under a broad digital heading.

**Reason**: the user asked for 1990-to-current coverage and ECE/EE Digital Logic without leaving the current syllabus; explicit source selection, content-level classification hints, and a locked exclusion audit keep practice broad in years but narrow in concepts.
