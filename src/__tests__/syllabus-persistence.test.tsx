import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyllabusTracker from '@/pages/SyllabusTracker';
import { db } from '@/lib/db';
import { topicProgressRowId, useTopicProgressStore } from '@/stores/topic-progress';

const USER = '00000000-0000-4000-8000-000000000001';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: USER, profile: null })
}));

vi.mock('@/lib/native', () => ({ haptic: vi.fn() }));

describe('syllabus tracker persistence', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    useTopicProgressStore.setState({ byUser: {} });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows progress that lands after the initial post-login read', async () => {
    render(<SyllabusTracker />);

    const topic = screen.getByRole('checkbox', { name: /Propositional Logic/i });
    expect(topic).not.toBeChecked();

    await db.topic_progress.put({
      id: topicProgressRowId(USER, 'Discrete Mathematics', 'Propositional Logic'),
      user_id: USER,
      subject: 'Discrete Mathematics',
      topic: 'Propositional Logic',
      completed_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:00:00.000Z',
      sync_status: 'synced'
    });

    await waitFor(() => expect(topic).toBeChecked());
  });
});
