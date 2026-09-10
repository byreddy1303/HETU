import { describe, expect, it } from 'vitest';
import {
  copyFullPlannerDay,
  copySelectedPlannerBlocks,
  createPlannerReplicateAction,
  estimateProposedPyqRecoveryLoad,
  expandPlannerRecurrenceDates,
  plannerCopySourceDate,
  plannerPlanVsActualBySubjectMode,
  previousWeekdayISO,
  rolloverUnfinishedPlannerBlocks
} from '@/lib/planner-operations';
import {
  createPlannerPyqLaunchPrescription,
  createPlannerPyqResultReceipt
} from '@/lib/planner-pyq';
import { emptyDayPlan, type DayPlan, type StudySession } from '@/lib/planner-storage';

const SOURCE_DATE = '2026-09-04';
const TARGET_DATE = '2026-09-07';

function basicBlock(id: string, overrides: Partial<StudySession> = {}): StudySession {
  return {
    id,
    subject: 'Operating Systems',
    subjectId: 'operating-systems',
    durationMin: 30,
    mode: 'Problem Solving',
    priority: 'P2 High',
    target: 'Practice synchronization',
    ...overrides
  };
}

function pyqBlock(
  id: string,
  date = SOURCE_DATE,
  questionUids: readonly string[] = ['q-1', 'q-2']
): StudySession {
  const prescription = createPlannerPyqLaunchPrescription({
    plannerDate: date,
    plannerBlockId: id,
    subjectLabel: 'Operating Systems',
    subjectSlug: 'operating-systems',
    topicSlug: 'process-synchronization',
    durationMin: 30,
    medianSecondsPerQuestion: 150,
    exactQuestionUids: questionUids,
    cohort: 'exact-uid',
    selectionSeed: `source-${id}`,
    protectSealedPapers: true
  });
  const receipt = createPlannerPyqResultReceipt({
    prescription,
    sessionId: `session-${id}`,
    status: 'completed',
    startedAt: `${date}T05:00:00.000Z`,
    completedAt: `${date}T05:30:00.000Z`,
    elapsedSec: 1_800,
    questionUids,
    recoveryItemIds: ['recovery-1'],
    attempts: questionUids.map((questionUid, index) => ({
      id: `attempt-${id}-${index}`,
      question_uid: questionUid,
      mark_correct: index === 0,
      mark_decision: 'MARK' as const,
      time_spent_sec: 120 + index * 30,
      score_thirds: index === 0 ? 3 : -1,
      confidence: index === 0 ? ('medium' as const) : ('high' as const),
      question_marks: 1 as const,
      scoring_status: 'scored' as const,
      attempted_at: `${date}T05:${String(index + 1).padStart(2, '0')}:00.000Z`
    }))
  });
  return basicBlock(id, {
    mode: 'PYQ Practice',
    launch: {
      kind: 'pyq',
      prescription,
      resolvedQuestionUids: [...questionUids],
      resolvedAt: `${date}T05:00:00.000Z`,
      pyqSessionId: `session-${id}`
    },
    result: { kind: 'pyq', receipt },
    execution: {
      sessionId: `session-${id}`,
      startedAt: `${date}T05:00:00.000Z`,
      completedAt: `${date}T05:30:00.000Z`,
      actualMin: 30,
      manual: false
    }
  });
}

function sourcePlan(...sessions: StudySession[]): DayPlan {
  const plan = emptyDayPlan(SOURCE_DATE);
  plan.updatedAt = '2026-09-04T18:00:00.000Z';
  plan.sessions = sessions;
  plan.availability.timeWindows = [
    { id: 'morning', label: 'Morning', start: '06:00', end: '08:00', energy: 'high' }
  ];
  plan.nonStudy = {
    exerciseDone: true,
    exerciseTime: '18:00',
    errands: 'Print formula sheet',
    social: 'Call family'
  };
  plan.review = {
    completionPct: 100,
    wentWell: 'Protected the first block.',
    missed: '',
    endMood: 'strong',
    replicate: 'yes'
  };
  return plan;
}

describe('Planner copy and rollover operations', () => {
  it('copies a full day with fresh PYQ identity and no leaked execution evidence', () => {
    const source = sourcePlan(pyqBlock('pyq-source'), basicBlock('study-source'));
    const before = JSON.stringify(source);

    const copied = copyFullPlannerDay(source, TARGET_DATE, {
      updatedAt: '2026-09-05T12:00:00.000Z'
    });

    expect(copied.date).toBe(TARGET_DATE);
    expect(copied.updatedAt).toBe('2026-09-05T12:00:00.000Z');
    expect(copied.sessions).toHaveLength(2);
    const copiedPyq = copied.sessions[0];
    expect(copiedPyq.id).not.toBe('pyq-source');
    expect(copiedPyq.execution).toBeUndefined();
    expect(copiedPyq.result).toBeUndefined();
    expect(copiedPyq.launch).toMatchObject({
      kind: 'pyq',
      resolvedQuestionUids: [],
      resolvedAt: null,
      pyqSessionId: null,
      prescription: {
        plannerDate: TARGET_DATE,
        plannerBlockId: copiedPyq.id,
        exactQuestionUids: ['q-1', 'q-2'],
        paceSecPerQuestion: 150,
        protectSealedPapers: true,
        config: { topicSlug: 'process-synchronization' }
      }
    });
    expect(copiedPyq.launch?.prescription.id).not.toBe(source.sessions[0].launch?.prescription.id);
    expect(copied.review).toEqual({
      completionPct: 0,
      wentWell: '',
      missed: '',
      endMood: '',
      replicate: ''
    });
    expect(copied.nonStudy).toMatchObject({
      exerciseDone: false,
      exerciseTime: '18:00',
      errands: 'Print formula sheet'
    });
    expect(copied.availability.timeWindows[0]).not.toBe(source.availability.timeWindows[0]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('regenerates an unlaunched Programming & DS block across both bank files', () => {
    const source = sourcePlan(
      basicBlock('programming', {
        subject: 'Programming & DS',
        subjectId: 'programming-data-structures',
        mode: 'PYQ Practice'
      })
    );

    const [copied] = copySelectedPlannerBlocks(source, ['programming'], TARGET_DATE);

    expect(copied.launch?.prescription.config).toMatchObject({
      subjectSlug: 'all',
      subjectSlugs: ['c-programming', 'data-structure']
    });
  });

  it('resolves yesterday and the strictly previous weekday across weekends', () => {
    expect(plannerCopySourceDate('2026-09-07', 'yesterday')).toBe('2026-09-06');
    expect(previousWeekdayISO('2026-09-07')).toBe('2026-09-04');
    expect(previousWeekdayISO('2026-09-06')).toBe('2026-09-04');
    expect(previousWeekdayISO('2026-09-05')).toBe('2026-09-04');
    expect(previousWeekdayISO('2026-09-08')).toBe('2026-09-07');
  });

  it('copies only selected blocks in agenda order and skips unknown IDs', () => {
    const source = sourcePlan(basicBlock('first'), pyqBlock('second'), basicBlock('third'));

    const copied = copySelectedPlannerBlocks(source, ['third', 'missing', 'second'], TARGET_DATE);

    expect(copied.map((block) => block.target)).toEqual([
      'Practice synchronization',
      'Practice synchronization'
    ]);
    expect(copied.map((block) => block.mode)).toEqual(['PYQ Practice', 'Problem Solving']);
    expect(new Set(copied.map((block) => block.id)).size).toBe(2);
    expect(copied[0].execution).toBeUndefined();
    expect(copied[0].result).toBeUndefined();
  });

  it('rolls over untouched and interrupted blocks but excludes completed work', () => {
    const source = sourcePlan(
      basicBlock('untouched'),
      basicBlock('interrupted', {
        execution: {
          sessionId: 'draft-session',
          startedAt: '2026-09-04T06:00:00.000Z',
          completedAt: null,
          actualMin: 12,
          manual: false
        }
      }),
      basicBlock('completed', {
        execution: {
          sessionId: 'done-session',
          startedAt: '2026-09-04T08:00:00.000Z',
          completedAt: '2026-09-04T08:30:00.000Z',
          actualMin: 30,
          manual: false
        }
      })
    );

    const rolled = rolloverUnfinishedPlannerBlocks(source, TARGET_DATE);

    expect(rolled).toHaveLength(2);
    expect(rolled.every((block) => block.execution === undefined)).toBe(true);
    expect(rolled.map((block) => block.id)).not.toContain('completed');
  });
});

describe('Planner replicate semantics', () => {
  it('maps Yes to all, Partial to proven completed blocks, and No to start fresh', () => {
    const source = sourcePlan(
      basicBlock('completed', {
        execution: {
          sessionId: 'done',
          startedAt: '2026-09-04T05:00:00.000Z',
          completedAt: '2026-09-04T05:30:00.000Z',
          actualMin: 30,
          manual: false
        }
      }),
      basicBlock('unfinished')
    );

    const yes = createPlannerReplicateAction(source, TARGET_DATE, 'yes');
    const partial = createPlannerReplicateAction(source, TARGET_DATE, 'partial');
    const no = createPlannerReplicateAction(source, TARGET_DATE, 'no');

    expect(yes).toMatchObject({
      action: 'copy-full-day',
      copiedSourceBlockIds: ['completed', 'unfinished']
    });
    expect(yes.plan?.sessions).toHaveLength(2);
    expect(partial).toMatchObject({
      action: 'copy-selected-blocks',
      copiedSourceBlockIds: ['completed'],
      omittedSourceBlockIds: ['unfinished']
    });
    expect(partial.plan?.sessions).toHaveLength(1);
    expect(no).toMatchObject({
      action: 'start-fresh',
      plan: null,
      copiedSourceBlockIds: [],
      omittedSourceBlockIds: ['completed', 'unfinished']
    });
  });

  it('lets an explicit Partial selection override the completed-block fallback', () => {
    const source = sourcePlan(basicBlock('completed'), basicBlock('chosen'));

    const action = createPlannerReplicateAction(source, TARGET_DATE, 'partial', {
      partialBlockIds: ['chosen']
    });

    expect(action.copiedSourceBlockIds).toEqual(['chosen']);
    expect(action.omittedSourceBlockIds).toEqual(['completed']);
    expect(action.explanation).toMatch(/explicitly selected/i);
  });
});

describe('Planner recurrence expansion', () => {
  it('expands bounded daily, weekday, and weekly dates inclusively', () => {
    expect(
      expandPlannerRecurrenceDates({
        kind: 'daily',
        startDate: '2026-09-01',
        interval: 2,
        maxOccurrences: 3
      })
    ).toEqual(['2026-09-01', '2026-09-03', '2026-09-05']);
    expect(
      expandPlannerRecurrenceDates({
        kind: 'weekdays',
        startDate: '2026-09-04',
        maxOccurrences: 4
      })
    ).toEqual(['2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09']);
    expect(
      expandPlannerRecurrenceDates({
        kind: 'weekly',
        startDate: '2026-09-01',
        interval: 2,
        maxOccurrences: 3
      })
    ).toEqual(['2026-09-01', '2026-09-15', '2026-09-29']);
  });

  it('supports template custom weekdays and an inclusive end date', () => {
    expect(
      expandPlannerRecurrenceDates({
        kind: 'custom',
        startDate: '2026-09-01',
        endDate: '2026-09-14',
        interval: 1,
        weekdays: [1, 3]
      })
    ).toEqual(['2026-09-02', '2026-09-07', '2026-09-09', '2026-09-14']);
  });
});

describe('Planner execution calibration', () => {
  it('reports time, question, and outcome evidence by subject and mode', () => {
    const first = pyqBlock('pyq-one');
    first.execution = { ...first.execution!, actualMin: 36 };
    const second = pyqBlock('pyq-two', SOURCE_DATE, ['q-3', 'q-4', 'q-5', 'q-6', 'q-7']);
    second.execution = { ...second.execution!, actualMin: 24 };
    delete second.result;
    const source = sourcePlan(first, second, basicBlock('deep', { mode: 'Deep Study' }));
    const future = sourcePlan(
      basicBlock('future', {
        mode: 'PYQ Practice',
        execution: {
          sessionId: 'future',
          startedAt: '2026-09-08T05:00:00.000Z',
          completedAt: '2026-09-08T06:00:00.000Z',
          actualMin: 120,
          manual: false
        }
      })
    );
    future.date = '2026-09-08';

    const rows = plannerPlanVsActualBySubjectMode([source, future], {
      throughDate: SOURCE_DATE
    });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.mode === 'PYQ Practice')).toMatchObject({
      subject: 'Operating Systems',
      plannedBlockCount: 2,
      completedBlockCount: 2,
      timeEvidenceBlockCount: 2,
      plannedMin: 60,
      plannedMinWithActual: 60,
      actualMin: 60,
      estimationErrorMin: 0,
      meanErrorMin: 0,
      meanAbsoluteErrorMin: 6,
      meanAbsolutePercentageErrorPct: 20,
      timeCalibrationFactor: 1,
      overrunBlockCount: 1,
      underrunBlockCount: 1,
      plannedQuestions: 7,
      plannedQuestionsWithResult: 2,
      attemptedQuestions: 2,
      questionCompletionPct: 100,
      correctQuestions: 1,
      incorrectQuestions: 1,
      answerAccuracyPct: 50,
      completedOutcomeCount: 1
    });
    expect(rows.find((row) => row.mode === 'Deep Study')).toMatchObject({
      plannedBlockCount: 1,
      timeEvidenceBlockCount: 0,
      meanErrorMin: null,
      timeCalibrationFactor: null
    });
  });
});

describe('proposed PYQ recovery-load estimate', () => {
  it('discloses an explicit capture-rate formula across D3/D10/D30', () => {
    const block = pyqBlock(
      'future-pyq',
      '2026-09-01',
      Array.from({ length: 10 }, (_, index) => `q-${index + 1}`)
    );

    const estimate = estimateProposedPyqRecoveryLoad({
      plannerDate: '2026-09-01',
      block,
      expectedCaptureRate: 0.4,
      minutesPerReview: 4
    });

    expect(estimate).toMatchObject({
      targetQuestionCount: 10,
      questionCountSource: 'typed-prescription',
      captureRateSource: 'explicit',
      expectedCaptureRate: 0.4,
      expectedRecoveryItems: 4,
      expectedReviewOccurrences: 12,
      totalEstimatedMin: 48,
      reviewOffsetsDays: [3, 10, 30]
    });
    expect(estimate.days).toEqual([
      {
        date: '2026-09-04',
        offsetDays: 3,
        label: 'D3',
        expectedReviews: 4,
        estimatedMin: 16
      },
      {
        date: '2026-09-11',
        offsetDays: 10,
        label: 'D10',
        expectedReviews: 4,
        estimatedMin: 16
      },
      {
        date: '2026-10-01',
        offsetDays: 30,
        label: 'D30',
        expectedReviews: 4,
        estimatedMin: 16
      }
    ]);
    expect(estimate.formula).toBe(
      '10 questions × 40% capture = 4 expected items; 4 × 3 reviews × 4m = 48m.'
    );
  });

  it('uses historical capture evidence and exposes duration/pace fallback for legacy blocks', () => {
    const estimate = estimateProposedPyqRecoveryLoad({
      plannerDate: '2026-09-01',
      block: basicBlock('legacy-pyq', { mode: 'PYQ Practice', durationMin: 30 }),
      historicalCapture: { capturedCount: 3, attemptedCount: 12 }
    });

    expect(estimate).toMatchObject({
      targetQuestionCount: 10,
      questionCountSource: 'duration-and-pace',
      captureRateSource: 'history',
      expectedCaptureRate: 0.25,
      expectedRecoveryItems: 2.5,
      totalEstimatedMin: 30
    });
    expect(estimate.assumptions.join(' ')).toMatch(/3\/12 historical attempts/i);
    expect(estimate.assumptions.join(' ')).toMatch(/180 seconds per question/i);
  });
});
