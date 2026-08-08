-- Make each committed PYQ response an immutable, self-contained audit row.
-- Capture version 0 identifies attempts created by the 2026-08-07 regression,
-- where selected_answer cannot be trusted. Version 1 is the older pre-session
-- shape. The production client writes version 2 with exact timing + snapshot.

alter table public.pyq_sessions
  add column if not exists current_question_uid text,
  add column if not exists current_question_started_at timestamptz;

update public.pyq_sessions
set status = 'completed',
    completed_at = coalesce(completed_at, updated_at),
    current_question_uid = null,
    current_question_started_at = null
where status = 'active'
  and current_index >= cardinality(question_uids);

-- Keep only the newest unfinished set active. Older rows remain available as
-- abandoned history; this prevents two devices from opening competing sets.
with ranked as (
  select id,
         row_number() over (partition by user_id order by updated_at desc, id desc) as position
  from public.pyq_sessions
  where status = 'active'
)
update public.pyq_sessions as sessions
set status = 'abandoned',
    current_question_uid = null,
    current_question_started_at = null,
    updated_at = now()
from ranked
where sessions.id = ranked.id
  and ranked.position > 1;

create unique index if not exists pyq_sessions_one_active_per_user
  on public.pyq_sessions (user_id)
  where status = 'active';

alter table public.pyq_attempts
  add column if not exists capture_version smallint not null default 0,
  add column if not exists question_snapshot jsonb,
  add column if not exists question_started_at timestamptz,
  add column if not exists time_spent_ms int;

-- Pre-session attempts did capture the learner answer correctly, but did not
-- include an immutable key/snapshot. Session-era rows before this fix keep
-- version 0 so no future UI presents their selected_answer as verified.
update public.pyq_attempts
set capture_version = 1
where pyq_session_id is null
  and capture_version = 0;

alter table public.pyq_attempts
  drop constraint if exists pyq_attempts_capture_version_check,
  add constraint pyq_attempts_capture_version_check
    check (capture_version between 0 and 2),
  drop constraint if exists pyq_attempts_v2_audit_check,
  add constraint pyq_attempts_v2_audit_check check (
    capture_version <> 2
    or (
      question_snapshot is not null
      and jsonb_typeof(question_snapshot) = 'object'
      and question_snapshot ?& array[
        'question_uid', 'year', 'number', 'paper_label', 'subject',
        'subject_slug', 'subtopics', 'type', 'answer_status', 'answer_source',
        'html', 'source_url'
      ]
      and question_started_at is not null
      and question_started_at <= attempted_at
      and time_spent_ms is not null
      and time_spent_ms > 0
      and time_spent_sec = greatest(1, (time_spent_ms + 999) / 1000)
      and (
        (mark_decision = 'SKIP' and selected_answer is null and mark_correct is null)
        or (mark_decision <> 'SKIP' and selected_answer is not null)
      )
      and (answer_status <> 'available' or correct_answer is not null)
    )
  );

create or replace function public.prevent_pyq_attempt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Idempotent upserts are allowed so an offline retry can acknowledge a row
  -- whose first network response was lost. Any material rewrite is rejected.
  if new is distinct from old then
    raise exception 'Committed PYQ attempts are immutable';
  end if;
  return old;
end;
$$;

drop trigger if exists pyq_attempts_immutable on public.pyq_attempts;
create trigger pyq_attempts_immutable
before update on public.pyq_attempts
for each row execute function public.prevent_pyq_attempt_mutation();

-- Account deletion still cascades from users; ordinary clients cannot erase
-- individual audit rows.
drop policy if exists del_own on public.pyq_attempts;
