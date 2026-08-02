-- Submitted GATE CSE question-bank attempts. The immutable question bank ships
-- with the client; only each learner's compact attempt record is synchronized.

create table public.pyq_attempts (
  id               uuid primary key default extensions.uuid_generate_v4(),
  user_id          uuid not null references public.users(id) on delete cascade,
  question_uid     text not null,
  subject          text not null,
  year             int not null check (year between 1991 and 2100),
  selected_answer  jsonb,
  mark_decision    mark_decision_t not null,
  mark_correct     boolean,
  time_spent_sec   int not null check (time_spent_sec >= 0),
  bank_version     text not null,
  attempted_at     timestamptz not null default now()
);

create index pyq_attempts_by_user_question
  on public.pyq_attempts (user_id, question_uid, attempted_at desc);

create index pyq_attempts_by_user_subject
  on public.pyq_attempts (user_id, subject, attempted_at desc);

alter table public.pyq_attempts enable row level security;

create policy sel_own on public.pyq_attempts
  for select using (user_id = auth.uid());

create policy ins_own on public.pyq_attempts
  for insert with check (user_id = auth.uid());

create policy upd_own on public.pyq_attempts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy del_own on public.pyq_attempts
  for delete using (user_id = auth.uid());
