import { describe, expect, it } from 'vitest';
import { buildTodayActions, type TodayActionsInput } from '@/lib/today-actions';
import { emptyDayPlan } from '@/lib/planner-storage';
import { newMemoryEntry } from '@/lib/study-memory';
import type { LearningItemRow, PyqSessionRow, RecoverySessionRow } from '@/types';
import type { DrillPack } from '@/lib/practice-coach';

const base: TodayActionsInput = {
  ownerId: 'owner',
  asOfDate: '2026-10-29',
  budget: 10,
  plan: null,
  concepts: { items: [], today: '2026-10-29', complete: true },
  recovery: { complete: true, sprint: { selected: [], estimatedSeconds: 0, deferredCount: 0 } },
  practiceSessions: [],
  recoverySessions: []
};
const repair = newMemoryEntry('repair', 'repair-1', 'Answer is B', {
  user_id: 'owner',
  state: 'open',
  topic: 'Memory Management',
  data: {
    due_date: '2026-10-28',
    duration_min: 20,
    target: 'Secret solution',
    reason: 'Key B',
    automation: 'local_learning_engine'
  }
});

describe('one local daily action decision', () => {
  it('offers selected due repairs within ten minutes while keeping solutions out of Today', () => {
    const focused = {
      id: 'pack',
      title: 'Count initial loads',
      due: true,
      due_date: base.asOfDate,
      done: false,
      selections: {},
      principle: 'Secret answer',
      questions: [{ answer: 2 }]
    } as unknown as DrillPack;
    const queue = buildTodayActions({
      ...base,
      focusedRepairs: [focused, { ...focused, id: 'later', due: false, due_date: '2099-01-01' }]
    });
    expect(queue.fitting).toHaveLength(1);
    expect(queue.fitting[0]).toMatchObject({ href: '/practice-lab?pack=pack', estimatedMin: 10 });
    expect(JSON.stringify(queue)).not.toContain('Secret answer');
  });

  it('uses the canonical budgeted sprint and removes its compatibility/concept duplicates', () => {
    const queue = buildTodayActions({
      ...base,
      recovery: {
        complete: true,
        sprint: {
          selected: [{ item: { id: 'canonical', source_review_id: 'recall-1' } }],
          estimatedSeconds: 540,
          deferredCount: 5
        }
      },
      learningItems: [
        {
          id: 'canonical',
          source_review_id: 'recall-1',
          recovery_state: 'active',
          stage: 'D3',
          scheduled_date: '2026-10-18',
          reason_flags: [],
          subject: 'OS',
          lapse_count: 0
        }
      ] as unknown as LearningItemRow[],
      concepts: {
        items: [
          { id: 'recall-1', prompt: 'Secret explanation', kind: 'recall', due_on: '2026-10-18' }
        ],
        today: base.asOfDate,
        complete: true
      }
    });
    expect(queue.actions.map((action) => action.id)).toEqual(['recovery-sprint']);
    expect(queue.fitting[0]).toMatchObject({ estimatedMin: 9, recoveryItemIds: ['canonical'] });
    expect(queue.actions[0].reason).toContain('5 other items stay scheduled');
    expect(JSON.stringify(queue)).not.toContain('Secret explanation');
  });

  it('preserves commitments, separates oversized work, and never exposes repair answers', () => {
    const plan = emptyDayPlan(base.asOfDate);
    plan.sessions.push({
      id: 'committed',
      subject: 'OS',
      mode: 'Revision',
      target: 'Read notes',
      durationMin: 30,
      priority: 'P1 Critical'
    });
    const queue = buildTodayActions({
      ...base,
      plan,
      studyMemoryEntries: [repair],
      concepts: {
        items: [{ id: 'short', prompt: 'hidden', kind: 'recall', due_on: base.asOfDate }],
        today: base.asOfDate,
        complete: true
      }
    });
    expect(queue.actions[0]).toMatchObject({ plannerBlockId: 'committed', estimatedMin: 30 });
    expect(queue.fitting[0].id).toBe('concept:short');
    expect(queue.actions.find((action) => action.repairId === repair.id)?.estimatedMin).toBe(20);
    expect(JSON.stringify(queue)).not.toMatch(/Secret solution|Key B|Answer is B/);
  });

  it('deduplicates a repair already scheduled in Planner', () => {
    const plan = emptyDayPlan(base.asOfDate);
    plan.sessions.push({
      id: `memory-repair:${repair.id}`,
      subject: 'OS',
      mode: 'Problem Solving',
      target: 'Repair',
      durationMin: 20,
      priority: 'P2 High'
    });
    const queue = buildTodayActions({ ...base, budget: 20, plan, studyMemoryEntries: [repair] });
    expect(queue.actions).toHaveLength(1);
    expect(queue.fitting[0]).toMatchObject({
      id: `repair:${repair.id}`,
      plannerBlockId: `memory-repair:${repair.id}`
    });
  });

  it('holds all new coaching behind an unfinished exam', () => {
    const exam = {
      id: 'exam',
      user_id: 'owner',
      status: 'paused',
      updated_at: '2026-10-29',
      config: { mode: 'exam' },
      completed_count: 3,
      question_uids: ['a', 'b', 'c', 'd']
    } as PyqSessionRow;
    const queue = buildTodayActions({
      ...base,
      practiceSessions: [exam],
      parkedActionIds: ['resume-practice:exam'],
      studyMemoryEntries: [repair]
    });
    expect(queue.heldForExam).toBe(true);
    expect(queue.actions).toHaveLength(1);
    expect(queue.fitting[0].href).toBe('/pyq?resumeSession=exam');
  });

  it('sets aside practice for this day without removing the saved session', () => {
    const practice = {
      id: 'saved',
      user_id: 'owner',
      status: 'paused',
      updated_at: '2026-10-29',
      config: { mode: 'practice', subjectSlug: 'operating-systems' },
      completed_count: 1,
      question_uids: ['a', 'b', 'c']
    } as PyqSessionRow;
    const input = {
      ...base,
      budget: 45 as const,
      practiceSessions: [practice],
      studyMemoryEntries: [repair]
    };
    expect(buildTodayActions(input).fitting[0].id).toBe('resume-practice:saved');
    const parked = buildTodayActions({ ...input, parkedActionIds: ['resume-practice:saved'] });
    expect(parked.fitting[0].id).toBe('repair:repair-1');
    expect(parked.actions.some((action) => action.id === 'resume-practice:saved')).toBe(true);
    expect(practice.completed_count).toBe(1);
  });

  it('does not recreate an active sprint, including an interrupted session', () => {
    const session = {
      id: 'saved',
      user_id: 'owner',
      status: 'interrupted',
      updated_at: '2026-10-29'
    } as RecoverySessionRow;
    const queue = buildTodayActions({
      ...base,
      recoverySessions: [session],
      recovery: {
        complete: true,
        sprint: { selected: [{ item: { id: 'item' } }], estimatedSeconds: 90, deferredCount: 0 }
      }
    });
    expect(queue.actions.map((action) => action.id)).toEqual(['resume-recovery:saved']);
  });

  it('renews the start identity after a terminal session without losing retry stability', () => {
    const input: TodayActionsInput = {
      ...base,
      recovery: {
        complete: true,
        sprint: {
          selected: [{ item: { id: 'still-due', version: 2 } }],
          estimatedSeconds: 90,
          deferredCount: 0
        }
      }
    };
    const startRevision = (value: TodayActionsInput) =>
      buildTodayActions(value).actions.find((action) => action.id === 'recovery-sprint')!
        .recoveryStartRevision;
    const original = startRevision(input);
    expect(startRevision(input)).toBe(original);

    for (const status of ['abandoned', 'completed'] as const) {
      const afterSession = {
        ...input,
        recoverySessions: [
          {
            id: 'previous-sprint',
            user_id: 'owner',
            status,
            version: 3,
            item_ids: ['still-due'],
            updated_at: '2026-10-29T10:00:00Z'
          } as RecoverySessionRow
        ]
      };
      const next = startRevision(afterSession);
      expect(next).not.toBe(original);
      expect(startRevision(afterSession)).toBe(next);
      expect(
        startRevision({
          ...afterSession,
          recoverySessions: [
            {
              ...afterSession.recoverySessions[0],
              id: 'foreign',
              user_id: 'other',
              updated_at: '2026-10-29T11:00:00Z'
            },
            ...afterSession.recoverySessions
          ]
        })
      ).toBe(next);
    }

    expect(
      startRevision({
        ...input,
        recovery: {
          ...input.recovery!,
          sprint: {
            ...input.recovery!.sprint,
            selected: [{ item: { id: 'still-due', version: 4 } }]
          }
        }
      })
    ).not.toBe(original);
  });

  it('honors a server exam hold even before the cache has its session', () => {
    const queue = buildTodayActions({
      ...base,
      studyMemoryEntries: [repair],
      concepts: { ...base.concepts!, held_for_exam: true }
    });
    expect(queue.heldForExam).toBe(true);
    expect(queue.actions).toEqual([]);
  });

  it('excludes future repairs and foreign-owner work', () => {
    const queue = buildTodayActions({
      ...base,
      studyMemoryEntries: [
        { ...repair, user_id: 'other' },
        { ...repair, id: 'future', data: { ...repair.data, due_date: '2026-11-01' } }
      ]
    });
    expect(queue.actions).toEqual([]);
  });
});
