-- Phase 1 evidence hardening for the GATE 2027 model.
--
-- This migration intentionally keeps every legacy label/receipt readable. A
-- canonical ID is filled only when the value is recognised; unknown historic
-- subjects stay verbatim with a NULL subject_id instead of being guessed.

set search_path = public, extensions;

create or replace function public.gate_subject_id(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g')
    when 'discrete mathematics' then 'discrete-mathematics'
    when 'discrete math' then 'discrete-mathematics'
    when 'dm' then 'discrete-mathematics'
    when 'engineering mathematics' then 'engineering-mathematics'
    when 'engineering math' then 'engineering-mathematics'
    when 'engineering maths' then 'engineering-mathematics'
    when 'linear algebra' then 'engineering-mathematics'
    when 'probability statistics' then 'engineering-mathematics'
    when 'probability and statistics' then 'engineering-mathematics'
    when 'digital logic' then 'digital-logic'
    when 'digital electronics' then 'digital-logic'
    when 'dl' then 'digital-logic'
    when 'coa' then 'coa'
    when 'computer organization' then 'coa'
    when 'computer organisation' then 'coa'
    when 'computer organization and architecture' then 'coa'
    when 'computer organisation and architecture' then 'coa'
    when 'computer organization architecture' then 'coa'
    when 'computer organisation architecture' then 'coa'
    when 'computer architecture' then 'coa'
    when 'c programming' then 'programming-data-structures'
    when 'c programming data structure' then 'programming-data-structures'
    when 'c programming and data structure' then 'programming-data-structures'
    when 'data structure' then 'programming-data-structures'
    when 'data structures' then 'programming-data-structures'
    when 'programming ds' then 'programming-data-structures'
    when 'programming and ds' then 'programming-data-structures'
    when 'programming data structures' then 'programming-data-structures'
    when 'programming and data structures' then 'programming-data-structures'
    when 'algorithms' then 'algorithms'
    when 'algorithm' then 'algorithms'
    when 'algo' then 'algorithms'
    when 'theory of computation' then 'theory-of-computation'
    when 'toc' then 'theory-of-computation'
    when 'automata theory' then 'theory-of-computation'
    when 'compiler design' then 'compiler-design'
    when 'compilers' then 'compiler-design'
    when 'compiler' then 'compiler-design'
    when 'cd' then 'compiler-design'
    when 'operating systems' then 'operating-systems'
    when 'operating system' then 'operating-systems'
    when 'os' then 'operating-systems'
    when 'databases' then 'databases'
    when 'database' then 'databases'
    when 'database management system' then 'databases'
    when 'database management systems' then 'databases'
    when 'dbms' then 'databases'
    when 'computer networks' then 'computer-networks'
    when 'computer network' then 'computer-networks'
    when 'networking' then 'computer-networks'
    when 'cn' then 'computer-networks'
    when 'general aptitude' then 'general-aptitude'
    when 'aptitude' then 'general-aptitude'
    when 'aptitude reasoning' then 'general-aptitude'
    when 'aptitude and reasoning' then 'general-aptitude'
    when 'ga' then 'general-aptitude'
    else null
  end;
$$;

create or replace function public.gate_subject_label(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case public.gate_subject_id(value)
    when 'discrete-mathematics' then 'Discrete Mathematics'
    when 'engineering-mathematics' then 'Engineering Mathematics'
    when 'digital-logic' then 'Digital Logic'
    when 'coa' then 'COA'
    when 'programming-data-structures' then 'Programming & DS'
    when 'algorithms' then 'Algorithms'
    when 'theory-of-computation' then 'Theory of Computation'
    when 'compiler-design' then 'Compiler Design'
    when 'operating-systems' then 'Operating Systems'
    when 'databases' then 'Databases'
    when 'computer-networks' then 'Computer Networks'
    when 'general-aptitude' then 'General Aptitude'
    else value
  end;
$$;

-- First merge topic-progress rows which become identical after alias
-- normalisation. Completion is monotonic, so retaining the latest timestamp
-- preserves the strongest evidence while avoiding a unique-key collision.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, public.gate_subject_id(subject), lower(trim(topic))
      order by completed_at desc, updated_at desc, id
    ) as keeper_id,
    max(completed_at) over (
      partition by user_id, public.gate_subject_id(subject), lower(trim(topic))
    ) as merged_completed_at,
    max(updated_at) over (
      partition by user_id, public.gate_subject_id(subject), lower(trim(topic))
    ) as merged_updated_at,
    row_number() over (
      partition by user_id, public.gate_subject_id(subject), lower(trim(topic))
      order by completed_at desc, updated_at desc, id
    ) as position
  from public.topic_progress
  where public.gate_subject_id(subject) is not null
), updated_keepers as (
  update public.topic_progress as target
  set completed_at = ranked.merged_completed_at,
      updated_at = ranked.merged_updated_at
  from ranked
  where target.id = ranked.keeper_id
    and ranked.position = 1
  returning target.id
)
delete from public.topic_progress as target
using ranked
where target.id = ranked.id
  and ranked.position > 1;

alter table public.sessions add column if not exists subject_id text;
alter table public.questions add column if not exists subject_id text;
alter table public.patterns add column if not exists subject_id text;
alter table public.formulas add column if not exists subject_id text;
alter table public.topic_progress add column if not exists subject_id text;
alter table public.pyq_attempts add column if not exists subject_id text;
alter table public.plan_items add column if not exists subject_id text;
alter table public.study_rooms add column if not exists subject_id text;

update public.sessions
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

update public.questions
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

update public.patterns
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

update public.formulas
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

update public.topic_progress
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

update public.plan_items
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where subject is not null
  and public.gate_subject_id(subject) is not null;

update public.study_rooms
set subject_id = public.gate_subject_id(subject),
    subject = public.gate_subject_label(subject)
where public.gate_subject_id(subject) is not null;

-- Existing attempt rows are protected by an immutable trigger. Disable it in
-- an exception-safe block and always restore it, including on migration error.
do $$
begin
  alter table public.pyq_attempts disable trigger pyq_attempts_immutable;
  begin
    update public.pyq_attempts
    set subject_id = public.gate_subject_id(subject),
        subject = public.gate_subject_label(subject)
    where public.gate_subject_id(subject) is not null;
  exception when others then
    alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
    raise;
  end;
  alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
end $$;

-- Canonicalise subject-bearing JSON mirrors without dropping unknown/custom
-- rows or labels. Their stale IDs are cleared; ordinality stays stable.
with normalized as (
  select
    plan.user_id,
    plan.plan_date,
    jsonb_agg(
      case
        when public.gate_subject_id(item.value->>'subject') is null then
          case
            when jsonb_typeof(item.value) = 'object' then
              (item.value - 'subject_id') || jsonb_build_object('subjectId', null)
            else item.value
          end
        else (item.value - 'subject_id') || jsonb_build_object(
          'subject', public.gate_subject_label(item.value->>'subject'),
          'subjectId', public.gate_subject_id(item.value->>'subject')
        )
      end
      order by item.ordinality
    ) as sessions
  from public.planner_day_plans as plan
  cross join lateral jsonb_array_elements(plan.sessions)
    with ordinality as item(value, ordinality)
  group by plan.user_id, plan.plan_date
)
update public.planner_day_plans as plan
set sessions = normalized.sessions
from normalized
where plan.user_id = normalized.user_id
  and plan.plan_date = normalized.plan_date
  and normalized.sessions is distinct from plan.sessions;

with expanded as (
  select
    mock.id,
    item.ordinality,
    item.value,
    public.gate_subject_id(item.value->>'subject') as subject_id
  from public.mock_tests as mock
  cross join lateral jsonb_array_elements(mock.subject_scores)
    with ordinality as item(value, ordinality)
), merged_known as (
  select
    id,
    min(ordinality) as ordinality,
    jsonb_build_object(
      'subject', public.gate_subject_label(subject_id),
      'subject_id', subject_id,
      'marks', sum(
        case
          when jsonb_typeof(value->'marks') = 'number' then (value->>'marks')::numeric
          else 0
        end
      )
    ) as value
  from expanded
  where subject_id is not null
  group by id, subject_id
), preserved_unknown as (
  select
    id,
    ordinality,
    case
      when jsonb_typeof(value) = 'object' then
        (value - 'subjectId') || jsonb_build_object('subject_id', null)
      else value
    end as value
  from expanded
  where subject_id is null
), normalized as (
  select id, jsonb_agg(value order by ordinality) as scores
  from (
    select * from merged_known
    union all
    select * from preserved_unknown
  ) as rows
  group by id
)
update public.mock_tests as mock
set subject_scores = normalized.scores,
    updated_at = greatest(mock.updated_at, now())
from normalized
where mock.id = normalized.id
  and normalized.scores is distinct from mock.subject_scores;

-- Keep nested subject mirrors canonical when an older client writes after this
-- migration. These helpers intentionally preserve unknown/custom labels.
create or replace function public.normalize_gate_planner_sessions(payload jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    -- Preserve malformed payloads so the table's NOT NULL/array CHECK rejects
    -- them; silently replacing them with [] would turn corruption into data loss.
    when jsonb_typeof(payload) is distinct from 'array' then payload
    else (
      select coalesce(
        jsonb_agg(
          case
            when public.gate_subject_id(item.value->>'subject') is null then
              case
                when jsonb_typeof(item.value) = 'object' then
                  (item.value - 'subject_id') || jsonb_build_object('subjectId', null)
                else item.value
              end
            else (item.value - 'subject_id') || jsonb_build_object(
              'subject', public.gate_subject_label(item.value->>'subject'),
              'subjectId', public.gate_subject_id(item.value->>'subject')
            )
          end
          order by item.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(payload)
        with ordinality as item(value, ordinality)
    )
  end;
$$;

create or replace function public.normalize_gate_mock_subject_scores(payload jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    -- As above, invalid non-array input must reach the table CHECK unchanged.
    when jsonb_typeof(payload) is distinct from 'array' then payload
    else (
      with expanded as (
        select
          item.ordinality,
          item.value,
          public.gate_subject_id(item.value->>'subject') as subject_id
        from jsonb_array_elements(payload)
          with ordinality as item(value, ordinality)
      ), normalized as (
        select
          min(ordinality) as ordinality,
          jsonb_build_object(
            'subject', public.gate_subject_label(subject_id),
            'subject_id', subject_id,
            'marks', sum(
              case
                when jsonb_typeof(value->'marks') = 'number' then (value->>'marks')::numeric
                else 0
              end
            )
          ) as value
        from expanded
        where subject_id is not null
        group by subject_id
        union all
        select
          ordinality,
          case
            when jsonb_typeof(value) = 'object' then
              (value - 'subjectId') || jsonb_build_object('subject_id', null)
            else value
          end
        from expanded
        where subject_id is null
      )
      select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
      from normalized
    )
  end;
$$;

create or replace function public.set_gate_nested_subject_identities()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'planner_day_plans' then
    new.sessions := public.normalize_gate_planner_sessions(new.sessions);
  elsif tg_table_name = 'mock_tests' then
    new.subject_scores := public.normalize_gate_mock_subject_scores(new.subject_scores);
  end if;
  return new;
end;
$$;

drop trigger if exists planner_day_plans_gate_subjects on public.planner_day_plans;
create trigger planner_day_plans_gate_subjects
before insert or update of sessions on public.planner_day_plans
for each row execute function public.set_gate_nested_subject_identities();

drop trigger if exists mock_tests_gate_subjects on public.mock_tests;
create trigger mock_tests_gate_subjects
before insert or update of subject_scores on public.mock_tests
for each row execute function public.set_gate_nested_subject_identities();

create or replace function public.set_gate_subject_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_id text;
begin
  resolved_id := public.gate_subject_id(new.subject);
  if resolved_id is not null then
    new.subject_id := resolved_id;
    new.subject := public.gate_subject_label(new.subject);
  elsif tg_op = 'UPDATE' and new.subject is distinct from old.subject then
    -- An UPDATE carries the old id forward unless we explicitly clear it when
    -- the label changes to an unknown/custom value (or to NULL where allowed).
    new.subject_id := null;
  elsif new.subject_id is not null then
    raise exception 'Unknown canonical GATE subject: %', new.subject_id;
  end if;
  return new;
end;
$$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'sessions', 'questions', 'patterns', 'formulas', 'topic_progress',
    'pyq_attempts', 'plan_items', 'study_rooms'
  ] loop
    execute format('drop trigger if exists set_gate_subject_identity on public.%I', relation_name);
    execute format('drop trigger if exists a_set_gate_subject_identity on public.%I', relation_name);
    execute format(
      'create trigger a_set_gate_subject_identity before insert or update of subject, subject_id on public.%I for each row execute function public.set_gate_subject_identity()',
      relation_name
    );
  end loop;
end $$;

-- Link Journal analysis to its immutable receipt. The owner-safe composite FK
-- prevents cross-account references; the partial unique index enforces one
-- analysis row per attempt while leaving manual Journal rows untouched.
create unique index if not exists pyq_attempts_user_id_id_unique
  on public.pyq_attempts (user_id, id);

alter table public.questions
  add column if not exists source_pyq_attempt_id uuid;

alter table public.questions
  drop constraint if exists questions_source_pyq_attempt_owner_fk,
  add constraint questions_source_pyq_attempt_owner_fk
    foreign key (user_id, source_pyq_attempt_id)
    references public.pyq_attempts (user_id, id)
    on delete no action
    deferrable initially deferred;

create unique index if not exists questions_one_analysis_per_pyq_attempt
  on public.questions (user_id, source_pyq_attempt_id)
  where source_pyq_attempt_id is not null;

create or replace function public.prevent_question_attempt_relink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source_pyq_attempt_id is not null
     and new.source_pyq_attempt_id is distinct from old.source_pyq_attempt_id then
    raise exception 'A Journal analysis cannot be detached from or reassigned to another PYQ attempt';
  end if;
  return new;
end;
$$;

drop trigger if exists questions_source_attempt_write_once on public.questions;
create trigger questions_source_attempt_write_once
before update of source_pyq_attempt_id on public.questions
for each row execute function public.prevent_question_attempt_relink();

-- Link only bidirectionally unique, GATE-tagged v0/v1 legacy pairs. Restricting
-- this heuristic to recognised subjects prevents unrelated/custom Journal rows
-- from becoming evidence merely because two unknown labels both map to NULL.
with candidates as (
  select
    question.id as question_id,
    attempt.id as attempt_id,
    count(*) over (partition by question.id) as attempt_candidates,
    count(*) over (partition by attempt.id) as question_candidates
  from public.questions as question
  join public.pyq_attempts as attempt
    on attempt.user_id = question.user_id
   and attempt.capture_version in (0, 1)
   and attempt.attempted_at = question.created_at
   and public.gate_subject_id(attempt.subject) is not null
   and public.gate_subject_id(attempt.subject) =
       public.gate_subject_id(question.subject)
   and attempt.mark_decision is not distinct from question.mark_decision
   and attempt.mark_correct is not distinct from question.mark_correct
   and attempt.time_spent_sec = question.time_spent_sec
   and (question.source_year is null or question.source_year = attempt.year)
   and (question.session_id is null or question.session_id = attempt.pyq_session_id)
  where question.source_pyq_attempt_id is null
    and question.source_ref ilike '%gate%'
    and question.mark_decision is not null
), unique_pairs as (
  select question_id, attempt_id
  from candidates
  where attempt_candidates = 1 and question_candidates = 1
)
update public.questions as question
set source_pyq_attempt_id = unique_pairs.attempt_id
from unique_pairs
where question.id = unique_pairs.question_id;

-- Immutable v3 scoring facts. Integer thirds avoid floating-point drift:
-- +3/+6 for a correct 1M/2M response; -1/-2 only for a wrong MCQ.
alter table public.pyq_attempts
  add column if not exists question_type text,
  add column if not exists question_marks smallint,
  add column if not exists score_thirds smallint,
  add column if not exists scoring_status text,
  add column if not exists scoring_version smallint,
  add column if not exists reattempt_id uuid,
  add column if not exists reattempt_round int,
  add column if not exists round_attempt_number int;

alter table public.pyq_attempts
  drop constraint if exists pyq_attempts_question_type_check,
  add constraint pyq_attempts_question_type_check check (
    question_type is null
    or upper(question_type) in (
      'MCQ', 'MSQ', 'NAT', 'AMBIGUOUS', 'MARKS_TO_ALL', 'SUBJECTIVE', 'UNSUPPORTED'
    )
  ),
  drop constraint if exists pyq_attempts_question_marks_check,
  add constraint pyq_attempts_question_marks_check
    check (question_marks is null or question_marks in (1, 2)),
  drop constraint if exists pyq_attempts_scoring_status_check,
  add constraint pyq_attempts_scoring_status_check
    check (scoring_status is null or scoring_status in ('scored', 'bonus', 'unscorable')),
  drop constraint if exists pyq_attempts_scoring_version_check,
  add constraint pyq_attempts_scoring_version_check
    check (scoring_version is null or scoring_version >= 1),
  drop constraint if exists pyq_attempts_reattempt_origin_check,
  add constraint pyq_attempts_reattempt_origin_check check (
    (reattempt_id is null and reattempt_round is null and round_attempt_number is null)
    or (
      reattempt_id is not null
      and reattempt_round is not null and reattempt_round >= 0
      and round_attempt_number is not null and round_attempt_number >= 1
    )
  );

create unique index if not exists pyq_attempts_unique_reattempt_submission
  on public.pyq_attempts (user_id, reattempt_id, reattempt_round, round_attempt_number)
  where reattempt_id is not null;

-- Backfill only facts present in the immutable v2 snapshot. Missing marks are
-- explicitly unscorable; no mark value is inferred from year or question type.
do $$
begin
  alter table public.pyq_attempts disable trigger pyq_attempts_immutable;
  begin
    update public.pyq_attempts
    set question_type = nullif(upper(question_snapshot->>'type'), ''),
        question_marks = case
          when question_snapshot->>'marks' in ('1', '2')
            then (question_snapshot->>'marks')::smallint
          else null
        end,
        scoring_status = case
          when answer_status = 'marks-to-all'
               and question_snapshot->>'marks' in ('1', '2') then 'bonus'
          when upper(coalesce(question_snapshot->>'type', '')) in ('MCQ', 'MSQ', 'NAT')
               and question_snapshot->>'marks' in ('1', '2')
               and (mark_decision = 'SKIP' or mark_correct is not null) then 'scored'
          else 'unscorable'
        end,
        score_thirds = case
          when answer_status = 'marks-to-all'
               and question_snapshot->>'marks' in ('1', '2')
            then (question_snapshot->>'marks')::smallint * 3
          when upper(coalesce(question_snapshot->>'type', '')) in ('MCQ', 'MSQ', 'NAT')
               and question_snapshot->>'marks' in ('1', '2') then
            case
              when mark_decision = 'SKIP' then 0
              when mark_correct is true then (question_snapshot->>'marks')::smallint * 3
              when mark_correct is false and upper(question_snapshot->>'type') = 'MCQ'
                then -(question_snapshot->>'marks')::smallint
              when mark_correct is false then 0
              else null
            end
          else null
        end,
        scoring_version = 1
    where capture_version = 2
      and scoring_version is null;
  exception when others then
    alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
    raise;
  end;
  alter table public.pyq_attempts enable trigger pyq_attempts_immutable;
end $$;

-- An older offline client may retry an otherwise byte-identical v0-v2 receipt
-- without columns introduced by this migration. The alphabetically-first
-- subject trigger canonicalizes its label first; this immutable guard then
-- acknowledges the retry while always retaining the already-enriched row.
create or replace function public.prevent_pyq_attempt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rollout_fields constant text[] := array[
    'subject_id',
    'question_type',
    'question_marks',
    'score_thirds',
    'scoring_status',
    'scoring_version',
    'reattempt_id',
    'reattempt_round',
    'round_attempt_number'
  ];
begin
  if new is not distinct from old then
    return old;
  end if;
  if old.capture_version between 0 and 2
     and new.capture_version = old.capture_version
     and (to_jsonb(new) - rollout_fields) = (to_jsonb(old) - rollout_fields) then
    return old;
  end if;
  raise exception 'Committed PYQ attempts are immutable';
end;
$$;

alter table public.pyq_attempts
  drop constraint if exists pyq_attempts_capture_version_check,
  add constraint pyq_attempts_capture_version_check
    check (capture_version between 0 and 3),
  drop constraint if exists pyq_attempts_v3_audit_check,
  add constraint pyq_attempts_v3_audit_check check (
    capture_version <> 3
    or (
      question_snapshot is not null
      and jsonb_typeof(question_snapshot) = 'object'
      and question_snapshot ?& array[
        'question_uid', 'year', 'number', 'paper_label', 'subject',
        'subject_slug', 'subtopics', 'type', 'answer_status', 'answer_source',
        'html', 'source_url'
      ]
      and question_snapshot->>'question_uid' = question_uid
      and question_snapshot->>'year' = year::text
      and question_snapshot->>'answer_status' = answer_status
      and coalesce(
        (
          public.gate_subject_id(question_snapshot->>'subject') is not null
          and subject_id = public.gate_subject_id(question_snapshot->>'subject')
          and subject = public.gate_subject_label(question_snapshot->>'subject')
        )
        or (
          public.gate_subject_id(question_snapshot->>'subject') is null
          and subject_id is null
          and trim(subject) = trim(question_snapshot->>'subject')
        ),
        false
      )
      and question_started_at is not null
      and question_started_at <= attempted_at
      and time_spent_ms is not null and time_spent_ms > 0
      and time_spent_sec = greatest(1, (time_spent_ms + 999) / 1000)
      and question_type is not null
      and question_type = upper(question_snapshot->>'type')
      and question_marks is not distinct from case
        when question_snapshot->>'marks' in ('1', '2')
          then (question_snapshot->>'marks')::smallint
        else null
      end
      and scoring_status is not null
      and scoring_version = 1
      and (
        (mark_decision = 'SKIP' and selected_answer is null and mark_correct is null)
        or (mark_decision <> 'SKIP' and selected_answer is not null)
      )
      and (answer_status <> 'available' or correct_answer is not null)
      and scoring_status = case
        when question_marks in (1, 2)
             and upper(question_type) = 'MARKS_TO_ALL'
             and answer_status = 'marks-to-all' then 'bonus'
        when question_marks in (1, 2)
             and upper(question_type) in ('MCQ', 'MSQ', 'NAT')
             and answer_status = 'available'
             and (mark_decision = 'SKIP' or mark_correct is not null) then 'scored'
        else 'unscorable'
      end
      and (
        scoring_status = 'unscorable'
        or question_marks in (1, 2)
      )
      and (
        (scoring_status = 'unscorable' and score_thirds is null)
        or (
          scoring_status = 'bonus'
          and upper(question_type) = 'MARKS_TO_ALL'
          and answer_status = 'marks-to-all'
          and score_thirds = question_marks * 3
        )
        or (
          scoring_status = 'scored'
          and upper(question_type) in ('MCQ', 'MSQ', 'NAT')
          and answer_status = 'available'
          and (
            (mark_decision = 'SKIP' and score_thirds = 0)
            or (mark_correct is true and score_thirds = question_marks * 3)
            or (
              mark_correct is false
              and (
                (upper(question_type) = 'MCQ' and score_thirds = -question_marks)
                or (upper(question_type) in ('MSQ', 'NAT') and score_thirds = 0)
              )
            )
          )
        )
      )
    )
  );

-- Readiness v2 is a methodology break. Keep the original two-column primary
-- key for old-client rollout safety, but version every row and compare only
-- like-for-like versions in the client and RPC.
alter table public.readiness_snapshots
  add column if not exists calculation_version smallint not null default 1,
  add column if not exists evidence_counts jsonb not null default '{}'::jsonb,
  add column if not exists components jsonb not null default '{}'::jsonb;

alter table public.readiness_snapshots
  drop constraint if exists readiness_snapshots_v2_evidence_check,
  add constraint readiness_snapshots_v2_evidence_check check (
    calculation_version <> 2
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
  if old.calculation_version = 2
     and new.calculation_version = 2
     and new.score is distinct from old.score
     and new.evidence_counts is not distinct from old.evidence_counts
     and new.components is not distinct from old.components then
    raise exception 'Readiness v2 score changes require matching evidence or component changes';
  end if;
  return new;
end;
$$;

drop trigger if exists readiness_snapshots_methodology_guard on public.readiness_snapshots;
create trigger readiness_snapshots_methodology_guard
before update on public.readiness_snapshots
for each row execute function public.protect_readiness_methodology();

drop index if exists readiness_snapshots_by_band;
create index readiness_snapshots_by_band
  on public.readiness_snapshots (calculation_version, days_to_exam, on_date desc);

create or replace function public.readiness_median_for_band(
  band_width_days int default 7
)
returns table (median numeric, sample_size int)
language plpgsql
stable security definer set search_path = public
as $$
declare
  caller_days_to_exam int;
  current_version constant smallint := 2;
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

grant execute on function public.readiness_median_for_band(int) to authenticated;

comment on column public.readiness_snapshots.calculation_version is
  'Readiness methodology version. Version 2 uses immutable PYQ attempt evidence.';
comment on column public.questions.source_pyq_attempt_id is
  'Write-once link to the immutable PYQ receipt this Journal analysis enriches.';
