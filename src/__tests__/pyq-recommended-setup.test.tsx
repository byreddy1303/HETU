import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PyqRecommendedSetup from '@/components/pyq/PyqRecommendedSetup';
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
  it('shows complete preflight evidence and exact UID reasons', async () => {
    const user = userEvent.setup();
    render(
      <PyqRecommendedSetup
        preset="repair"
        selection={selection}
        loading={false}
        error={null}
        seed="repair-proof"
        savedPrescriptions={[]}
        onPreset={vi.fn()}
        onSeed={vi.fn()}
        onRegenerate={vi.fn()}
        onSavePrescription={vi.fn()}
        onLoadPrescription={vi.fn()}
        onDeletePrescription={vi.fn()}
      />
    );

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Repair preset')).toBeInTheDocument();
    expect(screen.getByText(/Requested set is 9 questions short/i)).toBeInTheDocument();
    await user.click(screen.getByText(/Why these 1 exact UIDs/i));
    expect(screen.getByText(new RegExp(question.id))).toBeInTheDocument();
    expect(screen.getByText('high confidence wrong')).toBeInTheDocument();
    expect(screen.getByText('weekly focus')).toBeInTheDocument();
  });

  it('exposes all seven jobs plus Custom and persists a named prescription action', async () => {
    const user = userEvent.setup();
    const onPreset = vi.fn();
    const onSavePrescription = vi.fn();
    render(
      <PyqRecommendedSetup
        preset="custom"
        selection={null}
        loading={false}
        error={null}
        seed="custom-proof"
        savedPrescriptions={[]}
        onPreset={onPreset}
        onSeed={vi.fn()}
        onRegenerate={vi.fn()}
        onSavePrescription={onSavePrescription}
        onLoadPrescription={vi.fn()}
        onDeletePrescription={vi.fn()}
      />
    );

    for (const label of [
      'Learn',
      'Diagnose',
      'Repair',
      'Speed',
      'Transfer',
      'Mixed GATE',
      'Full Paper',
      'Custom'
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: /Transfer/i }));
    expect(onPreset).toHaveBeenCalledWith('transfer');
    await user.type(screen.getByPlaceholderText('Name this prescription'), 'Weekly repair');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSavePrescription).toHaveBeenCalledWith('Weekly repair');
  });
});
