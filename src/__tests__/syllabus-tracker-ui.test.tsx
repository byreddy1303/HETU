import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import SyllabusTracker from '@/pages/SyllabusTracker';
import { resetTopicProgressMemory, topicProgressId, useTopicProgressStore } from '@/stores/topic-progress';
import { SUBTOPICS_BY_SUBJECT } from '@/lib/subtopics';
import { buildBatchTopicEvidence } from '@/lib/topic-evidence';
import { runtimeStorage } from '@/lib/runtime-storage';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userId: USER,
    status: 'signed_in',
    sandbox: true,
    profile: { timezone: 'Asia/Kolkata', exam_date: '2027-02-07' }
  })
}));

vi.mock('@/lib/topic-evidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/topic-evidence')>();
  return { ...actual, buildBatchTopicEvidence: vi.fn(actual.buildBatchTopicEvidence) };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('SyllabusTracker UI and SyllabusOrbit chart', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    runtimeStorage.clear();
    resetTopicProgressMemory();
    await Promise.all([
      db.topic_progress.clear(),
      db.questions.clear(),
      db.pyq_attempts.clear(),
      db.reattempts.clear()
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the radial orbit chart with segments and center readout', async () => {
    const { container } = render(
      <MemoryRouter>
        <SyllabusTracker />
      </MemoryRouter>
    );

    // Page renders with header
    expect(screen.getByText('Syllabus tracker')).toBeInTheDocument();
    expect(screen.getByText('GATE CSE scope')).toBeInTheDocument();

    // The orbit chart wrapper is present with an aria-label
    const orbitWrapper = screen.getByLabelText(/of syllabus complete/i);
    expect(orbitWrapper).toBeInTheDocument();

    // SVG contains 12 interactive segment groups (one per subject)
    const svg = container.querySelector('svg[viewBox="0 0 200 200"]');
    expect(svg).toBeTruthy();
    const segmentGroups = svg!.querySelectorAll('g[role="button"]');
    expect(segmentGroups.length).toBe(12);

    // Each segment has a background arc path
    for (const g of segmentGroups) {
      expect(g.querySelector('path')).toBeTruthy();
    }

    // Center readout shows overall percent and topic count
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('topics studied')).toBeInTheDocument();

    // Default footer text
    expect(screen.getByText('12 subjects · Click to jump')).toBeInTheDocument();

    // Hovering a segment updates the center readout and footer
    const algoSegment = svg!.querySelector(
      'g[aria-label^="Algorithms:"]'
    ) as Element;
    expect(algoSegment).toBeTruthy();

    fireEvent.mouseEnter(algoSegment);
    // The hovered subject name appears in the center readout (title attr)
    const orbitCenter = orbitWrapper.querySelector('[title="Algorithms"]');
    expect(orbitCenter).toBeTruthy();
    expect(screen.getByText('Click to view Algorithms')).toBeInTheDocument();

    // Leaving returns to default
    fireEvent.mouseLeave(algoSegment);
    expect(screen.getByText('12 subjects · Click to jump')).toBeInTheDocument();
  });

  it('allows clicking a topic checkbox without freezing or error', async () => {
    render(
      <MemoryRouter>
        <SyllabusTracker />
      </MemoryRouter>
    );

    // Discrete Mathematics starts open by default when no nextTopic
    expect(screen.getByText('Discrete Mathematics')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    const firstCheckbox = checkboxes[0];
    expect(firstCheckbox).not.toBeChecked();

    fireEvent.click(firstCheckbox);

    expect(firstCheckbox).toBeChecked();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
  });

  it('updates five checkboxes and counts immediately while saves are slow, without recalculating practice', async () => {
    const gate = deferred();
    const put = db.topic_progress.put.bind(db.topic_progress);
    vi.spyOn(db.topic_progress, 'put').mockImplementation(async (row) => {
      await gate.promise;
      await put(row);
    });
    render(<MemoryRouter><SyllabusTracker /></MemoryRouter>);
    await waitFor(() => expect(buildBatchTopicEvidence).toHaveBeenCalled());
    const evidenceCalls = vi.mocked(buildBatchTopicEvidence).mock.calls.length;
    const checkboxes = screen.getAllByRole('checkbox').slice(0, 5);

    for (const checkbox of checkboxes) {
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    }
    expect(screen.getByRole('status')).toHaveTextContent('Saving 5 changes');
    expect(screen.getByLabelText(/of syllabus complete/i)).toHaveTextContent(/^\d+%topics studied5\//);
    expect(buildBatchTopicEvidence).toHaveBeenCalledTimes(evidenceCalls);

    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
    expect(await db.topic_progress.count()).toBe(5);
    expect(buildBatchTopicEvidence).toHaveBeenCalledTimes(evidenceCalls);
  });

  it('unticks a saved topic instantly and keeps it unticked while deletion is pending', async () => {
    const topic = SUBTOPICS_BY_SUBJECT['Discrete Mathematics'][0].value;
    await useTopicProgressStore.getState().setCompleted(USER, topicProgressId('Discrete Mathematics', topic), true);
    const gate = deferred();
    const remove = db.topic_progress.delete.bind(db.topic_progress);
    vi.spyOn(db.topic_progress, 'delete').mockImplementation(async (id) => {
      await gate.promise;
      await remove(id);
    });
    render(<MemoryRouter><SyllabusTracker /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Saving 1 change');
    expect(await db.topic_progress.count()).toBe(1);
    expect(checkbox).not.toBeChecked();

    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
    expect(checkbox).not.toBeChecked();
    expect(await db.topic_progress.count()).toBe(0);
  });

  it('restores confirmed progress and exposes a failed save without disabling the checklist', async () => {
    const topic = SUBTOPICS_BY_SUBJECT['Discrete Mathematics'][0].value;
    await useTopicProgressStore.getState().setCompleted(USER, topicProgressId('Discrete Mathematics', topic), true);
    vi.spyOn(db.topic_progress, 'delete').mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<MemoryRouter><SyllabusTracker /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
    const checkbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not confirm a save'));
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved to database'));
  });
});
