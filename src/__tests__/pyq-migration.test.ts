import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PYQ production audit migration', () => {
  it('enforces one active set and immutable version-2 attempt receipts', () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260808000001_pyq_attempt_audit.sql'),
      'utf8'
    );

    expect(sql).toContain('pyq_sessions_one_active_per_user');
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain('pyq_attempts_v2_audit_check');
    expect(sql).toContain('prevent_pyq_attempt_mutation');
    expect(sql).toContain('Committed PYQ attempts are immutable');
    expect(sql).toContain('drop policy if exists del_own on public.pyq_attempts');
  });

  it('adds canonical identities, write-once source links, v3 scoring, and versioned readiness', () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260822000001_phase1_canonical_evidence.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('gate_subject_id');
    expect(sql).toContain("regexp_replace(lower(trim(coalesce(value, '')))");
    expect(sql).toContain("when 'computer organization' then 'coa'");
    expect(sql).toContain("when 'c programming' then 'programming-data-structures'");
    expect(sql).toContain('source_pyq_attempt_id');
    expect(sql).toContain('questions_source_pyq_attempt_owner_fk');
    expect(sql).toContain('questions_source_attempt_write_once');
    expect(sql).toContain('questions_one_analysis_per_pyq_attempt');
    expect(sql).toContain('question_marks smallint');
    expect(sql).toContain('score_thirds smallint');
    expect(sql).toContain('pyq_attempts_v3_audit_check');
    expect(sql).toContain('pyq_attempts_question_type_check');
    expect(sql).toContain("upper(question_type) = 'MARKS_TO_ALL'");
    expect(sql).toContain("upper(question_type) in ('MCQ', 'MSQ', 'NAT')");
    expect(sql).toContain('pyq_attempts_unique_reattempt_submission');
    expect(sql).toContain('planner_day_plans_gate_subjects');
    expect(sql).toContain('mock_tests_gate_subjects');
    expect(sql).toContain('a_set_gate_subject_identity');
    expect(sql).toContain("jsonb_typeof(payload) is distinct from 'array'");
    expect(sql).not.toContain(
      "case when jsonb_typeof(payload) = 'array' then payload else '[]'::jsonb end"
    );
    expect(sql).toContain("jsonb_build_object('subjectId', null)");
    expect(sql).toContain("jsonb_build_object('subject_id', null)");
    expect(sql).toContain("jsonb_typeof(value->'marks') is distinct from 'number'");
    expect(sql).not.toContain('else 0\n');
    expect(sql).toContain("trim(coalesce(new.subject, '')) = ''");
    expect(sql).toContain('resolved_id := public.gate_subject_id(new.subject_id)');
    expect(sql).toContain('new.subject_id := null');
    expect(
      sql.match(
        /public\.gate_subject_id\(coalesce\(item\.value->>'subjectId', item\.value->>'subject_id'\)\)/g
      )
    ).toHaveLength(2);
    expect(sql.match(/public\.gate_subject_id\(item\.value->>'subject_id'\)/g)).toHaveLength(2);
    expect(sql).toContain('attempt.capture_version in (0, 1)');
    expect(sql).toContain("question.source_ref ~* '(^|[^a-z0-9])gate([^a-z0-9]|$)'");
    expect(sql).not.toContain("question.source_ref ilike '%gate%'");
    expect(sql).toContain('public.gate_subject_id(attempt.subject) is not null');
    expect(sql).toContain('question.session_id = attempt.pyq_session_id');
    expect(sql).toContain('linked_question.source_pyq_attempt_id = attempt.id');
    expect(sql).toContain("public.gate_subject_id(question_snapshot->>'subject') is not null");
    expect(sql).toContain("subject_id = public.gate_subject_id(question_snapshot->>'subject')");
    expect(sql).toContain("trim(subject) = trim(question_snapshot->>'subject')");
    expect(sql).toContain("'subtopics', 'marks', 'type'");
    expect(sql).toContain("jsonb_typeof(question_snapshot->'subtopics') = 'array'");
    expect(sql).toContain('not jsonb_path_exists(');
    expect(sql).toContain("jsonb_typeof(question_snapshot->'marks') in ('number', 'null')");
    expect(sql).toContain("not (question_snapshot ? 'book_slug')");
    expect(sql).toContain("jsonb_typeof(question_snapshot->'book_slug') = 'string'");
    expect(sql).toContain("trim(question_snapshot->>'book_slug') <> ''");
    expect(sql).toContain("not (question_snapshot ? 'choices')");
    expect(sql).toContain("jsonb_typeof(question_snapshot->'choices') = 'array'");
    expect(sql).toContain("jsonb_array_length(question_snapshot->'choices') > 0");
    expect(sql).toContain('@.type() != "string" || @ == ""');
    expect(sql).toContain("jsonb_typeof(question_snapshot->'tolerance') in ('object', 'null')");
    expect(sql).not.toContain("question_snapshot->>'marks' in ('1', '2')");
    expect(
      sql.match(/jsonb_typeof\(question_snapshot->'marks'\) = 'number'/g)?.length
    ).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("(question_snapshot->>'marks')::numeric in (1, 2)");
    expect(sql).toContain('and scoring_status = case');
    expect(sql).toContain("and answer_status = 'marks-to-all' then 'bonus'");
    expect(sql).toContain('and mark_correct is null');
    expect(sql).toContain("and (mark_decision = 'SKIP' or mark_correct is not null) then 'scored'");
    expect(sql.match(/question_snapshot->>'type', ''\)\) = 'MARKS_TO_ALL'/g)).toHaveLength(2);
    expect(sql.match(/and answer_status = 'available'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("else 'unscorable'");
    expect(sql).toContain('or coalesce((');
    expect(sql).toContain('(to_jsonb(new) - rollout_fields) = (to_jsonb(old) - rollout_fields)');
    expect(sql).toContain('calculation_version smallint not null default 1');
    expect(sql).toContain('readiness_snapshots_v2_evidence_check');
    expect(sql).toContain('readiness_snapshots_methodology_guard');
    expect(sql).toContain('current_version constant smallint := 2');
    expect(sql).toContain('disable trigger pyq_attempts_immutable');
    expect(sql).toContain('exception when others then');
    expect(sql).toContain('enable trigger pyq_attempts_immutable');

    const requiredV3SnapshotKeys = sql.match(
      /question_snapshot \?& array\[([\s\S]*?)\]\s+and jsonb_typeof\(question_snapshot->'question_uid'\)/
    )?.[1];
    expect(requiredV3SnapshotKeys).toBeDefined();
    expect(requiredV3SnapshotKeys).not.toContain("'book_slug'");
    expect(requiredV3SnapshotKeys).not.toContain("'choices'");

    const v2Backfill = sql.match(
      /-- Backfill only facts present in the immutable v2 snapshot\.([\s\S]*?)-- An older offline client/
    )?.[1];
    expect(v2Backfill).toBeDefined();
    expect(v2Backfill).toContain('where capture_version = 2');
    expect(v2Backfill).not.toContain('book_slug');
    expect(v2Backfill).not.toContain('choices');
  });

  it('runs the canonical subject trigger before the immutable receipt trigger', () => {
    const phaseOneSql = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260822000001_phase1_canonical_evidence.sql'
      ),
      'utf8'
    );
    const auditSql = readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260808000001_pyq_attempt_audit.sql'),
      'utf8'
    );
    const canonicalizer = phaseOneSql.match(
      /create trigger ([a-z_]+) before insert or update of subject, subject_id/
    )?.[1];
    const immutabilityGuard = auditSql.match(
      /create trigger ([a-z_]+)\s+before update on public\.pyq_attempts/
    )?.[1];

    expect(canonicalizer).toBe('a_set_gate_subject_identity');
    expect(immutabilityGuard).toBe('pyq_attempts_immutable');
    expect(canonicalizer!.localeCompare(immutabilityGuard!)).toBeLessThan(0);
  });

  it('accepts attempt receipts for the 1990 questions shipped in the GATE bank', () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260828000001_gate_1990_attempt_year.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('drop constraint if exists pyq_attempts_year_check');
    expect(sql).toContain('check (year between 1990 and 2100)');
  });

  it('stores qualified mock evidence with owner-safe PYQ links and strict readiness criteria', () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260827102350_qualified_mock_evidence.sql'),
      'utf8'
    );

    expect(sql).toContain("add column source_kind text not null default 'manual'");
    expect(sql).toContain("add column evidence_status text not null default 'supporting'");
    expect(sql).toContain("default array['conditions-unknown']::text[]");
    expect(sql).toContain('mock_tests_qualified_evidence_check');
    expect(sql).toContain('total_questions = 65');
    expect(sql).toContain('max_marks = 100');
    expect(sql).toContain("paper_scope = 'full_length'");
    expect(sql).toContain("freshness = 'unseen'");
    expect(sql).toContain('timed is true');
    expect(sql).toContain('closed_book is true');
    expect(sql).toContain('single_sitting is true');
    expect(sql).toContain('scoring_coverage_pct = 100');
    expect(sql).toContain('cardinality(evidence_reasons) = 0');
    expect(sql).toContain('foreign key (source_pyq_session_id, user_id)');
    expect(sql).toContain('references public.pyq_sessions (id, user_id)');
    expect(sql).toContain('on delete set null (source_pyq_session_id)');
    expect(sql).toContain('mock_tests_one_per_pyq_session');
    expect(sql).toContain('revoke all on table public.mock_tests from anon');
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.mock_tests to authenticated'
    );
  });
});
