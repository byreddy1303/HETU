import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiRequest } from '@/lib/fastapi-client';
import ThinkingReviewEditor from '@/components/memory/ThinkingReviewEditor';
import type { StudyMemoryEntry } from '@/lib/study-memory';
import type { PyqAttemptRow } from '@/types';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'learner', profile: { timezone: 'Asia/Kolkata' } }) }));
vi.mock('@/lib/fastapi-client', async (original) => ({ ...await original<typeof import('@/lib/fastapi-client')>(), apiRequest: vi.fn() }));
const records = new Map<string, StudyMemoryEntry>();
const attempt: PyqAttemptRow = { id: 'a1', user_id: 'learner', pyq_session_id: 'exam', question_uid: 'q1', subject: 'Algorithms', year: 2024,
  attempt_number: 1, selected_answer: 'A', correct_answer: 'B', capture_version: 3, question_snapshot: null, answer_status: 'available', screenshot_url: null,
  mark_decision: 'MARK', mark_correct: false, confidence: 'high', question_started_at: null, time_spent_ms: 60000, time_spent_sec: 60, bank_version: 'bank', attempted_at: '2026-10-15T10:00:00Z' };

function mount(onSaved = vi.fn()) { return render(<MemoryRouter><ThinkingReviewEditor attempt={attempt} revealState="before" onSaved={onSaved} /></MemoryRouter>); }

describe('thinking review without a model', () => {
  beforeEach(() => {
    cleanup(); records.clear();
    vi.mocked(apiRequest).mockReset().mockImplementation(async (path, options) => {
      const id = String(path).split('/').at(-1)!;
      if (options?.method === 'PUT') {
        const payload = JSON.parse(String(options.body));
        const entry = { ...payload, id, user_id: 'learner', version: (records.get(id)?.version || 0) + 1, created_at: '2026-10-15T10:00:00Z', updated_at: '2026-10-15T10:00:01Z' } as StudyMemoryEntry;
        records.set(id, entry); return entry;
      }
      const found = records.get(id);
      if (!found) throw Object.assign(new Error('Memory entry not found'), { status: 404 });
      return { entry: found, history: [found] };
    });
  });

  it('saves reasoning before any diagnosis and restores it on reopen', async () => {
    const view = mount();
    const input = screen.getByLabelText('What were you thinking?');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'I treated a necessary condition as sufficient.' } });
    await waitFor(() => expect([...records.values()][0]?.content).toContain('necessary condition'));
    view.unmount(); mount();
    await waitFor(() => expect(screen.getByLabelText('What were you thinking?')).toHaveValue('I treated a necessary condition as sufficient.'));
    expect([...records.values()][0].data.reveal_state).toBe('before');
    expect([...records.values()][0].data.failure_stage).toBe('uncertain');
    expect(vi.mocked(apiRequest).mock.calls.every(([path]) => String(path).startsWith('/v1/study-memory'))).toBe(true);
  });

  it('preserves the actual diagnostic response and its self-assessed status', async () => {
    mount();
    await waitFor(() => expect(screen.getByLabelText('What were you thinking?')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Your response before feedback'), { target: { value: 'A disconnected graph with two components.' } });
    fireEvent.change(screen.getByLabelText('Your assessment'), { target: { value: 'partial' } });
    fireEvent.click(screen.getByLabelText('I used a hint or saw guidance'));
    await waitFor(() => {
      const saved = [...records.values()][0];
      expect(saved.data.probe_answer).toContain('two components');
      expect(saved.data.probe_evaluation).toBe('partial');
      expect(saved.data.probe_hint_used).toBe(true);
    });
  });

  it('defers a real saved record instead of queuing an empty identifier', async () => {
    const onSaved = vi.fn(); mount(onSaved);
    await waitFor(() => expect(screen.getByLabelText('What were you thinking?')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('What were you thinking?'), { target: { value: 'I need to investigate the boundary case.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('deferred'));
    expect([...records.values()][0].content).toContain('boundary case');
    expect([...records.values()][0].state).toBe('deferred');
  });
});
