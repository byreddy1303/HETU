import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({
  isNativeApp: true,
  haptic: vi.fn()
}));

import NotificationTimeEditor from '@/components/settings/NotificationTimeEditor';

describe('NotificationTimeEditor in the native app', () => {
  it('uses in-page numeric fields instead of full-screen Android select dialogs', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);

    render(
      <NotificationTimeEditor
        idPrefix="telegram"
        label="Daily Telegram delivery"
        hour={18}
        minute={40}
        onSave={onSave}
      />
    );

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    const hour = screen.getByRole('spinbutton', { name: 'Daily Telegram delivery hour' });
    const minute = screen.getByRole('spinbutton', { name: 'Daily Telegram delivery minute' });

    fireEvent.change(hour, { target: { value: '19' } });
    fireEvent.change(minute, { target: { value: '41' } });
    await user.click(screen.getByRole('button', { name: 'Save Daily Telegram delivery time' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(19, 41);
  });

  it('keeps native hour and minute values within valid clock bounds', () => {
    render(
      <NotificationTimeEditor
        idPrefix="planner"
        label="Planner reminder"
        hour={6}
        minute={45}
        onSave={async () => true}
      />
    );

    const hour = screen.getByRole('spinbutton', { name: 'Planner reminder hour' });
    const minute = screen.getByRole('spinbutton', { name: 'Planner reminder minute' });
    fireEvent.change(hour, { target: { value: '99' } });
    fireEvent.change(minute, { target: { value: '-8' } });

    expect(hour).toHaveValue(23);
    expect(minute).toHaveValue(0);
  });
});
