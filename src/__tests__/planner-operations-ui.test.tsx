import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import PlannerOperationsPanel from '@/components/planner/PlannerOperationsPanel';
import { emptyDayPlan, saveDayPlan, type StudySession } from '@/lib/planner-storage';
import { useAuthStore } from '@/stores/auth';
import { usePlannerTemplatesStore } from '@/stores/planner-templates';

const USER_ID = 'planner-ops-ui-user';

function block(id: string, completed = false): StudySession {
  return {
    id,
    subject: 'Operating Systems',
    subjectId: 'operating-systems',
    durationMin: 45,
    mode: 'Problem Solving',
    priority: 'P2 High',
    target: `Target ${id}`,
    ...(completed
      ? {
          execution: {
            sessionId: `focus-${id}`,
            startedAt: '2026-09-01T06:00:00Z',
            completedAt: '2026-09-01T06:45:00Z',
            actualMin: 45,
            manual: false
          }
        }
      : {})
  };
}

describe('Planner operations workbench', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerTemplatesStore.getState().reset();
    useAuthStore.setState({
      status: 'signed_in',
      user: { id: USER_ID, email: 'planner@example.com' } as User,
      profile: null,
      sandbox: false
    });
  });

  it('rolls only unfinished work from yesterday with fresh evidence identity', async () => {
    const user = userEvent.setup();
    const yesterday = emptyDayPlan('2026-09-01');
    yesterday.sessions = [block('done', true), block('open')];
    saveDayPlan(yesterday);
    const current = emptyDayPlan('2026-09-02');
    const persist = vi.fn();

    render(<PlannerOperationsPanel plan={current} onPersistPlans={persist} />);
    await user.click(screen.getByRole('button', { name: 'Roll yesterday unfinished' }));

    expect(persist).toHaveBeenCalledTimes(1);
    const [plans] = persist.mock.calls[0] as [ReturnType<typeof emptyDayPlan>[], string];
    expect(plans[0].sessions).toHaveLength(1);
    expect(plans[0].sessions[0]).toMatchObject({ target: 'Target open' });
    expect(plans[0].sessions[0].id).not.toBe('open');
    expect(plans[0].sessions[0].execution).toBeUndefined();
  });

  it('saves a bounded recurring template and expands it only after explicit apply', async () => {
    const user = userEvent.setup();
    const current = emptyDayPlan('2026-09-02');
    current.sessions = [block('source')];
    const persist = vi.fn();
    render(<PlannerOperationsPanel plan={current} onPersistPlans={persist} />);

    await user.type(screen.getByRole('textbox', { name: 'Template name' }), 'OS repair');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Template recurrence' }),
      'daily'
    );
    const maximum = screen.getByRole('spinbutton', { name: 'Maximum recurrence occurrences' });
    fireEvent.change(maximum, { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Save reusable template' }));

    expect(screen.getByText('OS repair')).toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply recurrence' }));

    expect(persist).toHaveBeenCalledTimes(1);
    const [plans] = persist.mock.calls[0] as [ReturnType<typeof emptyDayPlan>[], string];
    expect(plans.map((plan) => plan.date)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
    expect(plans.every((plan) => plan.sessions.length >= 1)).toBe(true);
  });

  it('reconciles selections, template source, and target date as plan props evolve', async () => {
    const user = userEvent.setup();
    const first = emptyDayPlan('2026-09-02');
    first.sessions = [block('first'), block('second')];
    const persist = vi.fn();
    const { rerender } = render(
      <PlannerOperationsPanel plan={first} onPersistPlans={persist} />
    );

    const initialChecks = screen.getAllByRole('checkbox');
    expect(initialChecks[0]).toBeChecked();
    expect(initialChecks[1]).toBeChecked();
    await user.click(initialChecks[1]);
    expect(initialChecks[1]).not.toBeChecked();

    const editedSameDay = emptyDayPlan(first.date);
    editedSameDay.sessions = [block('second'), block('third')];
    rerender(<PlannerOperationsPanel plan={editedSameDay} onPersistPlans={persist} />);

    const reconciledChecks = screen.getAllByRole('checkbox');
    expect(reconciledChecks[0]).not.toBeChecked();
    expect(reconciledChecks[1]).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Template agenda action' })).toHaveValue('second');

    await user.click(screen.getByRole('button', { name: 'Copy selected' }));
    expect(persist).toHaveBeenCalledTimes(1);
    const [copiedPlans] = persist.mock.calls[0] as [ReturnType<typeof emptyDayPlan>[], string];
    expect(copiedPlans[0].sessions).toHaveLength(1);
    expect(copiedPlans[0].sessions[0].target).toBe('Target third');

    const nextDate = emptyDayPlan('2026-09-05');
    nextDate.sessions = [block('second')];
    rerender(<PlannerOperationsPanel plan={nextDate} onPersistPlans={persist} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Template agenda action' })).toHaveValue('second');
    expect(screen.getByLabelText('Planner operation target date')).toHaveValue('2026-09-06');
  });
});
