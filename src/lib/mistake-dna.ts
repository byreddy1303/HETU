// Mistake DNA (spec §3A): every wrong/skipped answer gets cause tags derived
// from behavioral signals + the learner's root-cause analysis. Tags are
// derived (never stored), so re-tagging propagates everywhere on recompute.
import type { MarkDecision, PyqAttemptRow, PyqExamConfidence, RootCause } from '@/types';

export type MistakeTag =
  | 'silly'
  | 'concept-gap'
  | 'misread'
  | 'time-pressure'
  | 'guess'
  | 'formula'
  | 'calculation';

export interface MistakeDnaInput {
  markDecision: MarkDecision;
  markCorrect: boolean | null;
  confidence?: PyqExamConfidence | null;
  timeSpentSec: number;
  targetTimeSec?: number | null;
  rootCause?: RootCause | null;
}

const inputFromAttempt = (
  attempt: Pick<PyqAttemptRow, 'mark_decision' | 'mark_correct' | 'confidence' | 'time_spent_sec'>,
  extra: Partial<Pick<MistakeDnaInput, 'targetTimeSec' | 'rootCause'>> = {}
): MistakeDnaInput => ({
  markDecision: attempt.mark_decision,
  markCorrect: attempt.mark_correct,
  confidence: attempt.confidence ?? null,
  timeSpentSec: attempt.time_spent_sec,
  targetTimeSec: extra.targetTimeSec ?? null,
  rootCause: extra.rootCause ?? null
});

/** Derive cause tags for one non-correct answer. Correct answers get []. */
export function deriveMistakeDNA(input: MistakeDnaInput): MistakeTag[] {
  if (input.markCorrect === true) return [];
  const tags = new Set<MistakeTag>();
  if (input.markDecision === 'FIFTY_FIFTY' || input.confidence === 'low') {
    tags.add('guess');
  }
  const target = input.targetTimeSec;
  const hasTarget = target != null && Number.isFinite(target) && (target as number) > 0;
  const slow = hasTarget && input.timeSpentSec > (target as number) * 1.25;
  const fast = hasTarget && input.timeSpentSec <= (target as number);
  if (slow) tags.add('time-pressure');
  switch (input.rootCause) {
    case 'concept':
      tags.add('concept-gap');
      break;
    case 'formula':
      tags.add('formula');
      break;
    case 'reading':
      tags.add('misread');
      break;
    case 'computation':
      tags.add('calculation');
      break;
    case 'strategy':
      // Strategy failures are process failures: rushed execution reads as a
      // silly loss, dragged execution as time pressure.
      tags.add(slow ? 'time-pressure' : 'silly');
      break;
    default:
      break;
  }
  if (
    input.markCorrect === false &&
    input.confidence === 'high' &&
    (fast || input.rootCause === 'computation' || input.rootCause === 'reading')
  ) {
    tags.add('silly');
  }
  if (tags.size === 0) tags.add('concept-gap');
  return [...tags];
}

export function deriveMistakeDNAForAttempt(
  attempt: Pick<PyqAttemptRow, 'mark_decision' | 'mark_correct' | 'confidence' | 'time_spent_sec'>,
  extra: Partial<Pick<MistakeDnaInput, 'targetTimeSec' | 'rootCause'>> = {}
): MistakeTag[] {
  return deriveMistakeDNA(inputFromAttempt(attempt, extra));
}

export function aggregateMistakeDNA(
  inputs: MistakeDnaInput[]
): { tag: MistakeTag; count: number }[] {
  const counts = new Map<MistakeTag, number>();
  for (const input of inputs) {
    for (const tag of deriveMistakeDNA(input)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
