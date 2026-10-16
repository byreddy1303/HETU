import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/fastapi-client';
import { buildExamReviewQueue, exportMemory, memoryEntryId, memoryPerformanceStats, memoryWritePayload, newMemoryEntry, queueMemorySave } from '@/lib/study-memory';
import { addMemoryRepairToPlanner, patternRepairDraft, recurringReflectionGroup, selectMemoryQuestions } from '@/lib/study-memory-practice';
import { loadCloudDayPlan, queuePlannerCloudWrite } from '@/lib/planner-cloud';
import { emptyDayPlan } from '@/lib/planner-storage';
import { buildPlannerEvidenceCandidates } from '@/lib/planner-evidence-candidates';
import type { PyqAttemptRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';

vi.mock('@/lib/fastapi-client', async (original) => ({ ...await original<typeof import('@/lib/fastapi-client')>(), apiRequest: vi.fn() }));
vi.mock('@/lib/planner-cloud', async (original) => ({ ...await original<typeof import('@/lib/planner-cloud')>(), loadCloudDayPlan: vi.fn(), queuePlannerCloudWrite: vi.fn() }));

const attempt = (id: string, extra: Partial<PyqAttemptRow> = {}): PyqAttemptRow => ({
  id, user_id: 'learner', pyq_session_id: 'exam', question_uid: `q-${id}`, subject: 'Algorithms', year: 2024,
  attempt_number: 1, selected_answer: 'A', correct_answer: 'B', capture_version: 3, question_snapshot: null,
  answer_status: 'available', screenshot_url: null, mark_decision: 'MARK', mark_correct: false,
  confidence: 'high', question_started_at: null, time_spent_ms: 60000, time_spent_sec: 60, bank_version: 'bank', attempted_at: `2026-10-15T10:00:00Z`, ...extra
});
const question = (id: string, extra: Partial<PyqQuestion> = {}): PyqQuestion => ({
  id, subject: 'Algorithms', subjectSlug: 'algorithms', topic: 'Shortest Paths', topicSlug: 'shortest-paths', year: 2024, set: 1,
  number: '1', paperLabel: 'Paper', subtopics: [], marks: 2, type: 'MCQ', answer: 'B', tolerance: null,
  answerStatus: 'available', html: '<p>A graph question</p>', sourceUrl: 'https://example.com/question', answerSource: null, ...extra
});

describe('study memory planning and evidence', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('uses stable identities and keeps every question in the review queue', () => {
    expect(memoryEntryId('reflection', 'attempt')).toBe(memoryEntryId('reflection', 'attempt'));
    const wrong = attempt('wrong');
    const secure = attempt('secure', { mark_correct: true, correct_answer: 'A', time_spent_sec: 10 });
    const skipped = attempt('skip', { selected_answer: null, mark_decision: 'SKIP', mark_correct: null });
    const queue = buildExamReviewQueue([secure, wrong, skipped, wrong]);
    expect(queue.map((row) => row.attempt.id)).toEqual(['wrong', 'skip', 'secure']);
    expect(queue[0].reasons[0]).toContain('investigate');
    expect(queue[2].reasons[0]).toContain('not yet assessed');
  });

  it('does not turn unknown conditions or familiar questions into independent fresh evidence', () => {
    const stats = memoryPerformanceStats([
      attempt('fresh', { mark_correct: true }), attempt('unknown', { mark_correct: true }),
      attempt('repeat', { mark_correct: true, attempt_number: 2 }), attempt('hint', { mark_correct: true })
    ], { fresh: { prior_exposure: false, hint_used: false, solution_seen: false }, hint: { hint_used: true } });
    expect(stats.independentFresh).toEqual({ attempted: 1, correct: 1 });
    expect(stats.repeated.attempted).toBe(1);
    expect(stats.assisted.attempted).toBe(1);
    expect(stats.unknownConditions).toBe(1);
  });

  it('selects fresh, exact-topic, gradable questions without exposing sealed papers', () => {
    const entry = newMemoryEntry('repair', 'repair', 'Fresh check', { subject: 'Algorithms', topic: 'Shortest Paths', data: { activity: 'transfer', requested_count: 5, allow_seen: true } });
    const result = selectMemoryQuestions(entry, [question('fresh'), question('seen'), question('sealed'), question('other', { topic: 'Sorting' }), question('ambiguous', { answerStatus: 'ambiguous' })], [attempt('old', { question_uid: 'seen' })], new Set(['sealed']));
    expect(result.map((row) => row.id)).toEqual(['fresh']);
  });

  it('counts distinct reviewed attempts and uses the learner calendar for tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'));
    try {
      const base = newMemoryEntry('reflection', 'r1', 'Thinking', { user_id: 'learner', subject: 'Algorithms', topic: 'Shortest Paths', state: 'completed', attempt_id: 'a1', data: { failure_stage: 'recognition', mechanism: 'Confused applicability conditions' } });
      const group = recurringReflectionGroup(base, [base, { ...base, id: 'duplicate' }, { ...base, id: 'r2', attempt_id: 'a2' }, { ...base, id: 'r3', attempt_id: 'a3' }]);
      expect(group).toHaveLength(3);
      const repair = patternRepairDraft(base, group, 'Asia/Kolkata');
      expect(repair.data.due_date).toBe('2026-10-17');
      expect(repair.data.duration_min).toBe(20);
      expect(recurringReflectionGroup({ ...base, data: { ...base.data, failure_stage: 'uncertain' } }, group)).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('adds one explainable due repair candidate without duplicating existing commitments', () => {
    const repair = newMemoryEntry('repair', 'repair-a', 'Graph repair', { state: 'open', data: { due_date: '2026-10-15', target: 'Recognise applicability', duration_min: 20, reason: 'Three reviewed attempts', success_criteria: 'Fresh independent application' } });
    const candidates = buildPlannerEvidenceCandidates({ asOfDate: '2026-10-15', studyMemoryEntries: [repair, repair] });
    expect(candidates.filter((row) => row.id === 'memory-repair:repair-a')).toHaveLength(1);
    expect(candidates[0].reason).toContain('Three reviewed attempts');
    expect(buildPlannerEvidenceCandidates({ asOfDate: '2026-10-15', studyMemoryEntries: [repair], existingSessions: [{ id: 'memory-repair:repair-a', subject: 'Algorithms', durationMin: 20, mode: 'Problem Solving', priority: 'P2 High', target: 'Existing commitment' }] }).filter((row) => row.id === 'memory-repair:repair-a')).toHaveLength(1);
  });

  it('keeps the durable day plan when scheduling a repair and retries without duplicate blocks', async () => {
    const date = '2026-10-20';
    const plan = { ...emptyDayPlan(date), sessions: [{ id: 'existing', subject: 'Algorithms', durationMin: 30, mode: 'Problem Solving' as const, priority: 'P1 Critical' as const, target: 'Existing commitment' }] };
    vi.mocked(loadCloudDayPlan).mockResolvedValue({ plan, tombstone: null, error: null });
    vi.mocked(queuePlannerCloudWrite).mockResolvedValue(null);
    const repair = newMemoryEntry('repair', 'durable', 'Repair', { data: { due_date: date } });
    await addMemoryRepairToPlanner(repair, 'learner', 'Asia/Kolkata');
    const written = vi.mocked(queuePlannerCloudWrite).mock.calls.at(-1)![1];
    expect(written.sessions.map((session) => session.id)).toEqual(['existing', 'memory-repair:durable']);
    vi.mocked(loadCloudDayPlan).mockResolvedValue({ plan: written, tombstone: null, error: null });
    await addMemoryRepairToPlanner(repair, 'learner', 'Asia/Kolkata');
    expect(vi.mocked(queuePlannerCloudWrite).mock.calls.at(-1)![1].sessions).toHaveLength(2);
    vi.mocked(loadCloudDayPlan).mockResolvedValue({ plan: null, tombstone: null, error: 'Database unavailable' });
    await expect(addMemoryRepairToPlanner(repair, 'learner', 'Asia/Kolkata')).rejects.toThrow('Database unavailable');
  });

  it('offers a due concept recall without claiming the concept is mastered', () => {
    const concept = newMemoryEntry('concept', 'concept', 'Graph conditions', { data: { next_review_on: '2026-10-15' } });
    const candidates = buildPlannerEvidenceCandidates({ asOfDate: '2026-10-15', studyMemoryEntries: [concept] });
    expect(candidates[0]).toMatchObject({ id: 'memory-concept:concept', estimatedMin: 5, href: '/memory/concept' });
    expect(candidates[0].reason).toContain('before showing guidance');
    expect(buildPlannerEvidenceCandidates({ asOfDate: '2026-10-14', studyMemoryEntries: [concept] })).toEqual([]);
  });

  it('exports beyond the first page using the server-supported page size', async () => {
    const first = Array.from({ length: 100 }, (_, index) => newMemoryEntry('concept', String(index), `Concept ${index}`));
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: first, total: 101, has_more: true }).mockResolvedValueOnce({ items: [newMemoryEntry('concept', 'last', 'Last')], total: 101, has_more: false });
    expect(await exportMemory()).toHaveLength(101);
    expect(vi.mocked(apiRequest).mock.calls[0][0]).toContain('limit=100');
    expect(vi.mocked(apiRequest).mock.calls[1][0]).toContain('offset=100');
  });

  it('serialises concurrent draft saves with acknowledged versions and excludes ownership fields', async () => {
    let version = 0;
    vi.mocked(apiRequest).mockImplementation(async (_path, options) => {
      if (options?.method !== 'PUT') return { items: [], total: 0, has_more: false };
      const payload = JSON.parse(String(options?.body));
      expect(payload.expected_version).toBe(version);
      version++;
      return { ...newMemoryEntry('reflection', 'serialize', 'Thinking'), ...payload, version };
    });
    const entry = newMemoryEntry('reflection', 'serialize', 'Thinking', { user_id: 'learner' });
    const writes = [queueMemorySave({ ...entry, content: 'First' }), queueMemorySave({ ...entry, content: 'Second' })];
    expect((await Promise.all(writes)).map((row) => row.version)).toEqual([1, 2]);
    expect(memoryWritePayload(entry)).not.toHaveProperty('user_id');
  });
});
