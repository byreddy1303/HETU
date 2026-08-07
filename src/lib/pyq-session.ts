import type { PyqSessionConfig, PyqSessionRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { nowISO, uuid, uuidFromString } from '@/lib/utils';

export function createPyqSessionRow(
  userId: string,
  bankVersion: string,
  config: PyqSessionConfig,
  questions: Pick<PyqQuestion, 'id'>[]
): PyqSessionRow {
  const now = nowISO();
  return {
    id: uuid(),
    user_id: userId,
    bank_version: bankVersion,
    config,
    question_uids: questions.map((question) => question.id),
    completed_question_uids: [],
    current_index: 0,
    completed_count: 0,
    elapsed_sec: 0,
    status: 'active',
    started_at: now,
    updated_at: now,
    completed_at: null
  };
}

export function pyqAttemptId(
  pyqSessionId: string,
  questionUid: string,
  attemptNumber = 1
): string {
  return uuidFromString(`pyq-attempt:${pyqSessionId}:${questionUid}:${attemptNumber}`);
}

export function pyqJournalQuestionId(attemptId: string): string {
  return uuidFromString(`pyq-journal-question:${attemptId}`);
}

export function advancePyqSessionProgress(
  session: PyqSessionRow,
  questionUid: string,
  nextIndex: number,
  now = nowISO()
): PyqSessionRow {
  const completed = Array.from(new Set([...session.completed_question_uids, questionUid]));
  const startedAt = new Date(session.started_at).getTime();
  const elapsedSec = Number.isFinite(startedAt)
    ? Math.max(session.elapsed_sec, Math.round((Date.now() - startedAt) / 1000))
    : session.elapsed_sec;
  return {
    ...session,
    completed_question_uids: completed,
    current_index: Math.max(session.current_index, nextIndex),
    completed_count: Math.max(session.completed_count, completed.length),
    elapsed_sec: elapsedSec,
    updated_at: now
  };
}

export function completePyqSession(session: PyqSessionRow, now = nowISO()): PyqSessionRow {
  const startedAt = new Date(session.started_at).getTime();
  const elapsedSec = Number.isFinite(startedAt)
    ? Math.max(session.elapsed_sec, Math.round((Date.now() - startedAt) / 1000))
    : session.elapsed_sec;
  return {
    ...session,
    status: 'completed',
    current_index: Math.max(session.current_index, session.question_uids.length),
    completed_count: Math.max(session.completed_count, session.completed_question_uids.length),
    elapsed_sec: elapsedSec,
    updated_at: now,
    completed_at: now
  };
}

export function abandonPyqSession(session: PyqSessionRow, now = nowISO()): PyqSessionRow {
  return {
    ...session,
    status: 'abandoned',
    updated_at: now
  };
}
