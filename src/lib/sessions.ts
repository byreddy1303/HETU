// Session-level helpers: unifying focused, log-batch and PYQ practice,
// pruning empty sessions, and listing recent sessions for the journal picker.
import type { PyqAttemptRow, QuestionRow, SessionRow } from '@/types';
import { db } from '@/lib/db';
import { deleteLocal, writeLocalBatch } from '@/lib/sync';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import {
  legacyPyqJournalQuestionId,
  pyqJournalQuestionId,
  pyqPracticeSessionRow,
  pyqPracticeSubject
} from '@/lib/pyq-session';

/** Count practice questions once when a PYQ attempt also has a journal row. */
export function practiceQuestionCount(
  questions: QuestionRow[],
  pyqAttempts: PyqAttemptRow[]
): number {
  const ledger = normalizeAttemptEvidence({ attempts: pyqAttempts, questions });
  const suppressed = new Set(ledger.suppressedJournalQuestionIds);
  const independentQuestions = questions.filter((question) => !suppressed.has(question.id)).length;
  return independentQuestions + ledger.counts.pyqAttempts;
}

/**
 * Backfill canonical session rows and PYQ journal grouping for data created
 * before PYQ sets joined the shared session stream. Writes are change-only so
 * this is safe to run on Dashboard/Journal mounts and after sync pulls.
 */
export async function reconcilePyqPracticeSessions(
  userId: string,
  timeZone = 'Asia/Kolkata'
): Promise<number> {
  if (!userId) return 0;
  const [pyqSessions, attempts, sessions, questions] = await Promise.all([
    db.pyq_sessions.where('user_id').equals(userId).toArray(),
    db.pyq_attempts.where('user_id').equals(userId).toArray(),
    db.sessions.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray()
  ]);
  const attemptsBySession = new Map<string, PyqAttemptRow[]>();
  for (const attempt of attempts) {
    if (!attempt.pyq_session_id) continue;
    const rows = attemptsBySession.get(attempt.pyq_session_id) ?? [];
    rows.push(attempt);
    attemptsBySession.set(attempt.pyq_session_id, rows);
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const writes: Parameters<typeof writeLocalBatch>[0] = [];

  for (const pyqSession of pyqSessions) {
    const sessionAttempts = attemptsBySession.get(pyqSession.id) ?? [];
    const existing = sessionById.get(pyqSession.id);
    const canonical = pyqPracticeSessionRow(
      pyqSession,
      sessionAttempts.length > 0
        ? pyqPracticeSubject(sessionAttempts)
        : (existing?.subject ?? 'PYQ practice'),
      timeZone,
      existing
    );
    if (
      !existing ||
      existing.kind !== 'pyq' ||
      existing.subject !== canonical.subject ||
      existing.actual_duration_min !== canonical.actual_duration_min ||
      existing.target_duration_min !== 0
    ) {
      writes.push({ name: 'sessions', row: canonical });
    }

    for (const attempt of sessionAttempts) {
      const journalRow =
        questions.find((question) => question.source_pyq_attempt_id === attempt.id) ??
        questionById.get(pyqJournalQuestionId(attempt.id)) ??
        questionById.get(legacyPyqJournalQuestionId(attempt.id));
      if (journalRow && journalRow.session_id !== pyqSession.id) {
        const regrouped: QuestionRow = { ...journalRow, session_id: pyqSession.id };
        writes.push({
          name: 'questions',
          row: regrouped
        });
      }
    }
  }

  await writeLocalBatch(writes);
  return writes.length;
}

/**
 * Finished sessions with practice evidence, newest first. Focused/log sessions
 * require a tagged question; PYQ sessions require a submitted attempt.
 */
export async function finishedSessionsWithQuestions(
  userId: string,
  timeZone = 'Asia/Kolkata'
): Promise<SessionRow[]> {
  if (!userId) return [];
  const [sessions, questions, pyqSessions, pyqAttempts] = await Promise.all([
    db.sessions.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.pyq_sessions.where('user_id').equals(userId).toArray(),
    db.pyq_attempts.where('user_id').equals(userId).toArray()
  ]);
  const populatedSessionIds = new Set(
    questions.flatMap((question) => (question.session_id ? [question.session_id] : []))
  );
  const attemptedPyqSessionIds = new Set(
    pyqAttempts.flatMap((attempt) => (attempt.pyq_session_id ? [attempt.pyq_session_id] : []))
  );
  const pyqById = new Map(pyqSessions.map((session) => [session.id, session]));
  const canonicalById = new Map<string, SessionRow>(
    sessions.map((session) => [session.id, session])
  );

  // Project legacy PYQ sets immediately; the mount-time reconciler persists
  // the same row so review routes and sync gain the canonical parent too.
  for (const pyqSession of pyqSessions) {
    const sessionAttempts = pyqAttempts.filter(
      (attempt) => attempt.pyq_session_id === pyqSession.id
    );
    const existing = canonicalById.get(pyqSession.id);
    canonicalById.set(
      pyqSession.id,
      pyqPracticeSessionRow(
        pyqSession,
        sessionAttempts.length > 0
          ? pyqPracticeSubject(sessionAttempts)
          : (existing?.subject ?? 'PYQ practice'),
        timeZone,
        existing
      )
    );
  }

  return [...canonicalById.values()]
    .filter((session) => {
      const pyq = pyqById.get(session.id);
      if (pyq) {
        return (
          (pyq.status === 'completed' || pyq.status === 'abandoned') &&
          attemptedPyqSessionIds.has(session.id)
        );
      }
      return session.actual_duration_min !== null && populatedSessionIds.has(session.id);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Delete every finished session that has zero tagged questions. Runs cheaply
 * (one Dexie query + one count per candidate) — the intent is a one-shot
 * housekeeping sweep on Journal / Dashboard mount so old cruft disappears.
 * Returns the number of sessions dropped.
 */
export async function pruneEmptyFinishedSessions(userId: string): Promise<number> {
  if (!userId) return 0;
  const [finished, questions, pyqSessions] = await Promise.all([
    db.sessions
      .where('user_id')
      .equals(userId)
      .filter((session) => session.actual_duration_min !== null)
      .toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.pyq_sessions.where('user_id').equals(userId).toArray()
  ]);
  const populatedSessionIds = new Set(
    questions.flatMap((question) => (question.session_id ? [question.session_id] : []))
  );
  const pyqSessionIds = new Set(pyqSessions.map((session) => session.id));
  let dropped = 0;
  for (const session of finished) {
    if (!populatedSessionIds.has(session.id) && !pyqSessionIds.has(session.id)) {
      await deleteLocal('sessions', session.id);
      dropped += 1;
    }
  }
  return dropped;
}

/** Newest-first list of the user's finished sessions, capped at `limit`. */
export async function recentSessions(
  userId: string,
  limit = 6,
  timeZone = 'Asia/Kolkata'
): Promise<SessionRow[]> {
  const all = await finishedSessionsWithQuestions(userId, timeZone);
  return all.slice(0, limit);
}

/**
 * All the user's finished sessions (newest first). Used by the session filter
 * dropdown so the user can jump to any old session — not just the last 6.
 */
export async function allSessions(
  userId: string,
  timeZone = 'Asia/Kolkata'
): Promise<SessionRow[]> {
  return finishedSessionsWithQuestions(userId, timeZone);
}
