// Spaced re-attempt ladder (F3.3): D3 → D10 → D30 → MASTERED. A correct answer
// advances one rung; an incorrect answer moves back one rung. `advance` mirrors
// the Postgres advance_reattempt() function exactly —
// the UI applies it locally and syncs the row, so it works offline; the SQL
// function stays authoritative for server-side jobs.
import type {
  MarkDecision,
  Outcome,
  PyqSelectedAnswer,
  ReattemptResult,
  ReattemptRow,
  ReattemptStage
} from '@/types';
import { OUTCOME_BY_CODE, REATTEMPT_FIRST_DELAY_DAYS } from '@/lib/constants';
import type { QuestionFormat } from '@/lib/constants';
import { addDaysISO, nowISO, todayISO, uuid } from '@/lib/utils';
import { db } from '@/lib/db';
import { writeLocal } from '@/lib/sync';

const NEXT_ON_CLEAN: Record<ReattemptStage, { stage: ReattemptStage; delayDays: number | null }> = {
  D3: { stage: 'D10', delayDays: 10 },
  D10: { stage: 'D30', delayDays: 30 },
  D30: { stage: 'MASTERED', delayDays: null },
  MASTERED: { stage: 'MASTERED', delayDays: null }
};

const NEXT_ON_FAIL: Record<ReattemptStage, { stage: ReattemptStage; delayDays: number }> = {
  D3: { stage: 'D3', delayDays: 3 },
  D10: { stage: 'D3', delayDays: 3 },
  D30: { stage: 'D10', delayDays: 10 },
  MASTERED: { stage: 'D30', delayDays: 30 }
};

export function needsReattempt(outcome: Outcome): boolean {
  return OUTCOME_BY_CODE[outcome].needsReattempt;
}

export interface ReattemptQueue {
  due: ReattemptRow[];
  upcoming: ReattemptRow[];
  mastered: number;
}

export interface ReattemptAnswerEvidence {
  selectedAnswer: PyqSelectedAnswer;
  correctAnswer: PyqSelectedAnswer;
  markDecision: MarkDecision;
}

function stripAnswerLabel(value: string): string {
  return value
    .trim()
    .replace(/^(?:actual\s+answer|answer(?:\s+key)?|correct\s+(?:answer|option))\s*[:=-]\s*/i, '')
    .trim();
}

function normalizedChoices(value: PyqSelectedAnswer): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [String(value)];
  return raw
    .map(String)
    .map((choice) => choice.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

function savedChoiceKey(value: PyqSelectedAnswer): string[] {
  if (Array.isArray(value)) return normalizedChoices(value);
  if (value == null) return [];
  const answer = stripAnswerLabel(String(value)).toUpperCase();
  const exact = answer.match(/^\(?([A-D])\)?[.)]?$/);
  if (exact) return [exact[1]];
  if (/^[A-D](?:\s*[,/&+]\s*[A-D])+$/i.test(answer)) {
    return answer.split(/\s*[,/&+]\s*/).sort();
  }
  return [];
}

/**
 * Grade an answer captured from a logged (non-bank) question against its saved
 * key. A missing/unusable key returns null so the UI can ask for a checkable
 * actual answer instead of silently promoting the question.
 */
export function evaluateLoggedReattemptAnswer(
  format: QuestionFormat,
  selectedAnswer: PyqSelectedAnswer,
  correctAnswer: PyqSelectedAnswer,
  decision: MarkDecision
): boolean | null {
  if (decision === 'SKIP' || selectedAnswer == null) return false;
  if (correctAnswer == null || String(correctAnswer).trim() === '') return null;

  if (format === 'MCQ' || format === 'MSQ') {
    const expected = savedChoiceKey(correctAnswer);
    if (expected.length === 0) return null;
    const selected = normalizedChoices(selectedAnswer);
    return selected.join('|') === expected.join('|');
  }

  const selected = Number(selectedAnswer);
  const expected = Number(stripAnswerLabel(String(correctAnswer)));
  if (!Number.isFinite(selected) || !Number.isFinite(expected)) return null;
  return Math.abs(selected - expected) <= Number.EPSILON;
}

/**
 * Build the visible queue without rewriting dates. A missed row remains due on
 * every later day until the learner records a result; this preserves the
 * original due date while providing the requested automatic carry-forward.
 */
export function buildReattemptQueue(
  rows: ReattemptRow[],
  today: string = todayISO()
): ReattemptQueue {
  const open = rows.filter((row) => row.stage !== 'MASTERED');
  return {
    due: open
      .filter((row) => row.scheduled_date <= today)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    upcoming: open
      .filter((row) => row.scheduled_date > today)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    mastered: rows.filter((row) => row.stage === 'MASTERED').length
  };
}

/** Pure ladder transition. Same semantics as SQL advance_reattempt(). */
export function advance(
  row: Pick<ReattemptRow, 'stage' | 'scheduled_date' | 'history'>,
  result: ReattemptResult,
  today: string = todayISO(),
  timeSpent?: number,
  answer?: ReattemptAnswerEvidence
): Pick<ReattemptRow, 'stage' | 'scheduled_date' | 'history'> {
  const next = result === 'clean' ? NEXT_ON_CLEAN[row.stage] : NEXT_ON_FAIL[row.stage];
  return {
    stage: next.stage,
    scheduled_date:
      next.delayDays === null ? row.scheduled_date : addDaysISO(today, next.delayDays),
    history: [
      ...row.history,
      {
        date: today,
        result,
        ...(timeSpent !== undefined ? { timeSpent: Math.max(0, Math.round(timeSpent)) } : {}),
        ...(answer ?? {})
      }
    ]
  };
}

export function createReattemptRow(
  userId: string,
  questionId: string,
  today: string = todayISO()
): ReattemptRow {
  return {
    id: uuid(),
    user_id: userId,
    question_id: questionId,
    scheduled_date: addDaysISO(today, REATTEMPT_FIRST_DELAY_DAYS),
    stage: 'D3',
    history: [],
    created_at: nowISO()
  };
}

/**
 * Create the first re-attempt (due today + 3) for a mistagged question.
 * Idempotent per question: an existing open ladder is left untouched.
 */
export async function scheduleReattempt(
  userId: string,
  questionId: string,
  today: string = todayISO()
): Promise<ReattemptRow | null> {
  const existing = await db.reattempts.where('question_id').equals(questionId).first();
  if (existing && existing.stage !== 'MASTERED') return null;
  const row = createReattemptRow(userId, questionId, today);
  await writeLocal('reattempts', row);
  return row;
}

/** Apply a clean/fail result to a ladder row and persist it (local-first). */
export async function recordReattemptResult(
  row: ReattemptRow,
  result: ReattemptResult,
  today: string = todayISO(),
  timeSpent?: number,
  answer?: ReattemptAnswerEvidence
): Promise<ReattemptRow> {
  const updated: ReattemptRow = { ...row, ...advance(row, result, today, timeSpent, answer) };
  await writeLocal('reattempts', updated);
  return updated;
}
