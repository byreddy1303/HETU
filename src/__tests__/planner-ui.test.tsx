import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import DayPlanModal from '@/components/planner/DayPlanModal';
import { emptyDayPlan, type DayPlan } from '@/lib/planner-storage';

function PlannerHarness() {
  const [plan, setPlan] = useState<DayPlan>(() => emptyDayPlan('2026-08-08'));
  return (
    <DayPlanModal
      date={plan.date}
      plan={plan}
      onChange={setPlan}
      onClose={() => undefined}
      onDelete={() => undefined}
    />
  );
}

describe('Planner subject picker', () => {
  it('adds a session and chooses a subject through the portalled picker', async () => {
    const user = userEvent.setup();
    render(<PlannerHarness />);

    await user.click(screen.getByRole('button', { name: 'Add subject' }));
    await user.click(screen.getByRole('button', { name: 'Mathematics' }));
    expect(screen.getByRole('dialog', { name: 'Choose subject' })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search subjects' }), 'operating');
    await user.click(screen.getByRole('button', { name: 'Operating Systems' }));

    expect(screen.queryByRole('dialog', { name: 'Choose subject' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Operating Systems' })).toBeInTheDocument();
  });

  it('keeps a custom subject name editable after selecting Custom', async () => {
    const user = userEvent.setup();
    render(<PlannerHarness />);

    await user.click(screen.getByRole('button', { name: 'Add subject' }));
    await user.click(screen.getByRole('button', { name: 'Mathematics' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search subjects' }), 'custom');
    await user.click(screen.getByRole('button', { name: 'Custom...' }));

    const input = screen.getByPlaceholderText('Custom subject name');
    await user.type(input, 'Graph Theory');
    expect(input).toHaveValue('Graph Theory');
  });
});
