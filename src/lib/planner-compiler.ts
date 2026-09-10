import type { DayPlan, EnergyForecast, Priority, StudySession } from '@/lib/planner-storage';

export type PlannerCandidateKind =
  'reattempt' | 'analysis' | 'guess' | 'slow' | 'formula' | 'pyq' | 'mock' | 'study' | 'planned';

export type PlannerEnergyNeed = EnergyForecast | 'any';

export interface PlannerTimeWindow {
  id: string;
  label?: string;
  start: string;
  end: string;
  energy?: EnergyForecast;
}

export interface PlannerWorkCandidate {
  id: string;
  kind: PlannerCandidateKind;
  title: string;
  detail?: string;
  subject?: string;
  estimatedMin: number;
  priority?: Priority;
  energy?: PlannerEnergyNeed;
  dueDate?: string;
  required?: boolean;
  splittable?: boolean;
  href?: string;
  reason?: string;
}

export interface PlannerRecoveryDebt {
  estimatedMin: number;
  count?: number;
  title?: string;
  detail?: string;
  href?: string;
}

export interface PlannerCompilerOptions {
  minActions?: number;
  maxActions?: number;
  minActionMin?: number;
  maxActionMin?: number;
  bufferPct?: number;
  bufferMin?: number;
}

export interface CompileDayPlanInput {
  date: string;
  candidates: readonly PlannerWorkCandidate[];
  /** Existing Planner fields provide target capacity, break rhythm and energy. */
  plan?: Pick<DayPlan, 'structure' | 'mindset'>;
  /** Allows evidence-driven callers to supply energy without constructing a DayPlan. */
  energy?: EnergyForecast;
  /** Overrides structure.totalHoursTarget when a caller has a tighter budget. */
  capacityMin?: number;
  timeWindows?: readonly PlannerTimeWindow[];
  recoveryDebt?: PlannerRecoveryDebt;
  options?: PlannerCompilerOptions;
}

export interface CompiledPlannerAction {
  id: string;
  sourceId: string | null;
  kind: PlannerCandidateKind | 'recovery';
  title: string;
  detail: string | null;
  subject: string | null;
  durationMin: number;
  sourceEstimatedMin: number;
  remainingSourceMin: number;
  priority: Priority | null;
  energy: PlannerEnergyNeed;
  required: boolean;
  href: string | null;
  windowId: string | null;
  windowLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  explanation: string;
}

export interface CompiledDayPlan {
  date: string;
  status: 'ready' | 'underfilled' | 'overloaded';
  nominalCapacityMin: number;
  capacityMin: number;
  bufferReservedMin: number;
  recoveryRequestedMin: number;
  recoveryReservedMin: number;
  deferredRecoveryMin: number;
  newWorkBudgetMin: number;
  scheduledMin: number;
  unallocatedMin: number;
  energy: EnergyForecast;
  actions: CompiledPlannerAction[];
  deferredCandidateIds: string[];
  notes: string[];
}

interface WindowCursor {
  id: string;
  label: string | null;
  startMin: number;
  endMin: number;
  cursorMin: number;
  energy: EnergyForecast;
}

interface DraftAction extends CompiledPlannerAction {
  splittable: boolean;
  sortMin: number;
}

const ENERGY_RANK: Record<EnergyForecast, number> = {
  recovery: 0,
  low: 1,
  medium: 2,
  high: 3
};

const PRIORITY_SCORE: Record<Priority, number> = {
  'P1 Critical': 400,
  'P2 High': 300,
  'P3 Medium': 200,
  'P4 Low': 100
};

const ENERGY_CAPACITY_FACTOR: Record<EnergyForecast, number> = {
  high: 1,
  medium: 0.9,
  low: 0.75,
  recovery: 0.55
};

const ENERGY_BUFFER_PCT: Record<EnergyForecast, number> = {
  high: 0.12,
  medium: 0.15,
  low: 0.2,
  recovery: 0.3
};

function clampInteger(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, finite));
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(totalMin: number): string {
  const bounded = Math.max(0, Math.min(1439, totalMin));
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`;
}

function prepareWindows(
  windows: readonly PlannerTimeWindow[] | undefined,
  defaultEnergy: EnergyForecast
): { windows: WindowCursor[]; invalidCount: number } {
  const valid: WindowCursor[] = [];
  let invalidCount = 0;
  for (const window of windows ?? []) {
    const startMin = parseClock(window.start);
    const endMin = parseClock(window.end);
    if (startMin === null || endMin === null || endMin <= startMin) {
      invalidCount += 1;
      continue;
    }
    valid.push({
      id: window.id,
      label: window.label?.trim() || null,
      startMin,
      endMin,
      cursorMin: startMin,
      energy: window.energy ?? defaultEnergy
    });
  }
  valid.sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  const nonOverlapping: WindowCursor[] = [];
  for (const window of valid) {
    const previous = nonOverlapping.at(-1);
    if (!previous || window.startMin >= previous.endMin) {
      nonOverlapping.push(window);
      continue;
    }
    if (window.endMin <= previous.endMin) {
      invalidCount += 1;
      continue;
    }
    nonOverlapping.push({ ...window, startMin: previous.endMin, cursorMin: previous.endMin });
  }
  return { windows: nonOverlapping, invalidCount };
}

function energyFitScore(available: EnergyForecast, needed: PlannerEnergyNeed): number {
  if (needed === 'any') return 30;
  const difference = ENERGY_RANK[available] - ENERGY_RANK[needed];
  return difference >= 0 ? 40 - difference * 5 : difference * 60;
}

function candidateScore(
  candidate: PlannerWorkCandidate,
  date: string,
  dayEnergy: EnergyForecast
): number {
  let score = candidate.required ? 1_000 : 0;
  score += PRIORITY_SCORE[candidate.priority ?? 'P3 Medium'];
  if (candidate.dueDate) {
    if (candidate.dueDate < date) score += 500;
    else if (candidate.dueDate === date) score += 350;
    else score += 25;
  }
  score += energyFitScore(dayEnergy, candidate.energy ?? 'any');
  return score;
}

function actionReason(candidate: PlannerWorkCandidate, date: string, durationMin: number): string {
  const reasons: string[] = [];
  if (candidate.required) reasons.push('required work');
  if (candidate.dueDate && candidate.dueDate < date) reasons.push('overdue');
  else if (candidate.dueDate === date) reasons.push('due today');
  if (candidate.priority) reasons.push(candidate.priority);
  if (candidate.energy && candidate.energy !== 'any') {
    reasons.push(`${candidate.energy}-energy fit`);
  }
  if (candidate.reason?.trim()) reasons.push(candidate.reason.trim());
  if (durationMin < Math.round(candidate.estimatedMin)) {
    reasons.push(`bounded to ${durationMin}m from ${Math.round(candidate.estimatedMin)}m`);
  }
  return reasons.length > 0
    ? `Selected because it is ${reasons.join(', ')}.`
    : 'Selected to use the remaining study capacity.';
}

function windowCapacity(windows: readonly WindowCursor[]): number {
  return windows.reduce((sum, window) => sum + (window.endMin - window.startMin), 0);
}

function allocateWindow(
  windows: WindowCursor[],
  requestedMin: number,
  energy: PlannerEnergyNeed,
  minActionMin: number,
  mayShrink: boolean
): { durationMin: number; window: WindowCursor; startsAt: string; endsAt: string } | null {
  const choices = windows
    .map((window) => ({
      window,
      remaining: window.endMin - window.cursorMin,
      fit: energyFitScore(window.energy, energy)
    }))
    .filter((choice) => choice.remaining > 0)
    .sort((a, b) => b.fit - a.fit || a.window.cursorMin - b.window.cursorMin);
  const exact = choices.find((choice) => choice.remaining >= requestedMin);
  const chosen =
    exact ?? (mayShrink ? choices.find((choice) => choice.remaining >= minActionMin) : null);
  if (!chosen) return null;
  const durationMin = Math.min(requestedMin, chosen.remaining);
  const start = chosen.window.cursorMin;
  chosen.window.cursorMin += durationMin;
  return {
    durationMin,
    window: chosen.window,
    startsAt: formatClock(start),
    endsAt: formatClock(start + durationMin)
  };
}

function scheduleDraft(
  draft: Omit<DraftAction, 'windowId' | 'windowLabel' | 'startsAt' | 'endsAt' | 'sortMin'>,
  windows: WindowCursor[],
  requestedMin: number,
  minActionMin: number
): DraftAction | null {
  if (windows.length === 0) {
    return {
      ...draft,
      durationMin: requestedMin,
      remainingSourceMin: Math.max(0, draft.remainingSourceMin),
      windowId: null,
      windowLabel: null,
      startsAt: null,
      endsAt: null,
      sortMin: Number.MAX_SAFE_INTEGER
    };
  }
  const allocation = allocateWindow(
    windows,
    requestedMin,
    draft.energy,
    minActionMin,
    draft.splittable
  );
  if (!allocation) return null;
  return {
    ...draft,
    durationMin: allocation.durationMin,
    remainingSourceMin: Math.max(
      0,
      draft.remainingSourceMin + requestedMin - allocation.durationMin
    ),
    windowId: allocation.window.id,
    windowLabel: allocation.window.label,
    startsAt: allocation.startsAt,
    endsAt: allocation.endsAt,
    sortMin: parseClock(allocation.startsAt) ?? Number.MAX_SAFE_INTEGER
  };
}

function splitLongestAction(
  actions: DraftAction[],
  minActionMin: number,
  maxActions: number
): DraftAction[] {
  if (actions.length >= maxActions) return actions;
  let splitIndex = -1;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!action.splittable || action.durationMin < minActionMin * 2) continue;
    if (splitIndex < 0 || action.durationMin > actions[splitIndex].durationMin) splitIndex = index;
  }
  if (splitIndex < 0) return actions;
  const source = actions[splitIndex];
  const firstMin = roundToFive(source.durationMin / 2);
  const secondMin = source.durationMin - firstMin;
  if (firstMin < minActionMin || secondMin < minActionMin) return actions;
  const firstEnd = source.startsAt
    ? formatClock((parseClock(source.startsAt) ?? 0) + firstMin)
    : null;
  const sharedExplanation = `${source.explanation} Split into shorter blocks to keep the day actionable.`;
  const first: DraftAction = {
    ...source,
    id: `${source.id}:part-1`,
    title: `${source.title} · part 1`,
    durationMin: firstMin,
    remainingSourceMin: Math.max(0, source.sourceEstimatedMin - firstMin),
    endsAt: firstEnd,
    explanation: sharedExplanation
  };
  const second: DraftAction = {
    ...source,
    id: `${source.id}:part-2`,
    title: `${source.title} · part 2`,
    durationMin: secondMin,
    remainingSourceMin: source.remainingSourceMin,
    startsAt: firstEnd,
    sortMin: source.sortMin + firstMin,
    explanation: sharedExplanation
  };
  return [...actions.slice(0, splitIndex), first, second, ...actions.slice(splitIndex + 1)];
}

function publicAction(action: DraftAction): CompiledPlannerAction {
  // Keep scheduling-only fields private to the compiler result.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { splittable, sortMin, ...result } = action;
  return result;
}

/**
 * Compile existing blocks and evidence-derived candidates into one feasible day.
 * The function is deterministic, performs no I/O and never mutates its inputs.
 */
export function compileCapacityAwareDay(input: CompileDayPlanInput): CompiledDayPlan {
  const dayEnergy = input.energy ?? input.plan?.mindset.energyForecast ?? 'medium';
  const implicitWindow = input.plan
    ? [
        {
          id: 'day-availability',
          label: 'Available day',
          start: input.plan.structure.wakeAt,
          end: input.plan.structure.sleepAt,
          energy: dayEnergy
        }
      ]
    : undefined;
  const prepared = prepareWindows(input.timeWindows ?? implicitWindow, dayEnergy);
  const totalWindowMin = windowCapacity(prepared.windows);
  const structureCapacity = Math.round((input.plan?.structure.totalHoursTarget ?? 0) * 60);
  const nominalCapacityMin = clampInteger(
    input.capacityMin ?? (structureCapacity > 0 ? structureCapacity : totalWindowMin || 180),
    0,
    960
  );
  const capacityBeforeEnergy =
    totalWindowMin > 0 ? Math.min(nominalCapacityMin, totalWindowMin) : nominalCapacityMin;
  const capacityMin = Math.max(
    0,
    roundToFive(capacityBeforeEnergy * ENERGY_CAPACITY_FACTOR[dayEnergy])
  );
  const maxActions = clampInteger(input.options?.maxActions ?? 5, 3, 5);
  const minActions = clampInteger(input.options?.minActions ?? 3, 3, maxActions);
  const maxActionMin = clampInteger(input.options?.maxActionMin ?? 90, 15, 180);
  const minActionMin = clampInteger(input.options?.minActionMin ?? 15, 5, maxActionMin);
  const requestedBufferPct = input.options?.bufferPct ?? ENERGY_BUFFER_PCT[dayEnergy];
  const bufferPct = Math.max(0, Math.min(0.5, requestedBufferPct));
  const proportionalBuffer = roundToFive(capacityMin * bufferPct);
  const bufferReservedMin = Math.min(
    capacityMin,
    Math.max(0, Math.round(input.options?.bufferMin ?? proportionalBuffer))
  );
  const workCapacityMin = Math.max(0, capacityMin - bufferReservedMin);
  const recoveryRequestedMin = Math.max(0, Math.round(input.recoveryDebt?.estimatedMin ?? 0));
  const recoveryReservedMin = Math.min(recoveryRequestedMin, workCapacityMin);
  const newWorkBudgetMin = Math.max(0, workCapacityMin - recoveryReservedMin);
  const drafts: DraftAction[] = [];
  const notes: string[] = [];

  if (prepared.invalidCount > 0) {
    notes.push(
      `${prepared.invalidCount} invalid time window${prepared.invalidCount === 1 ? ' was' : 's were'} ignored.`
    );
  }
  if (capacityMin < nominalCapacityMin) {
    notes.push(
      `${dayEnergy} energy reduced usable capacity from ${nominalCapacityMin}m to ${capacityMin}m.`
    );
  }
  notes.push(`${bufferReservedMin}m is protected as interruption and transition buffer.`);

  let recoveryToSchedule = recoveryReservedMin;
  let recoveryScheduledMin = 0;
  let recoveryPart = 0;
  while (recoveryToSchedule > 0 && drafts.length < maxActions) {
    recoveryPart += 1;
    const desired = Math.min(maxActionMin, recoveryToSchedule);
    const scheduled = scheduleDraft(
      {
        id: `recovery-${input.date}-${recoveryPart}`,
        sourceId: null,
        kind: 'recovery',
        title: input.recoveryDebt?.title?.trim() || 'Clear due review debt',
        detail: input.recoveryDebt?.detail?.trim() || null,
        subject: null,
        durationMin: desired,
        sourceEstimatedMin: recoveryRequestedMin,
        remainingSourceMin: Math.max(0, recoveryRequestedMin - recoveryScheduledMin - desired),
        priority: null,
        energy: 'any',
        required: true,
        href: input.recoveryDebt?.href ?? null,
        explanation: `Reserved before new work because ${input.recoveryDebt?.count ?? 'scheduled'} review work is due or overdue.`,
        splittable: true
      },
      prepared.windows,
      desired,
      Math.min(5, minActionMin)
    );
    if (!scheduled) break;
    drafts.push(scheduled);
    recoveryScheduledMin += scheduled.durationMin;
    recoveryToSchedule -= scheduled.durationMin;
  }

  let newWorkRemainingMin = newWorkBudgetMin;
  const ranked = input.candidates
    .map((candidate, index) => ({ candidate: { ...candidate }, index }))
    .filter(
      ({ candidate }) => Number.isFinite(candidate.estimatedMin) && candidate.estimatedMin > 0
    )
    .sort(
      (a, b) =>
        candidateScore(b.candidate, input.date, dayEnergy) -
          candidateScore(a.candidate, input.date, dayEnergy) || a.index - b.index
    );
  const selectedIds = new Set<string>();

  for (const { candidate } of ranked) {
    if (drafts.length >= maxActions || newWorkRemainingMin <= 0) break;
    const sourceEstimatedMin = Math.max(1, Math.round(candidate.estimatedMin));
    const desired = Math.min(maxActionMin, sourceEstimatedMin, newWorkRemainingMin);
    if (desired < minActionMin && sourceEstimatedMin >= minActionMin) continue;
    const scheduled = scheduleDraft(
      {
        id: `work-${candidate.id}`,
        sourceId: candidate.id,
        kind: candidate.kind,
        title: candidate.title.trim() || 'Study block',
        detail: candidate.detail?.trim() || null,
        subject: candidate.subject?.trim() || null,
        durationMin: desired,
        sourceEstimatedMin,
        remainingSourceMin: Math.max(0, sourceEstimatedMin - desired),
        priority: candidate.priority ?? null,
        energy: candidate.energy ?? 'any',
        required: candidate.required ?? false,
        href: candidate.href ?? null,
        explanation: actionReason(candidate, input.date, desired),
        splittable: candidate.splittable ?? true
      },
      prepared.windows,
      desired,
      minActionMin
    );
    if (!scheduled) continue;
    scheduled.explanation = actionReason(candidate, input.date, scheduled.durationMin);
    drafts.push(scheduled);
    selectedIds.add(candidate.id);
    newWorkRemainingMin -= scheduled.durationMin;
  }

  let boundedDrafts = drafts;
  while (boundedDrafts.length > 0 && boundedDrafts.length < minActions) {
    const split = splitLongestAction(boundedDrafts, minActionMin, maxActions);
    if (split.length === boundedDrafts.length) break;
    boundedDrafts = split;
  }
  boundedDrafts = boundedDrafts
    .slice()
    .sort((a, b) => a.sortMin - b.sortMin || Number(b.required) - Number(a.required));

  const scheduledMin = boundedDrafts.reduce((sum, action) => sum + action.durationMin, 0);
  const deferredRecoveryMin = Math.max(0, recoveryRequestedMin - recoveryScheduledMin);
  const deferredCandidateIds = input.candidates
    .filter((candidate) => !selectedIds.has(candidate.id))
    .map((candidate) => candidate.id);
  const overloaded =
    deferredRecoveryMin > 0 || (newWorkBudgetMin === 0 && deferredCandidateIds.length > 0);
  const status = overloaded
    ? 'overloaded'
    : boundedDrafts.length < minActions
      ? 'underfilled'
      : 'ready';
  if (deferredRecoveryMin > 0) {
    notes.push(
      `${deferredRecoveryMin}m of recovery debt does not fit and remains ahead of new work.`
    );
  }
  if (boundedDrafts.length < minActions) {
    notes.push(
      `Only ${boundedDrafts.length} feasible action${boundedDrafts.length === 1 ? '' : 's'} fit; add capacity or smaller candidates to reach ${minActions}.`
    );
  }

  return {
    date: input.date,
    status,
    nominalCapacityMin,
    capacityMin,
    bufferReservedMin,
    recoveryRequestedMin,
    recoveryReservedMin,
    deferredRecoveryMin,
    newWorkBudgetMin,
    scheduledMin,
    unallocatedMin: Math.max(
      0,
      capacityMin -
        bufferReservedMin -
        recoveryReservedMin -
        Math.max(0, scheduledMin - recoveryScheduledMin)
    ),
    energy: dayEnergy,
    actions: boundedDrafts.map(publicAction),
    deferredCandidateIds,
    notes
  };
}

function energyForMode(mode: StudySession['mode']): PlannerEnergyNeed {
  if (mode === 'Deep Study' || mode === 'Problem Solving' || mode === 'Mock Test') return 'high';
  if (mode === 'PYQ Practice' || mode === 'Doubt Clearing') return 'medium';
  return 'low';
}

function kindForMode(mode: StudySession['mode']): PlannerCandidateKind {
  if (mode === 'PYQ Practice') return 'pyq';
  if (mode === 'Mock Test') return 'mock';
  return 'planned';
}

/** Adapt today's unfinished stored blocks into compiler candidates. */
export function plannerCandidatesFromSessions(
  sessions: readonly StudySession[],
  dueDate?: string
): PlannerWorkCandidate[] {
  return sessions.flatMap((session) => {
    if (session.execution?.completedAt) return [];
    const subject =
      session.subject === 'Custom...' && session.customSubject
        ? session.customSubject
        : session.subject;
    return [
      {
        id: session.id,
        kind: kindForMode(session.mode),
        title: session.target.trim() || `${session.mode}: ${subject}`,
        detail: session.resource?.trim() || undefined,
        subject,
        estimatedMin: session.durationMin,
        priority: session.priority,
        energy: energyForMode(session.mode),
        dueDate,
        required: session.priority === 'P1 Critical',
        splittable: session.mode !== 'Mock Test',
        reason: `${session.mode} was already committed in Planner`
      }
    ];
  });
}
