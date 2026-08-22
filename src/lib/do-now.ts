import type { FormulaRow, PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import type { DayPlan } from '@/lib/planner-storage';
import { DEFAULT_TARGET_TIME_SEC, MARKS_TARGET_SEC } from '@/lib/constants';
import { plannerBlockHref } from '@/lib/planner-execution';
import { pyqSourceAttemptForJournalQuestion } from '@/lib/pyq-session';

export type DoNowKind = 'reattempt' | 'analysis' | 'guess' | 'slow' | 'formula' | 'planned';

export interface DoNowItem {
  id: string;
  kind: DoNowKind;
  title: string;
  detail: string;
  count: number;
  href: string;
}

function latestAttempts(attempts: PyqAttemptRow[]): PyqAttemptRow[] {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.question_uid);
    if (!current || attempt.attempted_at > current.attempted_at) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return [...latest.values()];
}

export function buildDoNowQueue(args: {
  today: string;
  reattempts: ReattemptRow[];
  questions: QuestionRow[];
  pyqAttempts: PyqAttemptRow[];
  formulas: FormulaRow[];
  plan: DayPlan | null;
}): DoNowItem[] {
  const items: DoNowItem[] = [];
  const due = args.reattempts.filter(
    (row) => row.stage !== 'MASTERED' && row.scheduled_date <= args.today
  );
  if (due.length > 0) {
    items.push({
      id: 'due-reattempts',
      kind: 'reattempt',
      title: 'Clear due re-attempts',
      detail: `${due.filter((row) => row.scheduled_date < args.today).length} overdue`,
      count: due.length,
      href: '/reattempts?open=first'
    });
  }

  const latest = latestAttempts(args.pyqAttempts);
  const analyzedAttemptIds = new Set<string>();
  for (const question of args.questions) {
    if (question.source_pyq_attempt_id) {
      analyzedAttemptIds.add(question.source_pyq_attempt_id);
      continue;
    }
    const source = pyqSourceAttemptForJournalQuestion(question, args.pyqAttempts);
    if (source) analyzedAttemptIds.add(source.id);
  }
  const unanalyzed = latest.filter(
    (attempt) => attempt.mark_correct === false && !analyzedAttemptIds.has(attempt.id)
  );
  if (unanalyzed.length > 0) {
    items.push({
      id: 'unanalyzed-pyqs',
      kind: 'analysis',
      title: 'Analyze wrong PYQs',
      detail: 'These answers were submitted but never converted into a journal diagnosis.',
      count: unanalyzed.length,
      href: '/pyq?history=unanalyzed'
    });
  }

  const guessed = latest.filter(
    (attempt) => attempt.mark_decision === 'FIFTY_FIFTY' && attempt.mark_correct === true
  );
  if (guessed.length > 0) {
    items.push({
      id: 'guessed-pyqs',
      kind: 'guess',
      title: 'Retest guessed-correct PYQs',
      detail: 'Correct answers with uncertain reasoning are not closed evidence.',
      count: guessed.length,
      href: '/pyq?history=guessed'
    });
  }

  const slow = latest.filter((attempt) => {
    const marks = attempt.question_snapshot?.marks;
    const target = marks ? MARKS_TARGET_SEC[marks] : DEFAULT_TARGET_TIME_SEC;
    return attempt.mark_correct === true && attempt.time_spent_sec > target;
  });
  if (slow.length > 0) {
    items.push({
      id: 'slow-pyqs',
      kind: 'slow',
      title: 'Compress slow-correct PYQs',
      detail: 'Repeat the opening move until the method starts inside the target time.',
      count: slow.length,
      href: '/pyq?history=slow'
    });
  }

  const formulas = args.formulas.filter((formula) => formula.next_review <= args.today);
  if (formulas.length > 0) {
    items.push({
      id: 'due-formulas',
      kind: 'formula',
      title: 'Review due formulas',
      detail: 'Recall first; reveal only after committing the expression.',
      count: formulas.length,
      href: '/formulas'
    });
  }

  for (const block of args.plan?.sessions ?? []) {
    if (block.execution?.completedAt) continue;
    const subject =
      block.subject === 'Custom...' && block.customSubject ? block.customSubject : block.subject;
    items.push({
      id: `plan-${block.id}`,
      kind: 'planned',
      title: block.target.trim() || `${block.mode}: ${subject}`,
      detail: `${subject} · ${block.durationMin} min · ${block.priority}`,
      count: 1,
      href: plannerBlockHref(args.plan!.date, block)
    });
  }
  return items;
}
