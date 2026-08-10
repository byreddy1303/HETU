import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/lib/db';
import QuickCapture from '@/pages/QuickCapture';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: USER, status: 'signed_in', sandbox: true })
}));

vi.mock('@/lib/image', () => ({
  compressToDataUrl: vi.fn(async () => ({
    dataUrl: 'data:image/jpeg;base64,cXVlc3Rpb24=',
    width: 800,
    height: 600,
    bytes: 11
  }))
}));

describe('quick capture', () => {
  beforeEach(async () => {
    await Promise.all([db.questions.clear(), db.reattempts.clear()]);
  });

  it('stores the compressed evidence and schedules the exact question for review', async () => {
    const user = userEvent.setup();
    const { container } = render(<QuickCapture />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    await user.upload(fileInput!, new File(['question'], 'gate-q.png', { type: 'image/png' }));
    expect(await screen.findByAltText('Question selected for quick capture')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Slow correct/ }));
    await user.type(
      screen.getByLabelText('One sentence about the mistake'),
      'I used the long method and missed the direct invariant.'
    );
    await user.click(screen.getByRole('button', { name: 'Save capture' }));

    expect(await screen.findByText(/Saved to Journal/)).toBeInTheDocument();
    await waitFor(async () => {
      const questions = await db.questions.where('user_id').equals(USER).toArray();
      const reattempts = await db.reattempts.where('user_id').equals(USER).toArray();
      expect(questions).toHaveLength(1);
      expect(questions[0]).toMatchObject({
        outcome: 'RBS',
        source_ref: 'Quick capture',
        capture_note: 'I used the long method and missed the direct invariant.',
        image_url: 'data:image/jpeg;base64,cXVlc3Rpb24='
      });
      expect(reattempts).toHaveLength(1);
      expect(reattempts[0].question_id).toBe(questions[0].id);
      expect(reattempts[0].stage).toBe('D3');
    });
  });
});
