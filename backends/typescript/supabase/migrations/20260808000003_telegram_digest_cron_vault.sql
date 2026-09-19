-- Repair Telegram scheduling with credentials stored in Supabase Vault.
--
-- The original job read custom Postgres settings that are not populated on
-- hosted Supabase, so every invocation failed before it could reach the Edge
-- Function. The deployment script provisions both named Vault secrets.

set search_path = public, extensions;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('daily-digest')
where exists (select 1 from cron.job where jobname = 'daily-digest');

select cron.schedule(
  'daily-digest',
  '* * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'air_journal_project_url'
      limit 1
    ) || '/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'air_journal_service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);
