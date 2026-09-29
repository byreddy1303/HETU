import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PyqConversationHistory from '@/components/pyq/PyqConversationHistory';
import type { PyqAttemptRow } from '@/types';

describe('PYQ answers recorded with ChatGPT', () => {
  it('shows the saved question, actual response, source and timing provenance', async () => {
    const receipt = {
      id: 'receipt-1',
      capture_origin: 'chatgpt',
      attempted_at: '2026-09-29T10:00:00.000Z',
      subject: 'Algorithms',
      question_uid: 'gate:test:1',
      selected_answer: 'A',
      correct_answer: 'B',
      answer_status: 'available',
      mark_decision: 'MARK',
      mark_correct: false,
      scoring_status: 'scored',
      duration_source: 'unknown',
      time_spent_ms: null,
      question_snapshot: {
        subject: 'Algorithms',
        topic: 'Sorting',
        html: '<p>Which option is correct?</p>',
        source_url: 'https://example.test/paper'
      }
    } as PyqAttemptRow;
    render(<PyqConversationHistory attempts={[receipt]} />);

    expect(screen.getByText('Practice recorded with ChatGPT')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Algorithms · Sorting/));
    expect(screen.getByText('Which option is correct?')).toBeInTheDocument();
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View question source' })).toHaveAttribute(
      'href',
      'https://example.test/paper'
    );
  });
});
