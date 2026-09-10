begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
set local session_replication_role = replica;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'planner-a@example.test', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated',
   'planner-b@example.test', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into public.users (id, name, email, username, timezone)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Planner A', 'planner-a@example.test', 'planner_a', 'Asia/Kolkata'),
  ('00000000-0000-4000-8000-0000000000b2', 'Planner B', 'planner-b@example.test', 'planner_b', 'Asia/Kolkata')
on conflict (id) do nothing;
set local session_replication_role = origin;

select ok(not has_function_privilege('anon',
  'public.apply_planner_day_plan_mutation(date,bigint,text,jsonb,jsonb,timestamptz)', 'execute'),
  'anonymous callers cannot mutate Planner days');
select ok(has_function_privilege('authenticated',
  'public.apply_planner_day_plan_mutation(date,bigint,text,jsonb,jsonb,timestamptz)', 'execute'),
  'authenticated callers can use the versioned mutation boundary');
select ok(not has_table_privilege('authenticated', 'public.planner_day_plans', 'delete'),
  'clients cannot physically remove deletion markers');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 0, 'create-a', '[]', '{"date":"2026-09-07","sessions":[]}', null
) #>> '{row,revision}')::integer, 1, 'first create returns revision one');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 0, 'create-a', '[]', '{"date":"2026-09-07","sessions":[]}', null
) ->> 'conflict'), 'idempotent_retry', 'lost-response retry does not advance the revision');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 0, 'stale-create', '[]', '{"date":"2026-09-07","sessions":[]}', null
) ->> 'conflict'), 'version_conflict', 'competing initial create is a structured conflict');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 1, 'update-a', '[]', '{"date":"2026-09-07","sessions":[],"review":{"wentWell":"Persisted"}}', null
) #>> '{row,revision}')::integer, 2, 'update advances exactly one revision');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 1, 'stale-update', '[]', '{"date":"2026-09-07","sessions":[]}', null
) ->> 'conflict'), 'version_conflict', 'stale active payload cannot overwrite a newer edit');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 1, 'delete-a', '[]', null, '2026-09-07T10:00:00Z'
) ->> 'conflict'), 'stale_delete_applied', 'intentional deletion wins over a concurrently edited version');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 2, 'resurrect-stale', '[]', '{"date":"2026-09-07","sessions":[]}', null
) ->> 'conflict'), 'deletion_wins', 'stale device cannot resurrect a deleted day');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 3, 'recreate-aware', '[]', '{"date":"2026-09-07","sessions":[]}', null
) #>> '{row,revision}')::integer, 4, 'a user who observed the tombstone can explicitly recreate the day');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-08', 2, 'missing-row', '[]', '{"date":"2026-09-08","sessions":[]}', null
) ->> 'conflict'), 'missing_expected_row', 'an expected missing row is never silently recreated');
select throws_ok(
  $$update public.planner_day_plans set plan = '{"sessions":[]}'
    where plan_date = '2026-09-07'$$,
  'P0001', 'Planner revision conflict', 'legacy unversioned overwrites are rejected');
select throws_ok(
  $$update public.planner_day_plans
    set user_id = '00000000-0000-4000-8000-0000000000b2',
        revision = revision + 1, last_mutation_id = 'reassign'
    where plan_date = '2026-09-07'$$,
  '42501', null, 'UPDATE WITH CHECK prevents ownership reassignment');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
select is((select count(*)::integer from public.planner_day_plans), 0,
  'user B cannot read user A plans');
select is((public.apply_planner_day_plan_mutation(
  '2026-09-07', 0, 'create-b', '[]', '{"date":"2026-09-07","sessions":[]}', null
) #>> '{row,revision}')::integer, 1, 'same calendar date belongs to an independent account row');

reset role;
select * from finish();
rollback;
