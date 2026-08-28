import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PyqImprovementInsights from '@/components/pyq/PyqImprovementInsights';
import type { PyqQuestionSummary } from '@/lib/pyq-summary';

function summaryQuestion(
  questionNumber: number,
  overrides: Partial<PyqQuestionSummary> = {}
): PyqQuestionSummary {
  return {
    questionUid: `ui-q${questionNumber}`,
    questionNumber,
    attemptOrder: questionNumber - 1,
    attempt: null,
    outcome: 'correct',
    visited: true,
    markedForReview: false,
    confidence: null,
    timeSpentSec: 60,
    scoreThirds: 3,
    maxThirds: 3,
    scoringCovered: true,
    ...overrides
  };
}

describe('PYQ improvement insights UI', () => {
  it('renders the reference metrics, accessible disclosures, receipts, and review priority', async () => {
    const user = userEvent.setup();
    render(
      <PyqImprovementInsights
        questions={[
          summaryQuestion(1, { timeSpentSec: 60 }),
          summaryQuestion(2, {
            outcome: 'wrong',
            timeSpentSec: 30,
            scoreThirds: -1
          }),
          summaryQuestion(3, {
            outcome: 'wrong',
            timeSpentSec: 180,
            scoreThirds: -2,
            maxThirds: 6
          }),
          summaryQuestion(4, {
            outcome: 'skipped',
            timeSpentSec: 150,
            scoreThirds: 0
          }),
          summaryQuestion(5, {
            timeSpentSec: 120,
            scoreThirds: 6,
            maxThirds: 6
          })
        ]}
      />
    );

    const region = screen.getByRole('region', { name: 'Improvement insights' });
    expect(within(region).getByText('Median pace:').parentElement).toHaveTextContent(
      '2m per timed question'
    );
    expect(within(region).getByText('Time sink:').parentElement).toHaveTextContent(
      '3m 30s spent across 2 questions'
    );
    expect(within(region).getByText('Accuracy:').parentElement).toHaveTextContent(
      '50% correct (2 questions), 50% incorrect (2 questions) across 4 graded attempts'
    );

    const fastTable = within(region).getByRole('table', {
      name: 'Fast incorrect question details'
    });
    expect(within(fastTable).getByText('Q02')).toBeInTheDocument();
    expect(within(fastTable).getByText('30s')).toBeInTheDocument();
    expect(within(fastTable).getByText('−0.33 / 1.00')).toBeInTheDocument();

    const slowTable = within(region).getByRole('table', {
      name: 'Slow low-return question details'
    });
    expect(within(slowTable).getByText('Q03')).toBeInTheDocument();
    expect(within(slowTable).getByText('Q04')).toBeInTheDocument();
    expect(within(region).getByText(/Review first/).parentElement).toHaveTextContent(
      'Q03 (3m, −0.67 / 2.00 marks)'
    );

    const fastDetails = fastTable.closest('details');
    const fastSummary = fastDetails?.querySelector('summary');
    expect(fastDetails?.open).toBe(true);
    await user.click(fastSummary!);
    expect(fastDetails?.open).toBe(false);
  });
});
