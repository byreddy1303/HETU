import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  checkpointRecoverySession,
  deferRecoveryItem,
  interruptRecoverySession,
  latestResumableRecoverySession,
  recordRecoveryRetrieval,
  revealRecoveryHint,
  startRecoverySession
} from '@/lib/recovery-session';
import { stopSync } from '@/lib/sync';
import type { LearningItemRow } from '@/types';

const USER = '00000000-0000-4000-8000-000000000001';
const TIME_ZONE = 'Asia/Kolkata';

function item(id: string, subject = 'Algorithms'): LearningItemRow {
  return {
    id,
    user_id: USER,
    source_kind: 'pyq',
    question_uid: `gate-${id}`,
    source_question_id: null,
    content_fingerprint: null,
    subject,
    topic: 'Graphs',
    origin_pyq_attempt_id: null,
    latest_pyq_attempt_id: null,
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D3',
    scheduled_date: '2026-08-31',
    reason_flags: ['wrong'],
    lapse_count: 0,
    successful_retrieval_count: 0,
    last_grade: null,
    last_interval_days: null,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z'
  };
}

beforeEach(async () => {
  stopSync();
  await Promise.all([
    db.learning_events.clear(),
    db.recovery_sessions.clear(),
    db.reattempts.clear(),
    db.learning_items.clear()
  ]);
});

describe('durable recovery sessions', () => {
  it('persists a bounded queue and resumes the latest checkpoint', async () => {
    const candidates = [
      { item: item('a'), estimatedSeconds: 240 },
      { item: item('b', 'DBMS'), estimatedSeconds: 240 },
      { item: item('c', 'OS'), estimatedSeconds: 240 }
    ];
    const { session, sprint } = await startRecoverySession({
      userId: USER,
      mode: 'minutes-10',
      candidates,
      today: '2026-08-31',
      selectionSeed: 'seed-1',
      startedAt: '2026-08-31T10:00:00.000Z'
    });
    expect(sprint.selected).toHaveLength(2);
    expect(session.item_ids).toEqual(['a', 'b']);
    expect((await latestResumableRecoverySession(USER))?.id).toBe(session.id);
  });

  it('records hint use and grades an assisted correct answer Hard without advancing', async () => {
    const learningItem = item('a');
    await db.learning_items.put({ ...learningItem, sync_status: 'synced' });
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'questions-5',
      candidates: [{ item: learningItem, estimatedSeconds: 90 }],
      today: '2026-08-31',
      startedAt: '2026-08-31T10:00:00.000Z'
    });
    const hinted = await revealRecoveryHint({
      session,
      item: learningItem,
      timeZone: TIME_ZONE,
      occurredAt: '2026-08-31T10:00:30.000Z'
    });
    const result = await recordRecoveryRetrieval({
      session: hinted,
      item: learningItem,
      evidence: {
        correct: true,
        timeSpentSec: 60,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: true,
        priorSuccessfulRetrievals: 0
      },
      answer: 'B',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T10:01:00.000Z'
    });
    expect(result.grade.grade).toBe('hard');
    expect(result.item).toMatchObject({ stage: 'D3', scheduled_date: '2026-09-03' });
    expect(result.session.status).toBe('completed');
    const repeatedHint = await revealRecoveryHint({
      session,
      item: learningItem,
      timeZone: TIME_ZONE,
      occurredAt: '2026-08-31T10:02:00.000Z'
    });
    expect(repeatedHint).toMatchObject({ status: 'completed', current_index: 1 });
    expect(
      (await db.learning_events.toArray())
        .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
        .map((event) => event.event_type)
    ).toEqual(['hint_revealed', 'retrieval_hard']);
  });

  it('distinguishes defer and interruption from failed retrieval', async () => {
    const first = item('a');
    const second = item('b', 'DBMS');
    await db.learning_items.bulkPut([
      { ...first, sync_status: 'synced' },
      { ...second, sync_status: 'synced' }
    ]);
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'all',
      candidates: [
        { item: first, estimatedSeconds: 90 },
        { item: second, estimatedSeconds: 90 }
      ],
      today: '2026-08-31',
      startedAt: '2026-08-31T10:00:00.000Z'
    });
    const deferred = await deferRecoveryItem({
      session,
      item: first,
      today: '2026-08-31',
      timeZone: TIME_ZONE,
      reason: 'Need paper and pen',
      occurredAt: '2026-08-31T10:00:15.000Z'
    });
    expect(deferred.item).toMatchObject({
      stage: 'D3',
      lapse_count: 0,
      scheduled_date: '2026-09-01'
    });
    const interrupted = await interruptRecoverySession({
      session: deferred.session,
      item: second,
      timeZone: TIME_ZONE,
      reason: 'App moved to background',
      elapsedMs: 15_000,
      occurredAt: '2026-08-31T10:00:30.000Z'
    });
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.current_index).toBe(1);
    expect(
      (await db.learning_events.toArray())
        .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
        .map((event) => event.event_type)
    ).toEqual(['deferred', 'interrupted']);
    expect((await db.learning_items.get(second.id))?.lapse_count).toBe(0);
  });

  it('returns the original committed grade for a repeated stale retrieval', async () => {
    const learningItem = item('stale-retrieval');
    await db.learning_items.put({ ...learningItem, sync_status: 'synced' });
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'questions-5',
      candidates: [{ item: learningItem, estimatedSeconds: 90 }],
      today: '2026-08-31',
      startedAt: '2026-08-31T11:00:00.000Z'
    });
    const committed = await recordRecoveryRetrieval({
      session,
      item: learningItem,
      evidence: {
        correct: true,
        timeSpentSec: 60,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 0
      },
      answer: 'B',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T11:01:00.000Z'
    });

    const repeated = await recordRecoveryRetrieval({
      // Simulate a delayed network/UI retry carrying the pre-commit snapshot
      // and even contradictory evidence. The committed event must win.
      session,
      item: learningItem,
      evidence: {
        correct: false,
        timeSpentSec: 180,
        targetTimeSec: 90,
        confidence: 'low',
        hintUsed: true,
        priorSuccessfulRetrievals: 0
      },
      answer: 'C',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T11:05:00.000Z'
    });

    expect(committed.grade.grade).toBe('good');
    expect(repeated.grade).toEqual(committed.grade);
    expect(repeated.explanation).toContain('already committed');
    expect(repeated.session).toMatchObject({ status: 'completed', current_index: 1 });
    expect(repeated.item).toMatchObject({
      stage: 'D10',
      lapse_count: 0,
      successful_retrieval_count: 1,
      scheduled_date: '2026-09-10'
    });
    const events = await db.learning_events.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'retrieval_good',
      answer: 'B',
      occurred_at: '2026-08-31T11:01:00.000Z'
    });
  });

  it('converges simultaneous contradictory submissions on one committed event', async () => {
    const learningItem = item('concurrent-retrieval');
    await db.learning_items.put({ ...learningItem, sync_status: 'synced' });
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'questions-5',
      candidates: [{ item: learningItem, estimatedSeconds: 90 }],
      today: '2026-08-31',
      startedAt: '2026-08-31T11:30:00.000Z'
    });
    const [left, right] = await Promise.all([
      recordRecoveryRetrieval({
        session,
        item: learningItem,
        evidence: {
          correct: true,
          timeSpentSec: 60,
          targetTimeSec: 90,
          confidence: 'high',
          hintUsed: false,
          priorSuccessfulRetrievals: 0
        },
        answer: 'B',
        timeZone: TIME_ZONE,
        today: '2026-08-31',
        occurredAt: '2026-08-31T11:31:00.000Z'
      }),
      recordRecoveryRetrieval({
        session,
        item: learningItem,
        evidence: {
          correct: false,
          timeSpentSec: 120,
          targetTimeSec: 90,
          confidence: 'low',
          hintUsed: false,
          priorSuccessfulRetrievals: 0
        },
        answer: 'C',
        timeZone: TIME_ZONE,
        today: '2026-08-31',
        occurredAt: '2026-08-31T11:31:01.000Z'
      })
    ]);

    const events = await db.learning_events.toArray();
    expect(events).toHaveLength(1);
    expect(events[0].grade).not.toBeNull();
    expect(left.grade.grade).toBe(events[0].grade);
    expect(right.grade.grade).toBe(events[0].grade);
    expect(left.session).toMatchObject({ status: 'completed', current_index: 1 });
    expect(right.session).toMatchObject({ status: 'completed', current_index: 1 });
    const storedItem = await db.learning_items.get(learningItem.id);
    expect((storedItem?.lapse_count ?? 0) + (storedItem?.successful_retrieval_count ?? 0)).toBe(1);
  });

  it('persists a draft through interruption and rejects its delayed write after advancement', async () => {
    const first = item('draft-first');
    const second = item('draft-second', 'DBMS');
    await db.learning_items.bulkPut([
      { ...first, sync_status: 'synced' },
      { ...second, sync_status: 'synced' }
    ]);
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'all',
      candidates: [
        { item: first, estimatedSeconds: 90 },
        { item: second, estimatedSeconds: 90 }
      ],
      today: '2026-08-31',
      startedAt: '2026-08-31T12:00:00.000Z'
    });
    const draft = {
      itemId: first.id,
      choices: ['B'],
      numeric: '',
      confidence: 'high'
    };
    const drafted = await checkpointRecoverySession(
      session,
      { draft_answer: draft },
      '2026-08-31T12:00:10.000Z'
    );
    const interrupted = await interruptRecoverySession({
      session: drafted,
      item: first,
      timeZone: TIME_ZONE,
      reason: 'App moved to background',
      elapsedMs: 10_000,
      occurredAt: '2026-08-31T12:00:20.000Z'
    });
    expect(interrupted.draft_answer).toEqual(draft);
    expect(await latestResumableRecoverySession(USER)).toMatchObject({
      id: session.id,
      status: 'interrupted',
      current_index: 0,
      draft_answer: draft
    });

    const resumed = await checkpointRecoverySession(
      interrupted,
      {
        status: 'active',
        current_item_started_at: '2026-08-31T12:00:30.000Z',
        completed_at: null
      },
      '2026-08-31T12:00:30.000Z'
    );
    const result = await recordRecoveryRetrieval({
      session: resumed,
      item: first,
      evidence: {
        correct: true,
        timeSpentSec: 60,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 0
      },
      answer: 'B',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T12:01:30.000Z'
    });
    expect(result.session).toMatchObject({ current_index: 1, status: 'active', draft_answer: null });

    const delayedDraft = await checkpointRecoverySession(
      drafted,
      { draft_answer: { ...draft, choices: ['C'] } },
      '2026-08-31T12:02:00.000Z'
    );
    expect(delayedDraft).toMatchObject({
      current_index: 1,
      status: 'active',
      draft_answer: null,
      updated_at: '2026-08-31T12:01:30.000Z'
    });
    expect(await db.recovery_sessions.get(session.id)).toMatchObject(delayedDraft);
  });

  it('does not let a repeated stale defer rewind a later failed retrieval', async () => {
    const first = item('defer-first');
    const second = item('fail-second', 'DBMS');
    await db.learning_items.bulkPut([
      { ...first, sync_status: 'synced' },
      { ...second, sync_status: 'synced' }
    ]);
    const { session } = await startRecoverySession({
      userId: USER,
      mode: 'all',
      candidates: [
        { item: first, estimatedSeconds: 90 },
        { item: second, estimatedSeconds: 90 }
      ],
      today: '2026-08-31',
      startedAt: '2026-08-31T13:00:00.000Z'
    });
    const deferred = await deferRecoveryItem({
      session,
      item: first,
      today: '2026-08-31',
      timeZone: TIME_ZONE,
      reason: 'Need paper and pen',
      occurredAt: '2026-08-31T13:00:10.000Z'
    });
    const failed = await recordRecoveryRetrieval({
      session: deferred.session,
      item: second,
      evidence: {
        correct: false,
        timeSpentSec: 90,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 0
      },
      answer: 'C',
      timeZone: TIME_ZONE,
      today: '2026-08-31',
      occurredAt: '2026-08-31T13:01:40.000Z'
    });
    expect(failed.session).toMatchObject({ status: 'completed', current_index: 2 });

    const repeatedDefer = await deferRecoveryItem({
      session,
      item: first,
      today: '2026-08-31',
      timeZone: TIME_ZONE,
      reason: 'Delayed duplicate click',
      occurredAt: '2026-08-31T13:03:00.000Z'
    });
    expect(repeatedDefer.session).toMatchObject({ status: 'completed', current_index: 2 });
    expect(repeatedDefer.item).toMatchObject({
      stage: 'D3',
      lapse_count: 0,
      scheduled_date: '2026-09-01'
    });
    expect(await db.learning_items.get(second.id)).toMatchObject({
      lapse_count: 1,
      last_grade: 'again',
      scheduled_date: '2026-09-03'
    });
    expect((await db.learning_events.toArray()).map((event) => event.event_type).sort()).toEqual([
      'deferred',
      'retrieval_again'
    ]);
  });
});
