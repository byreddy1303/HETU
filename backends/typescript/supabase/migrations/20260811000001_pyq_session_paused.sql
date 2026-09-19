-- Allow pyq_sessions to be paused so learners can save a set and start a
-- fresh one without discarding their progress.

-- Widen the status constraint to include 'paused'.
alter table public.pyq_sessions
  drop constraint if exists pyq_sessions_status_check;

alter table public.pyq_sessions
  add constraint pyq_sessions_status_check
    check (status in ('active', 'completed', 'abandoned', 'paused'));

-- The existing partial unique index (pyq_sessions_one_active_per_user) already
-- only covers rows WHERE status = 'active', so it naturally allows multiple
-- paused rows per user with no index changes needed.
