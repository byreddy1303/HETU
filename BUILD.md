# AIR Journal — Master Build Specification

**Authoritative source of truth for autonomous build.** Anything not stated here is a delegated choice; when in doubt, pick the option that (a) minimizes distraction surface, (b) minimizes maintenance, (c) ships faster. Never invent new features not in this document.

## Active scope amendment — 2026-07-21

The user removed all AI-backed product features. This amendment supersedes every AI/LLM feature, provider, route, secret, deployment, and Definition-of-Done item below. Doubt Chat, Triangulate, generated variations, formula extraction, reflex scoring, weekly synthesis, and weekly insight are not part of the active product. Formulas and Trigger Drill remain as local/manual tools. Historical additive database migrations may remain for deployed-schema compatibility, but the client does not expose or sync those legacy tables. Buddy now sits immediately below Planner and the dashboard provides deterministic learning tips derived from the learner's own data.

## Android production amendment — 2026-07-21

At the user's direction, AIR Journal also ships as an Android application from the same React codebase. Capacitor is the native runtime; the PWA and browser deployment remain first-class and must keep identical study data semantics. The Android shell must preserve Dexie-first offline behavior, invite-only authentication, RLS, and every hard ban below. Native feedback is restrained: haptics acknowledge selection, successful work, and errors only, are user-disableable, and never create engagement loops. Android system bars, safe areas, keyboard resize, back navigation, app resume, and release signing are part of production readiness. Node 22+ is the new build-tool baseline required by the maintained Capacitor runtime; this supersedes the older Node 20 build-tool entry.

## Android direct web-update amendment — 2026-07-22

At the user's direction, a separately named signed Android release may load the production AIR Journal HTTPS deployment so already-installed copies receive React, CSS, and content releases after a push to `main`, without another APK install. This live-shell release requires an online first launch; the production PWA service worker supplies cached offline launches afterward. Native code, permissions, Capacitor plugins, and signing changes still require a newly installed APK. Moving from the earlier bundled-shell APK changes the WebView origin, so all pending local rows must sync before installing the live-shell release.

## Daily digest exception — 2026-07-21

At the user's direction, an optional Telegram bot may send one deterministic daily study digest containing only the learner's open planner items, due re-attempts, and Monday weekly fix. Each user must explicitly connect and may pause or disconnect at any time. Browser/device push remains banned. The Telegram message must not contain streaks, shame, engagement bait, or autoplaying follow-ups. Email remains an optional secondary delivery channel; WhatsApp is not active.

Telegram connection, delivery time, timezone, test delivery, disconnect, and the daily on/off control live only in Settings. Planner remains planning-only. Its day modal contains Study sessions and Review; Day structure, Mindset & energy, and Non-study tasks are no longer shown. Legacy locally stored fields may remain readable for backward compatibility but are not part of new day planning.

The private bot supports `/today` for the connected user's local-date plan and due re-attempts, `/tomorrow` for the next-day plan, and `/timetable` for the current Monday-to-Sunday plan.

## Dashboard and analysis trust amendment — 2026-08-02

At the user's direction, the existing Dashboard and Analysis surfaces prioritize the next useful action and make uncertainty explicit; this is a refinement of existing features, not a new product surface. Every day/week bucket uses the profile timezone. Dashboard shows one context-aware primary action, separates due-now work from the seven-day mistake-surface movement, avoids duplicate prompts, and labels stale weekly fixes. Patterns sort by unresolved burden, expose not-clean/open evidence, preview merge impact, and allow an in-page undo. Re-attempts define a clean result as an unaided answer plus method, compare elapsed and target time, advance directly to the next due item, and group upcoming work by date.

Weekly Review distinguishes volume from miss rate and only marks steps complete when their data is actually saved. Heatmap filters support open-ended and preset ranges, sort by concentration, and disclose attempt denominators and relative color semantics. Readiness remains a confidence signal rather than a prediction: sparse evidence tempers component scores, subject rows disclose evidence confidence, historical comparisons require comparable weekly snapshots, and rank/score simulation stays collapsed and explicitly experimental. Calibration combines MARK and 50/50 committed answers, counts skips as zero in policy expected value, separates answered-only expected value, and withholds recommendations until four committed answers exist.

---

## 0. Autonomy directives (for Claude executing this doc)

You are building this app on behalf of a GATE 2027 CSE aspirant targeting AIR <100 at IISc. The user has granted autonomous execution. Follow these rules while building:

1. **Do not ask the user for decisions already made in this doc.** Every stack pick, feature scope, and data-model choice is locked below.
2. **Build strictly in Phase order.** Do not skip ahead. Complete Phase N acceptance criteria before starting Phase N+1.
3. **Commit after each completed phase** with message `phase-N: <summary>`. Never squash. Never force-push.
4. **After each phase**: run `npm run typecheck`, `npm run lint`, `npm run test` (if tests exist for that phase). All must pass before committing.
5. **If you hit ambiguity not covered here**: pick the simpler, more conservative option, document the decision in `DECISIONS.md`, keep moving. Do not wait.
6. **Never add features not in this doc.** No "while I'm here" scope creep. If you think a feature is missing, add a line to `FUTURE.md` and continue.
7. **Do not break the non-negotiables in §2.** They're non-negotiable for a reason — the app is designed to reduce user compulsions, not amplify them.
8. **Report progress at end of each phase**: what was built, what tests pass, what's next. Terse. No apologies, no filler.
9. **Do not delete files or overwrite prior work without cause.** If a scaffold file exists (see §14), read it and extend it.
10. **Never call `--no-verify`, `--force`, or `reset --hard` on the user's behalf.**

---

## 1. Mission

**Product**: AIR Journal — a local-first, multi-user GATE PYQ analysis app that captures every solved question as structured data (outcome / pattern / trigger / root cause), schedules spaced re-attempts, integrates free LLMs for doubt clearing and question-variation generation, and surfaces one weekly "upstream weakness" for focused fixing.

**Users**: 2 initially (owner + one study buddy). Multi-tenant from day one; more users later require zero code changes, only invites.

**Success metric for the user (not the code)**: By Oct 31, 2026 — ≥ 300 tagged PYQs, Sunday review completed 12/14 weeks, weekly root-cause tree names exactly one fix, gap between practice score and honest-exam score narrowing week-over-week.

**Success metric for the code**: All acceptance criteria in §7 pass. `npm run build` succeeds. Deployed to Vercel + Supabase, PWA installable on Android + iOS.

---

## 2. Non-negotiables (hard-coded into the app)

These are enforced in code, tests, or CI — not left to willpower.

1. **Tag flow must complete in ≤ 30 seconds median.** Vitest performance test in `src/__tests__/tag-flow.perf.test.ts` fails CI if median > 30s over 20 simulated runs.
2. **LLM calls are rate-limited server-side to 100/user/day.** Enforced in edge function; client cannot override.
3. **No browser/device push notifications.** ESLint bans `Notification`, `PushManager`, manual push registration, and `.showNotification(`. The sole proactive-message exception is the user-directed, opt-in daily Telegram study digest defined in the 2026-07-21 scope amendment.
4. **No streak-based dopamine.** No consecutive-day counters, no "streak broken" screens, no fire emojis, no ✅ celebrations. Skipping is silent and forgiven.
5. **No LLM auto-tagging.** LLM never sets `outcome`, `root_cause`, `pattern_name`, `insight`, or `this_weeks_fix`. Attempting to do so at DB level triggers a check constraint failure. See migration `20260717000004_ai_boundaries.sql`.
6. **Feature freeze on 2026-10-31.** After this date, `git hooks/pre-commit` blocks commits touching `src/pages/` or `src/components/` unless the commit message starts with `fix:`. Only bug fixes allowed post-freeze.
7. **No emojis in UI text.** ESLint rule bans emoji unicode ranges in JSX text and string literals under `src/`.
8. **Motion and color serve feedback, not engagement.** (Amended 2026-07-17, user-directed.) Springy micro-interactions, color-rich surfaces, and celebration on *completed work* are in. Autoplaying attention-grabbers, badges, XP, and gamified reward loops stay banned.
9. **Tag flow works offline.** Playwright test toggles offline, tags 5 questions, comes online, verifies sync.
10. **Weekly review is user-first, LLM-second.** The `weekly-review` flow will not render the LLM synthesis pane until the user has submitted their own `root_cause_summary` and `weakest_concept`. Enforced by state machine.

---

## 3. Locked stack

Do not change these. Do not evaluate alternatives.

| Layer | Choice | Reason (locked) |
|---|---|---|
| Frontend framework | React 18 + Vite + TypeScript | Fast dev loop, small builds |
| Styling | Tailwind CSS 3 + custom design tokens | No CSS bikeshedding |
| UI primitives | Custom (see `src/components/ui/`) | shadcn-inspired, no external lib |
| State | Zustand | Simple, no boilerplate |
| Server state | @tanstack/react-query | Cache + sync + retries |
| Local DB | Dexie.js (IndexedDB) | Offline-first, primary read source |
| Routing | react-router-dom v6 | Standard |
| Charts | Recharts | Enough for our 4 chart types |
| Icons | lucide-react | Consistent line icons |
| Motion | framer-motion | Only for feedback transitions |
| Auth | Supabase Auth (magic link + Google OAuth) | Passwordless |
| Backend DB | Supabase Postgres 15 | RLS-first |
| Edge functions | Supabase Edge Functions (Deno) | Colocated with DB |
| LLM providers | Groq, Google AI Studio (Gemini), OpenRouter, Cerebras | All free tier |
| OCR | tesseract.js (client-side) | Free, offline |
| Testing | Vitest + Playwright | Standard |
| Hosting (frontend) | Vercel Hobby | Free, auto-deploy from `main` |
| Hosting (backend) | Supabase Free | Sufficient for 2 users |
| PWA | vite-plugin-pwa | Workbox-backed |
| Error tracking | Sentry (free tier) | Only errors, no analytics |
| Package manager | npm | Ubiquitous |
| Node version | 20 LTS | Match Vercel default |

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite PWA)                                │
│  • Zustand state · Tailwind · shadcn-style primitives         │
│  • Dexie.js (IndexedDB) — PRIMARY read/write, source of truth │
│    for UI. Optimistic writes.                                 │
│  • React Query — background sync to Supabase                  │
│  • Service worker — offline shell + cached queries            │
└─────────────────┬────────────────────────────────────────────┘
                  │  HTTPS (JWT via Supabase Auth session)
┌─────────────────┴────────────────────────────────────────────┐
│  Supabase                                                     │
│  • Postgres 15 with RLS on every user-owned table            │
│  • Auth (magic link + Google OAuth, invite-only signup)      │
│  • Realtime (buddy tables only — no per-question realtime)   │
│  • Edge Functions (Deno):                                     │
│    - llm-router          (POST /llm — proxy + rate limit)    │
│    - schedule-reattempts (cron nightly, advance ladder)      │
│    - compute-readiness   (cron weekly, recompute score)      │
│  • Storage (question images, weekly PDF exports)              │
└─────────────────┬────────────────────────────────────────────┘
                  │  Server-side calls only (secrets never leak to client)
        ┌─────────┴─────────────────────────────┐
        │  LLM providers (free-tier only)        │
        │  • Groq — Llama 3.3 70B (default)      │
        │  • Google AI Studio — Gemini 2.5 Pro   │
        │  • OpenRouter — DeepSeek R1            │
        │  • Cerebras — Llama 3.3 (reflex speed) │
        └────────────────────────────────────────┘
```

Local-first flow: **all UI reads from Dexie**. Writes go to Dexie synchronously; React Query mutation runs in background and pushes to Supabase. Realtime subscription reconciles on remote changes (buddy-shared tables only). No spinner in the tag flow — everything is optimistic.

---

## 5. Data model

### 5.1 Postgres schema (authoritative)

File: `supabase/migrations/20260717000001_initial_schema.sql`

```sql
create extension if not exists "uuid-ossp";

create type outcome_t as enum ('R','RBS','RBG','W-C','W-E','W-R');
create type root_cause_t as enum ('concept','formula','reading','computation','strategy');
create type mark_decision_t as enum ('MARK','SKIP','FIFTY_FIFTY');
create type reattempt_stage_t as enum ('D3','D10','D30','MASTERED');
create type buddy_status_t as enum ('pending','active','paused');
create type share_status_t as enum ('sent','solved','discussed');
create type llm_provider_t as enum ('groq','gemini','openrouter','cerebras');
create type llm_use_t as enum ('quick_explain','deep_doubt','triangulate','long_context','reflex_score','variation','formula_extract');

-- Core per-user
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  exam_date     date default '2027-02-06',
  target_rank   int  default 100,
  sadhana_practice boolean default false,
  timezone      text default 'Asia/Kolkata',
  created_at    timestamptz not null default now()
);

create table sessions (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references users(id) on delete cascade,
  date                 date not null default current_date,
  subject              text not null,
  target_duration_min  int  not null default 90,
  actual_duration_min  int,
  insight              text,               -- USER-WRITTEN ONLY (see §2.5)
  sadhana_done         boolean default false,
  interruptions_count  int default 0,
  created_at           timestamptz not null default now()
);

create table questions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  session_id        uuid references sessions(id) on delete set null,
  subject           text not null,
  subtopic          text,
  source_year       int,                    -- e.g. 2019
  source_ref        text,                   -- e.g. "GATE CS 2019 Q23"
  question_text     text,
  answer_text       text,                   -- OWNER-ONLY; concealed by default
  image_url         text,
  time_spent_sec    int not null,
  target_time_sec   int default 120,
  outcome           outcome_t not null,     -- USER-SET ONLY
  pattern_name      text,                   -- USER-SET ONLY (3-5 words)
  trigger_sentence  text,                   -- USER-SET ONLY
  root_cause        root_cause_t,           -- USER-SET ONLY
  mark_decision     mark_decision_t,
  mark_correct      boolean,
  created_at        timestamptz not null default now()
);

create table patterns (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  name           text not null,
  subject        text not null,
  count          int not null default 1,
  is_reflexed    boolean default false,
  mastery_level  int default 0 check (mastery_level between 0 and 4),
  first_seen_at  timestamptz not null default now(),
  unique(user_id, name)
);

create table reattempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  scheduled_date  date not null,
  stage           reattempt_stage_t not null default 'D3',
  history         jsonb not null default '[]'::jsonb,  -- [{date, result, timeSpent}]
  created_at      timestamptz not null default now()
);

create table formulas (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  name           text not null,
  subject        text not null,
  expression     text not null,
  forgot_count   int default 0,
  last_reviewed  date,
  next_review    date not null default current_date,
  created_at     timestamptz not null default now()
);

create table trigger_phrases (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  phrase            text not null,
  concept           text not null,
  reflex_time_ms    int,
  question_ids      uuid[] default '{}'::uuid[],
  created_at        timestamptz not null default now()
);

create table weekly_reviews (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references users(id) on delete cascade,
  week_start            date not null,
  root_cause_summary    text,   -- USER-WRITTEN FIRST
  weakest_concept       text,   -- USER-WRITTEN FIRST
  this_weeks_fix        text,   -- USER-WRITTEN FIRST
  llm_synthesis         text,   -- Populated only after user submits above
  created_at            timestamptz not null default now(),
  unique(user_id, week_start)
);

create table interruption_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  session_id  uuid not null references sessions(id) on delete cascade,
  ts          timestamptz not null default now(),
  kind        text not null  -- 'tab_switch' | 'idle' | 'exit'
);

-- AI activity (audit + rate limit)
create table doubt_sessions (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  question_id    uuid references questions(id) on delete set null,
  use_case       llm_use_t not null,
  template_used  text,
  user_input     text not null,
  provider       llm_provider_t not null,
  model          text not null,
  response       text not null,
  latency_ms     int,
  was_helpful    boolean,
  created_at     timestamptz not null default now()
);

create table variations (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references users(id) on delete cascade,
  parent_question_id    uuid not null references questions(id) on delete cascade,
  generated_text        text not null,
  added_to_reattempt    boolean default false,
  created_at            timestamptz not null default now()
);

create table triangulate_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  prompt            text not null,
  groq_resp         text,
  gemini_resp       text,
  openrouter_resp   text,
  user_conclusion   text,
  disagreement_noted text,
  created_at        timestamptz not null default now()
);

create table llm_usage_daily (
  user_id  uuid not null references users(id) on delete cascade,
  day      date not null,
  count    int not null default 0,
  primary key (user_id, day)
);

-- Multi-user / buddy
create table buddies (
  id          uuid primary key default uuid_generate_v4(),
  user_a      uuid not null references users(id) on delete cascade,
  user_b      uuid not null references users(id) on delete cascade,
  status      buddy_status_t not null default 'pending',
  created_at  timestamptz not null default now(),
  unique(user_a, user_b),
  check (user_a < user_b)   -- enforce canonical ordering
);

create table shared_insights (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  week_start   date not null,
  insight      text not null,
  created_at   timestamptz not null default now(),
  unique(user_id, week_start)
);

create table question_shares (
  id           uuid primary key default uuid_generate_v4(),
  from_user    uuid not null references users(id) on delete cascade,
  to_user      uuid not null references users(id) on delete cascade,
  question_id  uuid not null references questions(id),
  note         text,
  status       share_status_t not null default 'sent',
  created_at   timestamptz not null default now()
);

create table study_rooms (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  subject        text not null,
  start_time     timestamptz not null,
  duration_min   int not null default 90,
  participants   uuid[] not null,
  created_by     uuid not null references users(id) on delete cascade,
  created_at     timestamptz not null default now()
);

create table study_room_presence (
  room_id     uuid not null references study_rooms(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- System
create table invites (
  id          uuid primary key default uuid_generate_v4(),
  token       text not null unique,
  issued_by   uuid not null references users(id) on delete cascade,
  used_by     uuid references users(id),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Indexes
create index on questions(user_id, created_at desc);
create index on questions(user_id, outcome);
create index on questions(user_id, subject);
create index on reattempts(user_id, scheduled_date);
create index on patterns(user_id, count desc);
create index on formulas(user_id, next_review);
create index on doubt_sessions(user_id, created_at desc);
create index on buddies(user_a);
create index on buddies(user_b);
```

### 5.2 RLS policies

File: `supabase/migrations/20260717000002_rls_policies.sql`

Every user-owned table follows the same pattern:

```sql
alter table users enable row level security;
create policy sel_self on users for select using (id = auth.uid());
create policy upd_self on users for update using (id = auth.uid());

-- Template for all user_id-scoped tables (repeat per table):
alter table sessions enable row level security;
create policy sel_own on sessions for select using (user_id = auth.uid());
create policy ins_own on sessions for insert with check (user_id = auth.uid());
create policy upd_own on sessions for update using (user_id = auth.uid());
create policy del_own on sessions for delete using (user_id = auth.uid());
-- Repeat for: questions, patterns, reattempts, formulas, trigger_phrases,
-- weekly_reviews, interruption_logs, doubt_sessions, variations,
-- triangulate_logs, llm_usage_daily, shared_insights

-- Buddy tables: bidirectional access for both members
alter table buddies enable row level security;
create policy sel_involved on buddies for select
  using (user_a = auth.uid() or user_b = auth.uid());
create policy ins_self on buddies for insert
  with check (user_a = auth.uid() or user_b = auth.uid());
create policy upd_involved on buddies for update
  using (user_a = auth.uid() or user_b = auth.uid());

-- Shared insights: readable by any active buddy
alter table shared_insights enable row level security;
create policy sel_own_or_buddy on shared_insights for select using (
  user_id = auth.uid()
  or exists (
    select 1 from buddies b
    where b.status = 'active'
      and ((b.user_a = auth.uid() and b.user_b = shared_insights.user_id)
        or (b.user_b = auth.uid() and b.user_a = shared_insights.user_id))
  )
);
create policy ins_own on shared_insights for insert with check (user_id = auth.uid());
create policy upd_own on shared_insights for update using (user_id = auth.uid());
create policy del_own on shared_insights for delete using (user_id = auth.uid());

-- Question shares: from_user or to_user can see
alter table question_shares enable row level security;
create policy sel_involved on question_shares for select
  using (from_user = auth.uid() or to_user = auth.uid());
create policy ins_from on question_shares for insert
  with check (from_user = auth.uid());
create policy upd_to on question_shares for update
  using (to_user = auth.uid());  -- only recipient updates status

-- Study rooms: participants only
alter table study_rooms enable row level security;
create policy sel_participant on study_rooms for select
  using (auth.uid() = any(participants));
create policy ins_creator on study_rooms for insert
  with check (created_by = auth.uid() and auth.uid() = any(participants));

alter table study_room_presence enable row level security;
create policy sel_participant on study_room_presence for select using (
  exists (select 1 from study_rooms r
    where r.id = room_id and auth.uid() = any(r.participants))
);
create policy ins_self on study_room_presence for insert with check (user_id = auth.uid());
create policy del_self on study_room_presence for delete using (user_id = auth.uid());

-- Invites: any authenticated user can read by token (needed for signup flow)
alter table invites enable row level security;
create policy sel_by_token on invites for select using (true);
create policy ins_own on invites for insert with check (issued_by = auth.uid());
create policy upd_use on invites for update using (used_by is null);
```

### 5.3 AI-boundary constraints

File: `supabase/migrations/20260717000004_ai_boundaries.sql`

```sql
-- Enforce that LLM-derived fields cannot appear in user-authored tables
-- via naming convention: any INSERT/UPDATE with a source column marked
-- 'llm' on outcome, root_cause, pattern_name is rejected.

-- We use a trigger to log any suspicious writes.
create table ai_boundary_violations (
  id           uuid primary key default uuid_generate_v4(),
  table_name   text not null,
  attempted_at timestamptz not null default now(),
  user_id      uuid,
  details      jsonb
);

-- Application-level rule: use_case in doubt_sessions must never be
-- 'auto_tag' or similar. Enforced by enum (no such value exists).
```

### 5.4 Cron functions (in-DB)

File: `supabase/migrations/20260717000003_functions.sql`

```sql
-- Function: advance re-attempt ladder based on latest history entry
create or replace function advance_reattempt(reattempt_id uuid, result text)
returns void language plpgsql security definer as $$
declare
  cur_stage reattempt_stage_t;
  next_date date;
  next_stage reattempt_stage_t;
begin
  select stage into cur_stage from reattempts where id = reattempt_id;
  if result = 'clean' then
    if cur_stage = 'D3'  then next_stage := 'D10';     next_date := current_date + 10;
    elsif cur_stage = 'D10' then next_stage := 'D30';  next_date := current_date + 30;
    elsif cur_stage = 'D30' then next_stage := 'MASTERED'; next_date := null;
    else next_stage := cur_stage; next_date := null;
    end if;
  else
    next_stage := 'D3';   -- reset ladder on failure
    next_date := current_date + 3;
  end if;

  update reattempts
    set stage = next_stage,
        scheduled_date = coalesce(next_date, scheduled_date),
        history = history || jsonb_build_object(
          'date', current_date, 'result', result)
    where id = reattempt_id;
end $$;

-- Function: nightly LLM-usage reset is unnecessary; the compound PK
-- llm_usage_daily(user_id, day) rotates naturally per date.
```

### 5.5 Dexie (client) schema

File: `src/lib/db.ts` — mirrors Postgres 1:1 except:
- No RLS (client-side, trusted per-user)
- `sync_status` column added: `'synced' | 'pending' | 'error'`
- `local_id` string for optimistic-insert rows before Supabase confirms UUID

---

## 6. Complete file tree

Every file to create. Files already scaffolded during setup are marked `[SCAFFOLD]`.

```
air-journal/
├── BUILD.md                                    [SCAFFOLD]
├── CLAUDE.md
├── README.md
├── FROZEN.md
├── DECISIONS.md
├── FUTURE.md
├── package.json                                [SCAFFOLD]
├── tsconfig.json                               [SCAFFOLD]
├── tsconfig.node.json                          [SCAFFOLD]
├── vite.config.ts                              [SCAFFOLD]
├── tailwind.config.js                          [SCAFFOLD]
├── postcss.config.js                           [SCAFFOLD]
├── index.html                                  [SCAFFOLD]
├── .env.example                                [SCAFFOLD]
├── .gitignore                                  [SCAFFOLD]
├── .eslintrc.cjs
├── .prettierrc
├── playwright.config.ts
├── vitest.config.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260717000001_initial_schema.sql
│   │   ├── 20260717000002_rls_policies.sql
│   │   ├── 20260717000003_functions.sql
│   │   └── 20260717000004_ai_boundaries.sql
│   └── functions/
│       ├── llm-router/index.ts
│       ├── schedule-reattempts/index.ts
│       └── compute-readiness/index.ts
├── public/
│   ├── manifest.json
│   ├── favicon.svg
│   ├── icon-192.png            (generated)
│   └── icon-512.png            (generated)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx
    ├── index.css
    ├── types/
    │   ├── index.ts
    │   └── db.ts
    ├── lib/
    │   ├── supabase.ts
    │   ├── db.ts                  (Dexie schema + helpers)
    │   ├── sync.ts                (React Query <-> Supabase <-> Dexie)
    │   ├── llm.ts                 (client-side LLM call helper)
    │   ├── reattempt.ts           (ladder math)
    │   ├── analysis.ts            (root-cause tree, weakness computation)
    │   ├── readiness.ts           (composite readiness score)
    │   ├── prompts.ts             (all LLM prompt templates — see §9)
    │   ├── utils.ts               (cn, formatDate, debounce, etc.)
    │   ├── constants.ts           (subjects, outcomes labels, etc.)
    │   └── flags.ts               (feature-freeze date check)
    ├── stores/
    │   ├── auth.ts
    │   ├── session.ts             (active session state)
    │   └── ui.ts                  (nav collapsed, theme, etc.)
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useSync.ts
    │   ├── useLLM.ts
    │   ├── useTimer.ts
    │   ├── useKeyboard.ts
    │   ├── useVisibilityChange.ts (tab-switch interruption log)
    │   └── useReattempts.ts
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Input.tsx
    │   │   ├── Textarea.tsx
    │   │   ├── Select.tsx
    │   │   ├── Card.tsx
    │   │   ├── Dialog.tsx
    │   │   ├── Toast.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Tabs.tsx
    │   │   ├── Empty.tsx
    │   │   ├── Progress.tsx
    │   │   └── Kbd.tsx
    │   ├── layout/
    │   │   ├── Shell.tsx
    │   │   ├── Nav.tsx
    │   │   ├── MobileTabs.tsx
    │   │   └── PageHeader.tsx
    │   ├── tags/
    │   │   ├── TagFlow.tsx         (4-step tag pipeline)
    │   │   ├── OutcomeStep.tsx
    │   │   ├── PatternStep.tsx
    │   │   ├── TriggerStep.tsx
    │   │   └── RootCauseStep.tsx
    │   ├── charts/
    │   │   ├── Heatmap.tsx         (subject × subtopic × root_cause)
    │   │   ├── ReadinessGauge.tsx
    │   │   ├── SurfaceChart.tsx    (mistake surface over time)
    │   │   └── DecayCurve.tsx      (retention decay)
    │   └── shared/
    │       ├── Timer.tsx
    │       ├── QuestionCard.tsx
    │       ├── PatternPill.tsx
    │       ├── OutcomeBadge.tsx
    │       ├── LoadingScreen.tsx
    │       ├── OfflineBadge.tsx
    │       └── ImportInvite.tsx
    ├── pages/
    │   ├── Auth.tsx
    │   ├── Dashboard.tsx
    │   ├── SessionNew.tsx
    │   ├── SessionActive.tsx
    │   ├── SessionReview.tsx        (post-session summary)
    │   ├── Journal.tsx
    │   ├── Patterns.tsx
    │   ├── Reattempts.tsx
    │   ├── WeeklyReview.tsx         (5-step guided flow)
    │   ├── TriggerDrill.tsx
    │   ├── Formulas.tsx
    │   ├── Calibration.tsx
    │   ├── DoubtChat.tsx
    │   ├── Triangulate.tsx
    │   ├── HeatmapPage.tsx
    │   ├── Readiness.tsx
    │   ├── Buddy.tsx                (list + invite)
    │   ├── BuddyInsights.tsx
    │   ├── BuddyDoubts.tsx
    │   ├── StudyRoom.tsx
    │   ├── CompareWeakSpots.tsx
    │   ├── Settings.tsx
    │   └── NotFound.tsx
    └── __tests__/
        ├── tag-flow.perf.test.ts
        ├── reattempt.test.ts
        ├── analysis.test.ts
        ├── readiness.test.ts
        └── e2e/
            ├── auth.spec.ts
            ├── tag-flow.spec.ts
            ├── offline-sync.spec.ts
            └── buddy-invite.spec.ts
```

---

## 7. Feature spec (grouped by phase, with acceptance criteria)

Each feature has a **Definition of Done (DoD)** — a testable condition. Do not mark a feature complete until DoD passes.

### Phase 1 — Foundation (must ship first)

**F1.1 — Auth flow (magic link + Google OAuth + invite-only)**
- Sign up: only via invite token in URL (`/auth?invite=<token>`); free sign-ups rejected server-side.
- Sign in: magic link primary, Google OAuth secondary.
- Session persisted; refresh works; sign out clears local Dexie.
- DoD: Playwright test `auth.spec.ts` — invalid invite → error, valid invite → account created, sign-out → redirect, sign-in again → dashboard.

**F1.2 — Design system + shell + navigation**
- Forest Ledger light base, tokens per `tailwind.config.js`.
- Left nav (desktop), bottom tabs (mobile). Nav items: Dashboard, Session, Journal, Analysis (submenu: Patterns, Re-attempts, Weekly, Heatmap), Learn (submenu: Doubt, Triangulate, Trigger drill, Formulas), Buddy, Settings.
- DoD: All primitives render in a Storybook-less demo route `/dev/primitives` (dev only). Visual QA by user.

**F1.3 — Dexie schema + Supabase client + sync layer**
- Dexie tables mirror Postgres.
- Every write to Dexie triggers React Query mutation to sync.
- On failure, row keeps `sync_status='pending'`; retry with exponential backoff.
- DoD: unit test `sync.test.ts` — offline write, come online, row syncs; conflict resolution logs to console.

### Phase 2 — Session + tag flow

**F2.1 — Session creation**
- `/session/new`: pick subject, target duration (30/60/90/120 min), question count (5/10/15/20/full paper).
- Creates `sessions` row; navigates to `/session/:id/solve`.
- DoD: session appears in journal within 100ms; row synced within 2s of online.

**F2.2 — Active session with timer + tag flow**
- Timer counts up per question; user hits "Next" to log time and open tag flow.
- Source capture accepts the exact question and an optional owner-only answer/solution. Answers
  must never be included in Buddy question sharing.
- Tag flow: 4 sequential screens (Outcome → Pattern → Trigger → Root Cause), keyboard shortcuts.
  - Outcome keys: `r`, `s`, `g`, `1`, `2`, `3` (mapping in `constants.ts`).
  - Skip Root Cause if outcome is `R`.
- Pattern name has autocomplete from existing `patterns` (Levenshtein distance ≤ 2).
- If both Pattern and Trigger are empty at save time, ask for explicit confirmation before logging.
- Full flow must complete in ≤ 30s (perf test enforces).
- DoD: perf test passes; e2e test tags 5 questions offline and syncs.

**F2.3 — Interruption logging**
- On `visibilitychange` during active session → insert into `interruption_logs`, increment `sessions.interruptions_count`.
- Displays subtle "1 interruption" indicator; no shaming copy.
- DoD: e2e test switches tab twice, count = 2.

**F2.4 — Session review page**
- After session ends: summary of outcomes, patterns hit, time distribution.
- Prompt user to write single-sentence "biggest insight" (writes to `sessions.insight`).
- DoD: navigating away without insight shows a soft nudge; skip is allowed and silent.

### Phase 3 — Journal + patterns + re-attempts + dashboard

**F3.1 — Journal**
- Filterable list: subject, outcome, date range, pattern name, root cause, mark decision.
- Search by trigger phrase (fuzzy).
- Row expand shows all tag details + link to source PYQ.
- Saved answers stay concealed and render only after an explicit "Show answer" action.
- DoD: filter combinations work; pagination at 50/page.

**F3.2 — Pattern library**
- Auto-aggregated from `questions.pattern_name`.
- Sorted by count desc.
- Click → view all questions with that pattern.
- Merge suggestions: two patterns with edit-distance ≤ 3 offer merge button (advisory only, user confirms).
- DoD: pattern count matches question count for that pattern.

**F3.3 — Spaced re-attempts**
- On tagging outcome `RBS`, `RBG`, or any `W-*`: auto-create `reattempts` row scheduled `current_date + 3`.
- Nightly cron (edge function `schedule-reattempts`) advances stages.
- Dashboard "Due today" section shows all `reattempts` with `scheduled_date <= today`.
- The due card shows the exact question, runs the attempt timer, and exposes the concealed answer
  only after the attempt finishes and the learner presses "Show answer".
- On re-attempt done: user picks "clean" / "fail" → server calls `advance_reattempt(id, result)`.
- DoD: unit test `reattempt.test.ts` — ladder progression D3→D10→D30→MASTERED; failure resets to D3.

**F3.4 — Dashboard**
- Top card: today's due re-attempts count + "Start review" button.
- Mid card: this week's ONE fix (from most-recent `weekly_reviews.this_weeks_fix`).
- Mistake surface size = count of open re-attempts (not `MASTERED`). Trend arrow week-over-week.
- Bottom: last session outcome distribution.
- DoD: numbers match SQL queries in `analysis.ts`.

### Phase 4 — AI features

**F4.1 — LLM edge function (`llm-router`)**
- POST `/functions/v1/llm` with body `{ use_case, prompt, question_id?, context? }`.
- Validates JWT, checks `llm_usage_daily.count < 100`, increments counter, routes to provider per §9.
- Logs to `doubt_sessions` (or `triangulate_logs` for that use case).
- Returns `{ provider, model, response, latency_ms }`.
- DoD: unit test with mocked fetch; 101st call in a day returns 429 with `retry_after` header.

**F4.2 — Structured doubt chat (`/doubt`)**
- User enters concept + specific stuck-point. App auto-wraps in 6-part template (see §9.1).
- Response streams via `SSE` from Groq (or falls back to non-stream if fetch stream fails).
- Save-to-journal button attaches doubt to a chosen question.
- DoD: user's typed input never contains outcome/root_cause auto-fills.

**F4.3 — Triangulate mode (`/triangulate`)**
- Enter question text → parallel calls to Groq (Llama), OpenRouter (DeepSeek R1), Gemini 2.5 Pro.
- 3-column display, aligned by paragraph where possible.
- User writes their `conclusion` — required before saving. LLMs never write conclusion.
- Disagreement detector: highlight sections where responses differ (naive: word-set Jaccard < 0.5).
- DoD: e2e test — 3 responses render, save requires conclusion field non-empty.

**F4.4 — Variation generator**
- On any question with outcome `W-*`, `RBS`, or `RBG`: "Generate 5 variations" button.
- Calls LLM with prompt §9.3; returns 5 variants; user selects any/all to add as `variations` rows scheduled for re-attempt.
- DoD: variations appear in `/reattempts` at D3 stage.

**F4.5 — Formula extractor**
- Paste text (chapter, notes) → LLM extracts formulas as `{name, expression, when_to_use}` array.
- User reviews and confirms; approved formulas → `formulas` table, `next_review = today`.
- DoD: at least 3 formulas extracted from a 500-word sample; malformed rows are skipped.

**F4.6 — Trigger phrase reflex scorer**
- `/trigger-drill`: shows phrase, user types associated concept; timer measures response time.
- LLM (Cerebras, fastest) scores answer against canonical (from `trigger_phrases.concept`).
- Fast + correct → mastery boost; else → repeat sooner.
- DoD: latency of LLM scoring < 1500ms p95.

### Phase 5 — Weekly review + analytics

**F5.1 — Weekly review guided flow (`/weekly-review`)**
- 5 screens:
  1. This week's data: total Q, RBS/RBG/W counts, subject breakdown.
  2. User writes `root_cause_summary` (required).
  3. User writes `weakest_concept` (required).
  4. User writes `this_weeks_fix` (required).
  5. LLM synthesis pane (only unlocked after step 4 submit) — for compare, not replace.
- Save creates/updates `weekly_reviews` row keyed by `(user_id, week_start)`.
- DoD: state machine test verifies LLM pane locked until step 4 done.

**F5.2 — Weakness heatmap (`/heatmap`)**
- 3D pivot: subject × subtopic × root_cause; color intensity = count of `W-*`/`RBS`/`RBG`.
- Click cell → filtered journal view.
- Filter by date range.
- DoD: numbers match SQL aggregation.

**F5.3 — Exam-day readiness score (`/readiness`)**
- Composite (0-100) computed weekly via edge function `compute-readiness`:
  - 30% coverage (patterns encountered vs. target library size)
  - 25% retention (fraction of re-attempts at D30/MASTERED)
  - 25% calibration (accuracy of MARK decisions)
  - 20% surface (inverse of open re-attempts count vs. baseline)
- Displayed as gauge + component breakdown.
- DoD: unit test `readiness.test.ts` on synthetic data returns expected score.

**F5.4 — MARK/SKIP/50-50 calibration (`/calibration`)**
- For each question, user sets `mark_decision` and `mark_correct`.
- View: accuracy of MARK vs. actual, expected value under -1/3 negative marking.
- Recommends: raise/lower confidence threshold per subject.
- DoD: expected-value math matches spec (skip=0, mark_correct=+1, mark_wrong=-1/3).

### Phase 6 — Buddy / multi-user

**F6.1 — Invite flow (`/buddy`)**
- Owner generates invite token, expires in 7 days.
- Shareable link `/auth?invite=<token>`.
- On use: `invites.used_by` set, `buddies` row created with canonical `user_a < user_b`.
- DoD: e2e — owner creates invite, second browser accepts, both dashboards show buddy card.

**F6.2 — Weekly shared insight**
- Toggle on weekly-review save: "Share insight with buddy" → inserts into `shared_insights`.
- Buddy sees latest 4 weeks of shared insights on `/buddy/insights`.
- DoD: RLS blocks reading non-buddy insights.

**F6.3 — Send-a-doubt (`/buddy/doubts`)**
- From any question row: "Send to buddy" → creates `question_shares` with note.
- Buddy sees incoming tray, marks `solved` when explained; `discussed` after conversation.
- DoD: e2e — send doubt, buddy sees it, marks solved, sender sees update.

**F6.4 — Async study room (`/study-room/:id`)**
- Create room: name, subject, start time, duration.
- Participants join at start time; presence via Supabase Realtime channel `room:<id>`.
- UI shows "Buddy is in session" — no chat, no video.
- DoD: 2 browsers join same room, both see presence.

**F6.5 — Sadhana peer signal**
- If both buddies have `sadhana_practice = true`: on `sessions.sadhana_done = true`, count as sadhana-day.
- Panel on `/buddy` shows: "Sadhana days both did this week: N/7".
- No shaming for zero days.
- DoD: correct count with synthetic sessions.

**F6.6 — Compare weak spots (`/buddy/compare`)**
- Side-by-side heatmap: your weaknesses vs. buddy's.
- Highlights: cells where buddy is strong and you are weak → suggest sending them the concept for a quick explain.
- DoD: e2e — mock data, correct highlight cells.

### Phase 7 — Polish

**F7.1 — Photograph question (client OCR)**
- On any journal entry create: camera icon → open camera → capture → tesseract.js OCR → populate `question_text`.
- DoD: OCR of a printed sample returns text within 5s on mid-range Android.

**F7.2 — PWA install + offline shell**
- Install prompt after 2 sessions.
- Service worker caches app shell + last-viewed journal page.
- DoD: Lighthouse PWA audit ≥ 90.

**F7.3 — Weekly one-page PDF export**
- On weekly review save: "Export PDF" — generates one-page summary (insight, weakest concept, this-week fix, heatmap thumbnail, top 3 patterns).
- Uses browser print CSS + `@page { size: A4 portrait; }`.
- DoD: PDF opens in Preview / Adobe.

**F7.4 — Retention decay curve**
- For every pattern, plot re-attempt success rate over time.
- Highlights patterns whose success rate drops below 70% at D30 → auto-schedule fresh D3.
- DoD: chart renders for patterns with ≥ 3 attempts.

**F7.5 — Data export / import (Settings)**
- Export: JSON dump of user's data (excluding buddies' data).
- Import: merges into current account (no overwrites; conflicts logged).
- DoD: roundtrip export/import preserves all user rows.

### Phase 8 — Hardening + deploy

**F8.1 — E2E test suite**
- Playwright: auth, tag flow, offline sync, buddy invite, weekly review.
- All pass in CI.
- DoD: GitHub Actions runs on push, all green.

**F8.2 — Sentry integration**
- Frontend + edge function error capture.
- Filter noise: rate-limit errors from clients, RLS denials from clients.
- DoD: intentional throw shows in Sentry within 1min.

**F8.3 — Deploy**
- Vercel: connect GitHub, set env vars, custom domain optional.
- Supabase: `supabase db push`, `supabase functions deploy llm-router schedule-reattempts compute-readiness`.
- Set edge function secrets: `supabase secrets set GROQ_API_KEY=... GEMINI_API_KEY=... OPENROUTER_API_KEY=... CEREBRAS_API_KEY=...`.
- DoD: app loads at deployed URL, LLM call works end-to-end.

**F8.4 — Feature freeze enforcement**
- On 2026-10-31, pre-commit hook activates: any commit touching `src/pages/` or `src/components/` requires message prefix `fix:`.
- File: `.git/hooks/pre-commit` (installed via `npm run prepare` on setup).
- DoD: manual test — try adding a non-fix commit post-date, get blocked.

---

## 8. Sequential build order

Execute in this order. Each step is a git commit boundary.

```
S01  Root configs + design tokens (mostly done in scaffold)
S02  Postgres migrations 001–004, RLS policies, cron functions
S03  Edge function scaffolds (llm-router, schedule-reattempts, compute-readiness) — stubs first
S04  src/types + src/lib/{constants,utils,flags,supabase,db}
S05  src/stores/auth + src/hooks/useAuth + Auth.tsx page (F1.1)
S06  src/components/ui/* (all UI primitives) (F1.2)
S07  src/components/layout/* + Shell/Nav/MobileTabs (F1.2)
S08  src/lib/sync + src/hooks/useSync + React Query provider (F1.3)
S09  src/pages/Dashboard.tsx (initial empty version) (F1.2)
S10  src/lib/reattempt + reattempt.test.ts (F3.3 logic)
S11  src/pages/SessionNew + SessionActive + TagFlow steps (F2.*)
S12  src/hooks/useTimer + useKeyboard + useVisibilityChange (F2.2, F2.3)
S13  src/pages/SessionReview (F2.4)
S14  src/pages/Journal + filters (F3.1)
S15  src/pages/Patterns (F3.2)
S16  src/pages/Reattempts + reattempt scheduling wire-up (F3.3)
S17  Dashboard proper: due today, weekly fix, mistake surface (F3.4)
S18  llm-router edge function full impl + rate limit (F4.1)
S19  src/lib/llm + src/hooks/useLLM + src/lib/prompts (F4.*)
S20  src/pages/DoubtChat (F4.2)
S21  src/pages/Triangulate (F4.3)
S22  Variation generator button + wire-up (F4.4)
S23  src/pages/Formulas + extractor (F4.5)
S24  src/pages/TriggerDrill + Cerebras scorer (F4.6)
S25  src/pages/WeeklyReview 5-step guided flow (F5.1)
S26  src/components/charts/Heatmap + src/pages/HeatmapPage (F5.2)
S27  src/lib/readiness + compute-readiness edge fn + src/pages/Readiness (F5.3)
S28  src/pages/Calibration (F5.4)
S29  Buddy: invite flow, Buddy page (F6.1)
S30  Weekly shared insight (F6.2)
S31  Send-a-doubt (F6.3)
S32  Async study room + realtime (F6.4)
S33  Sadhana peer signal (F6.5)
S34  Compare weak spots (F6.6)
S35  Photograph question OCR (F7.1)
S36  PWA install + offline shell (F7.2)
S37  Weekly PDF export (F7.3)
S38  Retention decay curve (F7.4)
S39  Data export/import in Settings (F7.5)
S40  E2E test suite (F8.1)
S41  Sentry integration (F8.2)
S42  Vercel + Supabase deploy (F8.3)
S43  Feature-freeze pre-commit hook (F8.4)
S44  Final README pass, DECISIONS.md review, tag v1.0.0
```

---

## 9. LLM specifications

### 9.1 Prompt templates (verbatim, do not modify)

**`quick_explain` (Groq Llama 3.3 70B) — for `/doubt` quick mode:**

```
You are a GATE CS tutor. The user is preparing for GATE 2027 (India, computer science). Respond in ONE reply covering all six sections. No preamble. No emojis.

TOPIC: {topic}
USER'S CURRENT UNDERSTANDING: {current_understanding}
USER'S STUCK POINT: {stuck_point}

Cover in this exact order with these headings:

## 1. Formal definition and intuition
## 2. All variations, edge cases, and boundary conditions
## 3. Common GATE question patterns (1-mark and 2-mark)
## 4. Three worked examples of increasing difficulty
## 5. Common mistakes and trap answers examiners set
## 6. Related concepts to revise next

Be precise. Use LaTeX for math. No filler.
```

**`deep_doubt` (Gemini 2.5 Pro with thinking) — for `/doubt` deep mode:**

Same template as `quick_explain`, prefix with:
```
Think step-by-step before writing the final structured answer.
```

**`variation` (Groq) — for F4.4:**

```
Given this GATE CS PYQ, generate exactly 5 variations that test the SAME underlying concept but with different numbers, wording, or edge conditions. Number them 1-5. Do not include the answer. Do not include hints. No preamble.

Original question:
{question_text}

Rules:
- Each variation must be independently solvable.
- Vary at least one of: numeric values, boundary conditions (e.g. byte↔word addressable), representation (e.g. little↔big endian), or which quantity is unknown.
- Match GATE tone: terse, unambiguous, no trick unless the concept is a trick.
```

**`formula_extract` (Groq):**

```
Extract every formula from the following text as a JSON array. Each item: {"name": string, "expression": string, "when_to_use": string}. Do not include narrative — output valid JSON only. If no formulas found, return [].

Text:
{text}
```

**`reflex_score` (Cerebras):**

```
GATE trigger phrase reflex check. Respond with ONE WORD only: "MATCH" or "MISS".

Phrase: {phrase}
Canonical concept: {canonical}
User's answer: {user_answer}

MATCH if the user's answer names the same concept (allow synonyms, abbreviations, minor wording differences). Else MISS.
```

**`weekly_synthesis` (Gemini 2.5 Pro) — for F5.1 step 5:**

```
You are analyzing a GATE aspirant's PYQ tags for the week of {week_start}. The user has ALREADY written their own root-cause conclusion below. Your job is to offer a SECOND OPINION — do not repeat the user, do not agree by default, do not flatter. If you see the same weakness, name it in one line. If you see a different upstream weakness in the data, name that instead.

USER'S OWN CONCLUSION:
- Root cause summary: {root_cause_summary}
- Weakest concept: {weakest_concept}
- This week's fix: {this_weeks_fix}

RAW DATA (aggregated):
{data_json}

Respond in exactly this format:
## Agreement / disagreement
[one sentence]
## The upstream node I see
[one sentence — the ONE concept]
## Why (from the data)
[2-3 sentences citing counts]
## What I would do differently this week
[one sentence, actionable]
```

### 9.2 Provider routing (in `llm-router`)

| use_case | Provider | Model | Reason |
|---|---|---|---|
| `quick_explain` | Groq | `llama-3.3-70b-versatile` | Fast, generous |
| `deep_doubt` | Gemini | `gemini-2.5-pro` (thinking on) | Best free reasoning |
| `triangulate` | Parallel: Groq + Gemini + OpenRouter | Llama + Gemini + DeepSeek R1 | Diversity |
| `long_context` | Gemini | `gemini-2.5-flash` | 1M context |
| `reflex_score` | Cerebras | `llama-3.3-70b` | Sub-second |
| `variation` | Groq | `llama-3.3-70b-versatile` | Fast |
| `formula_extract` | Groq | `llama-3.3-70b-versatile` | Structured output |
| `weekly_synthesis` | Gemini | `gemini-2.5-pro` (thinking on) | Best judgment |

### 9.3 Rate limiting

- 100 calls / user / day, enforced in edge function via atomic upsert on `llm_usage_daily`.
- Triangulate counts as **3 calls** (one per provider).
- On limit: HTTP 429 with `X-RateLimit-Reset: <ISO-date>`.

### 9.4 Secrets

Set via `supabase secrets set <KEY>=<value>`:
- `GROQ_API_KEY` — from console.groq.com
- `GEMINI_API_KEY` — from aistudio.google.com
- `OPENROUTER_API_KEY` — from openrouter.ai
- `CEREBRAS_API_KEY` — from inference.cerebras.ai

---

## 10. Design system tokens

Amended 2026-08-08 (user-selected visual direction): **"Forest Ledger"** — cool sage canvas, porcelain cards, deep pine ink, eucalyptus primary actions, and restrained brass markers. Faint ledger ruling belongs only on the light canvas; data surfaces stay clean, quiet, and highly legible. A complementary **Forest Ledger After Dusk** theme uses a line-free graphite canvas (`#0F1216`), charcoal cards (`#171B21`), eucalyptus actions (`#75B9A3`), porcelain ink (`#EEF2F5`), and distinct amber, violet, blue, rose, and moss annotations. Every surface and semantic color switches through shared tokens; question diagrams may retain white paper for source legibility.

- **Appearance**: Settings offers System / Light / Dark, with a one-tap light/dark toggle in the persistent app chrome and public account headers. The on-device preference is persisted, System reacts to OS changes, startup applies it before first paint, and browser/Android chrome follows the resolved theme.

- **Surfaces**: `bg` (`#F1F5F0` sage canvas), `bg-raised` (`#FBFDFB` porcelain card), `bg-overlay` (`#E7EFE9` sunk well). Subtle grain overlay ≤ 2% opacity.
- **Ink (text)**: `text` (`#19352F` deep pine), `text-muted` (`#50665F`), `text-faint` (`#657871`).
- **Lines**: `border` (`#D5E1D8`), `border-hover` (`#B8C9BD`).
- **Brand**: `accent` (`#2F6F5E` eucalyptus), `accent-hover` (`#265E50`), `accent-faint` (`rgba(47, 111, 94, 0.11)`).
- **Semantics**: `success` (`#4F7C45` moss), `warn` (`#8A5B13` accessible brass), `danger` (`#B85045` muted brick), `guess` (`#67518F` archival violet).
- **Highlighter**: `highlight` (`#F3D58A`) — restrained brass marker streaks under key text and text selection.
- **Subject inks** (`ink.*`): cobalt `#376C8C`, teal `#2F6F5E`, violet `#67518F`, rose `#A94C60`, marigold `#8A5B13`, slate `#50665F`. Assigned to subjects by stable index.
- **Fonts**: Bricolage Grotesque (display/headings), Schibsted Grotesk (UI body), Azeret Mono (numbers, timers, kbd chips, micro-labels).
- **Spacing**: 4, 8, 12, 16, 24, 32, 48, 64. No other values.
- **Radii**: 6 (chips/kbd), 10 (inputs/buttons), 16 (cards), full (pills/avatars).
- **Shadows**: layered soft paper lifts (`sm`, `card`, `lift`, `press`). No harsh drops.
- **Motion**: springy micro-feedback via `motion` lib, 150–400ms. Motion always answers a user action (press, stamp, save, step change); nothing autoplays on a loop.
- **Signature motifs**: faint ledger ruling on the canvas; eucalyptus margin-line; brass highlighter underline on active items; rotated "LOGGED" stamp on session completion; ink-dot burst on milestones.
- **Icons**: lucide-react, `strokeWidth={1.75}`, `size={16|20|24}` only.
- **Max content width**: 720px (single column mobile-first).
- **No emojis — color does the celebrating.**

---

## 11. Environment variables

**Client-safe (`VITE_*`)** — in `.env.local`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SENTRY_DSN=       (optional)
```

**Edge function secrets** — via `supabase secrets set`:
```
GROQ_API_KEY
GEMINI_API_KEY
OPENROUTER_API_KEY
CEREBRAS_API_KEY
```

---

## 12. Deployment steps

### 12.1 Supabase

```bash
# One-time
npx supabase init
npx supabase link --project-ref <ref>

# Push schema
npx supabase db push

# Deploy edge functions
npx supabase functions deploy llm-router
npx supabase functions deploy schedule-reattempts
npx supabase functions deploy compute-readiness

# Set secrets
npx supabase secrets set \
  GROQ_API_KEY=... \
  GEMINI_API_KEY=... \
  OPENROUTER_API_KEY=... \
  CEREBRAS_API_KEY=...

# Schedule cron
# In Supabase dashboard → Database → Cron:
# schedule-reattempts: '0 3 * * *' (daily 03:00 UTC)
# compute-readiness:   '0 4 * * 1' (weekly Mon 04:00 UTC)
```

### 12.2 Vercel

```bash
# One-time
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production

# Deploy
vercel --prod
```

### 12.3 Post-deploy checklist

- [ ] Sign up via invite link works
- [ ] Session logging works
- [ ] Tag flow ≤ 30s
- [ ] LLM doubt call returns in < 5s
- [ ] Rate limit blocks 101st call
- [ ] Buddy invite → accept → sees each other
- [ ] PWA installable
- [ ] Offline: tag 3 questions, come online, syncs

---

## 13. Testing strategy

- **Unit** (Vitest): `reattempt.test.ts`, `analysis.test.ts`, `readiness.test.ts`, `llm.test.ts` (mock fetch).
- **Perf** (Vitest): `tag-flow.perf.test.ts` — must median ≤ 30s.
- **Component** (React Testing Library): `TagFlow.test.tsx` — full 4-step flow.
- **E2E** (Playwright, single browser: Chromium):
  - `auth.spec.ts` — invite flow
  - `tag-flow.spec.ts` — session + tag 5 questions
  - `offline-sync.spec.ts` — offline write + online sync
  - `buddy-invite.spec.ts` — two-user flow

**CI**: GitHub Actions on push to `main`:
1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test`
5. `npm run test:e2e`
6. `npm run build`

---

## 14. Files already scaffolded

The following exist in the repo already. Do not overwrite; extend as needed.

- `BUILD.md` (this file)
- `package.json`
- `tsconfig.json`, `tsconfig.node.json`
- `vite.config.ts`
- `tailwind.config.js`, `postcss.config.js`
- `index.html`
- `.env.example`, `.gitignore`
- Empty directory tree matching §6

---

## 15. Commands (reference)

```bash
# Setup
npm install
cp .env.example .env.local
# → fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Dev
npm run dev              # localhost:5173
npx supabase start       # local Postgres + Studio at :54323

# Test
npm run typecheck
npm run lint
npm run test
npm run test:e2e

# Build
npm run build
npm run preview

# Deploy
vercel --prod
npx supabase db push
npx supabase functions deploy
```

---

## 16. Definition of Done (project-level)

Ship v1.0.0 when ALL of these hold:

1. All Phase 1–6 acceptance criteria pass. Phase 7 and 8 as time allows before Oct 31.
2. `npm run build` completes with 0 errors, 0 warnings.
3. `npm run typecheck` — 0 errors.
4. `npm run lint` — 0 errors.
5. `npm run test` — all pass.
6. `npm run test:e2e` — all pass on Chromium.
7. Lighthouse PWA audit ≥ 90.
8. Deployed to Vercel + Supabase; user can sign up via invite and log a session.
9. `README.md`, `DECISIONS.md`, `FROZEN.md` all populated.
10. Git tag `v1.0.0` pushed.

---

## 17. Hard bans (never do this)

- Do not add browser/device push notifications. The opt-in daily Telegram study digest is the only exception.
- Do not add streaks / consecutive-day counters / "streak broken" screens.
- Do not add LLM auto-tagging of outcome / root cause / pattern / insight.
- Do not add real-time chat between buddies.
- Do not add public sign-up (invite-only, enforced server-side).
- Do not add emojis to UI.
- Do not add gamified reward loops (badges, XP, levels, leaderboards).
- Do not add third-party analytics (Google Analytics, Mixpanel, etc.).
- Do not add ads.
- Do not add anything that pings the user for engagement. The Telegram digest may carry only the user's scheduled study work and due reviews.
- Do not increase LLM rate limit above 100/day.
- Do not weaken RLS.
- Do not commit `.env.local`, secrets, or API keys.
- Do not `--force` push. Do not `--no-verify` commits.
- Do not skip the feature-freeze pre-commit hook after 2026-10-31.

---

## 18. When in doubt

If a decision genuinely isn't covered here:

1. Pick the option that reduces distraction surface.
2. Pick the option that requires less user attention to maintain.
3. Pick the option that ships faster.
4. Log the decision + reasoning in `DECISIONS.md`.
5. Keep building. Do not stop to ask.

Compression is the whole point of this tool. Compress your building too.
