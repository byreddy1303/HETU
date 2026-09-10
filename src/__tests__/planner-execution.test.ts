import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { emptyDayPlan, loadDayPlan, saveDayPlan, type StudySession } from '@/lib/planner-storage';
import {
  attachPlannerPyqSession,
  createPlannerPyqRepairBlocks,
  markPlannerBlockComplete,
  plannerBlockHref,
  reconcilePlannerExecutions,
  startPlannerBlock
} from '@/lib/planner-execution';
import { useAuthStore } from '@/stores/auth';
import { completePyqSession, createPyqAttemptRow, createPyqSessionRow } from '@/lib/pyq-session';
import type { PyqQuestion } from '@/lib/pyq';

const USER = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-08-10';

function block(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'block-1',
    subject: 'Operating Systems',
    durationMin: 60,
    mode: 'Problem Solving',
    priority: 'P1 Critical',
    target: 'Synchronization',
    ...overrides
  };
}

function savePlan(...blocks: StudySession[]) {
  const plan = emptyDayPlan(DATE);
  plan.sessions = blocks;
  saveDayPlan(plan);
}

describe('planner execution links', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAuthStore.setState({
      user: { id: USER } as User,
      status: 'signed_in',
      sandbox: false
    });
    await Promise.all([
      db.sessions.clear(),
      db.mock_tests.clear(),
      db.pyq_sessions.clear(),
      db.pyq_attempts.clear(),
      db.learning_items.clear()
    ]);
  });

  afterEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, profile: null, status: 'signed_out' });
  });

  it('routes each planner mode into the correct working flow', () => {
    expect(plannerBlockHref(DATE, block({ mode: 'PYQ Practice', durationMin: 30 }))).toContain(
      '/pyq?'
    );
    expect(plannerBlockHref(DATE, block({ mode: 'PYQ Practice', durationMin: 30 }))).toContain(
      'count=10'
    );
    expect(plannerBlockHref(DATE, block({ mode: 'Mock Test' }))).toContain('/mocks?');
    expect(plannerBlockHref(DATE, block())).toContain('/session/new?');
    expect(
      plannerBlockHref(
        DATE,
        block({
          execution: {
            sessionId: 'session-1',
            startedAt: '2026-08-10T10:00:00.000Z',
            completedAt: null,
            actualMin: null,
            manual: false
          }
        })
      )
    ).toBe('/session/session-1/solve');
  });

  it('maps Programming & DS to both immutable bank subject files', () => {
    const href = plannerBlockHref(
      DATE,
      block({
        subject: 'Programming & DS',
        subjectId: 'programming-data-structures',
        mode: 'PYQ Practice',
        durationMin: 30
      })
    );
    const params = new URL(href, 'https://hetu.test').searchParams;

    expect(params.get('subjectSlug')).toBe('all');
    expect(params.get('subjectSlugs')?.split(',').sort()).toEqual([
      'c-programming',
      'data-structure'
    ]);
  });

  it('splits large exact repairs without dropping UIDs and freezes launch before navigation', () => {
    const questionUids = Array.from({ length: 51 }, (_, index) => `repair-${index + 1}`);
    const blocks = createPlannerPyqRepairBlocks({
      date: DATE,
      questionUids,
      durationMin: 153,
      subjectLabel: 'Mixed GATE repair'
    });

    expect(blocks).toHaveLength(2);
    expect(blocks.flatMap((candidate) => candidate.launch!.prescription.exactQuestionUids)).toEqual(
      questionUids
    );
    expect(
      blocks.every((candidate) => candidate.launch!.prescription.exactQuestionUids.length <= 50)
    ).toBe(true);
    expect(
      blocks.reduce((sum, candidate) => sum + candidate.durationMin, 0)
    ).toBeGreaterThanOrEqual(153);

    savePlan(blocks[0]);
    const started = startPlannerBlock(DATE, blocks[0].id);
    expect(started?.block.launch?.prescription.exactQuestionUids).toEqual(
      questionUids.slice(0, 50)
    );
    expect(started?.block.execution).toBeUndefined();
    expect(started?.href).toContain('cohort=exact-uid');
    expect(started?.href).toContain('plannerPrescription=');
  });

  it('attaches only the matching durable PYQ session and resumes that exact session', () => {
    const [repair] = createPlannerPyqRepairBlocks({
      date: DATE,
      questionUids: ['q1', 'q2'],
      durationMin: 20,
      subjectLabel: 'Operating Systems',
      subjectId: 'operating-systems'
    });
    savePlan(repair);

    expect(() =>
      attachPlannerPyqSession({
        plannerDate: DATE,
        plannerBlockId: repair.id,
        prescriptionId: 'stale-prescription',
        pyqSessionId: 'pyq-linked',
        resolvedQuestionUids: ['q1', 'q2'],
        startedAt: '2026-08-10T10:00:00.000Z'
      })
    ).toThrow(/prescription changed/i);

    const attached = attachPlannerPyqSession({
      plannerDate: DATE,
      plannerBlockId: repair.id,
      prescriptionId: repair.launch!.prescription.id,
      pyqSessionId: 'pyq-linked',
      resolvedQuestionUids: ['q2', 'q1'],
      startedAt: '2026-08-10T10:00:00.000Z'
    });
    expect(attached?.sessions[0]).toMatchObject({
      launch: {
        pyqSessionId: 'pyq-linked',
        resolvedQuestionUids: ['q2', 'q1']
      },
      execution: {
        sessionId: 'pyq-linked',
        startedAt: '2026-08-10T10:00:00.000Z',
        completedAt: null,
        manual: false
      }
    });
    expect(plannerBlockHref(DATE, attached!.sessions[0])).toContain('resumeSession=pyq-linked');
  });

  it('reconciles exact PYQ evidence into a typed result receipt idempotently', async () => {
    const [repair] = createPlannerPyqRepairBlocks({
      date: DATE,
      questionUids: ['planner-q1', 'planner-q2'],
      durationMin: 20,
      subjectLabel: 'Operating Systems',
      subjectId: 'operating-systems'
    });
    savePlan(repair);
    const question: PyqQuestion = {
      id: 'planner-q1',
      bookSlug: 'gate-cse',
      year: 2026,
      set: 1,
      number: '1',
      paperLabel: 'GATE CSE 2026 Set 1',
      subject: 'Operating Systems',
      subjectSlug: 'operating-systems',
      topic: 'Processes',
      topicSlug: 'processes',
      subtopics: [],
      marks: 1,
      type: 'MCQ',
      answer: 'B',
      tolerance: null,
      answerStatus: 'available',
      html: '<p>Planner linked question</p>',
      sourceUrl: 'https://example.test/planner-q1',
      answerSource: null
    };
    const active = createPyqSessionRow(
      USER,
      'planner-bank',
      {
        ...repair.launch!.prescription.config,
        plannerPrescriptionId: repair.launch!.prescription.id
      },
      [{ id: 'planner-q1' }, { id: 'planner-q2' }],
      '2026-08-10T10:00:00.000Z'
    );
    const attempt = createPyqAttemptRow({
      userId: USER,
      session: active,
      question,
      selectedAnswer: 'B',
      decision: 'MARK',
      confidence: 'high',
      bankVersion: 'planner-bank',
      questionStartedAtMs: Date.parse('2026-08-10T10:00:00.000Z'),
      committedAtMs: Date.parse('2026-08-10T10:01:00.000Z'),
      screenshotUrl: null
    });
    const completed = completePyqSession(
      {
        ...active,
        completed_question_uids: ['planner-q1'],
        completed_count: 1,
        elapsed_sec: 60
      },
      '2026-08-10T10:02:00.000Z'
    );
    await Promise.all([
      db.pyq_sessions.put({ ...completed, sync_status: 'synced' }),
      db.pyq_attempts.put({ ...attempt, sync_status: 'synced' }),
      db.sessions.put({
        id: completed.id,
        user_id: USER,
        kind: 'pyq',
        date: DATE,
        subject: 'Operating Systems',
        target_duration_min: 20,
        actual_duration_min: 1,
        insight: null,
        sadhana_done: false,
        interruptions_count: 0,
        planner_date: DATE,
        planner_block_id: repair.id,
        created_at: completed.started_at,
        sync_status: 'synced'
      })
    ]);

    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(1);
    expect(loadDayPlan(DATE)?.sessions[0]).toMatchObject({
      execution: {
        sessionId: completed.id,
        completedAt: '2026-08-10T10:02:00.000Z',
        actualMin: 1,
        manual: false
      },
      result: {
        kind: 'pyq',
        receipt: {
          pyqSessionId: completed.id,
          exactQuestionUids: ['planner-q1', 'planner-q2'],
          submittedQuestionUids: ['planner-q1'],
          attemptedQuestionCount: 1,
          completionPct: 50,
          outcome: 'partial',
          originalTargetStatus: 'partial'
        }
      }
    });
    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(0);
  });

  it('credits a completed target independently from estimation error', () => {
    savePlan(block(), block({ id: 'block-2', durationMin: 30 }));
    markPlannerBlockComplete(DATE, 'block-1', 45);

    const plan = loadDayPlan(DATE);
    expect(plan?.sessions[0].execution?.actualMin).toBe(45);
    expect(plan?.review.completionPct).toBe(67);
  });

  it('does not let one overlong block hide unfinished planned work', () => {
    savePlan(block(), block({ id: 'block-2', durationMin: 30 }));
    markPlannerBlockComplete(DATE, 'block-1', 120);

    expect(loadDayPlan(DATE)?.review.completionPct).toBe(67);
  });

  it('reconciles a completed focused session back into its exact planner block', async () => {
    savePlan(block());
    await db.sessions.put({
      id: 'session-linked',
      user_id: USER,
      kind: 'focused',
      date: DATE,
      subject: 'Operating Systems',
      target_duration_min: 60,
      actual_duration_min: 52,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      planner_date: DATE,
      planner_block_id: 'block-1',
      created_at: '2026-08-10T10:00:00.000Z',
      sync_status: 'synced'
    });

    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(1);
    expect(loadDayPlan(DATE)?.sessions[0].execution).toMatchObject({
      sessionId: 'session-linked',
      actualMin: 52,
      manual: false
    });
    expect(loadDayPlan(DATE)?.review.completionPct).toBe(100);
    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(0);
  });
});
