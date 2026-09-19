-- Authenticate the minute-level digest job with a dedicated shared secret.
-- This is independent of Supabase's legacy JWT and new sb_secret key formats.

set search_path = public, extensions;

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
      'x-air-journal-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'air_journal_digest_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);
