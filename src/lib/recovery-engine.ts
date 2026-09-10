import { addDaysISO } from '@/lib/utils';
import type {
  LearningItemRow,
  PyqExamConfidence,
  RecoveryGrade,
  RecoverySessionMode
} from '@/types';

export interface RecoveryGradeEvidence {
  correct: boolean;
  blank?: boolean;
  timeSpentSec: number;
  targetTimeSec: number;
  confidence: PyqExamConfidence | null;
  hintUsed: boolean;
  priorSuccessfulRetrievals: number;
}

export interface RecoveryGradeDecision {
  grade: RecoveryGrade;
  reasons: string[];
}

export interface RecoveryTransition {
  item: LearningItemRow;
  intervalDays: number | null;
  explanation: string;
  mastered: boolean;
}

export interface RecoveryCandidate {
  item: LearningItemRow;
  estimatedSeconds: number;
  marks?: number | null;
  weeklyFocus?: boolean;
  confidenceSurprise?: boolean;
}

export interface RankedRecoveryCandidate extends RecoveryCandidate {
  score: number;
  overdueDays: number;
  reasons: string[];
}

export interface RecoverySprint {
  mode: RecoverySessionMode;
  selected: RankedRecoveryCandidate[];
  mustRecoverToday: RankedRecoveryCandidate[];
  ifTime: RankedRecoveryCandidate[];
  estimatedSeconds: number;
  deferredCount: number;
}

export interface RecoveryForecastDay {
  date: string;
  itemCount: number;
  estimatedMinutes: number;
  overdue: number;
}

const DAY_MS = 86_400_000;

function dayDifference(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00.000Z`);
  const rightMs = Date.parse(`${right}T00:00:00.000Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return 0;
  return Math.round((leftMs - rightMs) / DAY_MS);
}

export function deriveRecoveryGrade(evidence: RecoveryGradeEvidence): RecoveryGradeDecision {
  if (!evidence.correct || evidence.blank) {
    return {
      grade: 'again',
      reasons: [evidence.blank ? 'left blank' : 'answer was not correct']
    };
  }

  const target = Math.max(1, evidence.targetTimeSec);
  const paceRatio = Math.max(0, evidence.timeSpentSec) / target;
  const hardReasons: string[] = [];
  if (evidence.hintUsed) hardReasons.push('opening cue revealed');
  if (evidence.confidence === 'low') hardReasons.push('low confidence');
  if (paceRatio > 1.25) hardReasons.push('over 125% of target time');
  if (hardReasons.length > 0) return { grade: 'hard', reasons: hardReasons };

  if (
    evidence.confidence === 'high' &&
    !evidence.hintUsed &&
    paceRatio <= 0.7 &&
    evidence.priorSuccessfulRetrievals > 0
  ) {
    return {
      grade: 'easy',
      reasons: ['high confidence', 'under 70% of target time', 'supported by prior recall']
    };
  }

  return {
    grade: 'good',
    reasons: [
      'correct',
      'hint-free',
      evidence.confidence ? `${evidence.confidence} confidence` : 'confidence not recorded',
      paceRatio <= 1 ? 'within target time' : 'near target time'
    ]
  };
}

function nextForGrade(
  stage: LearningItemRow['stage'],
  grade: RecoveryGrade
): { stage: LearningItemRow['stage']; intervalDays: number | null } {
  if (grade === 'again') {
    if (stage === 'MASTERED') return { stage: 'D3', intervalDays: 3 };
    if (stage === 'TRANSFER' || stage === 'D30') return { stage: 'D10', intervalDays: 3 };
    return { stage: 'D3', intervalDays: 3 };
  }
  if (grade === 'hard') {
    if (stage === 'MASTERED') return { stage: 'D30', intervalDays: 10 };
    if (stage === 'TRANSFER') return { stage: 'TRANSFER', intervalDays: 3 };
    if (stage === 'D30') return { stage: 'D30', intervalDays: 10 };
    if (stage === 'D10') return { stage: 'D10', intervalDays: 5 };
    return { stage: 'D3', intervalDays: 3 };
  }
  if (stage === 'MASTERED') return { stage: 'MASTERED', intervalDays: null };
  if (stage === 'TRANSFER' || stage === 'D30') return { stage: 'MASTERED', intervalDays: null };
  if (stage === 'D10') return { stage: 'D30', intervalDays: 30 };
  if (grade === 'easy') return { stage: 'D30', intervalDays: 30 };
  return { stage: 'D10', intervalDays: 10 };
}

export function transitionRecoveryItem(args: {
  item: LearningItemRow;
  grade: RecoveryGrade;
  today: string;
  occurredAt: string;
}): RecoveryTransition {
  const { item, grade, today, occurredAt } = args;
  const next = nextForGrade(item.stage, grade);
  const successful = grade !== 'again';
  const lapseCount = item.lapse_count + (grade === 'again' ? 1 : 0);
  const repeatedLapse = lapseCount >= 3 && grade === 'again';
  const mastered = next.stage === 'MASTERED';
  const transferPassed = mastered && item.stage === 'TRANSFER';
  const dueD30Passed = mastered && item.stage === 'D30';
  const reasonFlags = repeatedLapse
    ? [...new Set([...item.reason_flags, 'recurring-lapse'])]
    : item.reason_flags;
  const updated: LearningItemRow = {
    ...item,
    recovery_state: mastered
      ? 'mastered'
      : repeatedLapse
        ? 'remediation'
        : next.stage === 'TRANSFER'
          ? 'transfer'
          : 'active',
    stage: next.stage,
    scheduled_date: next.intervalDays == null ? null : addDaysISO(today, next.intervalDays),
    reason_flags: reasonFlags,
    lapse_count: lapseCount,
    successful_retrieval_count:
      item.successful_retrieval_count + (successful ? 1 : 0),
    last_grade: grade,
    last_interval_days: next.intervalDays,
    successful_due_d30_at: dueD30Passed ? occurredAt : item.successful_due_d30_at,
    transfer_passed_at: transferPassed ? occurredAt : item.transfer_passed_at,
    mastered_at: mastered ? occurredAt : null,
    updated_at: occurredAt
  };
  const explanation = mastered
    ? item.stage === 'TRANSFER'
      ? 'Fresh transfer solved; durable mastery recorded.'
      : 'Due D30 retrieval passed; durable mastery recorded.'
    : repeatedLapse
      ? `Again at ${item.stage}; focused remediation is now required before the next retrieval.`
      : `${grade[0].toUpperCase()}${grade.slice(1)} at ${item.stage}; next ${next.stage} retrieval in ${next.intervalDays} days.`;
  return { item: updated, intervalDays: next.intervalDays, explanation, mastered };
}

export function rankRecoveryCandidates(
  candidates: RecoveryCandidate[],
  today: string
): RankedRecoveryCandidate[] {
  return candidates
    .filter(
      ({ item }) =>
        item.recovery_state !== 'mastered' &&
        item.recovery_state !== 'paused' &&
        item.scheduled_date != null
    )
    .map((candidate) => {
      const due = candidate.item.scheduled_date as string;
      const overdueDays = Math.max(0, dayDifference(today, due));
      const dueToday = due <= today;
      const reasons: string[] = [];
      let score = dueToday ? 100 : Math.max(0, 30 - Math.max(0, dayDifference(due, today)) * 4);
      if (overdueDays > 0) {
        score += Math.min(80, overdueDays * 6);
        reasons.push(`${overdueDays}d overdue`);
      } else if (dueToday) reasons.push('due today');
      score += candidate.item.lapse_count * 14;
      if (candidate.item.lapse_count > 0) reasons.push(`${candidate.item.lapse_count} lapse${candidate.item.lapse_count === 1 ? '' : 's'}`);
      if (candidate.item.recovery_state === 'remediation') {
        score += 35;
        reasons.push('remediation');
      }
      if (candidate.item.analysis_state === 'pending') {
        score += 5;
        reasons.push('analysis pending');
      }
      if (candidate.marks === 2) {
        score += 8;
        reasons.push('2 marks');
      }
      if (candidate.weeklyFocus) {
        score += 12;
        reasons.push('weekly focus');
      }
      if (candidate.confidenceSurprise) {
        score += 18;
        reasons.push('confidence surprise');
      }
      return {
        ...candidate,
        estimatedSeconds: Math.max(30, candidate.estimatedSeconds),
        score,
        overdueDays,
        reasons: reasons.length > 0 ? reasons : ['scheduled review']
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.item.scheduled_date ?? '').localeCompare(right.item.scheduled_date ?? '') ||
        left.item.id.localeCompare(right.item.id)
    );
}

function interleaveSubjects(rows: RankedRecoveryCandidate[]): RankedRecoveryCandidate[] {
  const remaining = [...rows];
  const result: RankedRecoveryCandidate[] = [];
  let lastSubject = '';
  while (remaining.length > 0) {
    const differentSubjectIndex = remaining.findIndex(
      (candidate) => candidate.item.subject !== lastSubject
    );
    const index = differentSubjectIndex >= 0 ? differentSubjectIndex : 0;
    const [next] = remaining.splice(index, 1);
    result.push(next);
    lastSubject = next.item.subject;
  }
  return result;
}

function sprintLimit(mode: RecoverySessionMode): { seconds: number | null; questions: number | null } {
  switch (mode) {
    case 'minutes-10':
      return { seconds: 600, questions: null };
    case 'minutes-20':
      return { seconds: 1_200, questions: null };
    case 'minutes-30':
      return { seconds: 1_800, questions: null };
    case 'questions-5':
      return { seconds: null, questions: 5 };
    default:
      return { seconds: null, questions: null };
  }
}

export function buildRecoverySprint(
  candidates: RecoveryCandidate[],
  mode: RecoverySessionMode,
  today: string
): RecoverySprint {
  const ranked = interleaveSubjects(rankRecoveryCandidates(candidates, today));
  const limit = sprintLimit(mode);
  const selected: RankedRecoveryCandidate[] = [];
  let estimatedSeconds = 0;
  for (const candidate of ranked) {
    if (limit.questions != null && selected.length >= limit.questions) break;
    if (
      limit.seconds != null &&
      selected.length > 0 &&
      estimatedSeconds + candidate.estimatedSeconds > limit.seconds
    ) {
      continue;
    }
    selected.push(candidate);
    estimatedSeconds += candidate.estimatedSeconds;
  }
  const selectedIds = new Set(selected.map((candidate) => candidate.item.id));
  const remainder = ranked.filter((candidate) => !selectedIds.has(candidate.item.id));
  const mustRecoverToday = selected.filter(
    (candidate) =>
      (candidate.item.scheduled_date ?? '') <= today ||
      candidate.item.recovery_state === 'remediation'
  );
  return {
    mode,
    selected,
    mustRecoverToday,
    ifTime: remainder.slice(0, 3),
    estimatedSeconds,
    deferredCount: remainder.length
  };
}

export function forecastRecoveryLoad(
  candidates: RecoveryCandidate[],
  startDate: string,
  days = 7
): RecoveryForecastDay[] {
  const safeDays = Math.max(1, Math.min(30, Math.round(days)));
  const result = Array.from({ length: safeDays }, (_, offset): RecoveryForecastDay => ({
    date: addDaysISO(startDate, offset),
    itemCount: 0,
    estimatedMinutes: 0,
    overdue: 0
  }));
  for (const candidate of candidates) {
    if (!candidate.item.scheduled_date || candidate.item.recovery_state === 'mastered') continue;
    const offset = dayDifference(candidate.item.scheduled_date, startDate);
    const bucketIndex = offset < 0 ? 0 : offset;
    if (bucketIndex >= result.length) continue;
    const bucket = result[bucketIndex];
    bucket.itemCount += 1;
    bucket.estimatedMinutes += Math.max(1, Math.ceil(candidate.estimatedSeconds / 60));
    if (offset < 0) bucket.overdue += 1;
  }
  return result;
}
