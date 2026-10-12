// Per-question attempt timeline (spec §2): every answer committed in any mode
// is a permanent event. This groups immutable PYQ receipts by question_uid
// into a chronological chain with verdict/time deltas and a derived mastery
// state, so the History button shows the same truth everywhere it appears.
import type { PyqAttemptRow, QuestionRow } from '@/types';

export type QuestionMastery = 'new' | 'learning' | 'fragile' | 'mastered';
export type TimelineVerdict = 'correct' | 'wrong' | 'skipped' | 'unknown';
export type TimelineMode = 'practice' | 'exam' | 'reattempt' | 'chatgpt' | 'legacy';

export interface TimelineAttempt {
  id: string;
  position: number;
  attemptedAt: string;
  mode: TimelineMode;
  verdict: TimelineVerdict;
  decision: string;
  timeSpentSec: number;
  confidence: string | null;
  reattemptRound: number | null;
  journalQuestionId: string | null;
}

export interface QuestionTimeline {
  questionUid: string;
  totalAttempts: number;
  mastery: QuestionMastery;
  streak: number;
  lastVerdict: TimelineVerdict | null;
  avgTimeSec: number;
  attempts: TimelineAttempt[];
  /** Per-attempt deltas vs the previous attempt (index 0 has nulls). */
  timeDeltaSec: (number | null)[];
  completedReattemptRounds: number;
}

function verdictOf(attempt: PyqAttemptRow): TimelineVerdict {
  if (attempt.mark_decision === 'SKIP') return 'skipped';
  if (attempt.mark_correct === true) return 'correct';
  if (attempt.mark_correct === false) return 'wrong';
  return 'unknown';
}

function modeOf(attempt: PyqAttemptRow): TimelineMode {
  if (attempt.reattempt_id != null || attempt.reattempt_round != null) return 'reattempt';
  if (attempt.capture_origin === 'chatgpt') return 'chatgpt';
  if (attempt.capture_version === 0 || attempt.capture_version === 1) return 'legacy';
  if (attempt.pyq_session_id == null) return 'reattempt';
  return 'practice';
}

export function masteryForVerdicts(verdicts: TimelineVerdict[]): QuestionMastery {
  if (verdicts.length === 0) return 'new';
  const decisive = verdicts.filter((verdict) => verdict !== 'skipped' && verdict !== 'unknown');
  if (decisive.length === 0) return 'learning';
  const lastThree = decisive.slice(-3);
  if (lastThree.length === 3 && lastThree.every((verdict) => verdict === 'correct')) {
    return 'mastered';
  }
  const last = decisive[decisive.length - 1];
  if (last === 'correct') return 'fragile';
  return 'learning';
}

export function buildQuestionTimeline(
  questionUid: string,
  attempts: readonly PyqAttemptRow[],
  journalQuestions: readonly Pick<QuestionRow, 'id' | 'source_pyq_attempt_id'>[] = []
): QuestionTimeline {
  const rows = attempts
    .filter((attempt) => attempt.question_uid === questionUid)
    .slice()
    .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
  const journalByAttempt = new Map<string, string>();
  for (const question of journalQuestions) {
    if (question.source_pyq_attempt_id) {
      journalByAttempt.set(question.source_pyq_attempt_id, question.id);
    }
  }
  const timelineAttempts: TimelineAttempt[] = rows.map((attempt, index) => ({
    id: attempt.id,
    position: index + 1,
    attemptedAt: attempt.attempted_at,
    mode: modeOf(attempt),
    verdict: verdictOf(attempt),
    decision: attempt.mark_decision,
    timeSpentSec: attempt.time_spent_sec,
    confidence: attempt.confidence ?? null,
    reattemptRound: attempt.reattempt_round ?? null,
    journalQuestionId: journalByAttempt.get(attempt.id) ?? null
  }));
  const verdicts = timelineAttempts.map((attempt) => attempt.verdict);
  let streak = 0;
  for (let index = verdicts.length - 1; index >= 0; index -= 1) {
    if (verdicts[index] === 'correct') streak += 1;
    else if (verdicts[index] === 'wrong') break;
  }
  const timed = timelineAttempts.filter((attempt) => Number.isFinite(attempt.timeSpentSec));
  const timeDeltaSec = timelineAttempts.map((attempt, index) =>
    index === 0 ? null : attempt.timeSpentSec - timelineAttempts[index - 1].timeSpentSec
  );
  const reattemptRounds = new Set(
    timelineAttempts.filter((attempt) => attempt.mode === 'reattempt').map((attempt) => attempt.id)
  );
  return {
    questionUid,
    totalAttempts: timelineAttempts.length,
    mastery: masteryForVerdicts(verdicts),
    streak,
    lastVerdict: verdicts.length > 0 ? verdicts[verdicts.length - 1] : null,
    avgTimeSec:
      timed.length > 0
        ? Math.round(timed.reduce((sum, attempt) => sum + attempt.timeSpentSec, 0) / timed.length)
        : 0,
    attempts: timelineAttempts,
    timeDeltaSec,
    completedReattemptRounds: reattemptRounds.size
  };
}

export function buildAllQuestionTimelines(
  attempts: readonly PyqAttemptRow[],
  journalQuestions: readonly Pick<QuestionRow, 'id' | 'source_pyq_attempt_id'>[] = []
): Map<string, QuestionTimeline> {
  const uids = new Set(attempts.map((attempt) => attempt.question_uid));
  const timelines = new Map<string, QuestionTimeline>();
  for (const uid of uids) {
    timelines.set(uid, buildQuestionTimeline(uid, attempts, journalQuestions));
  }
  return timelines;
}
