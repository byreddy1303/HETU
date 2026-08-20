import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnswerReveal from '@/components/shared/AnswerReveal';

describe('AnswerReveal', () => {
  it('keeps an answer out of the rendered page until explicitly revealed', async () => {
    const user = userEvent.setup();
    render(<AnswerReveal answer="Use inclusion-exclusion: 42." />);

    expect(screen.queryByText('Use inclusion-exclusion: 42.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    await waitFor(() => expect(screen.getByText('Use inclusion-exclusion: 42.')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Hide answer' }));
    await waitFor(() =>
      expect(screen.queryByText('Use inclusion-exclusion: 42.')).not.toBeInTheDocument()
    );
  });

  it('offers an add action when no answer was recorded', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AnswerReveal answer={null} onAdd={onAdd} />);

    expect(screen.getByText('No answer saved')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add answer' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
