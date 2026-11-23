import type { LearningItemRow, QuestionRow } from '@/types';

/** Daily cap when an overdue backlog is spread over the coming days. */
export const BACKLOG_PER_DAY = 8;

/** An imported or logged question whose test result is unknown and not yet answered by the learner. */
export function needsTriage(item: LearningItemRow, question: QuestionRow | undefined): boolean {
  if (item.source_kind !== 'manual' || item.recovery_state === 'mastered') return false;
  if (item.reason_flags.some((flag) => flag.startsWith('triage-'))) return false;
  return item.reason_flags.includes('awaiting-test-result') || question?.outcome === 'U';
}
