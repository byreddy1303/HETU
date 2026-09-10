import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PlannerBuildMyDay from '@/components/planner/PlannerBuildMyDay';
import { forecastReviewLoadWindows } from '@/lib/planner-review-load';
import { emptyDayPlan, type DayPlan } from '@/lib/planner-storage';

function Harness() {
  const [plan, setPlan] = useState<DayPlan>(() => {
    const value = emptyDayPlan('2026-09-02');
    value.availability.availableMin = 120;
    value.availability.protectedBufferMin = 15;
    value.mindset.energyForecast = 'high';
    return value;
  });
  const forecast = forecastReviewLoadWindows(
    [
      { id: 'due', scheduled_date: '2026-09-02', stage: 'D3', estimatedMin: 10 },
      { id: 'tomorrow', scheduled_date: '2026-09-03', stage: 'D10', estimatedMin: 8 }
    ],
    { asOfDate: plan.date }
  );
  return (
    <>
      <PlannerBuildMyDay
        plan={plan}
        reviewForecast={forecast}
        candidates={[
          {
            id: 'evidence:exact',
            kind: 'pyq',
            title: 'Repair exact misses',
            subject: 'Operating Systems',
            estimatedMin: 45,
            priority: 'P1 Critical',
            energy: 'high',
            href: '/pyq?preset=repair&questionUids=q1,q2',
            reason: 'two high-confidence wrong receipts'
          },
          {
            id: 'evidence:formula',
            kind: 'formula',
            title: 'Recall due formulas',
            estimatedMin: 30,
            priority: 'P2 High',
            energy: 'low',
            href: '/formulas',
            reason: 'formula recall is due'
          }
        ]}
        onApprove={setPlan}
      />
      <output data-testid="session-count">{plan.sessions.length}</output>
    </>
  );
}

describe('Build my day approval workbench', () => {
  it('shows forecast and reasons but does not mutate Planner before explicit approval', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('8m')).toBeInTheDocument();
    expect(screen.getByTestId('session-count')).toHaveTextContent('0');
    await user.click(screen.getByRole('button', { name: 'Build my day' }));

    expect(screen.getByText(/two high-confidence wrong receipts/i)).toBeInTheDocument();
    expect(screen.getByText(/Forecast: ~.*recovery items/i)).toBeInTheDocument();
    expect(screen.getByTestId('session-count')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: 'Approve day' }));
    expect(Number(screen.getByTestId('session-count').textContent)).toBeGreaterThan(0);
  });

  it('can discard a proposal without changing the plan', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Build my day' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'Build my day' })).toBeInTheDocument();
    expect(screen.getByTestId('session-count')).toHaveTextContent('0');
  });
});
