-- Practical study-loop additions: planner/session linkage, quick-capture
-- notes, external mock logs, and synced manual syllabus progress.
set search_path = public, extensions;

alter table public.sessions
  add column if not exists planner_date date,
  add column if not exists planner_block_id text;

create index if not exists sessions_by_planner_block
  on public.sessions (user_id, planner_date, planner_block_id)
  where planner_block_id is not null;

alter table public.questions
  add column if not exists capture_note text;

alter table public.questions
  add constraint questions_capture_note_length
  check (capture_note is null or char_length(capture_note) <= 500) not valid;

alter table public.questions validate constraint questions_capture_note_length;

create table if not exists public.mock_tests (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  name              text not null check (char_length(trim(name)) between 1 and 140),
  test_date         date not null,
  total_marks       numeric(6,2) not null,
  max_marks         numeric(6,2) not null check (max_marks > 0),
  total_questions   smallint not null check (total_questions between 1 and 500),
  correct           smallint not null check (correct >= 0),
  wrong             smallint not null check (wrong >= 0),
  skipped           smallint not null check (skipped >= 0),
  duration_min      smallint not null check (duration_min between 1 and 720),
  subject_scores    jsonb not null default '[]'::jsonb,
  mistakes          jsonb not null default '[]'::jsonb,
  planner_date      date,
  planner_block_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (total_marks <= max_marks),
  check (correct + wrong + skipped = total_questions),
  check (jsonb_typeof(subject_scores) = 'array'),
  check (jsonb_typeof(mistakes) = 'array')
);

create index if not exists mock_tests_by_user_date
  on public.mock_tests (user_id, test_date desc);

alter table public.mock_tests enable row level security;

drop policy if exists sel_self on public.mock_tests;
create policy sel_self on public.mock_tests for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ins_self on public.mock_tests;
create policy ins_self on public.mock_tests for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists upd_self on public.mock_tests;
create policy upd_self on public.mock_tests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists del_self on public.mock_tests;
create policy del_self on public.mock_tests for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.mock_tests to authenticated;

create table if not exists public.topic_progress (
  id            text primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  subject       text not null check (char_length(trim(subject)) between 1 and 120),
  topic         text not null check (char_length(trim(topic)) between 1 and 180),
  completed_at  timestamptz not null,
  updated_at    timestamptz not null default now(),
  unique (user_id, subject, topic)
);

create index if not exists topic_progress_by_user_subject
  on public.topic_progress (user_id, subject);

alter table public.topic_progress enable row level security;

drop policy if exists sel_self on public.topic_progress;
create policy sel_self on public.topic_progress for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ins_self on public.topic_progress;
create policy ins_self on public.topic_progress for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists upd_self on public.topic_progress;
create policy upd_self on public.topic_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists del_self on public.topic_progress;
create policy del_self on public.topic_progress for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.topic_progress to authenticated;
