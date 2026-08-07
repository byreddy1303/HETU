import { describe, expect, it } from 'vitest';
import {
  createPyqSessionRow,
  pyqAttemptId,
  pyqJournalQuestionId,
  advancePyqSessionProgress,
  completePyqSession,
  abandonPyqSession
} from '@/lib/pyq-session';
import type { PyqSessionConfig } from '@/types';

const mockConfig: PyqSessionConfig = {
  subjectSlug: 'algorithms',
  fromYear: 2020,
  toYear: 2026,
  type: 'all',
  order: 'unseen',
  count: '10'
};

describe('PYQ session logic and determinism', () => {
  it('creates an active session row with initial progress', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' }
    ]);
    expect(session.user_id).toBe('user-1');
    expect(session.bank_version).toBe('1.0.0');
    expect(session.status).toBe('active');
    expect(session.question_uids).toEqual(['q1', 'q2']);
    expect(session.completed_question_uids).toEqual([]);
    expect(session.current_index).toBe(0);
    expect(session.completed_count).toBe(0);
  });

  it('generates deterministic attempt and journal question IDs', () => {
    const attemptId1 = pyqAttemptId('session-1', 'q1', 1);
    const attemptId2 = pyqAttemptId('session-1', 'q1', 1);
    const journalId1 = pyqJournalQuestionId(attemptId1);
    const journalId2 = pyqJournalQuestionId(attemptId1);

    expect(attemptId1).toBe(attemptId2);
    expect(journalId1).toBe(journalId2);
    expect(attemptId1).not.toBe(journalId1);
  });

  it('advances session progress correctly', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' },
      { id: 'q3' }
    ]);
    const advanced = advancePyqSessionProgress(session, 'q1', 1);
    expect(advanced.completed_question_uids).toEqual(['q1']);
    expect(advanced.current_index).toBe(1);
    expect(advanced.completed_count).toBe(1);
  });

  it('completes and abandons sessions properly', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' }
    ]);
    const completed = completePyqSession(session);
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();
    expect(completed.current_index).toBe(2);

    const abandoned = abandonPyqSession(session);
    expect(abandoned.status).toBe('abandoned');
  });
});
