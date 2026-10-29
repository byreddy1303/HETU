import {
  buildPlannerEvidenceCandidates,
  type BuildPlannerEvidenceCandidatesInput
} from '@/lib/planner-evidence-candidates';
import { getMemoryRepairData, memoryString, type StudyMemoryEntry } from '@/lib/study-memory';
import type { OverviewConceptQueue } from '@/lib/learning-overview';
import type { DayPlan } from '@/lib/planner-storage';
import type { PyqSessionRow, RecoverySessionRow } from '@/types';

export type TodayBudget = 10 | 20 | 30;
export type TodayActionKind = 'resume' | 'planned' | 'recovery' | 'concept' | 'repair' | 'evidence';

export interface TodayAction {
  id: string;
  kind: TodayActionKind;
  title: string;
  reason: string;
  href: string;
  estimatedMin: number | null;
  dueDate?: string;
  repairId?: string;
  plannerBlockId?: string;
  recoveryItemIds?: string[];
  recoveryStartRevision?: string;
  priority: number;
}

export interface TodayRecoveryOverview {
  complete: boolean;
  sprint: {
    selected: {
      item: {
        id: string;
        source_review_id?: string | null;
        version?: number;
        updated_at?: string;
      };
    }[];
    estimatedSeconds: number;
    deferredCount: number;
  };
}

export interface TodayConceptQueue extends Omit<OverviewConceptQueue, 'items'> {
  items: (OverviewConceptQueue['items'][number] & {
    concept?: { subject?: string; topic?: string };
  })[];
}

export interface TodayActionsInput extends BuildPlannerEvidenceCandidatesInput {
  ownerId: string;
  budget: TodayBudget;
  plan: DayPlan | null;
  concepts: TodayConceptQueue | null;
  recovery: TodayRecoveryOverview | null;
  practiceSessions: readonly PyqSessionRow[];
  recoverySessions: readonly RecoverySessionRow[];
}

/** One deterministic decision for Dashboard and Do now. No writes or model claims. */
export function buildTodayActions(input: TodayActionsInput) {
  const today = input.asOfDate;
  const actions: TodayAction[] = [];
  const ownedMemory = (input.studyMemoryEntries ?? []).filter(
    (entry) => entry.user_id === input.ownerId
  );
  const practice = input.practiceSessions
    .filter(
      (session) =>
        session.user_id === input.ownerId &&
        ['active', 'paused', 'interrupted'].includes(session.status)
    )
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const exam = practice.find((session) => session.config.mode === 'exam');
  if (exam || input.concepts?.held_for_exam) {
    const resume = exam ? [resumePractice(exam)] : [];
    return { actions: resume, fitting: resume, heldForExam: true };
  }
  const recoverySession = input.recoverySessions
    .filter(
      (session) =>
        session.user_id === input.ownerId &&
        ['active', 'paused', 'interrupted'].includes(session.status)
    )
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (recoverySession)
    actions.push({
      id: `resume-recovery:${recoverySession.id}`,
      kind: 'resume',
      title: 'Resume blind retrieval',
      reason: 'Continue the saved question with your answer and guidance history preserved.',
      href: `/reattempts?recoverySession=${encodeURIComponent(recoverySession.id)}`,
      estimatedMin: null,
      priority: 0
    });
  if (practice[0]) actions.push(resumePractice(practice[0]));

  const memoryById = new Map(ownedMemory.map((entry) => [entry.id, entry]));
  const candidates = buildPlannerEvidenceCandidates({
    ...input,
    studyMemoryEntries: ownedMemory,
    existingSessions: input.plan?.sessions ?? []
  });
  const knownConcepts = new Set(
    (input.learningItems ?? []).flatMap((item) =>
      item.source_review_id ? [item.source_review_id] : []
    )
  );
  const selected = input.recovery?.sprint.selected ?? [];
  const selectedIds = new Set(selected.map(({ item }) => item.id));
  const latestTerminalSession = input.recoverySessions
    .filter(
      (session) =>
        session.user_id === input.ownerId &&
        ['completed', 'abandoned'].includes(session.status) &&
        session.item_ids.some((id) => selectedIds.has(id))
    )
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))[0];
  for (const { item } of selected)
    if (item.source_review_id) knownConcepts.add(item.source_review_id);
  if (selected.length > 0 && !recoverySession)
    actions.push({
      id: 'recovery-sprint',
      kind: 'recovery',
      title: `Retrieve ${selected.length} due ${selected.length === 1 ? 'question' : 'questions'}`,
      reason:
        input.recovery!.sprint.deferredCount > 0
          ? `A manageable part of your due queue; ${input.recovery!.sprint.deferredCount} other items stay scheduled.`
          : 'Due blind recall, selected from your saved recovery evidence.',
      href: '/reattempts',
      estimatedMin: Math.max(1, Math.ceil(input.recovery!.sprint.estimatedSeconds / 60)),
      recoveryItemIds: selected.map(({ item }) => item.id),
      // Stable for transport retries, renewed when this work or its last session changes.
      // Abandonment leaves the items due, so item revisions alone cannot identify a new start.
      recoveryStartRevision: JSON.stringify([
        selected.map(({ item }) => [item.id, item.version ?? item.updated_at ?? null]),
        latestTerminalSession
          ? [
              latestTerminalSession.id,
              latestTerminalSession.version ?? latestTerminalSession.updated_at
            ]
          : null
      ]),
      priority: 2
    });
  for (const candidate of candidates) {
    // The canonical sprint owns due retrieval; its compatibility projection is not another task.
    if (candidate.id === 'evidence:due-recovery' && input.recovery) continue;
    const block = input.plan?.sessions.find(
      (session) => candidate.id === session.id || candidate.id === `planned:${session.id}`
    );
    const repairId = candidate.id.startsWith('memory-repair:')
      ? candidate.id.slice('memory-repair:'.length)
      : block?.id.startsWith('memory-repair:')
        ? block.id.slice('memory-repair:'.length)
        : null;
    const entry = repairId ? memoryById.get(repairId) : undefined;
    if (entry) {
      if (
        !practice.some((session) => session.id === memoryString(entry.data, 'active_session_id'))
      ) {
        actions.push({ ...repairAction(entry, Boolean(block)), plannerBlockId: block?.id });
      }
      continue;
    }
    actions.push({
      id: candidate.id,
      kind: block ? 'planned' : 'evidence',
      title: candidate.title,
      reason: candidate.reason || candidate.detail || 'From your saved study evidence.',
      href: candidate.href || '/planner',
      estimatedMin: candidate.estimatedMin,
      dueDate: candidate.dueDate,
      plannerBlockId: block?.id,
      priority: block ? 1 : candidate.kind === 'reattempt' ? 2 : 5
    });
  }
  // Approved lower-priority blocks remain visible too; the compiler only carries P1/P2.
  for (const block of input.plan?.sessions ?? []) {
    if (
      block.execution?.completedAt ||
      actions.some(
        (action) =>
          action.plannerBlockId === block.id ||
          (block.id.startsWith('memory-repair:') &&
            action.id === `repair:${block.id.slice('memory-repair:'.length)}`)
      )
    )
      continue;
    const repair = block.id.startsWith('memory-repair:')
      ? memoryById.get(block.id.slice('memory-repair:'.length))
      : undefined;
    if (repair) {
      if (
        !practice.some((session) => session.id === memoryString(repair.data, 'active_session_id'))
      ) {
        actions.push({ ...repairAction(repair, true), plannerBlockId: block.id });
      }
    } else
      actions.push({
        id: `plan:${block.id}`,
        kind: 'planned',
        title: block.target || `${block.mode}: ${block.subject}`,
        reason: 'An unfinished commitment in today’s Planner.',
        href: '/planner',
        estimatedMin: block.durationMin,
        plannerBlockId: block.id,
        dueDate: today,
        priority: 1
      });
  }
  for (const concept of input.concepts?.items ?? []) {
    if (concept.due_on > today || knownConcepts.has(concept.id)) continue;
    actions.push({
      id: `concept:${concept.id}`,
      kind: 'concept',
      title: concept.concept?.topic ? `${concept.concept.topic} recall` : 'Concept recall check',
      reason: 'Answer from memory before opening the explanation.',
      href: `/concept-review/${encodeURIComponent(concept.id)}`,
      estimatedMin: 5,
      dueDate: concept.due_on,
      priority: 3
    });
  }
  const unique = [...new Map(actions.map((action) => [action.id, action])).values()].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.dueDate || today).localeCompare(b.dueDate || today) ||
      a.id.localeCompare(b.id)
  );
  return {
    actions: unique,
    fitting: unique.filter(
      (action) => action.estimatedMin === null || action.estimatedMin <= input.budget
    ),
    heldForExam: false
  };
}

function resumePractice(session: PyqSessionRow): TodayAction {
  return {
    id: `resume-practice:${session.id}`,
    kind: 'resume',
    title: `Resume ${session.config.mode === 'exam' ? 'exam' : 'practice'}`,
    reason: `${session.completed_count} of ${session.question_uids.length} questions submitted. Continue your saved set.`,
    href: `/pyq?resumeSession=${encodeURIComponent(session.id)}`,
    estimatedMin: null,
    priority: 0
  };
}

function repairAction(entry: StudyMemoryEntry, planned: boolean): TodayAction {
  const repair = getMemoryRepairData(entry);
  const session = memoryString(entry.data, 'active_session_id');
  return {
    id: `repair:${entry.id}`,
    kind: 'repair',
    title: `${entry.topic || entry.subject || 'Focused practice'}: ${repair.activity === 'transfer' ? 'Application check' : repair.activity === 'speed' ? 'Pace check' : repair.activity === 'retry' ? 'Retry questions' : 'Practice check'}`,
    reason: session
      ? 'Continue the practice already linked to this activity.'
      : planned
        ? 'A prepared repair in today’s Planner.'
        : 'Attempt the selected questions before reviewing earlier answers or explanations.',
    href: session
      ? `/pyq?resumeSession=${encodeURIComponent(session)}`
      : `/memory/${encodeURIComponent(entry.id)}`,
    estimatedMin: session ? null : repair.duration_min,
    repairId: !session && entry.data.automation === 'local_learning_engine' ? entry.id : undefined,
    dueDate: repair.due_date || undefined,
    priority: session ? 0 : planned ? 1 : 4
  };
}
