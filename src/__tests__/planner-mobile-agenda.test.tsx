import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({
  haptic: vi.fn(),
  isNativeApp: true
}));

import Calendar from '@/components/planner/Calendar';

describe('mobile Planner week agenda', () => {
  it('keeps full subjects and durations visible and opens the chosen date', async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    const summaries = new Map([
      ['2026-09-02', { subjects: ['Operating Systems', 'Computer Networks'], totalMin: 90 }],
      ['2026-09-03', { subjects: ['Databases'], totalMin: 45 }]
    ]);
    render(
      <Calendar
        year={2026}
        monthIndex={8}
        today={new Date(2026, 8, 2, 12)}
        planIndex={new Set(summaries.keys())}
        summaries={summaries}
        onPrevMonth={() => undefined}
        onNextMonth={() => undefined}
        onPickDate={pick}
      />
    );

    const agenda = screen.getByRole('region', { name: 'Week at a glance' });
    expect(agenda).toHaveTextContent('Operating Systems · Computer Networks');
    expect(agenda).toHaveTextContent('1h30');
    expect(agenda).toHaveTextContent('Databases');
    expect(agenda).toHaveTextContent('45m');
    await user.click(screen.getByRole('button', { name: '2026-09-03 agenda, 45m planned' }));
    expect(pick).toHaveBeenCalledWith('2026-09-03');
  });
});
