import type { PyqAttemptRow, PyqHistoryFilter, QuestionRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { MARKS_TARGET_SEC, DEFAULT_TARGET_TIME_SEC } from '@/lib/constants';
import { pyqJournalQuestionId } from '@/lib/pyq-session';

export const PYQ_HISTORY_OPTIONS: { value: PyqHistoryFilter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'unseen', label: 'Never attempted' },
  { value: 'incorrect', label: 'Wrong last time' },
  { value: 'guessed', label: 'Guessed correctly' },
  { value: 'slow', label: 'Slow but correct' },
  { value: 'skipped', label: 'Previously skipped' },
  { value: 'unanalyzed', label: 'Wrong and not analyzed' },
  { value: 'repeated', label: 'Attempted more than once' }
];

export function attemptsByQuestion(attempts: PyqAttemptRow[]): Map<string, PyqAttemptRow[]> {
  const grouped = new Map<string, PyqAttemptRow[]>();
  for (const attempt of attempts) {
    const rows = grouped.get(attempt.question_uid) ?? [];
    rows.push(attempt);
    grouped.set(attempt.question_uid, rows);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
  }
  return grouped;
}

export function analyzedAttemptIds(questions: QuestionRow[]): Set<string> {
  const questionIds = new Set(questions.map((question) => question.id));
  const ids = new Set<string>();
  // PYQ journal IDs are deterministic, so no fragile source-text matching is needed.
  // The caller can cheaply test all known attempts against this set.
  for (const id of questionIds) ids.add(id);
  return ids;
}

function targetSeconds(question: Pick<PyqQuestion, 'marks'>): number {
  return question.marks ? MARKS_TARGET_SEC[question.marks] : DEFAULT_TARGET_TIME_SEC;
}

export function matchesPyqHistory(
  question: Pick<PyqQuestion, 'id' | 'marks'>,
  filter: PyqHistoryFilter,
  grouped: Map<string, PyqAttemptRow[]>,
  journalQuestionIds: Set<string>
): boolean {
  if (filter === 'all') return true;
  const attempts = grouped.get(question.id) ?? [];
  const latest = attempts.at(-1);
  if (filter === 'unseen') return attempts.length === 0;
  if (!latest) return false;
  if (filter === 'repeated') return attempts.length > 1;
  if (filter === 'incorrect') return latest.mark_correct === false;
  if (filter === 'guessed')
    return latest.mark_decision === 'FIFTY_FIFTY' && latest.mark_correct === true;
  if (filter === 'slow')
    return latest.mark_correct === true && latest.time_spent_sec > targetSeconds(question);
  if (filter === 'skipped') return latest.mark_decision === 'SKIP';
  if (filter === 'unanalyzed')
    return (
      latest.mark_correct === false && !journalQuestionIds.has(pyqJournalQuestionId(latest.id))
    );
  return true;
}

export function filterPyqByHistory(
  questions: PyqQuestion[],
  filter: PyqHistoryFilter,
  attempts: PyqAttemptRow[],
  journalQuestions: QuestionRow[]
): PyqQuestion[] {
  const grouped = attemptsByQuestion(attempts);
  const journalQuestionIds = analyzedAttemptIds(journalQuestions);
  return questions.filter((question) =>
    matchesPyqHistory(question, filter, grouped, journalQuestionIds)
  );
}
