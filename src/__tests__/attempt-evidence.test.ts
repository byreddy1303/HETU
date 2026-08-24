import { describe, expect, it } from 'vitest';
import type { MarkDecision, PyqAttemptRow, QuestionRow } from '@/types';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import {
  legacyPyqJournalQuestionId,
  pyqJournalQuestionId
} from '@/lib/pyq-session';

function attempt(
  id: string,
  decision: MarkDecision,
  correct: boolean | null,
  overrides: Partial<PyqAttemptRow> = {}
): PyqAttemptRow {
  return {
    id,
    user_id: 'user-1',
    pyq_session_id: 'session-1',
    question_uid: `uid-${id}`,
    subject: 'Algorithms',
    year: 2026,
    attempt_number: 1,
    selected_answer: decision === 'SKIP' ? null : 'A',
    correct_answer: 'A',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: decision,
    mark_correct: correct,
    question_started_at: '2026-08-20T08:59:50.000Z',
    time_spent_ms: 10_000,
    time_spent_sec: 10,
    bank_version: 'bank-1',
    attempted_at: '2026-08-20T09:00:00.000Z',
    ...overrides
  };
}

function journal(
  id: string,
  decision: MarkDecision | null,
  correct: boolean | null,
  overrides: Partial<QuestionRow> = {}
): QuestionRow {
  return {
    id,
    user_id: 'user-1',
    session_id: 'session-1',
    subject: 'Algorithms',
    subtopic: 'Shortest Path',
    source_year: 2026,
    source_ref: 'GATE PYQ · 2026 · Q 1 · MCQ',
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 10,
    target_time_sec: 90,
    outcome: correct ? 'R' : 'W-C',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: decision,
    mark_correct: correct,
    source_pyq_attempt_id: null,
    created_at: '2026-08-20T09:00:00.000Z',
    ...overrides
  };
}

describe('canonical attempt evidence', () => {
  it('counts each receipt once and suppresses all linked Journal aliases', () => {
    const skipped = attempt('attempt-skip', 'SKIP', null, { attempt_number: 1 });
    const answered = attempt('attempt-answer', 'MARK', true, { attempt_number: 2 });
    const legacy = attempt('attempt-legacy', 'MARK', false, {
      capture_version: 1,
      attempted_at: '2026-08-19T09:00:00.000Z',
      question_started_at: null,
      time_spent_ms: null
    });
    const questions = [
      journal(pyqJournalQuestionId(skipped.id), 'SKIP', null),
      journal(legacyPyqJournalQuestionId(answered.id), 'MARK', true),
      journal('explicit-analysis', 'MARK', true, {
        source_pyq_attempt_id: answered.id
      }),
      journal('random-legacy-analysis', 'MARK', false, {
        created_at: legacy.attempted_at
      }),
      journal('manual-uncertain', 'FIFTY_FIFTY', false, {
        source_ref: 'Own notes',
        created_at: '2026-08-21T09:00:00.000Z'
      })
    ];

    const ledger = normalizeAttemptEvidence({
      attempts: [skipped, answered, legacy, answered],
      questions
    });

    expect(ledger.events.map((event) => event.id)).toEqual([
      `pyq-attempt:${legacy.id}`,
      `pyq-attempt:${answered.id}`,
      `pyq-attempt:${skipped.id}`,
      'legacy-journal:manual-uncertain'
    ]);
    expect(ledger.counts).toEqual({
      total: 4,
      correct: 1,
      wrong: 2,
      skipped: 1,
      ungraded: 0,
      uncertain: 1,
      pyqAttempts: 3,
      legacyJournal: 1
    });
    expect(ledger.duplicateAttemptIds).toEqual([answered.id]);
    expect(ledger.suppressedJournalQuestionIds).toEqual([
      'explicit-analysis',
      legacyPyqJournalQuestionId(answered.id),
      pyqJournalQuestionId(skipped.id),
      'random-legacy-analysis'
    ].sort());
  });

  it('keeps an explicitly linked analysis out even during a partial attempt pull', () => {
    const linkedOnly = journal('linked-only', 'MARK', true, {
      source_pyq_attempt_id: 'receipt-not-pulled-yet'
    });
    const ledger = normalizeAttemptEvidence({ attempts: [], questions: [linkedOnly] });
    expect(ledger.events).toEqual([]);
    expect(ledger.counts.total).toBe(0);
    expect(ledger.suppressedJournalQuestionIds).toEqual(['linked-only']);
  });

  it('treats an explicit analysis link as occupying the receipt for legacy pairing', () => {
    const legacy = attempt('occupied-receipt', 'MARK', true, {
      capture_version: 1,
      question_started_at: null,
      time_spent_ms: null,
      attempted_at: '2026-08-20T09:00:00.000Z'
    });
    const explicit = journal('explicit-owner', 'MARK', true, {
      source_pyq_attempt_id: legacy.id
    });
    const coincidentalLegacy = journal('independent-legacy', 'MARK', true, {
      created_at: '2026-08-20T09:00:00.000+00:00'
    });

    const ledger = normalizeAttemptEvidence({
      attempts: [legacy],
      questions: [explicit, coincidentalLegacy]
    });

    expect(ledger.events.map((event) => event.id)).toEqual([
      'legacy-journal:independent-legacy',
      `pyq-attempt:${legacy.id}`
    ]);
    expect(ledger.suppressedJournalQuestionIds).toEqual(['explicit-owner']);
  });

  it('recovers outcome-only legacy decisions without overriding explicit fields', () => {
    const inferredGuess = journal('outcome-only-guess', null, null, { outcome: 'RBG' });
    const explicitWrong = journal('explicit-wrong', 'MARK', false, { outcome: 'RBS' });

    const ledger = normalizeAttemptEvidence({
      attempts: [],
      questions: [inferredGuess, explicitWrong]
    });

    expect(ledger.events).toEqual([
      expect.objectContaining({
        id: 'legacy-journal:explicit-wrong',
        decision: 'MARK',
        outcome: 'wrong',
        uncertain: false,
        correct: false
      }),
      expect.objectContaining({
        id: 'legacy-journal:outcome-only-guess',
        decision: 'FIFTY_FIFTY',
        outcome: 'correct',
        uncertain: true,
        correct: true
      })
    ]);
  });

  it('counts a duplicated independent Journal primary key only once', () => {
    const duplicate = journal('duplicate-independent', 'FIFTY_FIFTY', false, {
      source_ref: 'Own notes'
    });

    const ledger = normalizeAttemptEvidence({
      attempts: [],
      questions: [duplicate, { ...duplicate }]
    });

    expect(ledger.events).toEqual([
      expect.objectContaining({
        id: 'legacy-journal:duplicate-independent',
        outcome: 'wrong',
        uncertain: true
      })
    ]);
    expect(ledger.counts).toMatchObject({
      total: 1,
      wrong: 1,
      uncertain: 1,
      legacyJournal: 1
    });
  });
});
