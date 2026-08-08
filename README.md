# AIR Journal

Local-first, multi-user GATE PYQ analysis app. Captures every solved question as structured data (outcome / pattern / trigger / root cause), schedules spaced re-attempts, supports focused one-to-one buddy study, and surfaces one weekly upstream weakness. An optional Telegram bot can deliver one daily study-only digest.

Built for GATE 2027 CS, targeting AIR <100.

## Quick start (development)

```bash
npm install
cp .env.example .env.local        # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

# In another terminal:
npx supabase start                # local Postgres + Studio at http://localhost:54323

npm run dev                       # app at http://localhost:5173
```

Open `http://localhost:5173/dev/primitives` to preview the design system in dev.

## First-time user journey

1. Visit `/request-access` — asks for name, email, purpose.
2. Owner (you) receives an email; approves from **Settings → Access requests**.
3. Approval creates an invite; requester receives a one-time link that expires in 7 days.
4. Sign-in via magic link or Google OAuth. Dashboard opens with a walkthrough.
5. First session → tag 5 questions → re-attempts populate automatically.

The **first person to sign up becomes the owner** (bootstrap in `20260717000005_invite_signup.sql`). Every account after that must arrive via invite. Public sign-up is blocked at the database trigger; there is no way around it from the client.

## Access flow (production)

```
outsider →  /request-access                              (public form)
         →  edge fn "request-access"                     (validates + rate-limits)
         →  account_requests row (pending)               (RLS: owner-only reads)
         →  Resend mail to OWNER_EMAIL                   (with admin panel link)

owner    →  Settings → Access requests → Approve          (owner-only card)
         →  edge fn "approve-request"                    (JWT-authenticated)
         →  approve_account_request() atomic RPC          (creates invite)
         →  Resend mail to requester                     (with invite URL)

requester →  invite URL → /auth?invite=<token>            (magic link + token in metadata)
          →  trigger validates token                     (server-side)
          →  auth.users row created                      (account exists)
          →  handle_new_user() provisions profile        (public.users row)
```

Owner concept: `public.is_owner(uid)` returns true when `uid` matches the earliest-created `public.users` row. All owner-only surfaces (admin card, approve/decline edge functions) rely on this.

## Isolation

Each account's data is fully separate:

- **Server**: RLS policies on every user-owned table (`user_id = auth.uid()` on select/insert/update/delete).
- **Client**: on sign-out, `wipeLocalState()` (see `src/lib/isolation.ts`) drops all Dexie tables, resets zustand stores, and sweeps every `air.*` localStorage key. Non-app keys are left alone.
- **Verified by** `src/__tests__/isolation.test.ts`.

## Docs

- [`DEPLOY.md`](./DEPLOY.md) — Production deployment walkthrough (Supabase + Vercel + Resend).
- [`ANDROID.md`](./ANDROID.md) — Android APK/AAB builds, signing, device QA, and release workflow.

## Core philosophy

The tool compresses your mistake surface. It does not replace your reasoning.

- Every question you solve produces 4 tags (30 sec): outcome, pattern, trigger, root cause.
- Wrong / slow / guessed answers auto-enter a spaced re-attempt ladder (3 → 10 → 30 days).
- Buddy chat lets you discuss and share a stripped question snapshot without exposing outcomes, patterns, or root causes.
- Buddy message alerts are an explicit per-device opt-in and work on installed phone PWAs, desktop browsers, and configured Android builds.
- Weekly, you write ONE upstream weakness to fix that week; the dashboard turns your own tags into small, actionable learning notes.
- No streaks, gamified reward loops, marketing alerts, or third-party analytics. Buddy alerts and Telegram delivery are explicit opt-ins.

## Stack

React 18 + Vite + TypeScript · Tailwind · Zustand · Dexie · React Query · Supabase (Postgres 15 + Auth + Edge Functions) · Web Push/VAPID · Firebase Cloud Messaging for native Android · Telegram Bot API · Resend.

Total monthly cost at low volumes: ₹0. See `DEPLOY.md` for the scaling thresholds where paid tiers kick in.

## Testing

```bash
npm run typecheck        # strict TypeScript
npm run lint             # ESLint (0 warnings tolerated)
npm run test             # Vitest — analysis, isolation, Buddy, tips, sync, reattempt ladder
npm run test:e2e         # Playwright — auth, tag flow, offline sync, buddy invite
```

CI runs all five on every push to `main`.

## Deploy

Full walkthrough is in [`DEPLOY.md`](./DEPLOY.md). Short version — every backend CLI call is wrapped in one script:

```bash
# One-time: sign up on Supabase and Resend.
cp .deploy.env.example .deploy.env       # fill every value; .deploy.env is gitignored
supabase login                           # interactive; opens a browser
bash scripts/deploy.sh                   # links, pushes migrations, deploys edge functions, sets secrets
```

For the frontend, deploy the built app to Vercel:

```bash
npx vercel link
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add VITE_APP_URL production
npx vercel env add VITE_TELEGRAM_BOT_USERNAME production
npx vercel env add VITE_WEB_PUSH_PUBLIC_KEY production
npx vercel --prod
```

After the first Vercel deploy, put the resulting URL into `.deploy.env` as `VITE_APP_URL` and re-run `bash scripts/deploy.sh` so invite emails link to your real domain.

## Android

AIR Journal ships from the same codebase as a Capacitor Android app. Create `.env.capacitor.local` from the template, then run:

```bash
npm run android:apk
```

See [`ANDROID.md`](./ANDROID.md) before distributing a build; release APKs/AABs must be signed and tested on a physical device.

## License

Private. Not for redistribution.
