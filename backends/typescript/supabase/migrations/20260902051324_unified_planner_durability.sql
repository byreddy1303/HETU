-- Unify the legacy task planner with the complete calendar DayPlan and make
-- cross-device create/update/delete behavior explicit and recoverable.
--
-- `revision` is the optimistic-concurrency token. Deleted days remain as
-- tombstones so a stale device cannot recreate them by replaying an old plan.
-- The mutation id makes retrying an acknowledged write idempotent when the
-- client lost the response after the database committed it.

set search_path = public, extensions;

alter table public.planner_day_plans
  add column if not exists revision bigint not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists last_mutation_id text;

-- Executable blocks now include exact question prescriptions and receipts.
-- The original lightweight notification mirror allowed only 64 KiB/24 blocks,
-- which is too small for a complete historical agenda or merged legacy day.
alter table public.planner_day_plans
  drop constraint if exists planner_day_plans_sessions_check1,
  drop constraint if exists planner_day_plans_sessions_check2,
  drop constraint if exists planner_day_plans_sessions_size,
  add constraint planner_day_plans_sessions_size check (pg_column_size(sessions) <= 5242880);

alter table public.planner_day_plans
  drop constraint if exists planner_day_plans_revision_positive,
  add constraint planner_day_plans_revision_positive check (revision > 0),
  drop constraint if exists planner_day_plans_mutation_id_length,
  add constraint planner_day_plans_mutation_id_length check (
    last_mutation_id is null or char_length(last_mutation_id) between 1 and 180
  ),
  drop constraint if exists planner_day_plans_tombstone_payload,
  add constraint planner_day_plans_tombstone_payload check (
    deleted_at is null
    or (sessions = '[]'::jsonb and plan is null)
  );

create index if not exists planner_day_plans_live_by_date
  on public.planner_day_plans (user_id, plan_date)
  where deleted_at is null;

create index if not exists planner_day_plans_tombstones
  on public.planner_day_plans (user_id, deleted_at desc)
  where deleted_at is not null;

-- -------------------------------------------------------------------------
-- Import the finite legacy task evidence before archiving the old projection.
-- One-off tasks become dated DayPlan blocks. Every recorded recurring-task
-- completion also becomes a dated completed block, so no execution evidence is
-- lost. Open recurrence rules become typed Planner templates below.
-- -------------------------------------------------------------------------

with legacy_occurrences as (
  select item.id as item_id, item.user_id, item.due_date as on_date
  from public.plan_items as item
  where item.rrule_kind = 'none' and item.is_archived = false
  union
  select completion.item_id, completion.user_id, completion.on_date
  from public.plan_item_completions as completion
), legacy_sessions as (
  select
    occurrence.user_id,
    occurrence.on_date,
    max(coalesce(completion.completed_at, item.updated_at, item.created_at)) as updated_at,
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', 'legacy-plan-item:' || item.id::text || ':' || occurrence.on_date::text,
          'subject', coalesce(nullif(btrim(item.subject), ''), 'Custom...'),
          'subjectId', item.subject_id,
          'durationMin', coalesce(item.target_min, 60),
          'mode', 'Deep Study',
          'priority', 'P2 High',
          'target', item.title,
          'resource', item.notes
        )
        || case
          when completion.completed_at is null then '{}'::jsonb
          else jsonb_build_object(
            'execution', jsonb_build_object(
              'sessionId', null,
              'startedAt', null,
              'completedAt', completion.completed_at,
              'actualMin', coalesce(item.target_min, 60),
              'manual', true
            )
          )
        end
      )
      order by item.created_at, item.id
    ) as sessions
  from legacy_occurrences as occurrence
  join public.plan_items as item
    on item.user_id = occurrence.user_id and item.id = occurrence.item_id
  left join public.plan_item_completions as completion
    on completion.user_id = occurrence.user_id
   and completion.item_id = occurrence.item_id
   and completion.on_date = occurrence.on_date
  group by occurrence.user_id, occurrence.on_date
)
  insert into public.planner_day_plans (
    user_id,
    plan_date,
    sessions,
    plan,
    updated_at,
    revision,
    deleted_at,
    last_mutation_id
  )
  select
    legacy.user_id,
    legacy.on_date,
    legacy.sessions,
    jsonb_build_object(
      'date', legacy.on_date,
      'sessions', legacy.sessions,
      'updatedAt', legacy.updated_at
    ),
    legacy.updated_at,
    1,
    null,
    'legacy-plan-items:' || legacy.on_date::text
  from legacy_sessions as legacy
  on conflict (user_id, plan_date) do update
  set
    sessions = (
      select coalesce(jsonb_agg(candidate.value order by candidate.position), '[]'::jsonb)
      from (
        select existing.value, existing.ordinality::bigint as position
        from jsonb_array_elements(public.planner_day_plans.sessions)
          with ordinality as existing(value, ordinality)
        union all
        select incoming.value, 1000000 + incoming.ordinality::bigint
        from jsonb_array_elements(excluded.sessions)
          with ordinality as incoming(value, ordinality)
        where not exists (
          select 1
          from jsonb_array_elements(public.planner_day_plans.sessions) as existing(value)
          where existing.value->>'id' = incoming.value->>'id'
        )
      ) as candidate
    ),
    updated_at = greatest(public.planner_day_plans.updated_at, excluded.updated_at),
    revision = public.planner_day_plans.revision + 1,
    deleted_at = null,
    last_mutation_id = excluded.last_mutation_id;

-- Use a separate statement: PostgreSQL cannot update a row twice inside one
-- data-modifying CTE. The marker identifies exactly the rows imported above.
update public.planner_day_plans as day
set
  plan = jsonb_set(
    coalesce(
      day.plan,
      jsonb_build_object(
        'date', day.plan_date,
        'updatedAt', day.updated_at
      )
    ),
    '{sessions}',
    day.sessions,
    true
  )
where day.last_mutation_id = 'legacy-plan-items:' || day.plan_date::text;

-- Recurrences are finite rule definitions, not execution evidence. Convert
-- them into the same account-scoped typed template shape used by the client.
with legacy_templates as (
  select
    item.user_id,
    max(item.updated_at) as updated_at,
    jsonb_agg(
      jsonb_build_object(
        'id', 'legacy-plan-item:' || item.id::text,
        'name', left(item.title, 80),
        'block', jsonb_build_object(
          'subject', coalesce(nullif(btrim(item.subject), ''), 'Custom...'),
          'subjectId', item.subject_id,
          'customSubject', null,
          'durationMin', coalesce(item.target_min, 60),
          'mode', 'Deep Study',
          'priority', 'P2 High',
          'target', item.title,
          'resource', item.notes,
          'startAt', null
        ),
        'recurrence', jsonb_build_object(
          'kind', item.rrule_kind::text,
          'interval', 1,
          'weekdays', case item.rrule_kind
            when 'weekdays' then '[1,2,3,4,5]'::jsonb
            when 'weekly' then jsonb_build_array(extract(dow from item.due_date)::integer)
            else '[]'::jsonb
          end,
          'startDate', item.due_date,
          'endDate', item.ends_on,
          'maxOccurrences', null
        ),
        'createdAt', item.created_at,
        'updatedAt', item.updated_at
      )
      order by item.created_at, item.id
    ) as templates
  from public.plan_items as item
  where item.rrule_kind <> 'none' and item.is_archived = false
  group by item.user_id
)
insert into public.account_state (user_id, namespace, payload, updated_at)
select
  legacy.user_id,
  'planner_templates',
  jsonb_build_object(
    'schemaVersion', 1,
    'data', jsonb_build_object('templates', legacy.templates)
  ),
  legacy.updated_at
from legacy_templates as legacy
on conflict (user_id, namespace) do update
set
  payload = jsonb_set(
    (coalesce(public.account_state.payload, '{}'::jsonb) - 'templates')
      || jsonb_build_object(
        'schemaVersion', 1,
        'data', coalesce(public.account_state.payload->'data', '{}'::jsonb)
      ),
    '{data,templates}',
    (
      select coalesce(jsonb_agg(candidate.value order by candidate.position), '[]'::jsonb)
      from (
        select existing.value, existing.ordinality::bigint as position
        from jsonb_array_elements(
          coalesce(
            public.account_state.payload #> '{data,templates}',
            public.account_state.payload->'templates',
            '[]'::jsonb
          )
        ) with ordinality as existing(value, ordinality)
        union all
        select incoming.value, 1000000 + incoming.ordinality::bigint
        from jsonb_array_elements(excluded.payload #> '{data,templates}')
          with ordinality as incoming(value, ordinality)
        where not exists (
          select 1
          from jsonb_array_elements(
            coalesce(
              public.account_state.payload #> '{data,templates}',
              public.account_state.payload->'templates',
              '[]'::jsonb
            )
          ) as existing(value)
          where existing.value->>'id' = incoming.value->>'id'
        )
      ) as candidate
    ),
    true
  ),
  updated_at = greatest(public.account_state.updated_at, excluded.updated_at);

-- The old rows remain available for audit/rollback, but no longer participate
-- in notifications or future planning after their unified artifacts exist.
update public.plan_items
set is_archived = true, updated_at = now()
where is_archived = false;

-- -------------------------------------------------------------------------
-- Atomic mutation API. SECURITY INVOKER keeps normal RLS ownership checks in
-- force; the user id is always taken from auth.uid() and is never an argument.
-- -------------------------------------------------------------------------

create or replace function public.apply_planner_day_plan_mutation(
  p_plan_date date,
  p_expected_revision bigint,
  p_mutation_id text,
  p_sessions jsonb,
  p_plan jsonb,
  p_deleted_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
  current_row public.planner_day_plans%rowtype;
  saved_row public.planner_day_plans%rowtype;
  conflict_kind text := null;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_plan_date is null then
    raise exception 'Planner date is required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Planner expected revision must be zero or greater';
  end if;
  if p_mutation_id is null or char_length(btrim(p_mutation_id)) not between 1 and 180 then
    raise exception 'Planner mutation id is invalid';
  end if;
  if p_deleted_at is null then
    if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
      raise exception 'A live Planner mutation requires an object plan';
    end if;
    if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
      raise exception 'A live Planner mutation requires a sessions array';
    end if;
  end if;

  -- Row locks do not lock a missing date. Serialize the first insert too so
  -- simultaneous device creates receive a revision receipt, not a unique-key
  -- exception. The lock lasts only for this transaction and account/date.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text || ':' || p_plan_date::text, 0)
  );

  select *
  into current_row
  from public.planner_day_plans
  where user_id = caller_id and plan_date = p_plan_date
  for update;

  if found and current_row.last_mutation_id = p_mutation_id then
    return jsonb_build_object(
      'applied', true,
      'conflict', 'idempotent_retry',
      'row', to_jsonb(current_row)
    );
  end if;

  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object(
        'applied', false,
        'conflict', 'missing_expected_row',
        'row', null
      );
    end if;

    insert into public.planner_day_plans (
      user_id,
      plan_date,
      sessions,
      plan,
      updated_at,
      revision,
      deleted_at,
      last_mutation_id
    ) values (
      caller_id,
      p_plan_date,
      case when p_deleted_at is null then p_sessions else '[]'::jsonb end,
      case when p_deleted_at is null then p_plan else null end,
      now(),
      1,
      p_deleted_at,
      p_mutation_id
    )
    returning * into saved_row;

    return jsonb_build_object('applied', true, 'conflict', null, 'row', to_jsonb(saved_row));
  end if;

  if current_row.revision <> p_expected_revision then
    if current_row.deleted_at is not null and p_deleted_at is null then
      return jsonb_build_object(
        'applied', false,
        'conflict', 'deletion_wins',
        'row', to_jsonb(current_row)
      );
    end if;
    if p_deleted_at is null then
      return jsonb_build_object(
        'applied', false,
        'conflict', 'version_conflict',
        'row', to_jsonb(current_row)
      );
    end if;
    conflict_kind := 'stale_delete_applied';
  end if;

  update public.planner_day_plans
  set
    sessions = case when p_deleted_at is null then p_sessions else '[]'::jsonb end,
    plan = case when p_deleted_at is null then p_plan else null end,
    updated_at = now(),
    revision = current_row.revision + 1,
    deleted_at = p_deleted_at,
    last_mutation_id = p_mutation_id
  where user_id = caller_id and plan_date = p_plan_date
  returning * into saved_row;

  return jsonb_build_object(
    'applied', true,
    'conflict', conflict_kind,
    'row', to_jsonb(saved_row)
  );
end
$function$;

-- Reject legacy direct overwrites that omit the optimistic revision. New rows
-- remain insertable for rollout safety, but every update must advance exactly
-- one revision and carry a fresh mutation id.
create or replace function public.enforce_planner_day_plan_revision()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Planner revision conflict';
  end if;
  if new.last_mutation_id is null
     or new.last_mutation_id is not distinct from old.last_mutation_id then
    raise exception 'Planner mutation id must change with every revision';
  end if;
  return new;
end
$function$;

drop trigger if exists planner_day_plans_enforce_revision on public.planner_day_plans;
create trigger planner_day_plans_enforce_revision
before update on public.planner_day_plans
for each row execute function public.enforce_planner_day_plan_revision();

revoke all on function public.apply_planner_day_plan_mutation(
  date, bigint, text, jsonb, jsonb, timestamptz
) from public, anon;
grant execute on function public.apply_planner_day_plan_mutation(
  date, bigint, text, jsonb, jsonb, timestamptz
) to authenticated;

revoke all on function public.enforce_planner_day_plan_revision() from public, anon, authenticated;

-- Physical deletion would erase the anti-resurrection marker. Service-role
-- maintenance remains possible; authenticated clients use the mutation RPC.
revoke delete on table public.planner_day_plans from authenticated;

comment on column public.planner_day_plans.revision is
  'Monotonic optimistic-concurrency token for complete DayPlan mutations.';
comment on column public.planner_day_plans.deleted_at is
  'Retained deletion tombstone; stale active payloads cannot clear it.';
comment on column public.planner_day_plans.last_mutation_id is
  'Durable idempotency key for the last accepted client mutation.';
comment on function public.apply_planner_day_plan_mutation(
  date, bigint, text, jsonb, jsonb, timestamptz
) is
  'RLS-safe, revisioned and idempotent Planner create/update/delete boundary.';
