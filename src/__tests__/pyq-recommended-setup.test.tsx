import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PyqRecommendedSetup, {
  PyqRecommendationOptions
} from '@/components/pyq/PyqRecommendedSetup';
import {
  PYQ_RECOMMENDATION_PRESETS,
  type RecommendedPyqSelection
} from '@/lib/pyq-recommended-selection';
import type { PyqQuestion } from '@/lib/pyq';

const question: PyqQuestion = {
  id: 'gate-2025-algorithms-q7',
  bookSlug: 'gate-cse',
  year: 2025,
  set: 1,
  number: '7',
  paperLabel: 'GATE CSE 2025 Set 1',
  subject: 'Algorithms',
  subjectSlug: 'algorithms',
  topic: 'Graphs',
  topicSlug: 'graphs',
  subtopics: [],
  marks: 2,
  type: 'MCQ',
  answer: 'A',
  tolerance: null,
  answerStatus: 'available',
  html: '<p>Question</p>',
  sourceUrl: 'https://example.test/question',
  answerSource: null
};

const selection: RecommendedPyqSelection = {
  preset: PYQ_RECOMMENDATION_PRESETS.repair,
  cohorts: ['wrong', 'due'],
  questions: [question],
  questionUids: [question.id],
  reasonsByQuestionUid: { [question.id]: ['all', 'wrong', 'high-confidence-wrong', 'due'] },
  priorityReasonsByQuestionUid: {
    [question.id]: ['2 recovery lapses', 'weekly focus']
  },
  preflight: {
    exactMatchCount: 8,
    requestedCount: 10,
    requestedAll: false,
    selectableCount: 7,
    selectedCount: 1,
    estimatedMinutes: 3,
    estimatedMarks: 2,
    knownMarksCount: 1,
    matchedHistory: { unseen: 2, seen: 6 },
    selectedHistory: { unseen: 0, seen: 1 },
    matchedCohorts: { all: 8, wrong: 5, due: 3 },
    selectedCohorts: { all: 1, wrong: 1, due: 1 },
    distribution: {
      subject: { algorithms: 1 },
      topic: { graphs: 1 },
      year: { '2025': 1 },
      marks: { '2': 1 }
    },
    selectableDistribution: {
      subject: { algorithms: 7 },
      topic: { graphs: 7 },
      year: { '2025': 7 },
      marks: { '2': 7 }
    },
    reserve: {
      protected: true,
      sealedPaperCount: 1,
      reservedQuestionCount: 65,
      matchedReservedCount: 1,
      excludedCount: 1,
      allowedCount: 0
    },
    shortfall: 9,
    missingExactUidCount: 0,
    reproducibilitySeed: 'repair-proof',
    reasonChips: [
      { code: 'preset:repair', label: 'Repair preset' },
      { code: 'cohort:wrong', label: 'Wrong last time', matchedCount: 5, selectedCount: 1 },
      { code: 'shortfall', label: '9 questions short', matchedCount: 9 }
    ]
  }
};

describe('recommended PYQ setup', () => {
  it('keeps everyday choices short and reports the actual set size without exposing answers', async () => {
    const user = userEvent.setup();
    const onPreset = vi.fn();
    render(
      <PyqRecommendedSetup
        preset="repair"
        selection={selection}
        loading={false}
        error={null}
        onPreset={onPreset}
      />
    );
    expect(
      screen.getByRole('group', { name: 'Practice focus' }).querySelectorAll('button')
    ).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Review mistakes' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 question · About 3 min');
    expect(
      screen.getByText(
        'Only 1 of the requested 10 questions match. Widen your filters for a larger set.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Matched')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reproducibility seed')).not.toBeInTheDocument();
    await user.click(screen.getByText('Why this set?'));
    expect(screen.getByText('Algorithms · 2025 · Q7')).toBeInTheDocument();
    expect(screen.getByText(/weekly focus/)).toBeInTheDocument();
    expect(screen.queryByText(question.id)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New questions' }));
    expect(onPreset).toHaveBeenCalledWith('learn');
  });

  it('hides stale preview counts while preparing another focus and keeps failures visible', () => {
    const props = {
      preset: 'learn' as const,
      selection,
      loading: true,
      error: null,
      onPreset: vi.fn()
    };
    const { rerender } = render(<PyqRecommendedSetup {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your set');
    expect(screen.queryByText(/1 question ·/)).not.toBeInTheDocument();
    rerender(
      <PyqRecommendedSetup {...props} loading={false} error="The question bank is unavailable." />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The question bank is unavailable.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps specialised focuses and named setups available in advanced settings', async () => {
    const user = userEvent.setup();
    const onPreset = vi.fn();
    const onSavePrescription = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <PyqRecommendationOptions
        preset="speed"
        onPreset={onPreset}
        onRegenerate={onRegenerate}
        savedPrescriptions={[]}
        onSavePrescription={onSavePrescription}
        onLoadPrescription={vi.fn()}
        onDeletePrescription={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Specialised focus' })).toHaveValue('speed');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Specialised focus' }),
      'transfer'
    );
    expect(onPreset).toHaveBeenCalledWith('transfer');
    await user.click(screen.getByRole('button', { name: 'Refresh question mix' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    await user.type(
      screen.getByRole('textbox', { name: 'Save this setup' }),
      '  Weekly repair  {Enter}'
    );
    expect(onSavePrescription).toHaveBeenCalledWith('Weekly repair');
    expect(screen.getByRole('textbox', { name: 'Save this setup' })).toHaveValue('');
  });
});
