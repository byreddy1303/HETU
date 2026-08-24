import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import type { PyqAttemptRow, PyqSessionRow, QuestionRow, SessionRow } from '@/types';
import { db } from '@/lib/db';
import {
  allSessions,
  finishedSessionsWithQuestions,
  practiceQuestionCount,
  pruneEmptyFinishedSessions,
  reconcilePyqPracticeSessions,
  recentSessions
} from '@/lib/sessions';
import { pyqJournalQuestionId } from '@/lib/pyq-session';
import { stopSync } from '@/lib/sync';

const USER = '00000000-0000-4000-8000-000000000001';

function session(
  id: string,
  createdAt: string,
  actualDuration: number | null = 30
): SessionRow & { sync_status: 'synced' } {
  return {
    id,
    user_id: USER,
    date: createdAt.slice(0, 10),
    subject: 'Algorithms',
    target_duration_min: 60,
    actual_duration_min: actualDuration,
    insight: null,
    sadhana_done: false,
    interruptions_count: 0,
    created_at: createdAt,
    sync_status: 'synced'
  };
}

function question(id: string, sessionId: string): QuestionRow & { sync_status: 'synced' } {
  return {
    id,
    user_id: USER,
    session_id: sessionId,
    subject: 'Algorithms',
    subtopic: null,
    source_year: null,
    source_ref: null,
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 60,
    target_time_sec: 120,
    outcome: 'R',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: null,
    mark_correct: null,
    created_at: '2026-07-22T09:10:00.000Z',
    sync_status: 'synced'
  };
}

beforeEach(async () => {
  stopSync();
  await db.delete();
  await db.open();
});

describe('session history', () => {
  it('returns only finished sessions containing questions, newest first', async () => {
    await db.sessions.bulkPut([
      session('older-valid', '2026-07-20T09:00:00.000Z'),
      session('newer-valid', '2026-07-22T09:00:00.000Z'),
      session('empty-finished', '2026-07-23T09:00:00.000Z'),
      session('running', '2026-07-24T09:00:00.000Z', null)
    ]);
    await db.questions.bulkPut([
      question('q-1', 'older-valid'),
      question('q-2', 'newer-valid'),
      question('q-3', 'running')
    ]);

    expect((await finishedSessionsWithQuestions(USER)).map((row) => row.id)).toEqual([
      'newer-valid',
      'older-valid'
    ]);
    expect((await allSessions(USER)).map((row) => row.id)).toEqual(['newer-valid', 'older-valid']);
    expect((await recentSessions(USER, 1)).map((row) => row.id)).toEqual(['newer-valid']);
  });

  it('deletes legacy empty finished sessions but preserves running sessions', async () => {
    await db.sessions.bulkPut([
      session('valid', '2026-07-20T09:00:00.000Z'),
      session('empty-finished', '2026-07-22T09:00:00.000Z'),
      session('running', '2026-07-23T09:00:00.000Z', null)
    ]);
    await db.questions.put(question('q-1', 'valid'));

    expect(await pruneEmptyFinishedSessions(USER)).toBe(1);
    expect(await db.sessions.get('empty-finished')).toBeUndefined();
    expect(await db.sessions.get('running')).toBeDefined();
    expect(await db.sessions.get('valid')).toBeDefined();
  });

  it('includes legacy PYQ practice in session history and reconciles its journal grouping', async () => {
    const pyqSession = {
      id: 'pyq-session',
      user_id: USER,
      bank_version: 'test',
      config: {
        subjectSlug: 'algorithms',
        topicSlug: 'all',
        fromYear: 2020,
        toYear: 2026,
        type: 'all',
        order: 'unseen',
        count: '5'
      },
      question_uids: ['gate-q1'],
      completed_question_uids: ['gate-q1'],
      current_index: 1,
      completed_count: 1,
      elapsed_sec: 75,
      status: 'completed',
      current_question_uid: null,
      current_question_started_at: null,
      started_at: '2026-07-24T09:00:00.000Z',
      updated_at: '2026-07-24T09:02:00.000Z',
      completed_at: '2026-07-24T09:02:00.000Z',
      sync_status: 'synced'
    } as PyqSessionRow & { sync_status: 'synced' };
    const attempt = {
      id: 'pyq-attempt',
      user_id: USER,
      pyq_session_id: pyqSession.id,
      subject: 'Algorithms',
      attempted_at: '2026-07-24T09:01:00.000Z',
      sync_status: 'synced'
    } as PyqAttemptRow & { sync_status: 'synced' };
    const journalRow = {
      ...question(pyqJournalQuestionId(attempt.id), 'legacy-placeholder'),
      session_id: null
    };
    await db.pyq_sessions.put(pyqSession);
    await db.pyq_attempts.put(attempt);
    await db.questions.put(journalRow);

    expect((await allSessions(USER)).map((row) => [row.id, row.kind])).toEqual([
      [pyqSession.id, 'pyq']
    ]);
    expect(practiceQuestionCount([journalRow], [attempt])).toBe(1);

    expect(await reconcilePyqPracticeSessions(USER)).toBe(2);
    expect(await db.sessions.get(pyqSession.id)).toMatchObject({
      kind: 'pyq',
      subject: 'Algorithms',
      actual_duration_min: 2
    });
    expect((await db.questions.get(journalRow.id))?.session_id).toBe(pyqSession.id);
  });

  it('keeps paused PYQ exams out of finished history even when draft-era receipts exist', async () => {
    const basePyq: Omit<PyqSessionRow, 'id' | 'status'> & { sync_status: 'synced' } = {
      user_id: USER,
      bank_version: 'test',
      config: {
        subjectSlug: 'algorithms',
        topicSlug: 'all',
        fromYear: 2020,
        toYear: 2026,
        type: 'all',
        order: 'unseen',
        count: '5'
      },
      question_uids: ['gate-q1'],
      completed_question_uids: ['gate-q1'],
      current_index: 1,
      completed_count: 1,
      elapsed_sec: 75,
      current_question_uid: null,
      current_question_started_at: null,
      started_at: '2026-07-24T09:00:00.000Z',
      updated_at: '2026-07-24T09:02:00.000Z',
      completed_at: null,
      sync_status: 'synced'
    };
    const paused: PyqSessionRow & { sync_status: 'synced' } = {
      ...basePyq,
      id: 'paused-pyq',
      status: 'paused'
    };
    const completed: PyqSessionRow & { sync_status: 'synced' } = {
      ...basePyq,
      id: 'completed-pyq',
      status: 'completed',
      completed_at: '2026-07-24T09:02:00.000Z'
    };
    const receipt = (id: string, pyqSessionId: string) =>
      ({
        id,
        user_id: USER,
        pyq_session_id: pyqSessionId,
        question_uid: 'gate-q1',
        subject: 'Algorithms',
        attempted_at: '2026-07-24T09:01:00.000Z',
        sync_status: 'synced'
      }) as PyqAttemptRow & { sync_status: 'synced' };

    await db.pyq_sessions.bulkPut([paused, completed]);
    await db.pyq_attempts.bulkPut([
      receipt('paused-receipt', paused.id),
      receipt('completed-receipt', completed.id)
    ]);

    expect((await finishedSessionsWithQuestions(USER)).map((row) => row.id)).toEqual([
      completed.id
    ]);
  });
});
