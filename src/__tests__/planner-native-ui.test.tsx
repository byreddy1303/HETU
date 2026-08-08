import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({
  haptic: vi.fn(),
  isNativeApp: true
}));

import DayPlanModal from '@/components/planner/DayPlanModal';
import { emptyDayPlan } from '@/lib/planner-storage';

describe('native Planner sheets', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it('does not dismiss the day sheet when WebView retargets a tap to its backdrop', () => {
    render(
      <DayPlanModal
        date="2026-08-08"
        plan={emptyDayPlan('2026-08-08')}
        onChange={() => undefined}
        onClose={onClose}
        onDelete={() => undefined}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Saturday, 08 Aug 2026' });
    fireEvent.mouseDown(dialog.parentElement!);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('keeps the native subject picker open on a retargeted backdrop tap', async () => {
    const user = userEvent.setup();
    const plan = {
      ...emptyDayPlan('2026-08-08'),
      sessions: [
        {
          id: 'session-1',
          subject: 'Mathematics',
          durationMin: 60,
          mode: 'Deep Study' as const,
          priority: 'P2 High' as const,
          target: ''
        }
      ]
    };

    render(
      <DayPlanModal
        date={plan.date}
        plan={plan}
        onChange={() => undefined}
        onClose={onClose}
        onDelete={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Mathematics' }));
    const picker = screen.getByRole('dialog', { name: 'Choose subject' });
    fireEvent.mouseDown(picker.parentElement!);

    expect(picker).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close subject picker' }));
    expect(screen.queryByRole('dialog', { name: 'Choose subject' })).not.toBeInTheDocument();
  });
});
