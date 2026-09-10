-- Canonical, append-only recovery evidence for the Planner -> PYQ -> Recovery loop.
--
-- Existing Journal questions and reattempt ladders remain compatibility data.
-- `learning_items` owns the single active schedule for one underlying question;
-- `learning_events` preserves every attempt, retrieval, cue, defer, interruption,
-- remediation, transfer, and mastery transition without mutable JSON history.

set search_path = public, extensions;

create unique index if not exists questions_user_id_id_unique
  on public.questions (user_id, id);

alter table public.questions
  add column if not exists nat_tolerance_abs numeric,
  add column if not exists nat_accepted_min numeric,
  add column if not exists nat_accepted_max numeric;

alter table public.questions
  drop constraint if exists questions_nat_tolerance_check,
  add constraint questions_nat_tolerance_check check (
    nat_tolerance_abs is null or nat_tolerance_abs >= 0
  ),
  drop constraint if exists questions_nat_range_check,
  add constraint questions_nat_range_check check (
    (nat_accepted_min is null and nat_accepted_max is null)
    or
    (nat_accepted_min is not null and nat_accepted_max is not null
      and nat_accepted_min <= nat_accepted_max)
  );

alter table public.pyq_attempts
  add column if not exists confidence text;

alter table public.pyq_attempts
  drop constraint if exists pyq_attempts_confidence_check,
  add constraint pyq_attempts_confidence_check check (
    confidence is null or confidence in ('low', 'medium', 'high')
  );

-- Readiness v3 corrects a semantic error: D30 means the 30-day test is still
-- waiting. Only MASTERED (a successful due-D30 recall) is stabilised evidence.
alter table public.readiness_snapshots
  drop constraint if exists readiness_snapshots_v2_evidence_check,
  add constraint readiness_snapshots_versioned_evidence_check check (
    calculation_version < 2
    or (
      jsonb_typeof(evidence_counts) = 'object'
      and evidence_counts ?& array[
        'attempts', 'correct', 'wrong', 'skipped', 'ungraded', 'uncertain'
      ]
      and jsonb_typeof(components) = 'object'
      and components ?& array['coverage', 'retention', 'calibration', 'surface']
    )
  );

create or replace function public.protect_readiness_methodology()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.calculation_version >= 2 and new.calculation_version < old.calculation_version then
    raise exception 'A readiness snapshot cannot be downgraded to an older methodology';
  end if;
  if old.calculation_version >= 2
     and new.calculation_version = old.calculation_version
     and new.score is distinct from old.score
     and new.evidence_counts is not distinct from old.evidence_counts
     and new.components is not distinct from old.components then
    raise exception 'Readiness score changes require matching evidence or component changes';
  end if;
  return new;
end;
$$;

create or replace function public.readiness_median_for_band(
  band_width_days int default 7
)
returns table (median numeric, sample_size int)
language plpgsql
stable security definer set search_path = public
as $$
declare
  caller_days_to_exam int;
  current_version constant smallint := 3;
  min_sample constant int := 3;
begin
  select days_to_exam into caller_days_to_exam
    from public.readiness_snapshots
    where user_id = auth.uid()
      and calculation_version = current_version
    order by on_date desc
    limit 1;

  if caller_days_to_exam is null then
    return query select null::numeric, 0::int;
    return;
  end if;

  return query
    with peers as (
      select distinct on (user_id) user_id, score
      from public.readiness_snapshots
      where user_id <> auth.uid()
        and calculation_version = current_version
        and days_to_exam between caller_days_to_exam - band_width_days
                            and caller_days_to_exam + band_width_days
      order by user_id, on_date desc
    ), stats as (
      select
        percentile_cont(0.5) within group (order by score)::numeric as med,
        count(*)::int as n
      from peers
    )
    select case when n >= min_sample then med else null end, n
    from stats;
end $$;

revoke all on function public.readiness_median_for_band(int) from public, anon;
grant execute on function public.readiness_median_for_band(int) to authenticated;

create table if not exists public.learning_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_kind text not null,
  question_uid text,
  source_question_id uuid,
  content_fingerprint text,
  subject text not null,
  topic text,
  origin_pyq_attempt_id uuid,
  latest_pyq_attempt_id uuid,
  analysis_state text not null default 'pending',
  recovery_state text not null default 'active',
  stage text not null default 'D3',
  scheduled_date date,
  reason_flags text[] not null default '{}'::text[],
  lapse_count integer not null default 0,
  successful_retrieval_count integer not null default 0,
  last_grade text,
  last_interval_days integer,
  successful_due_d30_at timestamptz,
  transfer_passed_at timestamptz,
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_items_user_id_id_unique unique (user_id, id),
  constraint learning_items_source_kind_check
    check (source_kind in ('pyq', 'manual')),
  constraint learning_items_identity_check check (
    (source_kind = 'pyq' and question_uid is not null and btrim(question_uid) <> '')
    or
    (source_kind = 'manual' and (source_question_id is not null
      or (content_fingerprint is not null and btrim(content_fingerprint) <> '')))
  ),
  constraint learning_items_analysis_state_check
    check (analysis_state in ('pending', 'completed', 'not-required')),
  constraint learning_items_recovery_state_check
    check (recovery_state in ('active', 'remediation', 'transfer', 'mastered', 'paused')),
  constraint learning_items_stage_check
    check (stage in ('D3', 'D10', 'D30', 'TRANSFER', 'MASTERED')),
  constraint learning_items_schedule_check check (
    (recovery_state in ('active', 'remediation', 'transfer') and scheduled_date is not null)
    or recovery_state in ('mastered', 'paused')
  ),
  constraint learning_items_grade_check
    check (last_grade is null or last_grade in ('again', 'hard', 'good', 'easy')),
  constraint learning_items_counts_check check (
    lapse_count >= 0
    and successful_retrieval_count >= 0
    and (last_interval_days is null or last_interval_days >= 0)
  ),
  constraint learning_items_source_question_owner_fk
    foreign key (user_id, source_question_id)
    references public.questions (user_id, id)
    on delete set null (source_question_id)
    deferrable initially deferred,
  constraint learning_items_origin_attempt_owner_fk
    foreign key (user_id, origin_pyq_attempt_id)
    references public.pyq_attempts (user_id, id)
    on delete no action
    deferrable initially deferred,
  constraint learning_items_latest_attempt_owner_fk
    foreign key (user_id, latest_pyq_attempt_id)
    references public.pyq_attempts (user_id, id)
    on delete no action
    deferrable initially deferred
);

create unique index if not exists learning_items_one_pyq_identity
  on public.learning_items (user_id, question_uid)
  where source_kind = 'pyq';

create unique index if not exists learning_items_one_manual_question_identity
  on public.learning_items (user_id, source_question_id)
  where source_kind = 'manual' and source_question_id is not null;

create unique index if not exists learning_items_one_manual_fingerprint_identity
  on public.learning_items (user_id, content_fingerprint)
  where source_kind = 'manual' and content_fingerprint is not null;

create index if not exists learning_items_due_queue
  on public.learning_items (user_id, scheduled_date, stage)
  where recovery_state in ('active', 'remediation', 'transfer');

create index if not exists learning_items_by_subject
  on public.learning_items (user_id, subject, updated_at desc);

create table if not exists public.learning_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  learning_item_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null,
  local_date date not null,
  timezone text not null,
  source_pyq_attempt_id uuid,
  recovery_session_id uuid,
  grade text,
  is_correct boolean,
  answer jsonb,
  confidence text,
  time_spent_ms integer,
  hint_used boolean not null default false,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint learning_events_user_id_id_unique unique (user_id, id),
  constraint learning_events_item_owner_fk
    foreign key (user_id, learning_item_id)
    references public.learning_items (user_id, id)
    on delete cascade,
  constraint learning_events_attempt_owner_fk
    foreign key (user_id, source_pyq_attempt_id)
    references public.pyq_attempts (user_id, id)
    on delete no action
    deferrable initially deferred,
  constraint learning_events_type_check check (event_type in (
    'created', 'answer_committed', 'retrieval_started',
    'retrieval_again', 'retrieval_hard', 'retrieval_good', 'retrieval_easy',
    'hint_revealed', 'deferred', 'interrupted', 'analysis_completed',
    'remediation_started', 'remediation_completed', 'transfer_assigned',
    'transfer_passed', 'transfer_failed', 'mastered', 'reopened'
  )),
  constraint learning_events_grade_check
    check (grade is null or grade in ('again', 'hard', 'good', 'easy')),
  constraint learning_events_confidence_check
    check (confidence is null or confidence in ('low', 'medium', 'high')),
  constraint learning_events_time_check
    check (time_spent_ms is null or time_spent_ms >= 0),
  constraint learning_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists learning_events_idempotent
  on public.learning_events (user_id, idempotency_key);

create index if not exists learning_events_item_timeline
  on public.learning_events (user_id, learning_item_id, occurred_at, id);

create index if not exists learning_events_by_type
  on public.learning_events (user_id, event_type, occurred_at desc);

create index if not exists learning_events_by_source_attempt
  on public.learning_events (user_id, source_pyq_attempt_id)
  where source_pyq_attempt_id is not null;

create table if not exists public.recovery_sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active',
  mode text not null default 'due',
  selection_seed text not null,
  item_ids uuid[] not null default '{}'::uuid[],
  current_index integer not null default 0,
  queue_snapshot jsonb not null default '[]'::jsonb,
  draft_answer jsonb,
  elapsed_by_item_ms jsonb not null default '{}'::jsonb,
  deferred_item_ids uuid[] not null default '{}'::uuid[],
  hinted_item_ids uuid[] not null default '{}'::uuid[],
  current_item_started_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint recovery_sessions_user_id_id_unique unique (user_id, id),
  constraint recovery_sessions_status_check
    check (status in ('active', 'paused', 'completed', 'abandoned', 'interrupted')),
  constraint recovery_sessions_mode_check
    check (mode in ('due', 'minutes-10', 'minutes-20', 'minutes-30', 'questions-5', 'all')),
  constraint recovery_sessions_index_check
    check (current_index >= 0 and current_index <= cardinality(item_ids)),
  constraint recovery_sessions_snapshot_check
    check (jsonb_typeof(queue_snapshot) = 'array'),
  constraint recovery_sessions_elapsed_check
    check (jsonb_typeof(elapsed_by_item_ms) = 'object')
);

create index if not exists recovery_sessions_active
  on public.recovery_sessions (user_id, updated_at desc)
  where status in ('active', 'paused', 'interrupted');

alter table public.learning_events
  drop constraint if exists learning_events_recovery_session_owner_fk,
  add constraint learning_events_recovery_session_owner_fk
    foreign key (user_id, recovery_session_id)
    references public.recovery_sessions (user_id, id)
    on delete no action
    deferrable initially deferred;

alter table public.reattempts
  add column if not exists learning_item_id uuid;

alter table public.reattempts
  drop constraint if exists reattempts_learning_item_owner_fk,
  add constraint reattempts_learning_item_owner_fk
    foreign key (user_id, learning_item_id)
    references public.learning_items (user_id, id)
    on delete set null (learning_item_id)
    deferrable initially deferred;

create index if not exists reattempts_by_learning_item
  on public.reattempts (user_id, learning_item_id)
  where learning_item_id is not null;

-- Preserve legacy ladders as canonical items. Repeated PYQ attempts collapse by
-- immutable question_uid; manual questions retain their own identity. The most
-- conservative open stage and earliest open due date win, while events below
-- retain every row and history entry.
with legacy as (
  select
    r.id as reattempt_id,
    r.user_id,
    r.question_id,
    r.scheduled_date,
    r.stage::text as stage,
    r.history,
    r.created_at,
    q.subject,
    q.subtopic,
    q.mark_decision,
    q.mark_correct,
    q.time_spent_sec,
    q.target_time_sec,
    q.source_pyq_attempt_id,
    a.question_uid,
    a.attempted_at,
    case
      when a.question_uid is not null then 'pyq:' || a.question_uid
      else 'manual:' || q.id::text
    end as identity_key,
    case
      when q.mark_decision = 'SKIP' then 'skipped'
      when q.mark_correct = false then 'wrong'
      when q.mark_decision = 'FIFTY_FIFTY' and q.mark_correct = true then 'guessed-correct'
      when q.mark_correct = true and q.time_spent_sec > q.target_time_sec then 'slow-correct'
      else 'legacy-recovery'
    end as reason_flag,
    (
      select count(*)::integer
      from jsonb_array_elements(coalesce(r.history, '[]'::jsonb)) as history_entry
      where history_entry->>'result' = 'fail'
    ) as lapse_count
  from public.reattempts as r
  join public.questions as q
    on q.user_id = r.user_id and q.id = r.question_id
  left join public.pyq_attempts as a
    on a.user_id = q.user_id and a.id = q.source_pyq_attempt_id
), grouped as (
  select
    user_id,
    identity_key,
    (array_agg(reattempt_id order by created_at, reattempt_id))[1] as id,
    (array_agg(question_id order by created_at desc, question_id))[1] as source_question_id,
    (array_agg(subject order by created_at desc))[1] as subject,
    (array_agg(subtopic order by created_at desc) filter (where subtopic is not null))[1] as topic,
    (array_agg(question_uid order by attempted_at, source_pyq_attempt_id)
      filter (where question_uid is not null))[1] as question_uid,
    (array_agg(source_pyq_attempt_id order by attempted_at, source_pyq_attempt_id)
      filter (where source_pyq_attempt_id is not null))[1] as origin_pyq_attempt_id,
    (array_agg(source_pyq_attempt_id order by attempted_at desc, source_pyq_attempt_id desc)
      filter (where source_pyq_attempt_id is not null))[1] as latest_pyq_attempt_id,
    case
      when bool_and(stage = 'MASTERED') then 'MASTERED'
      else (array_agg(stage order by
        case stage when 'D3' then 1 when 'D10' then 2 when 'D30' then 3 else 4 end,
        scheduled_date
      ) filter (where stage <> 'MASTERED'))[1]
    end as stage,
    min(scheduled_date) filter (where stage <> 'MASTERED') as scheduled_date,
    array_agg(distinct reason_flag order by reason_flag) as reason_flags,
    sum(lapse_count)::integer as lapse_count,
    min(created_at) as created_at,
    max(created_at) as updated_at
  from legacy
  group by user_id, identity_key
)
insert into public.learning_items (
  id, user_id, source_kind, question_uid, source_question_id, subject, topic,
  origin_pyq_attempt_id, latest_pyq_attempt_id, analysis_state, recovery_state,
  stage, scheduled_date, reason_flags, lapse_count, created_at, updated_at
)
select
  id,
  user_id,
  case when question_uid is null then 'manual' else 'pyq' end,
  question_uid,
  source_question_id,
  subject,
  topic,
  origin_pyq_attempt_id,
  latest_pyq_attempt_id,
  'completed',
  case when stage = 'MASTERED' then 'mastered' else 'active' end,
  stage,
  scheduled_date,
  reason_flags,
  lapse_count,
  created_at,
  updated_at
from grouped
on conflict do nothing;

update public.reattempts as reattempt
set learning_item_id = item.id
from public.questions as question
left join public.pyq_attempts as source_attempt
  on source_attempt.user_id = question.user_id
 and source_attempt.id = question.source_pyq_attempt_id
join public.learning_items as item
  on item.user_id = question.user_id
 and (
   (item.source_kind = 'pyq' and item.question_uid = source_attempt.question_uid)
   or
   (item.source_kind = 'manual' and item.source_question_id = question.id)
 )
where question.user_id = reattempt.user_id
  and question.id = reattempt.question_id
  and reattempt.learning_item_id is null;

-- One creation event per legacy ladder means duplicate ladders remain visible
-- even though their mutable schedule projection is now canonical.
insert into public.learning_events (
  id, user_id, learning_item_id, event_type, occurred_at, local_date, timezone,
  idempotency_key, metadata, created_at
)
select
  reattempt.id,
  reattempt.user_id,
  reattempt.learning_item_id,
  'created',
  reattempt.created_at,
  (reattempt.created_at at time zone coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'))::date,
  coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'),
  'legacy-created:' || reattempt.id::text,
  jsonb_build_object(
    'legacy_reattempt_id', reattempt.id,
    'legacy_question_id', reattempt.question_id,
    'legacy_stage', reattempt.stage,
    'legacy_scheduled_date', reattempt.scheduled_date
  ),
  reattempt.created_at
from public.reattempts as reattempt
join public.users as app_user on app_user.id = reattempt.user_id
where reattempt.learning_item_id is not null
on conflict (user_id, idempotency_key) do nothing;

-- Import every immutable PYQ attempt for an already-known canonical item.
insert into public.learning_events (
  id, user_id, learning_item_id, event_type, occurred_at, local_date, timezone,
  source_pyq_attempt_id, grade, is_correct, answer, confidence, time_spent_ms,
  idempotency_key, metadata, created_at
)
select
  attempt.id,
  attempt.user_id,
  item.id,
  'answer_committed',
  attempt.attempted_at,
  (attempt.attempted_at at time zone coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'))::date,
  coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'),
  attempt.id,
  null,
  attempt.mark_correct,
  attempt.selected_answer,
  attempt.confidence,
  greatest(0, coalesce(attempt.time_spent_ms, attempt.time_spent_sec * 1000)),
  'attempt:' || attempt.id::text,
  jsonb_build_object(
    'mark_decision', attempt.mark_decision,
    'question_uid', attempt.question_uid,
    'capture_version', attempt.capture_version,
    'legacy_import', true
  ),
  attempt.attempted_at
from public.pyq_attempts as attempt
join public.learning_items as item
  on item.user_id = attempt.user_id
 and item.source_kind = 'pyq'
 and item.question_uid = attempt.question_uid
join public.users as app_user on app_user.id = attempt.user_id
on conflict (user_id, idempotency_key) do nothing;

-- Expand each mutable JSON history entry into an immutable event. Malformed or
-- date-less legacy entries remain evidence using the ladder creation date.
insert into public.learning_events (
  id, user_id, learning_item_id, event_type, occurred_at, local_date, timezone,
  grade, is_correct, answer, time_spent_ms, idempotency_key, metadata, created_at
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'hetu:learning-event:legacy-history:' || reattempt.id::text || ':' || history.ordinality::text
  ),
  reattempt.user_id,
  reattempt.learning_item_id,
  case when history.value->>'result' = 'clean' then 'retrieval_good' else 'retrieval_again' end,
  reattempt.created_at + make_interval(secs => history.ordinality::integer),
  case
    when coalesce(history.value->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (history.value->>'date')::date
    else (reattempt.created_at at time zone coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'))::date
  end,
  coalesce(nullif(app_user.timezone, ''), 'Asia/Kolkata'),
  case when history.value->>'result' = 'clean' then 'good' else 'again' end,
  history.value->>'result' = 'clean',
  history.value->'selectedAnswer',
  case
    when coalesce(history.value->>'timeSpent', '') ~ '^\d+(\.\d+)?$'
      then greatest(0, round((history.value->>'timeSpent')::numeric * 1000)::integer)
    else null
  end,
  'legacy-history:' || reattempt.id::text || ':' || history.ordinality::text,
  jsonb_build_object(
    'legacy_reattempt_id', reattempt.id,
    'legacy_history', history.value,
    'legacy_import', true
  ),
  reattempt.created_at
from public.reattempts as reattempt
join public.users as app_user on app_user.id = reattempt.user_id
cross join lateral jsonb_array_elements(coalesce(reattempt.history, '[]'::jsonb))
  with ordinality as history(value, ordinality)
where reattempt.learning_item_id is not null
on conflict (user_id, idempotency_key) do nothing;

create or replace function public.touch_closed_learning_loop_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists learning_items_touch_updated_at on public.learning_items;
create trigger learning_items_touch_updated_at
before update on public.learning_items
for each row execute function public.touch_closed_learning_loop_row();

drop trigger if exists recovery_sessions_touch_updated_at on public.recovery_sessions;
create trigger recovery_sessions_touch_updated_at
before update on public.recovery_sessions
for each row execute function public.touch_closed_learning_loop_row();

create or replace function public.reject_learning_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Learning events are append-only';
end;
$$;

drop trigger if exists learning_events_append_only on public.learning_events;
create trigger learning_events_append_only
before update or delete on public.learning_events
for each row execute function public.reject_learning_event_mutation();

revoke all on function public.touch_closed_learning_loop_row() from public, anon, authenticated;
revoke all on function public.reject_learning_event_mutation() from public, anon, authenticated;
revoke all on function public.protect_readiness_methodology() from public, anon, authenticated;

-- The legacy SECURITY DEFINER retry RPC had no ownership predicate and is not
-- part of the new client contract. Make it invoker-safe and non-callable.
alter function public.advance_reattempt(uuid, text) security invoker;
alter function public.advance_reattempt(uuid, text) set search_path = public;
revoke all on function public.advance_reattempt(uuid, text) from public, anon, authenticated;

-- Repair the legacy reattempt UPDATE policy so ownership cannot be reassigned.
drop policy if exists upd_own on public.reattempts;
create policy upd_own on public.reattempts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.learning_items enable row level security;
alter table public.learning_events enable row level security;
alter table public.recovery_sessions enable row level security;

drop policy if exists learning_items_select_own on public.learning_items;
create policy learning_items_select_own on public.learning_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists learning_items_insert_own on public.learning_items;
create policy learning_items_insert_own on public.learning_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists learning_items_update_own on public.learning_items;
create policy learning_items_update_own on public.learning_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists learning_events_select_own on public.learning_events;
create policy learning_events_select_own on public.learning_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists learning_events_insert_own on public.learning_events;
create policy learning_events_insert_own on public.learning_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.learning_items as item
      where item.user_id = (select auth.uid())
        and item.id = learning_item_id
    )
  );

drop policy if exists recovery_sessions_select_own on public.recovery_sessions;
create policy recovery_sessions_select_own on public.recovery_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recovery_sessions_insert_own on public.recovery_sessions;
create policy recovery_sessions_insert_own on public.recovery_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists recovery_sessions_update_own on public.recovery_sessions;
create policy recovery_sessions_update_own on public.recovery_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.learning_items from public, anon, authenticated;
revoke all on table public.learning_events from public, anon, authenticated;
revoke all on table public.recovery_sessions from public, anon, authenticated;
revoke all on table public.reattempts from public, anon, authenticated;

grant select, insert, update on table public.learning_items to authenticated;
grant select, insert on table public.learning_events to authenticated;
grant select, insert, update on table public.recovery_sessions to authenticated;
grant select, insert, update, delete on table public.reattempts to authenticated;

comment on table public.learning_items is
  'One learner-owned recovery identity and schedule projection per underlying question.';
comment on table public.learning_events is
  'Immutable evidence timeline for attempts, retrieval, cues, defers, remediation, transfer, and mastery.';
comment on table public.recovery_sessions is
  'Durable checkpoint for bounded blind-retrieval sessions across refresh and app restart.';
