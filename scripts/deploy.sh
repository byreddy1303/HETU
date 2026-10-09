#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 'The legacy Supabase deploy command is retired.' 'Use the Vercel projects documented in DEPLOY.md. Database migrations run separately from deployments.'
exit 1
