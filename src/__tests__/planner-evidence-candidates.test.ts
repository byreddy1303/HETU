import { describe, expect, it } from 'vitest';
import {
  buildPlannerEvidenceCandidates,
  type BuildPlannerEvidenceCandidatesInput
} from '@/lib/planner-evidence-candidates';
import type { StudySession } from '@/lib/planner-storage';
import type { DebtEntry, ReadinessSnapshot } from '@/lib/readiness-snapshots';
import type {
  FormulaRow,
  LearningItemRow,
  PyqAttemptRow,
  ReattemptRow,
  WeeklyReviewRow
} from '@/types';

function learningItem(overrides: Partial<LearningItemRow> = {}): LearningItemRow {
  return {
    id: 'learning-1',
    user_id: 'user-1',
    source_kind: 'pyq',
    question_uid: 'uid-learning-1',
    source_question_id: null,
    content_fingerprint: null,
    subject: 'Operating Systems',
    topic: 'Deadlock avoidance',
    origin_pyq_attempt_id: 'attempt-origin',
    latest_pyq_attempt_id: 'attempt-origin',
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D10',
    scheduled_date: '2026-08-30',
    reason_flags: ['wrong'],
    lapse_count: 0,
    successful_retrieval_count: 0,
    last_grade: null,
    last_interval_days: null,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: '2026-08-20T08:00:00.000Z',
    updated_at: '2026-08-30T08:00:00.000Z',
    ...overrides
  };
}

function reattempt(overrides: Partial<ReattemptRow> = {}): ReattemptRow {
  return {
    id: 'reattempt-1',
    user_id: 'user-1',
    question_id: 'question-1',
    scheduled_date: '2026-09-02',
    stage: 'D3',
    history: [],
    learning_item_id: null,
    created_at: '2026-08-30T08:00:00.000Z',
    ...overrides
  };
}

function attempt(overrides: Partial<PyqAttemptRow> = {}): PyqAttemptRow {
  return {
    id: 'attempt-1',
    user_id: 'user-1',
    pyq_session_id: 'pyq-session-1',
    question_uid: 'uid-1',
    subject: 'Operating Systems',
    year: 2025,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    confidence: null,
    question_started_at: '2026-09-01T08:00:00.000Z',
    time_spent_ms: 100_000,
    time_spent_sec: 100,
    bank_version: 'test-bank',
    attempted_at: '2026-09-01T08:02:00.000Z',
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: -1,
    scoring_status: 'scored',
    scoring_version: 1,
    ...overrides
  };
}

function formula(overrides: Partial<FormulaRow> = {}): FormulaRow {
  return {
    id: 'formula-1',
    user_id: 'user-1',
    name: 'Little law',
    subject: 'Operating Systems',
    expression: 'L = lambda W',
    forgot_count: 1,
    last_reviewed: '2026-08-20',
    next_review: '2026-09-01',
    created_at: '2026-08-01T08:00:00.000Z',
    ...overrides
  };
}

function weeklyReview(overrides: Partial<WeeklyReviewRow> = {}): WeeklyReviewRow {
  return {
    id: 'weekly-1',
    user_id: 'user-1',
    week_start: '2026-08-31',
    root_cause_summary: 'Concept retrieval',
    weakest_concept: 'Deadlock avoidance',
    this_weeks_fix: 'Practice deadlock avoidance from first principles',
    created_at: '2026-08-31T08:00:00.000Z',
    ...overrides
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'planner-p1',
    subject: 'Algorithms',
    durationMin: 60,
    mode: 'Deep Study',
    priority: 'P1 Critical',
    target: 'Dynamic programming recurrence practice',
    ...overrides
  };
}

function debt(overrides: Partial<DebtEntry> = {}): DebtEntry {
  return {
    key: 'component:retention',
    component: 'retention',
    subject: null,
    since: '2026-08-10',
    weeksHeld: 3,
    lastSeen: '2026-09-02',
    ...overrides
  };
}

function snapshot(overrides: Partial<ReadinessSnapshot> = {}): ReadinessSnapshot {
  return {
    date: '2026-09-02',
    score: 48,
    coverage: 0.3,
    retention: 0.4,
    calibration: 0.5,
    surface: 0.5,
    daysToExam: 160,
    calculationVersion: 3,
    evidenceCounts: { attempts: 30 },
    ...overrides
  };
}

function exactUids(href: string | undefined): string[] {
  const url = new URL(href ?? '/', 'https://hetu.test');
  return (url.searchParams.get('questionUids') ?? '').split(',').filter(Boolean);
}

function reverseEvidence(
  input: BuildPlannerEvidenceCandidatesInput
): BuildPlannerEvidenceCandidatesInput {
  return {
    ...input,
    learningItems: [...(input.learningItems ?? [])].reverse(),
    reattempts: [...(input.reattempts ?? [])].reverse(),
    pyqAttempts: [...(input.pyqAttempts ?? [])].reverse(),
    formulas: [...(input.formulas ?? [])].reverse(),
    incompleteSyllabusTopics: [...(input.incompleteSyllabusTopics ?? [])].reverse(),
    readinessDebt: [...(input.readinessDebt ?? [])].reverse(),
    readinessSnapshots: [...(input.readinessSnapshots ?? [])].reverse(),
    existingSessions: [...(input.existingSessions ?? [])].reverse()
  };
}

describe('Planner evidence candidate adapter', () => {
  it('covers every learning signal with deterministic, explainable, executable candidates', () => {
    const canonical = learningItem({
      id: 'canonical-due',
      lapse_count: 2,
      reason_flags: ['wrong', 'high-confidence-wrong']
    });
    const analyzed = learningItem({
      id: 'canonical-analyzed',
      question_uid: 'uid-analyzed',
      origin_pyq_attempt_id: 'wrong-analyzed',
      latest_pyq_attempt_id: 'wrong-analyzed',
      analysis_state: 'completed',
      scheduled_date: '2026-09-20'
    });
    const p1 = session();
    const p2 = session({
      id: 'planner-p2',
      subject: 'Databases',
      priority: 'P2 High',
      target: 'Revise joins'
    });
    const input: BuildPlannerEvidenceCandidatesInput = {
      asOfDate: '2026-09-02',
      learningItems: [canonical, analyzed, canonical],
      reattempts: [
        reattempt({ id: 'linked-projection', learning_item_id: canonical.id }),
        reattempt({ id: 'legacy-only', question_id: 'legacy-question' }),
        reattempt({ id: 'future', scheduled_date: '2026-09-10' }),
        reattempt({ id: 'mastered', stage: 'MASTERED' })
      ],
      pyqAttempts: [
        attempt({ id: 'wrong-pending', question_uid: 'uid-wrong' }),
        attempt({ id: 'wrong-analyzed', question_uid: 'uid-analyzed' }),
        attempt({
          id: 'guess-and-slow',
          question_uid: 'uid-guess',
          subject: 'Computer Networks',
          selected_answer: 'A',
          correct_answer: 'A',
          mark_decision: 'FIFTY_FIFTY',
          mark_correct: true,
          confidence: 'medium',
          time_spent_sec: 200,
          time_spent_ms: 200_000
        }),
        attempt({
          id: 'slow-only',
          question_uid: 'uid-slow',
          subject: 'Computer Networks',
          selected_answer: 'A',
          correct_answer: 'A',
          mark_correct: true,
          confidence: 'high',
          time_spent_sec: 210,
          time_spent_ms: 210_000
        }),
        attempt({
          id: 'old-wrong-now-correct',
          question_uid: 'uid-slow',
          attempted_at: '2026-08-20T08:02:00.000Z'
        })
      ],
      formulas: [formula(), formula()],
      currentWeeklyReview: weeklyReview(),
      incompleteSyllabusTopics: [
        {
          id: 'os-deadlock',
          subject: 'Operating Systems',
          topic: 'Deadlock avoidance'
        },
        {
          id: 'db-relational',
          subject: 'Databases',
          topic: 'Relational algebra',
          estimatedMin: 50
        }
      ],
      readinessDebt: [
        debt(),
        debt({
          key: 'subject:Operating Systems:coverage',
          component: 'coverage',
          subject: 'Operating Systems',
          weeksHeld: 2
        }),
        debt({
          key: 'subject:Databases:calibration',
          component: 'calibration',
          subject: 'Databases',
          weeksHeld: 1
        })
      ],
      readinessSnapshots: [snapshot({ date: '2026-08-26', score: 52 }), snapshot()],
      existingSessions: [
        p1,
        p2,
        session({ id: 'planner-p3', priority: 'P3 Medium' }),
        session({
          id: 'planner-complete',
          execution: {
            sessionId: 'done',
            startedAt: '2026-09-02T06:00:00.000Z',
            completedAt: '2026-09-02T07:00:00.000Z',
            actualMin: 60,
            manual: false
          }
        })
      ]
    };
    const before = JSON.stringify(input);

    const candidates = buildPlannerEvidenceCandidates(input);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    expect(candidates).toEqual(buildPlannerEvidenceCandidates(reverseEvidence(input)));
    expect(JSON.stringify(input)).toBe(before);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(candidates.length);
    expect(
      candidates.every(
        (candidate) =>
          candidate.estimatedMin > 0 &&
          Boolean(candidate.priority) &&
          Boolean(candidate.href) &&
          Boolean(candidate.reason?.trim())
      )
    ).toBe(true);

    expect(byId.get('evidence:due-recovery')).toMatchObject({
      title: 'Clear 2 due recovery items',
      priority: 'P1 Critical',
      required: true,
      href: '/reattempts?open=first'
    });
    expect(byId.get('evidence:due-recovery')?.reason).toContain('3 days late');
    expect(byId.get('evidence:due-recovery')?.reason).toContain('readiness gap');

    expect(exactUids(byId.get('evidence:pending-analysis')?.href)).toEqual(['uid-wrong']);
    expect(exactUids(byId.get('evidence:guessed-correct')?.href)).toEqual(['uid-guess']);
    expect(exactUids(byId.get('evidence:slow-correct')?.href)).toEqual(['uid-slow']);
    expect(byId.get('evidence:guessed-correct')?.reason).toContain('also slower');

    expect(byId.get('evidence:due-formulas')).toMatchObject({
      title: 'Recall 1 due formula',
      priority: 'P1 Critical'
    });
    expect(byId.has('planner-p1')).toBe(true);
    expect(byId.has('planner-p2')).toBe(true);
    expect(byId.has('planner-p3')).toBe(false);
    expect(byId.has('planner-complete')).toBe(false);

    const deadlock = candidates.find(
      (candidate) => candidate.title === 'Advance Deadlock avoidance'
    );
    expect(deadlock).toMatchObject({ priority: 'P2 High', subject: 'Operating Systems' });
    expect(deadlock?.reason).toContain('approved weekly fix');
    expect(deadlock?.reason).toContain('coverage remains a readiness gap');
    expect(candidates.some((candidate) => candidate.id.startsWith('evidence:weekly-focus:'))).toBe(
      false
    );

    const databaseCalibration = candidates.find(
      (candidate) => candidate.title === 'Calibrate Databases calibration'
    );
    expect(databaseCalibration).toMatchObject({ kind: 'pyq', priority: 'P3 Medium' });
  });

  it('uses only the latest question receipt and honors explicit completed analyses', () => {
    const candidates = buildPlannerEvidenceCandidates({
      asOfDate: '2026-09-02',
      analyzedAttemptIds: ['latest-wrong-analyzed'],
      pyqAttempts: [
        attempt({
          id: 'older-wrong',
          question_uid: 'uid-recovered',
          attempted_at: '2026-08-20T08:00:00.000Z'
        }),
        attempt({
          id: 'latest-correct',
          question_uid: 'uid-recovered',
          attempt_number: 2,
          attempted_at: '2026-09-01T08:00:00.000Z',
          selected_answer: 'B',
          correct_answer: 'B',
          mark_decision: 'FIFTY_FIFTY',
          mark_correct: true
        }),
        attempt({
          id: 'latest-wrong-analyzed',
          question_uid: 'uid-analyzed',
          attempted_at: '2026-09-01T09:00:00.000Z'
        })
      ]
    });

    expect(candidates.some((candidate) => candidate.id === 'evidence:pending-analysis')).toBe(
      false
    );
    const guessed = candidates.find((candidate) => candidate.id === 'evidence:guessed-correct');
    expect(exactUids(guessed?.href)).toEqual(['uid-recovered']);
  });

  it('turns the weakest declining readiness snapshot into work when no direct debt represents it', () => {
    const candidates = buildPlannerEvidenceCandidates({
      asOfDate: '2026-09-02',
      readinessSnapshots: [
        snapshot({
          date: '2026-08-26',
          score: 64,
          coverage: 0.45,
          retention: 0.7,
          calibration: 0.8,
          surface: 0.75
        }),
        snapshot({
          score: 50,
          coverage: 0.2,
          retention: 0.7,
          calibration: 0.8,
          surface: 0.75
        })
      ]
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'evidence:readiness-snapshot:coverage',
      kind: 'study',
      title: 'Close coverage debt',
      priority: 'P2 High',
      href: '/syllabus?component=coverage'
    });
    expect(candidates[0].reason).toContain('-14 points');
  });

  it('enriches an existing commitment instead of duplicating its weekly and syllabus work', () => {
    const committed = session({
      id: 'committed-deadlock',
      subject: 'Operating Systems',
      priority: 'P2 High',
      target: 'Master deadlock avoidance'
    });
    const candidates = buildPlannerEvidenceCandidates({
      asOfDate: '2026-09-02',
      existingSessions: [committed, committed],
      incompleteSyllabusTopics: [
        {
          id: 'deadlock-gap',
          subject: 'Operating Systems',
          topic: 'Deadlock avoidance'
        },
        {
          id: 'deadlock-gap-copy',
          subject: 'Operating Systems',
          topic: 'Deadlock avoidance'
        }
      ],
      currentWeeklyReview: weeklyReview()
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: committed.id, priority: 'P2 High' });
    expect(candidates[0].reason).toContain('still incomplete');
    expect(candidates[0].reason).toContain('approved weekly fix');
  });
});
