import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NotificationTimeEditor from '@/components/settings/NotificationTimeEditor';

describe('NotificationTimeEditor', () => {
  it('keeps hour and minute changes local, then saves the complete time once', async () => {
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

    await user.selectOptions(screen.getByLabelText('Daily Telegram delivery hour'), '19');
    await user.selectOptions(screen.getByLabelText('Daily Telegram delivery minute'), '41');

    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save Daily Telegram delivery time' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(19, 41);
  });

  it('restores the saved time when a save fails', async () => {
    const user = userEvent.setup();

    render(
      <NotificationTimeEditor
        idPrefix="planner"
        label="Planner reminder"
        hour={6}
        minute={45}
        onSave={async () => false}
      />
    );

    const minute = screen.getByLabelText('Planner reminder minute');
    await user.selectOptions(minute, '07');
    await user.click(screen.getByRole('button', { name: 'Save Planner reminder time' }));

    expect(minute).toHaveValue('45');
  });
});
