// With Postgres as the only durable store, the durability barrier is a
// contract that sign-out never needs to wait on: writes are already committed
// to the database. These tests pin that behavior.
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalCacheSafely, flushAllDurableState } from '@/lib/durability';
import { clearLocalData, db } from '@/lib/db';

describe('online-only durability contract', () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it('reports that all durable state is flushed without touching the cache', async () => {
    await db.questions.put({
      id: 'q-1',
      user_id: 'user-1',
      session_id: null,
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
      created_at: new Date().toISOString(),
      sync_status: 'synced'
    });

    const result = await flushAllDurableState('user-1');
    expect(result).toEqual({ ok: true });
    // RAM cache (and therefore the UI) is untouched by the flush check.
    expect(await db.questions.count()).toBe(1);
  });

  it('clearing the device cache drops RAM without blaming the database', async () => {
    await db.questions.bulkPut([
      {
        id: 'q-1',
        user_id: 'user-1',
        session_id: null,
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
        created_at: new Date().toISOString(),
        sync_status: 'synced'
      }
    ]);

    const result = await clearLocalCacheSafely('user-1');
    expect(result).toEqual({ ok: true });
    expect(await db.questions.count()).toBe(0);
  });
});