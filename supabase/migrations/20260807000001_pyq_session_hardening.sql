-- Durable local-first PYQ practice sets plus immutable answer/screenshot data
-- for each committed bank attempt.

create table if not exists public.pyq_sessions (
  id                      uuid primary key default extensions.uuid_generate_v4(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  bank_version            text not null,
  config                  jsonb not null,
  question_uids           text[] not null default '{}',
  completed_question_uids text[] not null default '{}',
  current_index           int not null default 0 check (current_index >= 0),
  completed_count         int not null default 0 check (completed_count >= 0),
  elapsed_sec             int not null default 0 check (elapsed_sec >= 0),
  status                  text not null default 'active'
    check (status in ('active','completed','abandoned')),
  started_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  completed_at            timestamptz
);

create index if not exists pyq_sessions_by_user_status
  on public.pyq_sessions (user_id, status, updated_at desc);

alter table public.pyq_sessions enable row level security;

drop policy if exists sel_own on public.pyq_sessions;
create policy sel_own on public.pyq_sessions
  for select using (user_id = auth.uid());

drop policy if exists ins_own on public.pyq_sessions;
create policy ins_own on public.pyq_sessions
  for insert with check (user_id = auth.uid());

drop policy if exists upd_own on public.pyq_sessions;
create policy upd_own on public.pyq_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists del_own on public.pyq_sessions;
create policy del_own on public.pyq_sessions
  for delete using (user_id = auth.uid());

alter table public.pyq_attempts
  add column if not exists pyq_session_id uuid references public.pyq_sessions(id) on delete set null,
  add column if not exists attempt_number int not null default 1 check (attempt_number >= 1),
  add column if not exists correct_answer jsonb,
  add column if not exists answer_status text not null default 'unsupported'
    check (answer_status in ('available','ambiguous','marks-to-all','unsupported')),
  add column if not exists screenshot_url text;

create unique index if not exists pyq_attempts_once_per_session_question_attempt
  on public.pyq_attempts (user_id, pyq_session_id, question_uid, attempt_number)
  where pyq_session_id is not null;
