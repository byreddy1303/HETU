-- Keep every user-scoped sync pull and common date lookup on a B-tree index.
-- Existing indexes are intentionally not duplicated (questions, reattempts,
-- patterns and formulas already lead with user_id in the initial migration).

create index if not exists sessions_by_user_created
  on public.sessions (user_id, created_at desc);

create index if not exists trigger_phrases_by_user_created
  on public.trigger_phrases (user_id, created_at desc);

create index if not exists weekly_reviews_by_user_week
  on public.weekly_reviews (user_id, week_start desc);

create index if not exists interruption_logs_by_user_time
  on public.interruption_logs (user_id, ts desc);
