import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  backfillLocalLearningEvidence,
  captureWeakPyqAttempt,
  needsRecoveryCapture,
  weakAttemptReasons
} from '@/lib/learning-recovery';
import { deleteLocal, stopSync, writeLocal } from '@/lib/sync';
import type { PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';

const USER = '00000000-0000-4000-8000-000000000001';
const TIME_ZONE = 'Asia/Kolkata';

function attempt(overrides: Partial<PyqAttemptRow> = {}): PyqAttemptRow {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    user_id: USER,
    pyq_session_id: '20000000-0000-4000-8000-000000000001',
    question_uid: 'gate-2026-q1',
    subject: 'Algorithms',
    subject_id: 'algorithms',
    year: 2026,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: {
      question_uid: 'gate-2026-q1',
      year: 2026,
      set: 1,
      number: '1',
      paper_label: 'GATE 2026',
      subject: 'Algorithms',
      subject_slug: 'algorithms',
      topic: 'Graphs',
      topic_slug: 'graphs',
      subtopics: [],
      marks: 1,
      type: 'MCQ',
      choices: ['A', 'B', 'C', 'D'],
      tolerance: null,
      answer_status: 'available',
      answer_source: null,
      html: '<p>Question</p>',
      source_url: 'https://example.test/question'
    },
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    confidence: 'high',
    question_started_at: '2026-08-30T19:13:00.000Z',
    time_spent_ms: 120_000,
    time_spent_sec: 120,
    bank_version: 'test-bank',
    attempted_at: '2026-08-30T19:15:00.000Z',
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: -1,
    scoring_status: 'scored',
    scoring_version: 1,
    reattempt_id: null,
    reattempt_round: null,
    round_attempt_number: null,
    ...overrides
  };
}

function question(sourceAttempt: PyqAttemptRow): QuestionRow {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    user_id: USER,
    session_id: sourceAttempt.pyq_session_id,
    subject: sourceAttempt.subject,
    subject_id: sourceAttempt.subject_id,
    subtopic: 'Graphs',
    source_year: 2026,
    source_ref: 'GATE 2026',
    question_text: 'Question',
    answer_text: 'B',
    image_url: null,
    time_spent_sec: sourceAttempt.time_spent_sec,
    target_time_sec: 90,
    outcome: 'W-C',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: sourceAttempt.mark_decision,
    mark_correct: sourceAttempt.mark_correct,
    source_pyq_attempt_id: sourceAttempt.id,
    created_at: sourceAttempt.attempted_at
  };
}

beforeEach(async () => {
  stopSync();
  await Promise.all([
    db.learning_events.clear(),
    db.recovery_sessions.clear(),
    db.reattempts.clear(),
    db.learning_items.clear(),
    db.questions.clear(),
    db.pyq_attempts.clear()
  ]);
});

describe('weak attempt classification', () => {
  it('captures wrong, skipped, confidence surprise, guessed-correct, and slow-correct evidence', () => {
    expect(weakAttemptReasons(attempt())).toEqual(['wrong', 'high-confidence-wrong']);
    expect(
      weakAttemptReasons(attempt({ mark_decision: 'SKIP', selected_answer: null, confidence: 'low' }))
    ).toEqual(['skipped', 'wrong', 'low-confidence']);
    expect(
      weakAttemptReasons(
        attempt({
          mark_correct: true,
          mark_decision: 'FIFTY_FIFTY',
          selected_answer: 'B',
          confidence: 'medium'
        })
      )
    ).toEqual(['guessed-correct', 'slow-correct']);
    expect(
      needsRecoveryCapture(
        attempt({
          mark_correct: true,
          mark_decision: 'MARK',
          selected_answer: 'B',
          confidence: 'high',
          time_spent_sec: 40,
          time_spent_ms: 40_000
        })
      )
    ).toBe(false);
  });
});

describe('canonical automatic capture', () => {
  it('creates one schedule, one immutable event, and one compatibility ladder idempotently', async () => {
    const receipt = attempt();
    const journal = question(receipt);

    await captureWeakPyqAttempt({
      attempt: receipt,
      timeZone: TIME_ZONE,
      compatibilityQuestion: journal
    });
    await captureWeakPyqAttempt({
      attempt: receipt,
      timeZone: TIME_ZONE,
      compatibilityQuestion: journal
    });

    const [item] = await db.learning_items.toArray();
    expect(item).toMatchObject({
      question_uid: receipt.question_uid,
      stage: 'D3',
      recovery_state: 'active',
      scheduled_date: '2026-09-03',
      reason_flags: ['wrong', 'high-confidence-wrong']
    });
    expect(await db.learning_events.count()).toBe(1);
    expect((await db.learning_events.toArray())[0]).toMatchObject({
      event_type: 'answer_committed',
      local_date: '2026-08-31',
      timezone: TIME_ZONE,
      idempotency_key: `attempt:${receipt.id}`
    });
    expect(await db.reattempts.count()).toBe(1);
    expect((await db.reattempts.toArray())[0].learning_item_id).toBe(item.id);
    expect(await db.questions.count()).toBe(1);
  });

  it('merges repeated weak attempts under one identity while preserving both receipts', async () => {
    const first = attempt({ confidence: 'medium' });
    const second = attempt({
      id: '10000000-0000-4000-8000-000000000002',
      attempt_number: 2,
      mark_correct: true,
      selected_answer: 'B',
      mark_decision: 'FIFTY_FIFTY',
      confidence: 'low',
      attempted_at: '2026-09-01T08:00:00.000Z'
    });
    await captureWeakPyqAttempt({ attempt: first, timeZone: TIME_ZONE, compatibilityQuestion: question(first) });
    await captureWeakPyqAttempt({
      attempt: second,
      timeZone: TIME_ZONE,
      compatibilityQuestion: { ...question(second), id: '30000000-0000-4000-8000-000000000002' }
    });

    expect(await db.learning_items.count()).toBe(1);
    const [item] = await db.learning_items.toArray();
    expect(item.latest_pyq_attempt_id).toBe(second.id);
    expect(item.reason_flags).toEqual([
      'wrong',
      'low-confidence',
      'guessed-correct',
      'slow-correct'
    ]);
    expect(await db.learning_events.count()).toBe(2);
    expect(await db.reattempts.count()).toBe(1);
  });

  it('enforces append-only events at the local write boundary', async () => {
    const receipt = attempt();
    await captureWeakPyqAttempt({
      attempt: receipt,
      timeZone: TIME_ZONE,
      compatibilityQuestion: question(receipt)
    });
    const [event] = await db.learning_events.toArray();

    await expect(
      writeLocal('learning_events', { ...event, event_type: 'retrieval_again' })
    ).rejects.toThrow(/append-only/i);
    await expect(deleteLocal('learning_events', event.id)).rejects.toThrow(/cannot be deleted/i);
  });
});

describe('legacy compatibility migration', () => {
  it('merges duplicate ladders for one PYQ without discarding their histories', async () => {
    const receipt = attempt({ confidence: 'medium' });
    const firstQuestion = question(receipt);
    const secondQuestion = {
      ...firstQuestion,
      id: '30000000-0000-4000-8000-000000000002'
    };
    const ladders: ReattemptRow[] = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        user_id: USER,
        question_id: firstQuestion.id,
        scheduled_date: '2026-09-05',
        stage: 'D10',
        history: [{ date: '2026-08-25', result: 'clean' }],
        created_at: '2026-08-20T00:00:00.000Z'
      },
      {
        id: '40000000-0000-4000-8000-000000000002',
        user_id: USER,
        question_id: secondQuestion.id,
        scheduled_date: '2026-09-01',
        stage: 'D3',
        history: [{ date: '2026-08-28', result: 'fail' }],
        created_at: '2026-08-21T00:00:00.000Z'
      }
    ];
    await db.pyq_attempts.put({ ...receipt, sync_status: 'synced' });
    await db.questions.bulkPut([
      { ...firstQuestion, sync_status: 'synced' },
      { ...secondQuestion, sync_status: 'synced' }
    ]);
    await db.reattempts.bulkPut(ladders.map((row) => ({ ...row, sync_status: 'synced' })));

    await backfillLocalLearningEvidence(USER, TIME_ZONE);

    expect(await db.learning_items.count()).toBe(1);
    const [item] = await db.learning_items.toArray();
    expect(item).toMatchObject({ stage: 'D3', scheduled_date: '2026-09-01', lapse_count: 1 });
    expect((await db.reattempts.toArray()).every((row) => row.learning_item_id === item.id)).toBe(true);
    expect(
      (await db.learning_events.toArray()).map((event) => event.idempotency_key).sort()
    ).toEqual([
      `attempt:${receipt.id}`,
      `legacy-created:${ladders[0].id}`,
      `legacy-created:${ladders[1].id}`,
      `legacy-history:${ladders[0].id}:1`,
      `legacy-history:${ladders[1].id}:1`
    ]);
  });
});
