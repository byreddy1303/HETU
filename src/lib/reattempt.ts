// Spaced re-attempt ladder (F3.3): D3 → D10 → D30 → MASTERED. A correct answer
// advances one rung; an incorrect answer moves back one rung. `advance` mirrors
// the Postgres advance_reattempt() function exactly —
// the UI applies it locally and syncs the row, so it works offline; the SQL
// function stays authoritative for server-side jobs.
import type {
  LearningEventRow,
  LearningItemRow,
  MarkDecision,
  Outcome,
  PyqSelectedAnswer,
  ReattemptResult,
  ReattemptRow,
  ReattemptStage
} from '@/types';
import { OUTCOME_BY_CODE, REATTEMPT_FIRST_DELAY_DAYS } from '@/lib/constants';
import type { QuestionFormat } from '@/lib/constants';
import {
  addDaysISO,
  calendarDateInTimeZone,
  nowISO,
  todayISO,
  uuid,
  uuidFromString
} from '@/lib/utils';
import { db } from '@/lib/db';
import { writeLocal, writeLocalBatch } from '@/lib/sync';

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

export interface LoggedNatEvaluationOptions {
  toleranceAbs?: number | null;
  acceptedMin?: number | null;
  acceptedMax?: number | null;
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
  const exact = answer.match(/^\(?([A-E])\)?[.)]?$/);
  if (exact) return [exact[1]];
  if (/^[A-E](?:\s*[,/&+]\s*[A-E])+$/i.test(answer)) {
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
  decision: MarkDecision,
  natRule: LoggedNatEvaluationOptions = {}
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
  if (!Number.isFinite(selected)) return null;
  const saved = stripAnswerLabel(String(correctAnswer)).trim();
  const explicitMin = natRule.acceptedMin;
  const explicitMax = natRule.acceptedMax;
  if (Number.isFinite(explicitMin) && Number.isFinite(explicitMax)) {
    return selected >= Number(explicitMin) && selected <= Number(explicitMax);
  }

  const numberToken = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const range = saved.match(
    new RegExp(`^[\\[(]?\\s*(${numberToken})\\s*(?:to|\\.\\.|[–—-])\\s*(${numberToken})\\s*[\\])]?$`, 'i')
  );
  if (range) {
    const first = Number(range[1]);
    const second = Number(range[2]);
    return selected >= Math.min(first, second) && selected <= Math.max(first, second);
  }

  const tolerance = saved.match(
    new RegExp(`^(${numberToken})\\s*(?:±|\\+/-)\\s*(${numberToken})$`, 'i')
  );
  const expected = Number(tolerance?.[1] ?? saved);
  if (!Number.isFinite(expected)) return null;
  const storedTolerance = Number(natRule.toleranceAbs);
  const toleranceAbs = Number.isFinite(storedTolerance)
    ? Math.max(0, storedTolerance)
    : tolerance
      ? Math.max(0, Number(tolerance[2]))
      : 0;
  const floatingPointSlack = Number.EPSILON * Math.max(1, Math.abs(selected), Math.abs(expected));
  return Math.abs(selected - expected) <= Math.max(toleranceAbs, floatingPointSlack);
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
  today: string = todayISO(),
  timeZone = 'Asia/Kolkata'
): Promise<ReattemptRow | null> {
  const question = await db.questions.get(questionId);
  if (!question || question.user_id !== userId) {
    throw new Error('The question is unavailable for recovery scheduling.');
  }
  const existing = await db.reattempts
    .where('question_id')
    .equals(questionId)
    .filter((candidate) => candidate.user_id === userId)
    .first();
  const existingItem = await db.learning_items
    .where('[user_id+source_question_id]')
    .equals([userId, questionId])
    .first();
  if (existing && existing.stage !== 'MASTERED' && existingItem) return null;

  const occurredAt = nowISO();
  const itemId = existingItem?.id ?? uuidFromString(`learning-item:${userId}:manual:${questionId}`);
  const dueDate = addDaysISO(today, REATTEMPT_FIRST_DELAY_DAYS);
  const reasonFlags = [
    ...(question.mark_decision === 'SKIP' ? ['skipped'] : []),
    ...(question.mark_correct === false || question.outcome.startsWith('W-') ? ['wrong'] : []),
    ...(question.mark_decision === 'FIFTY_FIFTY' ? ['guessed-correct'] : []),
    ...(question.time_spent_sec > question.target_time_sec ? ['slow-correct'] : [])
  ];
  const item: LearningItemRow = existingItem
    ? {
        ...existingItem,
        recovery_state: 'active',
        stage: existingItem.stage === 'MASTERED' ? 'D3' : existingItem.stage,
        scheduled_date:
          existingItem.scheduled_date && existingItem.stage !== 'MASTERED'
            ? existingItem.scheduled_date
            : dueDate,
        reason_flags: [...new Set([...existingItem.reason_flags, ...reasonFlags])],
        mastered_at: existingItem.stage === 'MASTERED' ? null : existingItem.mastered_at,
        updated_at: occurredAt
      }
    : {
        id: itemId,
        user_id: userId,
        source_kind: 'manual',
        question_uid: null,
        source_question_id: questionId,
        content_fingerprint: null,
        subject: question.subject,
        topic: question.subtopic,
        origin_pyq_attempt_id: null,
        latest_pyq_attempt_id: null,
        analysis_state: 'completed',
        recovery_state: 'active',
        stage: 'D3',
        scheduled_date: dueDate,
        reason_flags: reasonFlags.length > 0 ? [...new Set(reasonFlags)] : ['manual-recovery'],
        lapse_count: 0,
        successful_retrieval_count: 0,
        last_grade: null,
        last_interval_days: null,
        successful_due_d30_at: null,
        transfer_passed_at: null,
        mastered_at: null,
        created_at: occurredAt,
        updated_at: occurredAt
      };
  const baseRow = existing ?? createReattemptRow(userId, questionId, today);
  const row: ReattemptRow = {
    ...baseRow,
    learning_item_id: item.id,
    ...(baseRow.stage === 'MASTERED'
      ? { stage: 'D3' as const, scheduled_date: dueDate }
      : {})
  };
  const idempotencyKey = `manual-question:${questionId}:${question.created_at}`;
  const captured = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([userId, idempotencyKey])
    .first();
  const event: LearningEventRow = {
    id: uuidFromString(`learning-event:${idempotencyKey}`),
    user_id: userId,
    learning_item_id: item.id,
    event_type: 'created',
    occurred_at: question.created_at || occurredAt,
    local_date: calendarDateInTimeZone(question.created_at || occurredAt, timeZone),
    timezone: timeZone,
    source_pyq_attempt_id: null,
    recovery_session_id: null,
    grade: null,
    is_correct: question.mark_correct,
    answer: null,
    confidence: null,
    time_spent_ms: Math.max(0, Math.round(question.time_spent_sec * 1000)),
    hint_used: false,
    idempotency_key: idempotencyKey,
    metadata: {
      source_question_id: questionId,
      outcome: question.outcome,
      mark_decision: question.mark_decision,
      root_cause: question.root_cause,
      pattern_name: question.pattern_name
    },
    created_at: question.created_at || occurredAt
  };
  await writeLocalBatch([
    { name: 'learning_items', row: item },
    ...(!captured ? [{ name: 'learning_events' as const, row: event }] : []),
    { name: 'reattempts', row }
  ]);
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
