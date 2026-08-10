-- Allow in-app study reminders at any minute and run their dispatcher every minute.

set search_path = public, extensions;

alter table public.study_notification_preferences
  drop constraint if exists study_notification_preferences_minute_local_check;

alter table public.study_notification_preferences
  add constraint study_notification_preferences_minute_local_check
  check (minute_local between 0 and 59);

select cron.unschedule('study-notifications')
where exists (select 1 from cron.job where jobname = 'study-notifications');

select cron.schedule(
  'study-notifications',
  '* * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'air_journal_project_url'
      limit 1
    ) || '/functions/v1/study-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-air-journal-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'air_journal_push_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
