-- Schedule the daily-digest edge function. pg_cron runs in UTC; we fire on
-- every hour, and the edge function itself decides which users are "at 6 AM
-- local" for the moment it runs. This makes per-user hour preferences work
-- without a per-timezone cron.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any prior schedule so this migration is idempotent.
select cron.unschedule('daily-digest')
  where exists (select 1 from cron.job where jobname = 'daily-digest');

select cron.schedule(
  'daily-digest',
  '*/15 * * * *',  -- every 15 minutes to support :00, :15, :30, :45 minute preferences
  $$
  select
    net.http_post(
      url := coalesce(
        current_setting('supabase.functions_url', true),
        current_setting('app.settings.functions_url', true),
        'http://127.0.0.1:54321/functions/v1'
      ) || '/daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('supabase.service_role_key', true),
          current_setting('app.settings.service_role_key', true),
          ''
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
