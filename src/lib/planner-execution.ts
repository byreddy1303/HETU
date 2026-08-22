import { db } from '@/lib/db';
import { loadDayPlan, saveDayPlan, type DayPlan, type StudySession } from '@/lib/planner-storage';
import { nowISO } from '@/lib/utils';
import { canonicalSubjectLabel } from '@/lib/subjects';

function subjectName(block: StudySession): string {
  return block.subject === 'Custom...' && block.customSubject
    ? block.customSubject
    : canonicalSubjectLabel(block.subject);
}

function pyqCountForMinutes(minutes: number): '5' | '10' | '25' | '50' {
  const desired = Math.max(5, Math.round(minutes / 3));
  if (desired <= 7) return '5';
  if (desired <= 17) return '10';
  if (desired <= 37) return '25';
  return '50';
}

export function plannerBlockHref(date: string, block: StudySession): string {
  const common = new URLSearchParams({ plannerDate: date, plannerBlock: block.id });
  if (block.mode === 'PYQ Practice') {
    common.set('subject', subjectName(block));
    common.set('count', pyqCountForMinutes(block.durationMin));
    return `/pyq?${common.toString()}`;
  }
  if (block.mode === 'Mock Test') {
    common.set('new', '1');
    common.set('date', date);
    return `/mocks?${common.toString()}`;
  }
  if (block.execution?.sessionId && block.execution.startedAt && !block.execution.completedAt) {
    return `/session/${block.execution.sessionId}/solve`;
  }
  common.set('subject', subjectName(block));
  common.set('duration', String(block.durationMin));
  return `/session/new?${common.toString()}`;
}

export function plannerCompletionPercent(plan: DayPlan): number {
  const total = plan.sessions.reduce((sum, block) => sum + block.durationMin, 0);
  if (total <= 0) return 0;
  const completed = plan.sessions.reduce(
    (sum, block) =>
      sum +
      (block.execution?.completedAt
        ? Math.min(block.durationMin, block.execution.actualMin ?? block.durationMin)
        : 0),
    0
  );
  return Math.min(100, Math.round((completed / total) * 100));
}

function saveWithAutomaticReview(plan: DayPlan): DayPlan {
  return saveDayPlan({
    ...plan,
    review: { ...plan.review, completionPct: plannerCompletionPercent(plan) }
  });
}

export function updatePlannerBlockExecution(
  date: string,
  blockId: string,
  patch: Partial<NonNullable<StudySession['execution']>>
): DayPlan | null {
  const plan = loadDayPlan(date);
  if (!plan) return null;
  let found = false;
  const sessions = plan.sessions.map((block) => {
    if (block.id !== blockId) return block;
    found = true;
    return {
      ...block,
      execution: {
        sessionId: null,
        startedAt: null,
        completedAt: null,
        actualMin: null,
        manual: false,
        ...block.execution,
        ...patch
      }
    };
  });
  return found ? saveWithAutomaticReview({ ...plan, sessions }) : null;
}

export function markPlannerBlockStarted(date: string, blockId: string): DayPlan | null {
  return updatePlannerBlockExecution(date, blockId, {
    startedAt: nowISO(),
    completedAt: null,
    manual: false
  });
}

export function markPlannerBlockComplete(
  date: string,
  blockId: string,
  actualMin: number
): DayPlan | null {
  return updatePlannerBlockExecution(date, blockId, {
    startedAt: nowISO(),
    completedAt: nowISO(),
    actualMin: Math.max(1, Math.round(actualMin)),
    manual: true
  });
}

export async function reconcilePlannerExecutions(userId: string): Promise<number> {
  const [sessions, mocks] = await Promise.all([
    db.sessions.where('user_id').equals(userId).toArray(),
    db.mock_tests.where('user_id').equals(userId).toArray()
  ]);
  const linked = [
    ...sessions.flatMap((session) =>
      session.planner_date && session.planner_block_id
        ? [
            {
              date: session.planner_date,
              blockId: session.planner_block_id,
              sessionId: session.id,
              startedAt: session.created_at,
              completedAt: session.actual_duration_min === null ? null : session.created_at,
              actualMin: session.actual_duration_min,
              manual: false
            }
          ]
        : []
    ),
    ...mocks.flatMap((mock) =>
      mock.planner_date && mock.planner_block_id
        ? [
            {
              date: mock.planner_date,
              blockId: mock.planner_block_id,
              sessionId: mock.id,
              startedAt: mock.created_at,
              completedAt: mock.updated_at,
              actualMin: mock.duration_min,
              manual: false
            }
          ]
        : []
    )
  ];
  let changed = 0;
  for (const row of linked) {
    const plan = loadDayPlan(row.date);
    const block = plan?.sessions.find((candidate) => candidate.id === row.blockId);
    if (!block) continue;
    const current = block.execution;
    if (
      current?.sessionId === row.sessionId &&
      current.completedAt === row.completedAt &&
      current.actualMin === row.actualMin
    ) {
      continue;
    }
    updatePlannerBlockExecution(row.date, row.blockId, row);
    changed += 1;
  }
  return changed;
}
