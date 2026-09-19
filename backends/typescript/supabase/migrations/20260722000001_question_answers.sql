-- Store a private answer/solution beside each question. The existing
-- questions RLS policies continue to restrict the value to its owner.

alter table public.questions
  add column if not exists answer_text text;

comment on column public.questions.answer_text is
  'Owner-only answer or solution, concealed by default in review interfaces.';
