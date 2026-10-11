import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyServerRows, clearLocalData, db } from '@/lib/db';
import { answerApi, hintApi, startSessionApi } from '@/lib/recovery-api';
import { recordRecoveryRetrieval } from '@/lib/recovery-session';
import type { LearningItemRow, RecoverySessionRow } from '@/types';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fastapi-client', async (load) => ({ ...await load<typeof import('@/lib/fastapi-client')>(), apiRequest }));
vi.mock('@/lib/api-client', async (load) => ({ ...await load<typeof import('@/lib/api-client')>(), apiConfigured: true }));

const item: LearningItemRow = {
  id: 'canonical-item', user_id: 'one', version: 1, source_kind: 'pyq', question_uid: 'q', source_question_id: null,
  content_fingerprint: null, subject: 'Algorithms', topic: 'Sorting', origin_pyq_attempt_id: 'original', latest_pyq_attempt_id: 'original',
  analysis_state: 'pending', recovery_state: 'active', stage: 'D3', scheduled_date: '2026-10-10', reason_flags: ['wrong'],
  lapse_count: 0, successful_retrieval_count: 0, last_grade: null, last_interval_days: null, successful_due_d30_at: null,
  transfer_passed_at: null, mastered_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z'
};
const session: RecoverySessionRow = {
  id: 'session', user_id: 'one', version: 1, status: 'active', mode: 'minutes-10', selection_seed: 'seed', item_ids: [item.id],
  current_index: 0, queue_snapshot: [], draft_answer: null, elapsed_by_item_ms: {}, deferred_item_ids: [], hinted_item_ids: [],
  current_item_started_at: '2026-10-10T00:00:00Z', started_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z', completed_at: null
};
const evidence = { correct: true, timeSpentSec: 40, targetTimeSec: 90, confidence: 'high' as const, hintUsed: false, priorSuccessfulRetrievals: 0 };

beforeEach(async () => {
  apiRequest.mockReset();
  await clearLocalData();
});

describe('shared Python recovery boundary', () => {
  it('uses the server selection and grade and applies committed rows without compatibility writes', async () => {
    const hinted = { ...session, version: 2, hinted_item_ids: [item.id] };
    const recovered = { ...item, version: 2, stage: 'D3' as const, last_grade: 'hard' as const, scheduled_date: '2026-10-13' };
    const completed = { ...hinted, version: 3, status: 'completed' as const, current_index: 1 };
    apiRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/recovery/sessions') return { session, sprint: { selected: [{ item }], estimatedSeconds: 90 } };
      if (path.endsWith('/hint')) return { session: hinted };
      if (path.endsWith('/answers')) return { session: completed, item: recovered, grade: { grade: 'hard', reasons: ['opening cue revealed'] }, explanation: 'Hint recorded by Python.' };
      throw new Error(`Unexpected API path ${path}`);
    });
    const started = await startSessionApi({ userId: 'one', mode: 'minutes-10', itemIds: [item.id], key: 'same-key' });
    expect(started.sprint.estimatedSeconds).toBe(90);
    await hintApi(started.session, item);
    const result = await recordRecoveryRetrieval({ session: hinted, item, evidence, answer: 'B', timeZone: 'Asia/Kolkata', today: '2026-10-10' });
    expect(result.grade.grade).toBe('hard');
    expect((await db.learning_items.get(item.id))?.last_grade).toBe('hard');
    expect((await db.recovery_sessions.get(session.id))?.current_index).toBe(1);
    const call = apiRequest.mock.calls.find(([path]) => path.endsWith('/answers'))!;
    expect(JSON.parse(call[1].body)).toMatchObject({ expected_version: 2, expected_index: 0, answer: 'B' });
    expect(apiRequest.mock.calls.every(([path]) => !path.includes('/compat/'))).toBe(true);
  });

  it('retains the original duration and key after an uncertain response', async () => {
    const isolated = { ...session, id: 'uncertain-session' };
    apiRequest.mockRejectedValueOnce(new Error('Connection interrupted'));
    await expect(answerApi({ session: isolated, item, evidence, answer: 'B' })).rejects.toThrow('Connection interrupted');
    apiRequest.mockResolvedValueOnce({ session: { ...isolated, version: 2, status: 'completed', current_index: 1 }, item: { ...item, version: 2 }, grade: { grade: 'good', reasons: [] }, explanation: 'Saved' });
    await answerApi({ session: isolated, item, evidence: { ...evidence, timeSpentSec: 80 }, answer: 'B' });
    const first = JSON.parse(apiRequest.mock.calls[0][1].body);
    const retry = JSON.parse(apiRequest.mock.calls[1][1].body);
    expect(retry).toEqual(first);
    expect(retry.duration_ms).toBe(40000);
  });

  it('never lets a delayed receipt overwrite a newer checkpoint or another account', async () => {
    applyServerRows('one', [{ name: 'recovery_sessions', rows: [{ ...session, version: 4, current_index: 1, status: 'completed' }] }]);
    applyServerRows('one', [{ name: 'recovery_sessions', rows: [session] }]);
    expect((await db.recovery_sessions.get(session.id))?.version).toBe(4);
    expect(() => applyServerRows('two', [{ name: 'learning_items', rows: [item] }])).toThrow('another account');
    expect(await db.learning_items.get(item.id)).toBeUndefined();
  });
});
