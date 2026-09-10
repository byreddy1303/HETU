import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  assignRecoveryTransfer,
  completeRecoveryRemediation,
  remediationEvidenceFromEvents,
  selectExactTopicTransferQuestion,
  transferAssignmentFromEvents
} from '@/lib/recovery-workflows';
import { recordRecoveryRetrieval, startRecoverySession } from '@/lib/recovery-session';
import type { LearningItemRow, PyqAttemptRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';

const USER = '00000000-0000-4000-8000-000000000001';
const TIME_ZONE = 'Asia/Kolkata';

function item(overrides: Partial<LearningItemRow> = {}): LearningItemRow {
  return {
    id: 'item-transfer',
    user_id: USER,
    source_kind: 'pyq',
    question_uid: 'source-question',
    source_question_id: null,
    content_fingerprint: null,
    subject: 'Algorithms',
    topic: 'Shortest Paths',
    origin_pyq_attempt_id: null,
    latest_pyq_attempt_id: null,
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D30',
    scheduled_date: '2026-08-31',
    reason_flags: ['wrong'],
    lapse_count: 0,
    successful_retrieval_count: 2,
    last_grade: 'good',
    last_interval_days: 30,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

function question(id: string, overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id,
    year: 2025,
    set: 1,
    number: id,
    paperLabel: 'GATE CSE 2025 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Paths',
    topicSlug: 'shortest-paths',
    subtopics: ['Dijkstra'],
    marks: 2,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>Fresh shortest-path question</p>',
    sourceUrl: 'https://example.test/question',
    answerSource: null,
    ...overrides
  };
}

function attempt(questionUid: string): PyqAttemptRow {
  return {
    id: `attempt-${questionUid}`,
    user_id: USER,
    pyq_session_id: null,
    question_uid: questionUid,
    attempt_number: 1,
    subject: 'Algorithms',
    year: 2025,
    question_marks: 2,
    question_type: 'MCQ',
    answer_status: 'available',
    correct_answer: 'B',
    mark_decision: 'MARK',
    mark_correct: false,
    selected_answer: 'A',
    time_spent_sec: 120,
    time_spent_ms: 120_000,
    confidence: 'high',
    question_started_at: '2026-08-01T00:00:00.000Z',
    attempted_at: '2026-08-01T00:00:00.000Z',
    bank_version: 'test',
    capture_version: 2,
    question_snapshot: null,
    screenshot_url: null,
    reattempt_id: null,
    reattempt_round: null,
    round_attempt_number: null
  };
}

describe('recovery remediation and transfer workflows', () => {
  beforeEach(async () => {
    await Promise.all([
      db.learning_items.clear(),
      db.learning_events.clear(),
      db.recovery_sessions.clear(),
      db.reattempts.clear(),
      db.pyq_attempts.clear()
    ]);
  });

  it('selects a reproducible unseen exact-topic transfer while protecting reserves', () => {
    const source = item();
    const candidates = [
      question('source-question'),
      question('seen-question'),
      question('reserved-question'),
      question('wrong-topic', { topic: 'MST', topicSlug: 'mst' }),
      question('fresh-a'),
      question('fresh-b')
    ];
    const first = selectExactTopicTransferQuestion({
      item: source,
      questions: candidates,
      attempts: [attempt('seen-question')],
      reservedQuestionUids: ['reserved-question'],
      seed: 'stable-seed'
    });
    const reordered = selectExactTopicTransferQuestion({
      item: source,
      questions: [...candidates].reverse(),
      attempts: [attempt('seen-question')],
      reservedQuestionUids: ['reserved-question'],
      seed: 'stable-seed'
    });
    expect(first.question?.id).toBe(reordered.question?.id);
    expect(['fresh-a', 'fresh-b']).toContain(first.question?.id);
    expect(first).toMatchObject({ eligibleCount: 2, excludedSeen: 1, excludedReserved: 1 });
  });

  it('requires and persists a corrected opening move and focused plan', async () => {
    const remediation = item({
      recovery_state: 'remediation',
      stage: 'D3',
      lapse_count: 3,
      reason_flags: ['wrong', 'recurring-lapse']
    });
    await db.learning_items.put({ ...remediation, sync_status: 'synced' });
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'questions-5',
      candidates: [{ item: remediation, estimatedSeconds: 120 }],
      today: '2026-08-31',
      startedAt: '2026-08-31T10:00:00.000Z'
    });
    await expect(
      completeRecoveryRemediation({
        item: remediation,
        correctedOpeningMove: 'vague',
        focusedPlan: 'redo examples',
        today: '2026-08-31',
        timeZone: TIME_ZONE,
        session
      })
    ).rejects.toThrow('specific corrected opening move');
    const result = await completeRecoveryRemediation({
      item: remediation,
      correctedOpeningMove: 'Write the invariant before selecting the next edge.',
      focusedPlan: 'Solve three Dijkstra counterexamples without notes.',
      today: '2026-08-31',
      timeZone: TIME_ZONE,
      session,
      occurredAt: '2026-08-31T10:05:00.000Z'
    });
    expect(result.item).toMatchObject({
      recovery_state: 'active',
      stage: 'D3',
      scheduled_date: '2026-09-03',
      analysis_state: 'completed'
    });
    expect(result.session?.status).toBe('completed');
    const events = await db.learning_events.toArray();
    expect(remediationEvidenceFromEvents(events, remediation.id)).toMatchObject({
      correctedOpeningMove: 'Write the invariant before selecting the next edge.',
      focusedPlan: 'Solve three Dijkstra counterexamples without notes.'
    });
  });

  it('persists the exact delayed transfer assignment and derives it from events', async () => {
    const source = item({ recovery_state: 'mastered', stage: 'MASTERED' });
    await db.learning_items.put({ ...source, sync_status: 'synced' });
    const assigned = await assignRecoveryTransfer({
      item: source,
      question: question('fresh-transfer'),
      today: '2026-08-31',
      timeZone: TIME_ZONE,
      occurredAt: '2026-08-31T11:00:00.000Z'
    });
    expect(assigned).toMatchObject({
      recovery_state: 'transfer',
      stage: 'TRANSFER',
      scheduled_date: '2026-09-03',
      mastered_at: null
    });
    expect(
      transferAssignmentFromEvents(await db.learning_events.toArray(), source.id)
    ).toMatchObject({ questionUid: 'fresh-transfer', dueDate: '2026-09-03' });
  });

  it('records an explicit transfer pass before durable mastery', async () => {
    const transfer = item({
      recovery_state: 'transfer',
      stage: 'TRANSFER',
      scheduled_date: '2026-08-31'
    });
    await db.learning_items.put({ ...transfer, sync_status: 'synced' });
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'questions-5',
      candidates: [{ item: transfer, estimatedSeconds: 120 }],
      today: '2026-08-31'
    });
    const result = await recordRecoveryRetrieval({
      session,
      item: transfer,
      evidence: {
        correct: true,
        timeSpentSec: 90,
        targetTimeSec: 120,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 2
      },
      answer: 'B',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T12:00:00.000Z'
    });
    expect(result.item).toMatchObject({
      recovery_state: 'mastered',
      stage: 'MASTERED',
      transfer_passed_at: '2026-08-31T12:00:00.000Z'
    });
    expect((await db.learning_events.toArray()).map((event) => event.event_type)).toEqual(
      expect.arrayContaining(['retrieval_good', 'transfer_passed', 'mastered'])
    );
  });
});
