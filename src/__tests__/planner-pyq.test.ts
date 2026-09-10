import { describe, expect, it } from 'vitest';
import {
  createPlannerPyqLaunchPrescription,
  createPlannerPyqResultReceipt,
  plannerPyqPrescriptionHref,
  type PlannerPyqReceiptAttempt
} from '@/lib/planner-pyq';

describe('structured Planner PYQ handoff', () => {
  it('uses learner pace to produce a bounded, structured launch prescription', () => {
    const prescription = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-08-31',
      plannerBlockId: 'block-os',
      subjectLabel: 'Operating Systems',
      subjectSlug: 'operating-systems',
      topicSlug: 'process-synchronization',
      bookSlug: 'gate-cse',
      durationMin: 45,
      medianSecondsPerQuestion: 180,
      history: 'incorrect',
      fromYear: 2010,
      toYear: 2025,
      type: 'MCQ',
      order: 'oldest'
    });

    expect(prescription.targetQuestionCount).toBe(15);
    expect(prescription.config).toMatchObject({
      subjectSlug: 'operating-systems',
      topicSlug: 'process-synchronization',
      bookSlug: 'gate-cse',
      count: '15',
      history: 'incorrect',
      fromYear: 2010,
      toYear: 2025,
      type: 'MCQ',
      order: 'oldest',
      mode: 'practice'
    });
    const href = plannerPyqPrescriptionHref(prescription);
    expect(href).toContain('plannerBlock=block-os');
    expect(href).toContain('subject=Operating+Systems');
    expect(href).toContain('topic=process-synchronization');
    expect(href).toContain('count=15');
    expect(href).toContain('duration=45');
    expect(href).toContain('protectSealed=1');
    expect(href).toContain('plannerPrescription=');
  });

  it('retains a deduplicated exact UID order and emits the complete executable contract', () => {
    const first = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-09-02',
      plannerBlockId: 'repair-block',
      subjectLabel: 'Mixed GATE repair',
      subjectSlug: 'all',
      durationMin: 24,
      exactQuestionUids: ['slow-2', 'wrong-1', 'slow-2'],
      selectionSeed: 'approved-seed',
      protectSealedPapers: true
    });
    const repeated = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-09-02',
      plannerBlockId: 'repair-block',
      subjectLabel: 'Mixed GATE repair',
      subjectSlug: 'all',
      durationMin: 24,
      exactQuestionUids: ['slow-2', 'wrong-1', 'slow-2'],
      selectionSeed: 'approved-seed',
      protectSealedPapers: true
    });

    expect(first).toMatchObject({
      id: repeated.id,
      cohort: 'exact-uid',
      targetQuestionCount: 2,
      questionBudget: 2,
      timeBudgetMin: 24,
      exactQuestionUids: ['slow-2', 'wrong-1'],
      config: {
        subjectSlug: 'all',
        count: 'all',
        history: 'all',
        recommendationPreset: 'repair',
        plannerTimeBudgetMin: 24
      }
    });
    const params = new URL(plannerPyqPrescriptionHref(first), 'https://hetu.test').searchParams;
    expect(params.get('questionUids')).toBe('slow-2,wrong-1');
    expect(params.get('cohort')).toBe('exact-uid');
    expect(params.get('preset')).toBe('repair');
    expect(params.get('seed')).toBe('approved-seed');
    expect(params.get('duration')).toBe('24');
    expect(params.get('plannerPrescription')).toBe(first.id);
  });

  it('keeps a canonical subject that spans multiple bank files explicitly scoped', () => {
    const prescription = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-09-02',
      plannerBlockId: 'programming-block',
      subjectLabel: 'Programming & DS',
      subjectSlug: 'all',
      subjectSlugs: ['data-structure', 'c-programming', 'data-structure'],
      durationMin: 30
    });

    expect(prescription.config).toMatchObject({
      subjectSlug: 'all',
      subjectSlugs: ['data-structure', 'c-programming']
    });
    const params = new URL(plannerPyqPrescriptionHref(prescription), 'https://hetu.test')
      .searchParams;
    expect(params.get('subjectSlug')).toBe('all');
    expect(params.get('subjectSlugs')).toBe('data-structure,c-programming');
  });

  it('creates a stable result receipt from the latest immutable attempt per question', () => {
    const prescription = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-08-31',
      plannerBlockId: 'block-os',
      subjectLabel: 'Operating Systems',
      durationMin: 45,
      medianSecondsPerQuestion: 180
    });
    const attempts: PlannerPyqReceiptAttempt[] = [
      {
        id: 'q1-first',
        question_uid: 'q1',
        mark_correct: false,
        mark_decision: 'MARK',
        time_spent_sec: 90,
        score_thirds: -1,
        attempted_at: '2026-08-31T06:01:00Z'
      },
      {
        id: 'q1-latest',
        question_uid: 'q1',
        mark_correct: true,
        mark_decision: 'MARK',
        time_spent_sec: 120,
        score_thirds: 6,
        attempted_at: '2026-08-31T06:03:00Z'
      },
      {
        id: 'q2-skip',
        question_uid: 'q2',
        mark_correct: false,
        mark_decision: 'SKIP',
        time_spent_sec: 30,
        score_thirds: 0,
        attempted_at: '2026-08-31T06:05:00Z'
      },
      {
        id: 'q3-unscored',
        question_uid: 'q3',
        mark_correct: null,
        mark_decision: 'MARK',
        time_spent_sec: 45,
        score_thirds: null,
        attempted_at: '2026-08-31T06:07:00Z'
      }
    ];
    const before = JSON.stringify(attempts);

    const receipt = createPlannerPyqResultReceipt({
      prescription,
      sessionId: 'pyq-session-1',
      status: 'completed',
      startedAt: '2026-08-31T06:00:00Z',
      completedAt: '2026-08-31T06:10:00Z',
      elapsedSec: 600,
      attempts
    });

    expect(receipt).toMatchObject({
      outcome: 'partial',
      requestedQuestionCount: 15,
      attemptedQuestionCount: 3,
      submissionCount: 4,
      correctCount: 1,
      incorrectCount: 0,
      skippedCount: 1,
      unscoredCount: 1,
      accuracyPct: 100,
      completionPct: 20,
      activeAttemptSec: 195,
      paceSecPerQuestion: 200,
      scoreThirds: 6
    });
    expect(receipt.id).toBe(`${prescription.id}:pyq-session-1`);
    expect(JSON.stringify(attempts)).toBe(before);
  });

  it('records scoring coverage, confidence surprises, recovery creation, and target status', () => {
    const prescription = createPlannerPyqLaunchPrescription({
      plannerDate: '2026-09-02',
      plannerBlockId: 'repair-result',
      subjectLabel: 'Databases',
      durationMin: 12,
      exactQuestionUids: ['q1', 'q2']
    });
    const attempts: PlannerPyqReceiptAttempt[] = [
      {
        id: 'a1',
        question_uid: 'q1',
        mark_correct: false,
        mark_decision: 'MARK',
        time_spent_sec: 90,
        score_thirds: -1,
        confidence: 'high',
        question_marks: 1,
        scoring_status: 'scored',
        attempted_at: '2026-09-02T06:02:00Z'
      },
      {
        id: 'a2',
        question_uid: 'q2',
        mark_correct: null,
        mark_decision: 'MARK',
        time_spent_sec: 60,
        score_thirds: null,
        confidence: 'low',
        question_marks: 2,
        scoring_status: 'unscorable',
        attempted_at: '2026-09-02T06:04:00Z'
      }
    ];

    const receipt = createPlannerPyqResultReceipt({
      prescription,
      sessionId: 'session-result',
      status: 'completed',
      startedAt: '2026-09-02T06:00:00Z',
      completedAt: '2026-09-02T06:05:00Z',
      elapsedSec: 300,
      questionUids: ['q1', 'q2'],
      recoveryItemIds: ['learning-q1', 'learning-q1'],
      attempts
    });

    expect(receipt).toMatchObject({
      exactQuestionUids: ['q1', 'q2'],
      submittedQuestionUids: ['q1', 'q2'],
      possibleScorableMarks: 1,
      scoringCoveragePct: 50,
      scoreThirds: -1,
      scorableMarks: -1 / 3,
      confidenceSurpriseCount: 1,
      recoveryItemIds: ['learning-q1'],
      recoveryItemsCreated: 1,
      originalTargetStatus: 'met'
    });
  });
});
