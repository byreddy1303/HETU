begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
set local session_replication_role = replica;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated',
  'planner-legacy@example.test', '{}'::jsonb, '{}'::jsonb);
insert into public.users (id, name, email, username, timezone)
values ('00000000-0000-4000-8000-0000000000c3', 'Legacy test', 'planner-legacy@example.test',
  'planner_legacy', 'Asia/Kolkata');
set local session_replication_role = origin;

insert into public.planner_day_plans (user_id, plan_date, sessions, plan)
values ('00000000-0000-4000-8000-0000000000c3', '2026-09-07',
  '[{"id":"existing-block","subject":"Algorithms","durationMin":30,"mode":"Revision","priority":"P2 High","target":"Existing work"}]',
  '{"date":"2026-09-07","sessions":[{"id":"existing-block","subject":"Algorithms","durationMin":30,"mode":"Revision","priority":"P2 High","target":"Existing work"}],"review":{"wentWell":"Keep this review"}}');
insert into public.account_state (user_id, namespace, payload)
values ('00000000-0000-4000-8000-0000000000c3', 'planner_templates',
  '{"schemaVersion":1,"data":{"templates":[{"id":"existing-template","name":"Keep this template"}]}}');
insert into public.plan_items (id, user_id, title, subject, due_date, rrule_kind, target_min, is_archived)
values
  ('10000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c3', 'One-off', 'Algorithms', '2026-09-07', 'none', 40, false),
  ('20000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c3', 'Recurring', 'Algorithms', '2026-09-01', 'weekly', 35, false),
  ('30000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c3', 'Archived', 'Algorithms', '2026-09-08', 'daily', 20, true);
insert into public.plan_item_completions (item_id, user_id, on_date, completed_at)
values ('20000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c3',
  '2026-09-07', '2026-09-07T08:00:00Z');

-- Replay the actual migration against representative pre-migration fixtures.
-- Its revision trigger is installed only after consolidation in production.
drop trigger planner_day_plans_enforce_revision on public.planner_day_plans;
-- INSERT_PLANNER_MIGRATION_HERE

select is((select jsonb_array_length(sessions) from public.planner_day_plans
  where user_id = '00000000-0000-4000-8000-0000000000c3' and plan_date = '2026-09-07'),
  3, 'one-off and completed recurrence merge with the existing block');
select ok((select plan->'sessions' = sessions from public.planner_day_plans
  where user_id = '00000000-0000-4000-8000-0000000000c3' and plan_date = '2026-09-07'),
  'full DayPlan and notification projection contain exactly the same merged sessions');
select is((select plan #>> '{review,wentWell}' from public.planner_day_plans
  where user_id = '00000000-0000-4000-8000-0000000000c3' and plan_date = '2026-09-07'),
  'Keep this review', 'existing end-of-day review survives migration');
select is((select jsonb_array_length(payload #> '{data,templates}') from public.account_state
  where user_id = '00000000-0000-4000-8000-0000000000c3' and namespace = 'planner_templates'),
  2, 'existing and active recurring templates share the canonical account envelope');
select is((select count(*)::integer from public.plan_items
  where user_id = '00000000-0000-4000-8000-0000000000c3' and is_archived = false),
  0, 'legacy rows are retained and archived after conversion');
select is((select count(*)::integer from public.planner_day_plans
  where user_id = '00000000-0000-4000-8000-0000000000c3' and plan_date <> '2026-09-07'),
  0, 'uncompleted recurrence and archived tasks do not create fictional dated work');
select is((select count(*)::integer from public.planner_day_plans as day,
  lateral jsonb_array_elements(day.sessions) as block
  where day.user_id = '00000000-0000-4000-8000-0000000000c3'
    and block #>> '{execution,completedAt}' is not null),
  1, 'recorded completion remains attached to exactly one concrete block');

select * from finish();
rollback;
