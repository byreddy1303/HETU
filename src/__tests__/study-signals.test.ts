import { describe, expect, it } from 'vitest';
import type { PyqQuestion } from '@/lib/pyq';
import {
  activityByDay,
  buildBankStats,
  dailyPlan,
  FALLBACK_SUBJECT_WEIGHTS,
  mockPlan,
  practiceHref,
  reattemptPipeline,
  reattemptProgress,
  studyPhase,
  studyStreak,
  subjectSignals,
  syllabusBySubject
} from '@/lib/study-signals';
import type { LearningEventRow, LearningItemRow, PyqAttemptRow, PyqSessionRow } from '@/types';

const EXAM = '2027-02-06';
const TZ = 'Asia/Kolkata';

function question(
  id: string,
  subjectSlug: string,
  topicSlug: string,
  year: number,
  marks: number,
  paperLabel = `GATE CSE ${year}`
): PyqQuestion {
  return {
    id,
    year,
    set: null,
    number: id,
    paperLabel,
    subject: subjectSlug,
    subjectSlug,
    topic: topicSlug,
    topicSlug,
    subtopics: [],
    marks,
    type: 'MCQ',
    answer: 'A',
    tolerance: null,
    answerStatus: 'available',
    html: '',
    sourceUrl: '',
    answerSource: null
  };
}

/** 65 questions, 100 marks: GA 15, OS 9, Algorithms 76. */
function paper(label: string, year: number): PyqQuestion[] {
  return Array.from({ length: 65 }, (_, index) => {
    const marks = index < 30 ? 1 : 2;
    const id = `${label}#${index}`;
    if (index < 5 || (index >= 30 && index < 35))
      return question(id, 'general-aptitude', 'general-aptitude', year, marks, label);
    if (index < 10 || (index >= 35 && index < 37))
      return question(id, 'operating-systems', 'cpu-scheduling', year, marks, label);
    return question(id, 'algorithms', 'sorting', year, marks, label);
  });
}

const bankQuestions = [
  ...paper('GATE CSE 2026 Set 1', 2026),
  ...paper('GATE CSE 2025 Set 1', 2025),
  question('old-os', 'operating-systems', 'deadlock', 2010, 2),
  question('c-1', 'c-programming', 'loops', 2018, 1),
  question('ds-1', 'data-structure', 'stack', 2019, 2),
  question('net-sec', 'computer-networks', 'network-security', 2020, 2),
  question('isro-1', 'operating-systems', 'deadlock', 2020, 1, 'ISRO 2020')
];

function attempt(
  id: string,
  questionUid: string,
  attemptedAt: string,
  correct: boolean | null,
  decision: PyqAttemptRow['mark_decision'] = 'MARK'
): PyqAttemptRow {
  return {
    id,
    user_id: 'u',
    question_uid: questionUid,
    attempted_at: attemptedAt,
    mark_correct: correct,
    mark_decision: decision
  } as PyqAttemptRow;
}

function item(
  id: string,
  subject: string,
  stage: LearningItemRow['stage'],
  scheduled: string | null,
  state: LearningItemRow['recovery_state'] = 'active'
): LearningItemRow {
  return {
    id,
    user_id: 'u',
    subject,
    stage,
    scheduled_date: scheduled,
    recovery_state: state
  } as LearningItemRow;
}

function event(
  itemId: string,
  type: LearningEventRow['event_type'],
  localDate: string,
  sourceAttempt: string | null = null
): LearningEventRow {
  return {
    id: `${itemId}:${type}:${localDate}`,
    user_id: 'u',
    learning_item_id: itemId,
    event_type: type,
    local_date: localDate,
    source_pyq_attempt_id: sourceAttempt
  } as LearningEventRow;
}

describe('studyPhase', () => {
  it('splits the last 75 days into Cover, Consolidate and Simulate', () => {
    const phase = studyPhase('2026-11-23', EXAM);
    expect(phase).toMatchObject({
      id: 'cover',
      daysToExam: 75,
      endsOn: '2026-12-20',
      consolidateStartsOn: '2026-12-21',
      simulateStartsOn: '2027-01-18',
      next: { id: 'consolidate', startsOn: '2026-12-21', inDays: 28 }
    });
    expect(studyPhase('2026-12-21', EXAM)).toMatchObject({
      id: 'consolidate',
      dayOfPhase: 1,
      phaseLength: 28,
      endsOn: '2027-01-17'
    });
    expect(studyPhase('2027-01-18', EXAM)).toMatchObject({
      id: 'simulate',
      endsOn: '2027-02-05',
      next: { id: 'exam' }
    });
    expect(studyPhase(EXAM, EXAM).id).toBe('exam');
    expect(studyPhase('2027-02-07', EXAM).id).toBe('done');
  });
});

describe('buildBankStats', () => {
  const stats = buildBankStats(bankQuestions);

  it('weights subjects by their marks in complete GATE CSE papers', () => {
    const weight = (id: string) => stats.subjects.find((s) => s.subjectId === id)?.weight;
    expect(stats.loaded).toBe(true);
    expect(stats.referencePapers).toEqual(['GATE CSE 2026 Set 1', 'GATE CSE 2025 Set 1']);
    expect(weight('general-aptitude')).toBe(15);
    expect(weight('operating-systems')).toBe(9);
    expect(weight('algorithms')).toBe(76);
    expect(weight('databases')).toBe(0);
  });

  it('keeps in-scope GATE CSE questions and paces from 2015', () => {
    const os = stats.subjects.find((s) => s.subjectId === 'operating-systems')!;
    expect(os.allIds.has('old-os')).toBe(true);
    expect(os.paceIds.has('old-os')).toBe(false);
    expect(os.allIds.has('isro-1')).toBe(false);
    expect(stats.subjectOf.has('net-sec')).toBe(false);
    const pds = stats.subjects.find((s) => s.subjectId === 'programming-data-structures')!;
    expect([...pds.paceIds].sort()).toEqual(['c-1', 'ds-1']);
    expect(stats.lastYear).toBe(2026);
  });

  it('falls back to published weights before the bank loads', () => {
    const empty = buildBankStats([]);
    expect(empty.loaded).toBe(false);
    expect(empty.subjects.find((s) => s.subjectId === 'operating-systems')?.weight).toBe(
      FALLBACK_SUBJECT_WEIGHTS['operating-systems']
    );
  });
});

describe('subjectSignals', () => {
  const stats = buildBankStats(bankQuestions);

  it('measures coverage, first-try accuracy and due re-attempts per subject', () => {
    const attempts = [
      attempt('a1', 'GATE CSE 2026 Set 1#5', '2026-11-20T05:00:00Z', false),
      attempt('a2', 'GATE CSE 2026 Set 1#5', '2026-11-22T05:00:00Z', true),
      attempt('a3', 'GATE CSE 2026 Set 1#6', '2026-11-20T05:10:00Z', true),
      attempt('a4', 'GATE CSE 2026 Set 1#7', '2026-11-20T05:20:00Z', null, 'SKIP'),
      attempt('a5', 'old-os', '2026-11-20T05:30:00Z', true)
    ];
    const items = [
      item('i1', 'Operating Systems', 'D3', '2026-11-23'),
      item('i2', 'OS', 'D10', '2026-12-01'),
      item('i3', 'Operating Systems', 'D3', '2026-11-20', 'mastered')
    ];
    const os = subjectSignals(stats, attempts, items, '2026-11-23').find(
      (s) => s.subjectId === 'operating-systems'
    )!;
    expect(os).toMatchObject({
      paceTotal: 14,
      paceAttempted: 3,
      allTotal: 15,
      allAttempted: 4,
      firstTries: 3,
      firstTryCorrect: 2,
      openReattempts: 2,
      dueReattempts: 1
    });
    expect(os.accuracy).toBeCloseTo(2 / 3);
    expect(os.coverage).toBeCloseTo(3 / 14);
  });

  it('ranks by open marks and asks to study first when the syllabus is untouched', () => {
    const syllabus = syllabusBySubject((subject, topic) =>
      subject === 'Operating Systems' ? true : subject === 'Algorithms' && topic === 'nothing'
    );
    const ranked = subjectSignals(stats, [], [], '2026-11-23', syllabus);
    expect(ranked[0].subjectId).toBe('algorithms');
    expect(ranked.find((s) => s.subjectId === 'algorithms')?.stage).toBe('learn');
    expect(ranked.find((s) => s.subjectId === 'algorithms')?.syllabus?.nextTopic).toBe(
      'Asymptotic Analysis'
    );
    expect(ranked.find((s) => s.subjectId === 'operating-systems')?.stage).toBe('practise');
    expect(ranked.find((s) => s.subjectId === 'general-aptitude')?.stage).toBe('practise');
  });
});

describe('dailyPlan', () => {
  const stats = buildBankStats(bankQuestions);
  const phase = studyPhase('2026-11-23', EXAM);

  it('spreads unseen recent PYQs over the days before Simulate', () => {
    const attempts = [
      // First attempts today (IST): two paced core questions and one older one.
      attempt('t1', 'GATE CSE 2026 Set 1#40', '2026-11-23T04:00:00Z', true),
      attempt('t2', 'GATE CSE 2026 Set 1#41', '2026-11-23T04:05:00Z', false),
      attempt('t3', 'old-os', '2026-11-23T04:10:00Z', true),
      // A re-solve today of a question first seen earlier does not count as new.
      attempt('t4', 'GATE CSE 2025 Set 1#40', '2026-11-20T04:00:00Z', false),
      attempt('t5', 'GATE CSE 2025 Set 1#40', '2026-11-23T04:20:00Z', true),
      attempt('t6', 'GATE CSE 2026 Set 1#0', '2026-11-23T04:30:00Z', true)
    ];
    const plan = dailyPlan(stats, attempts, '2026-11-23', TZ, phase, 15);
    // Core paced set: 2 papers x 55 non-GA questions + c-1 + ds-1 = 112.
    expect(plan.core).toMatchObject({
      total: 112,
      attempted: 3,
      remaining: 109,
      doneToday: 2,
      olderToday: 1,
      // 56 calendar days minus 12 mock days (Sundays, then Wednesdays and Sundays).
      daysLeft: 44,
      deadline: '2027-01-18',
      mockDay: false
    });
    expect(plan.core.dailyTarget).toBe(Math.ceil(111 / 44));
    expect(plan.core.pace).toBe(plan.core.dailyTarget);
    expect(plan.aptitude).toMatchObject({ total: 20, attempted: 1, doneToday: 1 });
    expect(plan.aptitude.dailyTarget).toBe(5);
    expect(plan.savedGoal).toMatchObject({ perDay: 15, afterExam: false, afterDeadline: false });
  });

  it('warns when the saved goal would run past the exam', () => {
    const plan = dailyPlan(stats, [], '2026-11-23', TZ, phase, 1);
    expect(plan.savedGoal?.afterExam).toBe(true);
  });

  it('stops pacing new PYQs in the Simulate phase', () => {
    const plan = dailyPlan(stats, [], '2027-01-20', TZ, studyPhase('2027-01-20', EXAM), 15);
    expect(plan.core.dailyTarget).toBeNull();
  });
});

describe('re-attempt signals', () => {
  it('counts retrievals today against what is still due', () => {
    const items = [
      item('i1', 'OS', 'D3', '2026-11-23'),
      item('i2', 'OS', 'D3', '2026-11-26'),
      item('i3', 'OS', 'D10', '2026-12-02'),
      item('i4', 'OS', 'D3', '2026-11-21', 'paused')
    ];
    const events = [
      event('i2', 'retrieval_good', '2026-11-23'),
      event('i2', 'retrieval_started', '2026-11-23'),
      event('i3', 'answer_committed', '2026-11-23')
    ];
    expect(reattemptProgress(items, events, '2026-11-23')).toEqual({
      doneToday: 1,
      dueNow: 1,
      nextDueOn: '2026-11-26'
    });
  });

  it('places every question on the ladder', () => {
    const pipeline = reattemptPipeline([
      item('a', 'OS', 'D3', null),
      item('b', 'OS', 'D10', null),
      item('c', 'OS', 'TRANSFER', null, 'transfer'),
      item('d', 'OS', 'D30', null, 'mastered'),
      item('e', 'OS', 'D3', null, 'remediation'),
      item('f', 'OS', 'D3', null, 'paused')
    ]);
    expect(pipeline).toEqual({
      stages: { D3: 1, D10: 1, D30: 0, TRANSFER: 1, MASTERED: 1 },
      needsRepair: 1,
      paused: 1,
      total: 6
    });
  });
});

describe('mockPlan', () => {
  it('schedules Sunday mocks while covering and notices a mock taken today', () => {
    const phase = studyPhase('2026-11-23', EXAM);
    const idle = mockPlan(phase, '2026-11-23', TZ, [], []);
    expect(idle).toMatchObject({ scheduledToday: false, doneToday: false, nextOn: '2026-11-29' });
    const sunday = mockPlan(
      studyPhase('2026-11-29', EXAM),
      '2026-11-29',
      TZ,
      [
        {
          config: { mode: 'exam' },
          started_at: '2026-11-29T03:30:00Z'
        } as unknown as PyqSessionRow
      ],
      []
    );
    expect(sunday).toMatchObject({ scheduledToday: true, doneToday: true });
  });

  it('uses the Simulate cadence and stops two days before the exam', () => {
    const phase = studyPhase('2027-02-03', EXAM);
    expect(mockPlan(phase, '2027-02-03', TZ, [], [])).toMatchObject({
      scheduledToday: true,
      nextOn: null
    });
  });
});

describe('activity', () => {
  it('separates new PYQs from re-solves and counts the streak', () => {
    const attempts = [
      attempt('x1', 'q1', '2026-11-21T05:00:00Z', false),
      attempt('x2', 'q1', '2026-11-22T05:00:00Z', true),
      attempt('x3', 'q2', '2026-11-22T20:00:00Z', true)
    ];
    const events = [
      event('i1', 'retrieval_good', '2026-11-22'),
      event('i2', 'retrieval_hard', '2026-11-22', 'x2')
    ];
    const days = activityByDay(attempts, events, '2026-11-23', TZ);
    expect(days).toHaveLength(14);
    expect(days.at(-1)).toEqual({ date: '2026-11-23', newPyqs: 1, revisits: 0 });
    expect(days.at(-2)).toEqual({ date: '2026-11-22', newPyqs: 0, revisits: 2 });
    expect(days.at(-3)).toEqual({ date: '2026-11-21', newPyqs: 1, revisits: 0 });
    expect(studyStreak(days)).toBe(3);
    expect(
      studyStreak([...days.slice(0, -1), { date: '2026-11-23', newPyqs: 0, revisits: 0 }])
    ).toBe(2);
  });
});

describe('practiceHref', () => {
  it('builds an exact Custom setup for one or several bank subjects', () => {
    const os = new URL(
      practiceHref({ subjectId: 'operating-systems', count: 19, toYear: 2026 }),
      'http://x'
    );
    expect(os.pathname).toBe('/pyq');
    expect(Object.fromEntries(os.searchParams)).toMatchObject({
      preset: 'custom',
      mode: 'practice',
      subjectSlug: 'operating-systems',
      topic: 'all',
      fromYear: '2015',
      toYear: '2026',
      history: 'unseen',
      order: 'newest',
      count: '25'
    });
    const pds = new URL(
      practiceHref({ subjectId: 'programming-data-structures', count: 5 }),
      'http://x'
    );
    expect(pds.searchParams.get('subjectSlugs')).toBe('c-programming,data-structure');
    expect(pds.searchParams.has('toYear')).toBe(false);
  });
});
