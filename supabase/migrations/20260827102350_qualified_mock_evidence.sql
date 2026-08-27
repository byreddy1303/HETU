-- Qualified mock evidence is intentionally explicit. Historical mock logs do
-- not record exam conditions, so this migration keeps every existing row as
-- supporting evidence with an inspectable unknown-conditions reason.

set search_path = public, extensions;

alter table public.mock_tests
  add column source_kind text not null default 'manual',
  add column source_pyq_session_id uuid,
  add column paper_scope text not null default 'unknown',
  add column freshness text not null default 'unknown',
  add column timed boolean,
  add column closed_book boolean,
  add column single_sitting boolean,
  add column evidence_status text not null default 'supporting',
  add column evidence_reasons text[] not null default array['conditions-unknown']::text[],
  add column scoring_coverage_pct numeric(5, 2);

-- Never infer qualification from legacy question/mark totals. Those rows lack
-- the condition metadata needed to distinguish a fresh closed-book sitting.
update public.mock_tests
set evidence_status = 'supporting',
    evidence_reasons = case
      when 'conditions-unknown' = any(evidence_reasons) then evidence_reasons
      else evidence_reasons || array['conditions-unknown']::text[]
    end;

alter table public.mock_tests
  add constraint mock_tests_source_kind_check
    check (source_kind in ('manual', 'pyq_exam')),
  add constraint mock_tests_paper_scope_check
    check (paper_scope in ('full_length', 'sectional', 'topic', 'unknown')),
  add constraint mock_tests_freshness_check
    check (freshness in ('unseen', 'partially_seen', 'repeated', 'unknown')),
  add constraint mock_tests_evidence_status_check
    check (evidence_status in ('qualified', 'supporting', 'excluded')),
  add constraint mock_tests_evidence_reasons_check
    check (
      coalesce(array_ndims(evidence_reasons), 1) = 1
      and cardinality(evidence_reasons) <= 100
      and array_position(evidence_reasons, null) is null
    ),
  add constraint mock_tests_scoring_coverage_check
    check (scoring_coverage_pct is null or scoring_coverage_pct between 0 and 100),
  add constraint mock_tests_qualified_evidence_check
    check (
      evidence_status <> 'qualified'
      or (
        total_questions = 65
        and max_marks = 100
        and paper_scope = 'full_length'
        and freshness = 'unseen'
        and timed is true
        and closed_book is true
        and single_sitting is true
        and scoring_coverage_pct = 100
        and cardinality(evidence_reasons) = 0
      )
    );

-- The compound key makes the optional PYQ-session link owner-safe. Deleting a
-- source session clears only the optional link; the learner-owned mock remains.
create unique index if not exists pyq_sessions_id_user_owner
  on public.pyq_sessions (id, user_id);

alter table public.mock_tests
  add constraint mock_tests_source_pyq_session_owner_fk
  foreign key (source_pyq_session_id, user_id)
  references public.pyq_sessions (id, user_id)
  on delete set null (source_pyq_session_id)
  not valid;

alter table public.mock_tests
  validate constraint mock_tests_source_pyq_session_owner_fk;

create index if not exists mock_tests_by_user_evidence
  on public.mock_tests (user_id, evidence_status, test_date desc);

create unique index if not exists mock_tests_one_per_pyq_session
  on public.mock_tests (user_id, source_pyq_session_id)
  where source_pyq_session_id is not null;

-- Keep the existing self-ownership policies in force and make Data API grants
-- explicit: signed-out clients receive nothing; authenticated clients still
-- pass through RLS for each CRUD operation.
alter table public.mock_tests enable row level security;
revoke all on table public.mock_tests from anon;
grant select, insert, update, delete on table public.mock_tests to authenticated;
