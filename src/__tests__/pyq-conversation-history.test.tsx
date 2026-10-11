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

  it('prefers the captured question screenshot and shows confidence when present', async () => {
    const receipt = {
      id: 'receipt-2',
      capture_origin: 'chatgpt',
      attempted_at: '2026-09-29T11:00:00.000Z',
      subject: 'Algorithms',
      question_uid: 'gate:test:2',
      selected_answer: 'A',
      correct_answer: 'A',
      answer_status: 'available',
      mark_decision: 'MARK',
      mark_correct: true,
      confidence: 'high',
      duration_source: 'measured',
      time_spent_ms: 42_000,
      screenshot_url: 'data:image/png;base64,c2NyZWVuc2hvdA==',
      question_snapshot: {
        subject: 'Algorithms',
        topic: 'Sorting',
        html: '<p>Which option is correct?</p>',
        source_url: 'https://example.test/paper'
      }
    } as PyqAttemptRow;
    render(<PyqConversationHistory attempts={[receipt]} />);

    await userEvent.click(screen.getByText(/Algorithms · Sorting/));

    const screenshot = screen.getByRole('img', {
      name: 'Question screenshot from when you attempted it'
    });
    expect(screenshot).toHaveAttribute('src', 'data:image/png;base64,c2NyZWVuc2hvdA==');
    expect(screen.queryByText('Which option is correct?')).not.toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });
});
