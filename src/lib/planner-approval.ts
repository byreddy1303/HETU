import type { CompiledDayPlan, CompiledPlannerAction } from '@/lib/planner-compiler';
import { createPlannerPyqLaunchPrescription } from '@/lib/planner-pyq';
import type { DayPlan, StudyMode, StudySession } from '@/lib/planner-storage';
import { canonicalSubjectId, canonicalSubjectLabel } from '@/lib/subjects';
import { gate2027BankSubjectSlugs } from '@/lib/gate-2027';
import { uuidFromString } from '@/lib/utils';

function actionMode(action: CompiledPlannerAction): StudyMode {
  if (action.kind === 'mock') return 'Mock Test';
  if (
    action.kind === 'pyq' ||
    action.kind === 'guess' ||
    action.kind === 'slow' ||
    action.href?.startsWith('/pyq')
  ) {
    return 'PYQ Practice';
  }
  if (action.kind === 'analysis') return 'Doubt Clearing';
  if (action.kind === 'recovery' || action.kind === 'reattempt' || action.kind === 'formula') {
    return 'Revision';
  }
  return action.kind === 'planned' ? 'Problem Solving' : 'Deep Study';
}

function exactQuestionUids(href: string | null): string[] {
  if (!href?.startsWith('/pyq')) return [];
  const search = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  return [
    ...new Set(
      (params.get('questionUids') ?? params.get('uids') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ];
}

function approvedBlockId(date: string, action: CompiledPlannerAction): string {
  return uuidFromString(
    `planner-approved:v1:${date}:${action.id}:${action.sourceId ?? 'evidence'}:${action.durationMin}`
  );
}

function subjectFields(
  action: CompiledPlannerAction
): Pick<StudySession, 'subject' | 'subjectId' | 'customSubject'> {
  const raw = action.subject?.trim() || (action.kind === 'recovery' ? 'Recovery' : 'Mixed GATE');
  const subjectId = canonicalSubjectId(raw);
  return subjectId
    ? { subject: canonicalSubjectLabel(subjectId), subjectId, customSubject: undefined }
    : { subject: 'Custom...', subjectId: null, customSubject: raw };
}

/** Convert one approved compiler action into an executable, durable Planner block. */
export function plannerSessionFromApprovedAction(
  date: string,
  action: CompiledPlannerAction,
  existing?: StudySession | null
): StudySession {
  const id = existing?.id ?? approvedBlockId(date, action);
  const mode = actionMode(action);
  const subject = subjectFields(action);
  const base: StudySession = {
    ...(existing ?? {}),
    id,
    ...subject,
    durationMin: action.durationMin,
    mode,
    priority: action.priority ?? (action.required ? 'P1 Critical' : 'P2 High'),
    target: action.title,
    resource: action.detail ?? action.explanation,
    actionHref: action.href ?? undefined,
    startAt: action.startsAt
  };

  if (mode !== 'PYQ Practice') {
    return { ...base, launch: undefined, result: undefined };
  }

  const exactUids = exactQuestionUids(action.href);
  const params = new URLSearchParams(
    action.href?.includes('?') ? action.href.slice(action.href.indexOf('?') + 1) : ''
  );
  const bankSubjectSlugs = subject.subjectId
    ? gate2027BankSubjectSlugs(subject.subjectId)
    : [];
  const prescription = createPlannerPyqLaunchPrescription({
    plannerDate: date,
    plannerBlockId: id,
    subjectLabel: subject.customSubject ?? subject.subject,
    subjectSlug:
      exactUids.length > 0 || bankSubjectSlugs.length !== 1 ? 'all' : bankSubjectSlugs[0],
    subjectSlugs: exactUids.length > 0 ? undefined : bankSubjectSlugs,
    durationMin: action.durationMin,
    exactQuestionUids: exactUids,
    history:
      (params.get('history') as
        | 'all'
        | 'unseen'
        | 'incorrect'
        | 'guessed'
        | 'slow'
        | 'skipped'
        | 'unanalyzed'
        | 'repeated'
        | null) ?? undefined,
    selectionSeed: `planner-compiler:${date}:${id}`,
    protectSealedPapers: true
  });
  return {
    ...base,
    actionHref: undefined,
    launch: {
      kind: 'pyq',
      prescription,
      resolvedQuestionUids: [],
      resolvedAt: null,
      pyqSessionId: null
    },
    result: undefined
  };
}

/**
 * Apply an explicitly approved proposal. Completed/active evidence is retained;
 * unfinished agenda rows are replaced by the bounded proposal.
 */
export function approveCompiledDayPlan(plan: DayPlan, compiled: CompiledDayPlan): DayPlan {
  if (compiled.date !== plan.date) throw new Error('The proposal belongs to another Planner day.');
  const retained = plan.sessions.filter(
    (session) => session.execution?.completedAt || session.execution?.startedAt
  );
  const existingById = new Map(plan.sessions.map((session) => [session.id, session]));
  const retainedIds = new Set(retained.map((session) => session.id));
  const approved = compiled.actions.flatMap((action) => {
    const existing = action.sourceId ? existingById.get(action.sourceId) : undefined;
    if (existing && retainedIds.has(existing.id)) return [];
    return [plannerSessionFromApprovedAction(plan.date, action, existing)];
  });
  return { ...plan, sessions: [...retained, ...approved] };
}
