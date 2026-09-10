import { db } from '@/lib/db';
import { loadDayPlan, saveDayPlan, type DayPlan, type StudySession } from '@/lib/planner-storage';
import { nowISO, uuidFromString } from '@/lib/utils';
import { canonicalSubjectId, canonicalSubjectLabel, type SubjectId } from '@/lib/subjects';
import { gate2027BankSubjectSlugs } from '@/lib/gate-2027';
import {
  createPlannerPyqLaunchPrescription,
  createPlannerPyqResultReceipt,
  plannerPyqPrescriptionHref,
  type PlannerPyqLaunchPrescription
} from '@/lib/planner-pyq';

function subjectName(block: StudySession): string {
  return block.subject === 'Custom...' && block.customSubject
    ? block.customSubject
    : canonicalSubjectLabel(block.subject);
}

function defaultPyqPrescription(date: string, block: StudySession): PlannerPyqLaunchPrescription {
  const canonicalId = block.subjectId ?? canonicalSubjectId(subjectName(block));
  const bankSubjectSlugs = canonicalId ? gate2027BankSubjectSlugs(canonicalId) : [];
  return createPlannerPyqLaunchPrescription({
    plannerDate: date,
    plannerBlockId: block.id,
    subjectLabel: subjectName(block),
    subjectSlug: bankSubjectSlugs.length === 1 ? bankSubjectSlugs[0] : 'all',
    subjectSlugs: bankSubjectSlugs,
    durationMin: block.durationMin,
    ...(block.launch?.kind === 'pyq'
      ? {
          cohort: block.launch.prescription.cohort,
          mode: block.launch.prescription.config.mode,
          examKind: block.launch.prescription.config.examKind,
          selectionSeed: block.launch.prescription.selectionSeed,
          protectSealedPapers: block.launch.prescription.protectSealedPapers,
          exactQuestionUids: block.launch.prescription.exactQuestionUids,
          subjectSlugs: block.launch.prescription.config.subjectSlugs,
          topicSlug: block.launch.prescription.config.topicSlug,
          bookSlug: block.launch.prescription.config.bookSlug,
          history: block.launch.prescription.config.history,
          fromYear: block.launch.prescription.config.fromYear,
          toYear: block.launch.prescription.config.toYear,
          type: block.launch.prescription.config.type,
          order: block.launch.prescription.config.order
        }
      : {})
  });
}

export function plannerBlockHref(date: string, block: StudySession): string {
  const common = new URLSearchParams({ plannerDate: date, plannerBlock: block.id });
  if (block.mode === 'PYQ Practice') {
    const href = plannerPyqPrescriptionHref(
      block.launch?.kind === 'pyq' ? block.launch.prescription : defaultPyqPrescription(date, block)
    );
    if (block.launch?.pyqSessionId && !block.execution?.completedAt) {
      const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
      params.set('resumeSession', block.launch.pyqSessionId);
      return `/pyq?${params.toString()}`;
    }
    return href;
  }
  if (block.mode === 'Mock Test') {
    common.set('new', '1');
    common.set('date', date);
    return `/mocks?${common.toString()}`;
  }
  if (block.actionHref?.startsWith('/')) {
    const [pathname, search = ''] = block.actionHref.split('?', 2);
    const params = new URLSearchParams(search);
    params.set('plannerDate', date);
    params.set('plannerBlock', block.id);
    return `${pathname}?${params.toString()}`;
  }
  if (block.execution?.sessionId && block.execution.startedAt && !block.execution.completedAt) {
    return `/session/${block.execution.sessionId}/solve`;
  }
  common.set('subject', subjectName(block));
  common.set('duration', String(block.durationMin));
  return `/session/new?${common.toString()}`;
}

export interface PlannerBlockStart {
  plan: DayPlan;
  block: StudySession;
  href: string;
}

export interface PlannerPyqRepairBlockInput {
  date: string;
  questionUids: readonly string[];
  durationMin: number;
  subjectLabel?: string;
  subjectId?: SubjectId | null;
}

/** Turn an actionable evidence subset into bounded, idempotent executable Planner blocks. */
export function createPlannerPyqRepairBlocks(input: PlannerPyqRepairBlockInput): StudySession[] {
  const questionUids = [
    ...new Set(input.questionUids.map((value) => value.trim()).filter(Boolean))
  ];
  if (questionUids.length === 0) return [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : nowISO().slice(0, 10);
  const chunkCount = Math.ceil(questionUids.length / 50);
  const totalDurationMin = Math.max(
    5,
    Math.min(960, 480 * chunkCount, Math.round(input.durationMin || 30))
  );
  const recognizedId = input.subjectId ?? canonicalSubjectId(input.subjectLabel);
  const label = input.subjectLabel?.trim() || 'Mixed GATE repair';
  const chunks = Array.from({ length: chunkCount }, (_, index) =>
    questionUids.slice(index * 50, index * 50 + 50)
  );
  let assignedDurationMin = 0;

  return chunks.map((chunk, index): StudySession => {
    const remainingChunks = chunks.length - index;
    const remainingDuration = Math.max(5 * remainingChunks, totalDurationMin - assignedDurationMin);
    const durationMin =
      index === chunks.length - 1
        ? Math.max(5, remainingDuration)
        : Math.max(5, Math.round((totalDurationMin * chunk.length) / questionUids.length));
    assignedDurationMin += durationMin;
    const stableIdentity = [...chunk].sort().join(',');
    const blockId = uuidFromString(`planner-pyq-repair:${date}:${stableIdentity}`);
    const prescription = createPlannerPyqLaunchPrescription({
      plannerDate: date,
      plannerBlockId: blockId,
      subjectLabel: label,
      // Exact UIDs are authoritative. A single inferred subject scope could
      // wrongly exclude mixed or Programming & DS bank rows.
      subjectSlug: 'all',
      durationMin,
      exactQuestionUids: chunk,
      cohort: 'exact-uid',
      history: 'all',
      order: 'random',
      selectionSeed: `planner-repair-${date}-${blockId}`,
      protectSealedPapers: true
    });

    return {
      id: blockId,
      subject: recognizedId ? canonicalSubjectLabel(recognizedId) : 'Custom...',
      subjectId: recognizedId,
      ...(recognizedId ? {} : { customSubject: label }),
      durationMin,
      mode: 'PYQ Practice',
      priority: 'P1 Critical',
      target: `Repair ${chunk.length} exact evidence question${chunk.length === 1 ? '' : 's'}${chunks.length > 1 ? ` · part ${index + 1}/${chunks.length}` : ''}`,
      resource: 'Approved from the PYQ evidence ledger',
      launch: {
        kind: 'pyq',
        prescription,
        resolvedQuestionUids: [],
        resolvedAt: null,
        pyqSessionId: null
      }
    };
  });
}

/** Convenience for callers that have already bounded a request to one block. */
export function createPlannerPyqRepairBlock(
  input: PlannerPyqRepairBlockInput
): StudySession | null {
  const blocks = createPlannerPyqRepairBlocks(input);
  return blocks.length === 1 ? blocks[0] : null;
}

/**
 * Freeze a typed launch before leaving Planner. For PYQ blocks this is the
 * approved prescription; exact bank UIDs are filled only after PYQ actually starts.
 */
export function startPlannerBlock(date: string, blockId: string): PlannerBlockStart | null {
  const plan = loadDayPlan(date);
  if (!plan) return null;
  const startedAt = nowISO();
  let startedBlock: StudySession | null = null;
  const sessions = plan.sessions.map((block) => {
    if (block.id !== blockId) return block;
    const launch =
      block.mode === 'PYQ Practice'
        ? (block.launch ?? {
            kind: 'pyq' as const,
            prescription: defaultPyqPrescription(date, block),
            resolvedQuestionUids: [],
            resolvedAt: null,
            pyqSessionId: null
          })
        : block.launch;
    startedBlock = {
      ...block,
      ...(launch ? { launch } : {}),
      ...(block.mode === 'PYQ Practice'
        ? {}
        : {
            execution: {
              sessionId: block.execution?.sessionId ?? null,
              startedAt,
              completedAt: null,
              actualMin: block.execution?.actualMin ?? null,
              manual: false
            }
          })
    };
    return startedBlock;
  });
  if (!startedBlock) return null;
  const saved = saveWithAutomaticReview({ ...plan, sessions });
  const savedBlock = saved.sessions.find((block) => block.id === blockId);
  if (!savedBlock) return null;
  return { plan: saved, block: savedBlock, href: plannerBlockHref(date, savedBlock) };
}

export interface AttachPlannerPyqSessionInput {
  plannerDate: string;
  plannerBlockId: string;
  prescriptionId?: string | null;
  pyqSessionId: string;
  resolvedQuestionUids: readonly string[];
  startedAt: string;
}

/** Attach only a durably created PYQ session to the exact approved launch. */
export function attachPlannerPyqSession(input: AttachPlannerPyqSessionInput): DayPlan | null {
  const plan = loadDayPlan(input.plannerDate);
  if (!plan) return null;
  const block = plan.sessions.find((candidate) => candidate.id === input.plannerBlockId);
  if (!block || block.mode !== 'PYQ Practice') return null;
  const prescription =
    block.launch?.kind === 'pyq'
      ? block.launch.prescription
      : defaultPyqPrescription(input.plannerDate, block);
  if (input.prescriptionId && input.prescriptionId !== prescription.id) {
    throw new Error('This Planner prescription changed before the PYQ session could attach.');
  }
  if (
    block.launch?.pyqSessionId &&
    block.launch.pyqSessionId !== input.pyqSessionId &&
    !block.execution?.completedAt
  ) {
    throw new Error('This Planner block is already linked to another active PYQ session.');
  }
  const resolvedQuestionUids = [
    ...new Set(input.resolvedQuestionUids.map((value) => value.trim()).filter(Boolean))
  ];
  const nextBlock: StudySession = {
    ...block,
    launch: {
      kind: 'pyq',
      prescription,
      resolvedQuestionUids,
      resolvedAt: input.startedAt,
      pyqSessionId: input.pyqSessionId
    },
    execution: {
      sessionId: input.pyqSessionId,
      startedAt: input.startedAt,
      completedAt: null,
      actualMin: null,
      manual: false
    }
  };
  if (JSON.stringify(block) === JSON.stringify(nextBlock)) return plan;
  return saveWithAutomaticReview({
    ...plan,
    sessions: plan.sessions.map((candidate) =>
      candidate.id === input.plannerBlockId ? nextBlock : candidate
    )
  });
}

export function plannerCompletionPercent(plan: DayPlan): number {
  const total = plan.sessions.reduce((sum, block) => sum + block.durationMin, 0);
  if (total <= 0) return 0;
  const completed = plan.sessions.reduce(
    (sum, block) => sum + (block.execution?.completedAt ? block.durationMin : 0),
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
  const [sessions, mocks, pyqSessions, pyqAttempts, learningItems] = await Promise.all([
    db.sessions.where('user_id').equals(userId).toArray(),
    db.mock_tests.where('user_id').equals(userId).toArray(),
    db.pyq_sessions.where('user_id').equals(userId).toArray(),
    db.pyq_attempts.where('user_id').equals(userId).toArray(),
    db.learning_items.where('user_id').equals(userId).toArray()
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
  const pyqSessionById = new Map(pyqSessions.map((session) => [session.id, session]));
  const pyqPlannerLinks = new Set(
    sessions.flatMap((session) =>
      session.planner_date && session.planner_block_id && pyqSessionById.has(session.id)
        ? [`${session.planner_date}\u0000${session.planner_block_id}`]
        : []
    )
  );
  const pyqAttemptsBySession = new Map<string, typeof pyqAttempts>();
  for (const attempt of pyqAttempts) {
    if (!attempt.pyq_session_id) continue;
    const rows = pyqAttemptsBySession.get(attempt.pyq_session_id) ?? [];
    rows.push(attempt);
    pyqAttemptsBySession.set(attempt.pyq_session_id, rows);
  }
  const recoveryItemIdsByAttempt = new Map<string, Set<string>>();
  for (const item of learningItems) {
    const attemptId = item.origin_pyq_attempt_id;
    if (!attemptId) continue;
    const ids = recoveryItemIdsByAttempt.get(attemptId) ?? new Set<string>();
    ids.add(item.id);
    recoveryItemIdsByAttempt.set(attemptId, ids);
  }
  let changed = 0;
  for (const row of linked) {
    const plan = loadDayPlan(row.date);
    if (!plan) continue;
    const block = plan.sessions.find((candidate) => candidate.id === row.blockId);
    if (!block) continue;
    if (
      block.mode === 'PYQ Practice' &&
      !pyqSessionById.has(row.sessionId) &&
      pyqPlannerLinks.has(`${row.date}\u0000${row.blockId}`)
    ) {
      // Full-paper submission also creates a linked mock-test evidence row.
      // The PYQ session owns the richer launch/result contract for this block.
      continue;
    }
    let nextBlock: StudySession = {
      ...block,
      execution: {
        sessionId: row.sessionId,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        actualMin: row.actualMin,
        manual: false
      }
    };

    if (block.mode === 'PYQ Practice') {
      const pyqSession = pyqSessionById.get(row.sessionId);
      if (pyqSession) {
        const attempts = pyqAttemptsBySession.get(pyqSession.id) ?? [];
        const canonicalId = block.subjectId ?? canonicalSubjectId(subjectName(block));
        const bankSubjectSlugs = canonicalId ? gate2027BankSubjectSlugs(canonicalId) : [];
        const prescription =
          block.launch?.kind === 'pyq'
            ? block.launch.prescription
            : createPlannerPyqLaunchPrescription({
                plannerDate: row.date,
                plannerBlockId: row.blockId,
                subjectLabel: subjectName(block),
                subjectSlug: bankSubjectSlugs.length === 1 ? bankSubjectSlugs[0] : 'all',
                subjectSlugs: bankSubjectSlugs,
                durationMin: block.durationMin,
                exactQuestionUids: pyqSession.question_uids,
                selectionSeed: pyqSession.config.selectionSeed,
                protectSealedPapers: true,
                mode: pyqSession.config.mode ?? 'practice',
                examKind: pyqSession.config.examKind
              });
        const recoveryItemIds = [
          ...new Set(
            attempts.flatMap((attempt) => [
              ...(recoveryItemIdsByAttempt.get(attempt.id) ?? new Set<string>())
            ])
          )
        ];
        nextBlock = {
          ...nextBlock,
          execution: {
            sessionId: pyqSession.id,
            startedAt: pyqSession.started_at,
            completedAt: pyqSession.completed_at,
            actualMin:
              pyqSession.completed_at === null
                ? null
                : Math.max(1, Math.ceil(pyqSession.elapsed_sec / 60)),
            manual: false
          },
          launch: {
            kind: 'pyq',
            prescription,
            resolvedQuestionUids: [...pyqSession.question_uids],
            resolvedAt: pyqSession.started_at,
            pyqSessionId: pyqSession.id
          },
          result: {
            kind: 'pyq',
            receipt: createPlannerPyqResultReceipt({
              prescription,
              sessionId: pyqSession.id,
              status: pyqSession.status,
              startedAt: pyqSession.started_at,
              completedAt: pyqSession.completed_at,
              elapsedSec: pyqSession.elapsed_sec,
              questionUids: pyqSession.question_uids,
              recoveryItemIds,
              attempts
            })
          }
        };
      }
    }

    if (JSON.stringify(block) === JSON.stringify(nextBlock)) {
      continue;
    }
    const sessions = plan.sessions.map((candidate) =>
      candidate.id === row.blockId ? nextBlock : candidate
    );
    saveWithAutomaticReview({ ...plan, sessions });
    changed += 1;
  }
  return changed;
}
