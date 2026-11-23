import { describe, expect, it } from 'vitest';
import type { PyqQuestion } from '@/lib/pyq';
import { rankRecoveryCandidates, forecastRecoveryLoad } from '@/lib/recovery-engine';
import {
  buildBankStats,
  dailyPlan,
  isMockDay,
  practiceHref,
  reattemptProgress,
  studyPhase
} from '@/lib/study-signals';
import type { LearningItemRow } from '@/types';

const EXAM = '2027-02-06';

function question(id: string, year: number, subjectSlug = 'operating-systems'): PyqQuestion {
  return {
    id,
    year,
    set: null,
    number: id,
    paperLabel: `GATE CSE ${year}`,
    subject: subjectSlug,
    subjectSlug,
    topic: 'cpu-scheduling',
    topicSlug: subjectSlug === 'operating-systems' ? 'cpu-scheduling' : 'general-aptitude',
    subtopics: [],
    marks: 1,
    type: 'MCQ',
    answer: 'A',
    tolerance: null,
    answerStatus: 'available',
    html: '',
    sourceUrl: '',
    answerSource: null
  };
}

function item(
  id: string,
  scheduled: string | null,
  state: LearningItemRow['recovery_state'],
  stage: LearningItemRow['stage'] = 'D3'
): LearningItemRow {
  return {
    id,
    user_id: 'u',
    subject: 'Operating Systems',
    stage,
    scheduled_date: scheduled,
    recovery_state: state,
    lapse_count: 0,
    analysis_state: 'completed',
    reason_flags: []
  } as unknown as LearningItemRow;
}

describe('sealed mock papers', () => {
  it('never count towards daily coverage', () => {
    const stats = buildBankStats(
      [question('a', 2024), question('b', 2025), question('sealed', 2026)],
      new Set(['sealed'])
    );
    const os = stats.subjects.find((subject) => subject.subjectId === 'operating-systems')!;
    expect([...os.paceIds].sort()).toEqual(['a', 'b']);
    expect(os.allIds.has('sealed')).toBe(false);
    expect(stats.reservedCount).toBe(1);
    expect(stats.lastYear).toBe(2026);
    expect(stats.paceLastYear).toBe(2025);
  });
});

describe('mock days', () => {
  it('follow the phase cadence and stop two days before the exam', () => {
    const phase = studyPhase('2026-11-23', EXAM);
    expect(isMockDay('2026-11-29', phase)).toBe(true); // Sunday in Cover
    expect(isMockDay('2026-12-02', phase)).toBe(false); // Wednesday in Cover
    expect(isMockDay('2026-12-23', phase)).toBe(true); // Wednesday in Consolidate
    expect(isMockDay('2027-01-18', phase)).toBe(true); // Monday in Simulate
    expect(isMockDay('2027-02-05', phase)).toBe(false); // the day before the exam
  });

  it('pause new core PYQs on a mock day but keep aptitude going', () => {
    const stats = buildBankStats([question('a', 2024), question('ga', 2024, 'general-aptitude')]);
    const sunday = '2026-11-29';
    const plan = dailyPlan(stats, [], sunday, 'Asia/Kolkata', studyPhase(sunday, EXAM), 15);
    expect(plan.core.mockDay).toBe(true);
    expect(plan.core.dailyTarget).toBe(0);
    expect(plan.core.pace).toBe(1);
    expect(plan.aptitude.mockDay).toBe(false);
    expect(plan.aptitude.dailyTarget).toBe(1);
  });
});

describe('final passes', () => {
  it('count as due re-attempts once their day arrives', () => {
    const progress = reattemptProgress(
      [
        item('due-pass', '2027-01-28', 'mastered', 'MASTERED'),
        item('later-pass', '2027-02-02', 'mastered', 'MASTERED'),
        item('done', null, 'mastered', 'MASTERED')
      ],
      [],
      '2027-01-28'
    );
    expect(progress).toEqual({ doneToday: 0, dueNow: 1, nextDueOn: '2027-02-02' });
  });

  it('join the app sprint and forecast like the server does', () => {
    const candidates = [
      { item: item('due-pass', '2027-01-28', 'mastered', 'MASTERED'), estimatedSeconds: 90 },
      { item: item('later-pass', '2027-02-02', 'mastered', 'MASTERED'), estimatedSeconds: 90 }
    ];
    const ranked = rankRecoveryCandidates(candidates as never, '2027-01-28');
    expect(ranked.map((row) => row.item.id)).toEqual(['due-pass']);
    expect(ranked[0].reasons).toContain('final pass');
    const days = forecastRecoveryLoad(candidates as never, '2027-01-28', 7);
    expect(days[0].itemCount).toBe(1);
    expect(days[5].itemCount).toBe(1);
  });
});

describe('mixed practice links', () => {
  it('interleave several subjects and hide topic labels', () => {
    const url = new URL(
      practiceHref({
        subjectIds: ['operating-systems', 'programming-data-structures'],
        count: 12,
        order: 'random',
        hideTopics: true
      }),
      'http://x'
    );
    expect(url.searchParams.get('subjectSlugs')).toBe(
      'operating-systems,c-programming,data-structure'
    );
    expect(url.searchParams.get('hideTopics')).toBe('1');
    expect(url.searchParams.get('order')).toBe('random');
    expect(url.searchParams.get('count')).toBe('15');
  });
});
