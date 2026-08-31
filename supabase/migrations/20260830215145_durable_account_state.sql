-- Durable, authenticated storage for client state that must survive browser
-- cache clears, sign-out, and switching devices.

set search_path = public, extensions;

-- Keep `sessions` intact for the existing notification pipeline while adding
-- the complete Planner day payload used to restore the client without loss.
alter table public.planner_day_plans
  add column if not exists plan jsonb;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.planner_day_plans'::regclass
      and conname = 'planner_day_plans_plan_object'
  ) then
    alter table public.planner_day_plans
      add constraint planner_day_plans_plan_object
      check (plan is null or jsonb_typeof(plan) = 'object');
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.planner_day_plans'::regclass
      and conname = 'planner_day_plans_plan_size'
  ) then
    alter table public.planner_day_plans
      add constraint planner_day_plans_plan_size
      check (plan is null or pg_column_size(plan) <= 5242880);
  end if;
end
$do$;

comment on column public.planner_day_plans.plan is
  'Complete Planner day payload; sessions remains the notification-compatible projection.';

-- Earlier table migrations granted the intended CRUD privileges without first
-- clearing Supabase's historical public-schema defaults. Keep authenticated
-- access behind RLS while removing unnecessary TRUNCATE/TRIGGER/REFERENCES.
revoke all on table public.mock_tests, public.topic_progress from anon, authenticated;
grant select, insert, update, delete
  on table public.mock_tests, public.topic_progress
  to authenticated;

create table if not exists public.account_state (
  user_id     uuid not null references public.users(id) on delete cascade,
  namespace   text not null,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, namespace)
);

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_state'::regclass
      and conname = 'account_state_namespace_length'
  ) then
    alter table public.account_state
      add constraint account_state_namespace_length
      check (char_length(namespace) between 1 and 128);
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_state'::regclass
      and conname = 'account_state_payload_object'
  ) then
    alter table public.account_state
      add constraint account_state_payload_object
      check (jsonb_typeof(payload) = 'object');
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_state'::regclass
      and conname = 'account_state_payload_size'
  ) then
    alter table public.account_state
      add constraint account_state_payload_size
      check (pg_column_size(payload) <= 5242880);
  end if;
end
$do$;

alter table public.account_state enable row level security;

revoke all on table public.account_state from anon, authenticated;
grant select, insert, update, delete on table public.account_state to authenticated;

drop policy if exists account_state_select_own on public.account_state;
create policy account_state_select_own
on public.account_state
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists account_state_insert_own on public.account_state;
create policy account_state_insert_own
on public.account_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists account_state_update_own on public.account_state;
create policy account_state_update_own
on public.account_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists account_state_delete_own on public.account_state;
create policy account_state_delete_own
on public.account_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.account_state is
  'Durable per-account application state partitioned into independently synchronized namespaces.';
comment on column public.account_state.user_id is
  'Owner of this state; deletion of the account removes its persisted state.';
comment on column public.account_state.namespace is
  'Stable application-defined key identifying one independently persisted state document.';
comment on column public.account_state.payload is
  'Bounded JSON object containing the latest durable state for this namespace.';
comment on column public.account_state.updated_at is
  'Time the application last persisted this namespace.';
