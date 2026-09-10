import type { DayPlan, PlannerAvailabilityWindow, StudySession } from '@/lib/planner-storage';

export type PlannerCapacityStatus = 'empty' | 'within-capacity' | 'at-capacity' | 'overloaded';

export interface PlannerCapacitySummary {
  grossAvailableMin: number;
  protectedBufferMin: number;
  netAvailableMin: number;
  plannedMin: number;
  remainingMin: number;
  overloadMin: number;
  utilizationPct: number;
  status: PlannerCapacityStatus;
  guidance: string;
}

function boundedMinutes(value: number, max: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
}

export function plannerCapacitySummary(
  plan: Pick<DayPlan, 'availability' | 'sessions'>
): PlannerCapacitySummary {
  const grossAvailableMin = boundedMinutes(plan.availability.availableMin, 960);
  const protectedBufferMin = Math.min(
    grossAvailableMin,
    boundedMinutes(plan.availability.protectedBufferMin, 480)
  );
  const netAvailableMin = Math.max(0, grossAvailableMin - protectedBufferMin);
  const plannedMin = plan.sessions.reduce(
    (sum, session) => sum + boundedMinutes(session.durationMin, 720),
    0
  );
  const remainingMin = Math.max(0, netAvailableMin - plannedMin);
  const overloadMin = Math.max(0, plannedMin - netAvailableMin);
  const utilizationPct =
    netAvailableMin === 0
      ? plannedMin > 0
        ? 100
        : 0
      : Math.min(100, Math.round((plannedMin / netAvailableMin) * 100));
  const status: PlannerCapacityStatus =
    plannedMin === 0
      ? 'empty'
      : overloadMin > 0
        ? 'overloaded'
        : plannedMin === netAvailableMin
          ? 'at-capacity'
          : 'within-capacity';
  const guidance =
    status === 'overloaded'
      ? `Move, shorten, or roll over ${overloadMin}m before approving this day.`
      : status === 'at-capacity'
        ? 'The day uses every schedulable minute; the protected buffer remains untouched.'
        : status === 'within-capacity'
          ? `${remainingMin}m remains schedulable after the protected buffer.`
          : `Add only evidence-backed work; ${netAvailableMin}m is schedulable.`;

  return {
    grossAvailableMin,
    protectedBufferMin,
    netAvailableMin,
    plannedMin,
    remainingMin,
    overloadMin,
    utilizationPct,
    status,
    guidance
  };
}

export function plannerWindowMinutes(
  window: Pick<PlannerAvailabilityWindow, 'start' | 'end'>
): number {
  const parse = (value: string): number | null => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const start = parse(window.start);
  const end = parse(window.end);
  return start === null || end === null || end <= start ? 0 : end - start;
}

export function reorderPlannerSessions(
  sessions: readonly StudySession[],
  sessionId: string,
  targetIndex: number
): StudySession[] {
  const sourceIndex = sessions.findIndex((session) => session.id === sessionId);
  if (sourceIndex < 0 || sessions.length < 2) return [...sessions];
  const boundedTarget = Math.max(0, Math.min(sessions.length - 1, Math.round(targetIndex)));
  if (sourceIndex === boundedTarget) return [...sessions];
  const next = [...sessions];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(boundedTarget, 0, moved);
  return next;
}

export function nextPlannerSession(sessions: readonly StudySession[]): StudySession | null {
  return (
    sessions.find((session) => session.execution?.startedAt && !session.execution.completedAt) ??
    sessions.find((session) => !session.execution?.completedAt) ??
    null
  );
}
