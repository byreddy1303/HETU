import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnswerReveal from '@/components/shared/AnswerReveal';

describe('AnswerReveal', () => {
  it('keeps an answer out of the rendered page until explicitly revealed', async () => {
    const user = userEvent.setup();
    render(<AnswerReveal answer="Use inclusion-exclusion: 42." />);

    expect(screen.queryByText('Use inclusion-exclusion: 42.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('Use inclusion-exclusion: 42.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(screen.queryByText('Use inclusion-exclusion: 42.')).not.toBeInTheDocument();
  });

  it('typesets math only after revealing and conceals it when the saved answer changes', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <AnswerReveal answer={String.raw`Use $\frac{1}{2}$ of the total.`} />
    );

    expect(container.querySelector('math')).toBeNull();
    expect(container.textContent).not.toContain('of the total');
    await user.click(screen.getByRole('button', { name: 'Show answer' }));

    const revealed = screen.getByRole('region', { name: 'Saved answer' });
    expect(revealed.querySelector('math')).not.toBeNull();
    expect(revealed).toHaveTextContent('of the total.');
    expect(revealed.textContent).not.toContain('$');

    rerender(<AnswerReveal answer={String.raw`Now use $\sqrt{3}$.`} />);
    expect(screen.queryByRole('region', { name: 'Saved answer' })).not.toBeInTheDocument();
    expect(container.querySelector('math')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(
      screen.getByRole('region', { name: 'Saved answer' }).querySelector('math')
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(container.querySelector('math')).toBeNull();
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
