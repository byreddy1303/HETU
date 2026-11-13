import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillDiagnosisDraft } from '@/hooks/useSkillDiagnosisDraft';
import { useStudyDay } from '@/hooks/useStudyDay';
import { saveDiagnosis, type SkillDiagnosis } from '@/lib/skill-coach';
import { apiRequest } from '@/lib/fastapi-client';
import { newMemoryEntry } from '@/lib/study-memory';

vi.mock('@/lib/fastapi-client', async (original) => ({
  ...(await original<typeof import('@/lib/fastapi-client')>()),
  apiRequest: vi.fn()
}));
vi.mock('@/lib/skill-coach', () => ({ saveDiagnosis: vi.fn() }));
const initial = {
  entry: {
    ...newMemoryEntry('reflection', 'diagnosis', 'Check', {
      state: 'draft',
      data: { answers: {} }
    }),
    version: 1
  },
  skill: { id: 'cache' }
} as SkillDiagnosis;

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('persistent skill drafts', () => {
  it('serializes newer typing and submission behind the acknowledged save', async () => {
    vi.useFakeTimers();
    let acknowledge!: (value: SkillDiagnosis) => void;
    vi.mocked(saveDiagnosis)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            acknowledge = resolve;
          })
      )
      .mockImplementation(async (entry, value) => ({
        ...initial,
        entry: {
          ...entry,
          version: entry.version + 1,
          content: value.reasoning,
          state: value.submit ? 'completed' : 'draft'
        }
      }));
    const { result } = renderHook(() => useSkillDiagnosisDraft(initial));
    act(() => result.current.update({ reasoning: 'first idea' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => result.current.update({ reasoning: 'revised idea', answers: { a: 1, b: 0 } }));
    let submission!: Promise<SkillDiagnosis>;
    act(() => {
      submission = result.current.save(true);
    });
    expect(saveDiagnosis).toHaveBeenCalledTimes(1);
    await act(async () => {
      acknowledge({ ...initial, entry: { ...initial.entry, version: 2, content: 'first idea' } });
      await submission;
    });
    expect(saveDiagnosis).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 2 }),
      expect.objectContaining({ reasoning: 'revised idea', submit: true })
    );
    expect(result.current.result.entry.state).toBe('completed');
    expect(result.current.dirty).toBe(false);
  });

  it('retains responses after a failed save and permits an explicit retry', async () => {
    vi.mocked(saveDiagnosis)
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValue({
        ...initial,
        entry: { ...initial.entry, version: 2, content: 'keep this' }
      });
    const { result } = renderHook(() => useSkillDiagnosisDraft(initial));
    act(() => result.current.update({ reasoning: 'keep this' }));
    await act(async () => {
      await expect(result.current.save(false)).rejects.toThrow('Connection lost');
    });
    expect(result.current.draft.reasoning).toBe('keep this');
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.save(false);
    });
    expect(result.current.error).toBe('');
    expect(result.current.dirty).toBe(false);
  });

  it('flushes unsaved work when navigating away before the debounce', async () => {
    vi.mocked(saveDiagnosis).mockResolvedValue(initial);
    const { result, unmount } = renderHook(() => useSkillDiagnosisDraft(initial));
    act(() => result.current.update({ reasoning: 'last sentence' }));
    unmount();
    await act(async () => {});
    expect(saveDiagnosis).toHaveBeenCalledWith(
      initial.entry,
      expect.objectContaining({ reasoning: 'last sentence', submit: false })
    );
  });
});

describe('durable daily choices', () => {
  it('preserves the acknowledged budget when a save conflicts and reloads the saved value', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        version: 3,
        budget: 45,
        parked_action_ids: ['resume-practice:saved']
      })
      .mockRejectedValueOnce(new Error('Version conflict'))
      .mockResolvedValueOnce({ version: 4, budget: 60, parked_action_ids: [] });
    const { result } = renderHook(() => useStudyDay('owner', '2026-11-13'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.save({ budget: 10 });
    });
    expect(result.current.value.budget).toBe(45);
    expect(result.current.error).toBe('Version conflict');
    expect(result.current.saving).toBe(false);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.value.budget).toBe(60));
    expect(result.current.error).toBe('');
  });

  it('does not let a late response from another day overwrite the current day', async () => {
    let oldResponse!: (value: unknown) => void;
    vi.mocked(apiRequest)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldResponse = resolve;
          })
      )
      .mockResolvedValueOnce({ version: 0, budget: 20, parked_action_ids: [] });
    const { result, rerender } = renderHook(({ day }) => useStudyDay('owner', day), {
      initialProps: { day: '2026-11-13' }
    });
    rerender({ day: '2026-11-14' });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      oldResponse({ version: 5, budget: 60, parked_action_ids: [] });
    });
    expect(result.current.value.budget).toBe(20);
  });
});
