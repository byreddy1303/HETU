begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- Seed identities without invoking the production invite-signup workflow.
set local session_replication_role = replica;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'learning-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated', 'authenticated', 'learning-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict (id) do nothing;

insert into public.users (id, name, email, username, timezone)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'Learning A', 'learning-a@example.test', 'learning_a', 'Asia/Kolkata'
  ),
  (
    '00000000-0000-4000-8000-0000000000b2',
    'Learning B', 'learning-b@example.test', 'learning_b', 'Asia/Kolkata'
  )
on conflict (id) do nothing;

set local session_replication_role = origin;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.learning_items'::regclass),
  'learning_items has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.learning_events'::regclass),
  'learning_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.recovery_sessions'::regclass),
  'recovery_sessions has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.learning_items', 'select'),
  'anon has no learning_items Data API grant'
);
select ok(
  not has_table_privilege('anon', 'public.learning_events', 'select'),
  'anon has no learning_events Data API grant'
);
select ok(
  has_table_privilege('authenticated', 'public.learning_items', 'select')
    and has_table_privilege('authenticated', 'public.learning_items', 'insert')
    and has_table_privilege('authenticated', 'public.learning_items', 'update'),
  'authenticated has only the required learning_items grants'
);
select ok(
  has_table_privilege('authenticated', 'public.learning_events', 'select')
    and has_table_privilege('authenticated', 'public.learning_events', 'insert'),
  'authenticated can select and append learning events'
);
select ok(
  not has_table_privilege('authenticated', 'public.learning_events', 'update')
    and not has_table_privilege('authenticated', 'public.learning_events', 'delete'),
  'authenticated cannot rewrite or delete learning events'
);
select ok(
  has_table_privilege('authenticated', 'public.recovery_sessions', 'select')
    and has_table_privilege('authenticated', 'public.recovery_sessions', 'insert')
    and has_table_privilege('authenticated', 'public.recovery_sessions', 'update'),
  'authenticated has only the required recovery session grants'
);
select ok(
  not has_function_privilege('anon', 'public.advance_reattempt(uuid,text)', 'execute'),
  'anon cannot execute the legacy retry RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.advance_reattempt(uuid,text)', 'execute'),
  'authenticated cannot execute the legacy retry RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.learning_items (
      id, user_id, source_kind, content_fingerprint, subject, analysis_state,
      recovery_state, stage, scheduled_date
    ) values (
      '10000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a1',
      'manual', 'rls-a', 'Algorithms', 'pending', 'active', 'D3', current_date
    )$$,
  'user A can insert their own learning item'
);

select results_eq(
  $$select count(*)::integer from public.learning_items$$,
  array[1],
  'user A sees only their own item'
);

select lives_ok(
  $$insert into public.learning_events (
      id, user_id, learning_item_id, event_type, occurred_at, local_date,
      timezone, idempotency_key
    ) values (
      '20000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a1',
      '10000000-0000-4000-8000-0000000000a1',
      'created', now(), current_date, 'Asia/Kolkata', 'rls-a-created'
    )$$,
  'user A can append evidence to their own item'
);

select lives_ok(
  $$insert into public.recovery_sessions (
      id, user_id, status, mode, selection_seed, item_ids, current_index
    ) values (
      '30000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a1',
      'active', 'questions-5', 'rls-seed',
      array['10000000-0000-4000-8000-0000000000a1'::uuid], 0
    )$$,
  'user A can save their own recovery session'
);

select throws_ok(
  $$insert into public.learning_items (
      id, user_id, source_kind, content_fingerprint, subject, recovery_state, stage, scheduled_date
    ) values (
      '10000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000b2',
      'manual', 'cross-user', 'DBMS', 'active', 'D3', current_date
  )$$,
  '42501',
  null,
  'user A cannot insert an item owned by user B'
);

select throws_ok(
  $$update public.learning_items
    set user_id = '00000000-0000-4000-8000-0000000000b2'
    where id = '10000000-0000-4000-8000-0000000000a1'$$,
  '42501',
  null,
  'learning_items UPDATE WITH CHECK prevents ownership reassignment'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select count(*)::integer from public.learning_items$$,
  array[0],
  'user B cannot see user A learning items'
);
select results_eq(
  $$select count(*)::integer from public.learning_events$$,
  array[0],
  'user B cannot see user A learning events'
);
select results_eq(
  $$select count(*)::integer from public.recovery_sessions$$,
  array[0],
  'user B cannot see user A recovery sessions'
);

select throws_ok(
  $$insert into public.learning_events (
      id, user_id, learning_item_id, event_type, occurred_at, local_date,
      timezone, idempotency_key
    ) values (
      '20000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000b2',
      '10000000-0000-4000-8000-0000000000a1',
      'created', now(), current_date, 'Asia/Kolkata', 'cross-item-event'
  )$$,
  '42501',
  null,
  'user B cannot append evidence to user A item'
);

select throws_ok(
  $$insert into public.recovery_sessions (
      id, user_id, status, mode, selection_seed
    ) values (
      '30000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000a1',
      'active', 'due', 'cross-owner'
    )$$,
  '42501',
  null,
  'user B cannot create a recovery session owned by user A'
);

reset role;
select throws_ok(
  $$update public.learning_events
    set metadata = '{"rewritten":true}'::jsonb
    where id = '20000000-0000-4000-8000-0000000000a1'$$,
  'P0001',
  'Learning events are append-only',
  'the database trigger rejects privileged evidence mutation'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reattempts'
      and policyname = 'upd_own'
      and with_check is not null
  ),
  'legacy reattempt UPDATE policy has WITH CHECK'
);
select ok(
  not exists (
    select 1
    from pg_class as relation
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    where relation.oid in (
      'public.learning_items'::regclass,
      'public.learning_events'::regclass,
      'public.recovery_sessions'::regclass
    )
      and privilege.grantee = 0
      and privilege.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'PUBLIC receives no closed-loop Data API grants'
);

select * from finish();
rollback;
