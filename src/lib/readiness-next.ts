// Readiness next-actions (spec §3D): the readiness score tells where you
// stand; this pack tells what to do next. Pure + sorted: due reattempts
// first, then fragile, then learning-wrong-last. Capped so the learner gets
// a concrete "do these N" list instead of vibes.
import type { QuestionTimeline } from '@/lib/question-attempt-timeline';

export type NextActionReason = 'due' | 'fragile' | 'relearn' | 'slow-correct';

export interface NextAction {
  questionUid: string;
  reason: NextActionReason;
  detail: string;
}

const REASON_RANK: Record<NextActionReason, number> = {
  due: 0,
  fragile: 1,
  relearn: 2,
  'slow-correct': 3
};

export function buildNextActionPack(
  timelines: readonly QuestionTimeline[],
  dueQuestionUids: readonly string[] = [],
  limit = 20
): NextAction[] {
  const due = new Set(dueQuestionUids);
  const actions: NextAction[] = [];
  for (const timeline of timelines) {
    if (timeline.totalAttempts === 0) continue;
    if (due.has(timeline.questionUid)) {
      actions.push({
        questionUid: timeline.questionUid,
        reason: 'due',
        detail: `Reattempt due · ${timeline.totalAttempts} prior ${timeline.totalAttempts === 1 ? 'try' : 'tries'}`
      });
      continue;
    }
    if (timeline.mastery === 'fragile') {
      actions.push({
        questionUid: timeline.questionUid,
        reason: 'fragile',
        detail: `Fixed once after misses · lock it in (${timeline.streak} in a row)`
      });
      continue;
    }
    if (timeline.mastery === 'learning' && timeline.lastVerdict === 'wrong') {
      actions.push({
        questionUid: timeline.questionUid,
        reason: 'relearn',
        detail: 'Still wrong last time · relearn the concept'
      });
      continue;
    }
    if (timeline.mastery === 'learning' && timeline.lastVerdict === 'correct') {
      actions.push({
        questionUid: timeline.questionUid,
        reason: 'slow-correct',
        detail: `Correct but unsteady · avg ${timeline.avgTimeSec}s`
      });
    }
  }
  return actions
    .sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason])
    .slice(0, Math.max(0, limit));
}
