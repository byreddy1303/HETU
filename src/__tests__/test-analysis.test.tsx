import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SavedTestAnalyses from '@/components/learning/SavedTestAnalyses';
import TestAnalysis from '@/pages/TestAnalysis';
import type { TestAnalysisDetail, TestAnalysisSummary } from '@/lib/test-analysis';

const { apiRequest, identity } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  identity: { userId: 'learner-one' }
}));
vi.mock('@/lib/fastapi-client', () => ({ apiRequest }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => identity }));

function summary(id = 'test-one'): TestAnalysisSummary {
  return {
    id,
    name: 'COA test 2',
    test_date: '2026-10-10',
    version: 1,
    summary: 'Distinguish byte offsets from word offsets.',
    question_count: 1,
    missing_information: ['Confirm the duration.'],
    capture_origin: 'chatgpt'
  };
}

function detail(): TestAnalysisDetail {
  return {
    report: {
      ...summary(),
      full_analysis: 'Count the addressable bytes in each block.',
      questions: [
        {
          ref: 'Q7',
          subject: 'COA',
          topic: 'Cache',
          question_text: 'Offset bits for 64 bytes?',
          answer_text: 'Six offset bits.',
          learner_answer: null,
          outcome: 'R',
          outcome_provenance: 'screenshot',
          time_spent_sec: null,
          duration_source: 'unknown',
          capture_note: null,
          root_cause: null,
          pattern_name: null,
          trigger_sentence: null,
          analysis_provenance: 'assistant_hypothesis'
        }
      ],
      sources: [
        {
          kind: 'conversation',
          title: 'Test discussion',
          url: 'https://chatgpt.com/c/test-discussion',
          excerpt: 'The block contains 64 bytes.'
        }
      ],
      next_steps: ['Recall byte versus word addressing.'],
      unresolved: [],
      session_id: 'session-one',
      workflow_id: 'workflow-one',
      revision_pack_id: 'pack-one',
      artifact_maps: { questions: { Q7: 'question-one' } },
      follow_up_receipts: []
    },
    artifacts: {
      questions: [{ id: 'question-one', version: 1, has_image: true }],
      concept_pages: [
        {
          id: 'concept-one',
          version: 1,
          concept: 'Block offset',
          subject: 'COA',
          topic: 'Cache',
          full_explanation: 'Each offset identifies one byte.'
        }
      ],
      formulas: [{ id: 'formula-one', version: 1, name: 'Offset bits', expression: 'log2(64)' }],
      trigger_phrases: [
        {
          id: 'cue-one',
          version: 1,
          phrase: 'Byte-addressed cache',
          concept: 'Count addressable bytes.'
        }
      ],
      reattempts: [
        {
          id: 'retry-one',
          version: 1,
          question_id: 'question-one',
          stage: 'D3',
          scheduled_date: '2026-10-15'
        }
      ],
      concept_reviews: [
        { id: 'review-one', version: 1, prompt: 'Why six offset bits?', due_on: '2026-10-15' }
      ]
    }
  };
}

function page() {
  return (
    <MemoryRouter initialEntries={['/mocks/analysis/test-one']}>
      <Routes>
        <Route path="/mocks/analysis/:analysisId" element={<TestAnalysis />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('saved test handoff', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    identity.userId = 'learner-one';
  });

  it('lists captures with bounded pagination and opens the app report', async () => {
    apiRequest
      .mockResolvedValueOnce({ items: [summary()], next_cursor: 'next-page', complete: false })
      .mockResolvedValueOnce({
        items: [{ ...summary('test-two'), name: 'COA test 3' }],
        next_cursor: null,
        complete: true
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SavedTestAnalyses />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: /COA test 2/ })).toHaveAttribute(
      'href',
      '/mocks/analysis/test-one'
    );
    expect(screen.getByText('1 detail to confirm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more tests' }));
    expect(await screen.findByRole('link', { name: /COA test 3/ })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith('/v1/test-analyses?limit=10&cursor=next-page');
    expect(screen.queryByRole('button', { name: 'Load more tests' })).not.toBeInTheDocument();
  });

  it('links every study destination and loads only an opened question image with the answer hidden', async () => {
    apiRequest.mockImplementation(async (path: string) =>
      path.endsWith('/image') ? { image_url: 'data:image/jpeg;base64,cXVlc3Rpb24=' } : detail()
    );
    const user = userEvent.setup();
    render(page());
    expect(await screen.findByRole('heading', { name: 'COA test 2' })).toBeInTheDocument();
    for (const [name, href] of [
      ['Open question log', '/journal?session=session-one'],
      ['Continue review', '/workflows/workflow-one'],
      ['Test revision pack', '/revision-pack?pack=pack-one'],
      ['Block offset', '/learning-library/concept-one'],
      ['Why six offset bits?', '/concept-review/review-one']
    ])
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    expect(screen.getByRole('link', { name: /Q7 · D3 re-attempt/ })).toHaveAttribute(
      'href',
      '/reattempts/retry-one'
    );
    expect(screen.getByText('log2(64)').closest('.katex')).toBeInTheDocument();
    expect(screen.getByText('Confirm the duration.')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Six offset bits.')).not.toBeInTheDocument();
    await user.click(screen.getByText('Q7').closest('summary')!);
    expect(await screen.findByAltText('Q7 question screenshot without the answer')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,cXVlc3Rpb24='
    );
    expect(screen.queryByText('Six offset bits.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('Six offset bits.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(screen.queryByText('Six offset bits.')).not.toBeInTheDocument();
  });

  it('typesets captured discussion math and bare formula expressions', async () => {
    const saved = detail();
    saved.report.summary = String.raw`Use $\log_2 n$ for the bit count.`;
    saved.artifacts.formulas[0].expression = String.raw`\frac{a}{b}`;
    apiRequest.mockResolvedValue(saved);
    const view = render(page());
    await screen.findByRole('heading', { name: 'COA test 2' });
    expect([...view.container.querySelectorAll('annotation')].map((node) => node.textContent))
      .toEqual(expect.arrayContaining([String.raw`\log_2 n`, String.raw`\frac{a}{b}`]));
    expect(view.container.querySelectorAll('.katex')).toHaveLength(2);
    expect(screen.queryByText('Six offset bits.')).not.toBeInTheDocument();
  });

  it('recovers a failed report request and a failed screenshot request', async () => {
    let imageCalls = 0;
    apiRequest
      .mockRejectedValueOnce(new Error('Test service unavailable.'))
      .mockImplementation(async (path: string) => {
        if (!path.endsWith('/image')) return detail();
        if (++imageCalls === 1) throw new Error('Screenshot interrupted.');
        return { image_url: 'data:image/jpeg;base64,cXVlc3Rpb24=' };
      });
    const user = userEvent.setup();
    render(page());
    expect(await screen.findByRole('alert')).toHaveTextContent('Test service unavailable.');
    await user.click(screen.getByRole('button', { name: 'Retry loading test' }));
    await screen.findByRole('heading', { name: 'COA test 2' });
    await user.click(screen.getByText('Q7').closest('summary')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Screenshot interrupted.');
    await user.click(screen.getByRole('button', { name: 'Retry screenshot' }));
    expect(
      await screen.findByAltText('Q7 question screenshot without the answer')
    ).toBeInTheDocument();
  });

  it('discards a delayed report after the signed-in account changes', async () => {
    let finish!: (value: TestAnalysisDetail) => void;
    let originalSignal!: AbortSignal;
    apiRequest
      .mockImplementationOnce((_path: string, init: RequestInit) => {
        originalSignal = init.signal as AbortSignal;
        return new Promise<TestAnalysisDetail>((resolve) => {
          finish = resolve;
        });
      })
      .mockResolvedValue({
        ...detail(),
        report: { ...detail().report, name: 'Second account test' }
      });
    const view = render(page());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    identity.userId = 'learner-two';
    view.rerender(page());
    expect(await screen.findByRole('heading', { name: 'Second account test' })).toBeInTheDocument();
    expect(originalSignal.aborted).toBe(true);
    await act(async () => {
      finish(detail());
    });
    expect(screen.queryByRole('heading', { name: 'COA test 2' })).not.toBeInTheDocument();
  });
});
