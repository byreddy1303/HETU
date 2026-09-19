-- 20260913000001_realtime_sync_publication.sql
-- Enable supabase_realtime publication for all user-owned tables
-- to allow instant push-notifications and cross-device sync between Android and Web.

do $$
declare
  t text;
  tables text[] := array[
    'sessions',
    'questions',
    'patterns',
    'reattempts',
    'formulas',
    'trigger_phrases',
    'weekly_reviews',
    'mock_tests',
    'topic_progress',
    'pyq_sessions',
    'pyq_attempts',
    'learning_items',
    'learning_events',
    'recovery_sessions',
    'planner_day_plans',
    'account_state'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
