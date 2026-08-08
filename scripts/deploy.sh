#!/usr/bin/env bash
# scripts/deploy.sh — One-shot production deploy for AIR Journal backend.
#
# Prerequisites (do these once, in a browser):
#   1. Sign up on Supabase (https://supabase.com) and create a project.
#      Note the "Project Reference" — you can find it in Settings → General
#      or in the URL of your project dashboard.
#   2. Sign up on Resend (https://resend.com) and grab the API key.
#      Optional but recommended: verify a sending domain so invite mails
#      can go to third parties.
#
# Then:
#   1. Populate .deploy.env in this repo root (already created for you).
#   2. Run `supabase login` once — this opens a browser tab.
#   3. Run `bash scripts/deploy.sh` from the repo root.
#
# This script is idempotent — you can run it again after tweaking .deploy.env
# and it will re-apply the changes without breaking things.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

step() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
info() { printf '  \033[0;36m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
ok()   { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }

step "Load .deploy.env"
[[ -f .deploy.env ]] || fail ".deploy.env is missing. Copy the template from README and fill in your secrets."
set -a
# shellcheck source=/dev/null
source .deploy.env
set +a
ok "Loaded secrets"

step "Sanity check secrets"
for var in RESEND_API_KEY MAIL_FROM OWNER_EMAIL SUPABASE_PROJECT_REF; do
  if [[ -z "${!var:-}" ]]; then
    fail "$var is empty in .deploy.env — fill it in and retry."
  fi
done
ok "Required secrets present"

step "Check supabase CLI"
command -v supabase >/dev/null 2>&1 || fail "supabase CLI not installed. Install: brew install supabase/tap/supabase"
ok "supabase CLI: $(supabase --version)"

step "Verify supabase login"
if ! supabase projects list >/dev/null 2>&1; then
  fail "You are not logged into Supabase. Run: supabase login  (opens a browser)"
fi
ok "Logged into Supabase"

step "Link this repo to project $SUPABASE_PROJECT_REF"
if [[ -f supabase/.temp/project-ref ]]; then
  existing=$(cat supabase/.temp/project-ref)
  if [[ "$existing" != "$SUPABASE_PROJECT_REF" ]]; then
    info "Repo is linked to a different ref ($existing) — re-linking."
    supabase link --project-ref "$SUPABASE_PROJECT_REF"
  else
    ok "Already linked."
  fi
else
  supabase link --project-ref "$SUPABASE_PROJECT_REF"
  ok "Linked."
fi

step "Provision digest and Buddy-push cron credentials in Supabase Vault"
project_url="https://${SUPABASE_PROJECT_REF}.supabase.co"
digest_cron_secret="$(openssl rand -hex 32)"
push_cron_secret="$(openssl rand -hex 32)"
vault_sql="
do \$vault\$
declare
  project_url_id uuid;
  cron_secret_id uuid;
  push_cron_secret_id uuid;
begin
  select id into project_url_id from vault.secrets where name = 'air_journal_project_url' limit 1;
  if project_url_id is null then
    perform vault.create_secret('${project_url}', 'air_journal_project_url', 'AIR Journal Edge Function base URL');
  else
    perform vault.update_secret(project_url_id, '${project_url}', 'air_journal_project_url', 'AIR Journal Edge Function base URL');
  end if;

  select id into cron_secret_id from vault.secrets where name = 'air_journal_digest_cron_secret' limit 1;
  if cron_secret_id is null then
    perform vault.create_secret('${digest_cron_secret}', 'air_journal_digest_cron_secret', 'AIR Journal daily digest cron credential');
  else
    perform vault.update_secret(cron_secret_id, '${digest_cron_secret}', 'air_journal_digest_cron_secret', 'AIR Journal daily digest cron credential');
  end if;

  select id into push_cron_secret_id from vault.secrets where name = 'air_journal_push_cron_secret' limit 1;
  if push_cron_secret_id is null then
    perform vault.create_secret('${push_cron_secret}', 'air_journal_push_cron_secret', 'AIR Journal Buddy push retry credential');
  else
    perform vault.update_secret(push_cron_secret_id, '${push_cron_secret}', 'air_journal_push_cron_secret', 'AIR Journal Buddy push retry credential');
  end if;
end
\$vault\$;"
supabase db query --linked "$vault_sql" >/dev/null
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  "DAILY_DIGEST_CRON_SECRET=$digest_cron_secret" \
  "BUDDY_PUSH_CRON_SECRET=$push_cron_secret" >/dev/null
unset digest_cron_secret push_cron_secret vault_sql
ok "Vault credentials are present"

step "Apply migrations to remote"
supabase db push
ok "Schema is up to date"

step "Deploy edge functions"
functions=(
  schedule-reattempts
  compute-readiness
  request-access
  approve-request
  decline-request
  signup-via-invite
  login
  request-pin-reset
  buddy-request
  daily-digest
  telegram-webhook
  buddy-notifications
)
for fn in "${functions[@]}"; do
  info "→ $fn"
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
done
ok "All ${#functions[@]} edge functions deployed"

step "Set edge function secrets"
# Only set variables that are non-empty. Supabase secrets set fails on an
# empty value.
secret_args=()
add_secret() {
  local key="$1"
  local val="${!key:-}"
  [[ -n "$val" ]] && secret_args+=("$key=$val")
}
add_secret RESEND_API_KEY
add_secret MAIL_FROM
add_secret OWNER_EMAIL
add_secret VITE_APP_URL
add_secret TELEGRAM_BOT_TOKEN
add_secret TELEGRAM_WEBHOOK_SECRET
add_secret VAPID_PUBLIC_KEY
add_secret VAPID_PRIVATE_KEY
add_secret VAPID_SUBJECT
add_secret FCM_SERVICE_ACCOUNT_JSON
if [[ ${#secret_args[@]} -gt 0 ]]; then
  supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${secret_args[@]}"
  ok "Set ${#secret_args[@]} secrets"
else
  info "Nothing to set."
fi

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  [[ -n "${TELEGRAM_BOT_USERNAME:-}" ]] || fail "TELEGRAM_BOT_USERNAME is required when TELEGRAM_BOT_TOKEN is set"
  [[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]] || fail "TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_BOT_TOKEN is set"
  step "Configure Telegram webhook"
  telegram_webhook_url="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/telegram-webhook"
  telegram_response=$(curl --silent --show-error --request POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    --data-urlencode "url=${telegram_webhook_url}" \
    --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
    --data-urlencode 'allowed_updates=["message"]')
  [[ "$telegram_response" == *'"ok":true'* ]] || fail "Telegram rejected the webhook configuration"
  ok "Telegram webhook configured"
fi

step "Print production URLs"
project_url="https://${SUPABASE_PROJECT_REF}.supabase.co"
echo "  Supabase project:      $project_url"
echo "  Functions gateway:     $project_url/functions/v1"
echo "  Dashboard:             https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}"

step "Vercel frontend deploy (manual step)"
cat <<EOF
Vercel is not automated by this script because it needs an interactive
browser login. To deploy the frontend:

  1. Install the CLI:      npx vercel --version
  2. Link this repo:       npx vercel link
  3. Add env vars for prod (paste values from Supabase Dashboard → API):
       npx vercel env add VITE_SUPABASE_URL production
       npx vercel env add VITE_SUPABASE_ANON_KEY production
       npx vercel env add VITE_APP_URL production
       npx vercel env add VITE_TELEGRAM_BOT_USERNAME production
       npx vercel env add VITE_WEB_PUSH_PUBLIC_KEY production
  4. Ship it:              npx vercel --prod

After the first Vercel deploy, come back and update .deploy.env with the
resulting VITE_APP_URL, then re-run this script so invite mails carry the
right base URL.
EOF

step "Done"
ok "Backend is live. See README.md → 'Access flow (production)' for the walkthrough."
