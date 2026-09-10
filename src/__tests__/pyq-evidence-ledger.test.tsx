import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PyqEvidenceLedger from '@/components/pyq/PyqEvidenceLedger';
import type { PyqEvidenceInsights } from '@/lib/pyq-evidence-insights';

const insights: PyqEvidenceInsights = {
  confidence: [
    { confidence: 'high', attempted: 4, correct: 2, wrong: 2, accuracyPct: 50 },
    { confidence: 'medium', attempted: 2, correct: 1, wrong: 1, accuracyPct: 50 },
    { confidence: 'low', attempted: 0, correct: 0, wrong: 0, accuracyPct: null }
  ],
  calibrationBySubjectTopic: [
    {
      subject: 'Algorithms',
      topic: 'Graphs',
      attempted: 4,
      correct: 2,
      wrong: 2,
      highConfidenceWrong: 2,
      accuracyPct: 50,
      highConfidenceAccuracyPct: 50,
      exactQuestionUids: ['q1', 'q2']
    }
  ],
  paceBaselines: [
    {
      subject: 'Algorithms',
      marks: 1,
      sampleSize: 4,
      personalMedianSec: 105,
      gateTargetSec: 90,
      ratioToTarget: 1.17
    }
  ],
  cohorts: {
    highConfidenceWrong: ['q1'],
    guessedCorrect: ['q2'],
    slowCorrect: ['q3'],
    wrongUnanalyzed: ['q1'],
    repair: ['q1', 'q2', 'q3']
  }
};

describe('PYQ evidence action ledger', () => {
  it('turns the exact repair cohort into five executable actions', async () => {
    const user = userEvent.setup();
    const onPractice = vi.fn();
    const onAddToRecovery = vi.fn();
    const onAnalyzeFirst = vi.fn();
    const onPlanRepair = vi.fn();
    const onTryTransfer = vi.fn();
    render(
      <PyqEvidenceLedger
        insights={insights}
        onPractice={onPractice}
        onAddToRecovery={onAddToRecovery}
        onAnalyzeFirst={onAnalyzeFirst}
        onPlanRepair={onPlanRepair}
        onTryTransfer={onTryTransfer}
      />
    );

    expect(screen.getByText('105s / 90s')).toBeInTheDocument();
    expect(screen.getByText('2 confident wrong')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Practice exact subset/i }));
    await user.click(screen.getByRole('button', { name: /Add to recovery/i }));
    await user.click(screen.getByRole('button', { name: /Analyze first/i }));
    await user.click(screen.getByRole('button', { name: /Plan repair/i }));
    await user.click(screen.getByRole('button', { name: /Try fresh transfer/i }));
    expect(onPractice).toHaveBeenCalledWith(['q1', 'q2', 'q3']);
    expect(onAddToRecovery).toHaveBeenCalledWith(['q1', 'q2', 'q3']);
    expect(onAnalyzeFirst).toHaveBeenCalledWith('q1');
    expect(onPlanRepair).toHaveBeenCalledWith(['q1', 'q2', 'q3']);
    expect(onTryTransfer).toHaveBeenCalledWith(['q1', 'q2', 'q3']);
  });
});
