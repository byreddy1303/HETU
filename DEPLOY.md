# DEPLOY.md — Production deployment walkthrough

Follow this document top-to-bottom to take AIR Journal from a fresh clone to a working production URL with a functional access-request pipeline. Every step is idempotent — you can run the whole thing again to roll changes.

## 0. Prerequisites

- Node 22 LTS or newer locally (required by the maintained Capacitor toolchain).
- `npm i -g supabase vercel` (or `npx …` — used everywhere below).
- A Supabase account (free tier is sufficient for the first ~50 active users).
- A Vercel account (Hobby plan is fine).
- A Resend account (free tier: 3000 mails/month) with your sending domain verified for DKIM + SPF.
- A domain you control for the `From:` address on outgoing mail.
- Optional Telegram bot created with `@BotFather` if daily Telegram delivery is enabled.

## 1. Provision Supabase

```bash
# From the app root:
npx supabase login
npx supabase projects create air-journal --region ap-south-1 --org <org>
npx supabase link --project-ref <the-new-ref>
```

Note the **project URL** and **anon key** (Supabase Dashboard → Project Settings → API). Also copy the **service role key** — needed for the edge secrets step, never for the client.

## 2. Push schema + seed policies

```bash
npx supabase db push
```

This applies every migration in order, including access-request, Buddy, and Buddy-message hardening migrations.

Verify in Supabase Dashboard → Table Editor:

- `account_requests` table exists with RLS enabled.
- `public.is_owner`, `public.owner_email`, `public.approve_account_request`, `public.decline_account_request` all show under Database → Functions.
- `public.cancel_buddy_request` exists and `buddy_messages` has RLS enabled.

## 3. Deploy edge functions

```bash
npx supabase functions deploy schedule-reattempts
npx supabase functions deploy compute-readiness
npx supabase functions deploy request-access
npx supabase functions deploy approve-request
npx supabase functions deploy decline-request
npx supabase functions deploy signup-via-invite
npx supabase functions deploy login
npx supabase functions deploy request-pin-reset
npx supabase functions deploy buddy-request
npx supabase functions deploy daily-digest
npx supabase functions deploy telegram-webhook
npx supabase functions deploy buddy-notifications --no-verify-jwt
```

## 4. Configure secrets

Every secret below must be present before the app can function end-to-end.

```bash
npx supabase secrets set \
  RESEND_API_KEY='re_...'     \
  MAIL_FROM='AIR Journal <no-reply@yourdomain.com>' \
  OWNER_EMAIL='byreddy1303@gmail.com'               \
  VITE_APP_URL='https://your-app.vercel.app'
```

- `MAIL_FROM` must be a verified sender in Resend, or the API will reject.
- `OWNER_EMAIL` is where new access-request notifications land. It's independent of the DB "owner" (first-signed-up user) — you can point it wherever routing is convenient.
- `VITE_APP_URL` is used inside invite emails so the link resolves to your production host, not the edge function origin.

For Telegram delivery, create a bot with `@BotFather`, then add the server-only secrets:

```bash
npx supabase secrets set \
  TELEGRAM_BOT_TOKEN='123456:replace-me' \
  TELEGRAM_WEBHOOK_SECRET='replace-with-openssl-rand-hex-32'

curl --request POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode 'url=https://your-project-ref.supabase.co/functions/v1/telegram-webhook' \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]'
```

The webhook rejects requests without Telegram's secret header. Users connect from Settings through a 15-minute link; the browser never accepts or writes a chat ID.

For Buddy message alerts, generate one VAPID keypair and keep the private half server-only:

```bash
npx web-push generate-vapid-keys
npx supabase secrets set \
  VAPID_PUBLIC_KEY='replace-me' \
  VAPID_PRIVATE_KEY='replace-me' \
  VAPID_SUBJECT='mailto:notifications@yourdomain.com'
```

Set the same public key as `VITE_WEB_PUSH_PUBLIC_KEY` in Vercel. The deployment script creates the separate outbox-cron credential in Supabase Vault. Native Android alerts additionally require `android/app/google-services.json` and the server-only `FCM_SERVICE_ACCOUNT_JSON` described in `ANDROID.md`.

Free-tier key: **Resend** — [resend.com](https://resend.com) — for transactional mail. Verify your domain (DKIM + SPF) before going live.

## 5. Configure Supabase Auth

Supabase Dashboard → Authentication → Providers:

- **Email**: enable magic link. Set the redirect URL to `https://your-app.vercel.app`.
- **Google OAuth** (optional): follow Supabase's Google setup guide; add the redirect URL as above.

Authentication → Email Templates: swap the default templates for your brand if desired. The signup flow uses `signInWithOtp` — magic link is the only email Supabase sends directly. All other transactional mail flows through Resend (invite approvals, declines, owner notifications).

## 6. Configure Supabase Auth webhook (optional but recommended)

If you plan to bootstrap multiple owners on staging, keep the DB trigger `validate_invite_signup` as the single gate. The first-account-becomes-owner bootstrap works exactly once — subsequent accounts always need an invite.

## 7. Deploy to Vercel

```bash
vercel link                          # link to a new or existing project
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_APP_URL production          # same as edge fn secret
vercel env add VITE_TELEGRAM_BOT_USERNAME production # public name, no @
vercel env add VITE_SENTRY_DSN production       # optional
vercel env add VITE_WEB_PUSH_PUBLIC_KEY production
vercel --prod
```

Set the Vercel project's Node runtime to 22.x or newer, matching `package.json` and `.nvmrc`.

## 8. Smoke test

After the first deploy:

1. Visit `https://your-app.vercel.app/request-access`. Fill the form. Submit.
2. Check `OWNER_EMAIL` inbox for the owner-notification.
3. Sign in as the owner (first account is exempt from invite requirement).
4. Settings → Access requests → click **Approve + send invite** on the row you created.
5. Confirm the requester email got the invite mail. Open the link, sign in.
6. Confirm the buddy pairing landed (Buddy page for both users should show the other).
7. Settings → Daily study digest → Connect Telegram → tap Start in Telegram.
8. Return to Settings, confirm the connection, and use **Send now** once.
9. Settings → Buddy message alerts → enable this device. Send a Buddy message from another account with this app closed; tap the alert and confirm the correct chat opens.

## 9. Schedule cron jobs

Supabase Dashboard → Database → Cron. Add:

- **schedule-reattempts** — cron: `0 3 * * *` — runs the ladder advance nightly.
- **compute-readiness** — cron: `0 4 * * 1` — weekly readiness score refresh.

## 10. Rate limits and quotas

- Access requests: 1 pending per email per calendar day (DB unique index).
- Buddy requests: server-enforced daily limit and 24-hour cooldown after a decline.
- Resend free tier: 3000 mails/month. At the volumes AIR Journal operates, this is comfortable.
- Telegram Bot API delivery is free. Two daily recipients produce about 730 messages per year.

## 11. Ongoing ops

- **Rotate secrets** with `supabase secrets set …`. Restarts are automatic.
- **New migration**: `npx supabase migration new <name>` → edit → `npx supabase db push`.
- **Backups**: Supabase runs daily automatic backups on the free tier (7-day retention).
- **Sentry**: set `VITE_SENTRY_DSN` — client errors land in your project. Server (edge fn) errors log via `console.warn/console.error` and appear in Supabase Dashboard → Functions → Logs.

## 12. Rollback

`vercel rollback` from the dashboard, or revert the offending commit and redeploy. Supabase migrations are additive — if you need to undo a schema change, write a new migration that reverses it (never delete a migration file).

## 13. What to do if the owner leaves

The "owner" is whichever row in `public.users` has the earliest `created_at`. If that account is deactivated:

1. Update `OWNER_EMAIL` secret so new request notifications route to a maintainer.
2. Manually change `created_at` in Supabase Dashboard → Table Editor to promote a different `public.users` row to owner. All owner-gated surfaces (admin card, approve/decline RPCs) will follow automatically.

Never delete the owner row — cascade rules would nuke buddy relationships tied to it.
