import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MissingTagsConfirm from '@/components/shared/MissingTagsConfirm';
import TagFlow from '@/components/tags/TagFlow';
import { needsMissingTagsConfirmation } from '@/lib/questionTags';
import { applyDraftToRow, emptyDraft } from '@/components/shared/questionDraft';
import type { QuestionRow } from '@/types';

describe('missing question-tag confirmation', () => {
  it('allows empty pattern and trigger tags without requiring confirmation', () => {
    expect(needsMissingTagsConfirmation(null, null)).toBe(false);
    expect(needsMissingTagsConfirmation('   ', '')).toBe(false);
    expect(needsMissingTagsConfirmation('pigeonhole on remainders', null)).toBe(false);
    expect(needsMissingTagsConfirmation(null, 'at least two share')).toBe(false);
  });

  it('normalizes whitespace-only cues to empty values when saving', () => {
    const row = {
      id: 'question-1',
      user_id: 'user-1',
      session_id: null,
      subject: 'Discrete Mathematics',
      subtopic: null,
      source_year: null,
      source_ref: null,
      question_text: null,
      answer_text: null,
      image_url: null,
      time_spent_sec: 0,
      target_time_sec: 120,
      outcome: 'R',
      pattern_name: null,
      trigger_sentence: null,
      root_cause: null,
      mark_decision: null,
      mark_correct: null,
      created_at: '2026-07-22T00:00:00.000Z'
    } satisfies QuestionRow;
    const draft = {
      ...emptyDraft(row.subject, '2026-07-22'),
      patternName: ' ',
      triggerSentence: '\n'
    };

    expect(applyDraftToRow(row, draft)).toMatchObject({
      pattern_name: null,
      trigger_sentence: null
    });
  });

  it('keeps going back as the primary action', async () => {
    const user = userEvent.setup();
    const onGoBack = vi.fn();
    const onConfirm = vi.fn();
    render(<MissingTagsConfirm open onGoBack={onGoBack} onConfirm={onConfirm} />);

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Save without pattern or trigger?' })).toBeVisible()
    );
    expect(screen.getByText('Both learning cues are empty.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go back and add tags' }));
    expect(onGoBack).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('saves an untagged Session question directly without confirmation popup', async () => {
    const onSave = vi.fn();
    render(
      <TagFlow
        subject="Discrete Mathematics"
        patterns={[]}
        questionLabel="Q1"
        timeSpentSec={90}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /Right.*Clean solve/i }));
    const patternInput = await screen.findByLabelText('Pattern name');
    fireEvent.keyDown(patternInput, { key: 'Enter' });
    const triggerInput = await screen.findByLabelText('Trigger sentence');
    fireEvent.keyDown(triggerInput, { key: 'Enter' });

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      pattern_name: null,
      trigger_sentence: null
    });
  });
});
