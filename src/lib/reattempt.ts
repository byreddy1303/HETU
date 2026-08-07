// Spaced re-attempt ladder (F3.3): D3 → D10 → D30 → MASTERED; any fail resets
// to D3. `advance` mirrors the Postgres advance_reattempt() function exactly —
// the UI applies it locally and syncs the row, so it works offline; the SQL
// function stays authoritative for server-side jobs.
import type { Outcome, ReattemptResult, ReattemptRow, ReattemptStage } from '@/types';
import { OUTCOME_BY_CODE, REATTEMPT_FIRST_DELAY_DAYS } from '@/lib/constants';
import { addDaysISO, nowISO, todayISO, uuid } from '@/lib/utils';
import { db } from '@/lib/db';
import { writeLocal } from '@/lib/sync';

const NEXT_ON_CLEAN: Record<ReattemptStage, { stage: ReattemptStage; delayDays: number | null }> = {
  D3: { stage: 'D10', delayDays: 10 },
  D10: { stage: 'D30', delayDays: 30 },
  D30: { stage: 'MASTERED', delayDays: null },
  MASTERED: { stage: 'MASTERED', delayDays: null }
};

export function needsReattempt(outcome: Outcome): boolean {
  return OUTCOME_BY_CODE[outcome].needsReattempt;
}

export interface ReattemptQueue {
  due: ReattemptRow[];
  upcoming: ReattemptRow[];
  mastered: number;
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
  timeSpent?: number
): Pick<ReattemptRow, 'stage' | 'scheduled_date' | 'history'> {
  const next =
    result === 'clean' ? NEXT_ON_CLEAN[row.stage] : { stage: 'D3' as const, delayDays: 3 };
  return {
    stage: next.stage,
    scheduled_date:
      next.delayDays === null ? row.scheduled_date : addDaysISO(today, next.delayDays),
    history: [
      ...row.history,
      {
        date: today,
        result,
        ...(timeSpent !== undefined ? { timeSpent: Math.max(0, Math.round(timeSpent)) } : {})
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
  timeSpent?: number
): Promise<ReattemptRow> {
  const updated: ReattemptRow = { ...row, ...advance(row, result, today, timeSpent) };
  await writeLocal('reattempts', updated);
  return updated;
}
