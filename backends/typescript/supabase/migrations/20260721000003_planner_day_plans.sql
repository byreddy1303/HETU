-- Minimal cloud mirror of calendar Planner study sessions.
--
-- The browser remains local-first. Only the study-session array is mirrored so
-- the daily Telegram function can read that user's plan at delivery time.
-- Review and legacy day-structure fields stay on device.

set search_path = public, extensions;

create table if not exists public.planner_day_plans (
  user_id     uuid not null references public.users(id) on delete cascade,
  plan_date   date not null,
  sessions    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, plan_date),
  check (jsonb_typeof(sessions) = 'array'),
  check (jsonb_array_length(sessions) <= 24),
  check (pg_column_size(sessions) <= 65536)
);

create index if not exists planner_day_plans_by_date
  on public.planner_day_plans (plan_date, user_id);

alter table public.planner_day_plans enable row level security;

drop policy if exists sel_self on public.planner_day_plans;
create policy sel_self on public.planner_day_plans
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ins_self on public.planner_day_plans;
create policy ins_self on public.planner_day_plans
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists upd_self on public.planner_day_plans;
create policy upd_self on public.planner_day_plans
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists del_self on public.planner_day_plans;
create policy del_self on public.planner_day_plans
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.planner_day_plans to authenticated;

comment on table public.planner_day_plans is
  'Per-user study-session mirror used by opt-in Telegram day-plan delivery.';
