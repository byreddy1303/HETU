import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePyqSnapshot, PYQ_CAPTURE_TIMEOUT_MS } from '@/lib/pyq-capture';
import { captureElementToDataUrl } from '@/lib/image';
import type { PyqQuestion } from '@/lib/pyq';

vi.mock('@/lib/image', () => ({ captureElementToDataUrl: vi.fn(), urlToDataUrl: vi.fn() }));
const question = {
  html: '<p>Which answer?</p>',
  paperLabel: 'GATE CSE 2026',
  number: '1',
  subject: 'Algorithms',
  type: 'MCQ',
  marks: 2
} as PyqQuestion;

afterEach(() => vi.useRealTimers());
describe('PYQ capture deadline', () => {
  it('saves an answer-free fallback when media never finishes loading', async () => {
    vi.useFakeTimers();
    vi.mocked(captureElementToDataUrl).mockReturnValueOnce(new Promise(() => {}));
    const result = capturePyqSnapshot(question, document.createElement('div'));
    await vi.advanceTimersByTimeAsync(PYQ_CAPTURE_TIMEOUT_MS);
    expect(await result).toMatch(/^data:image\/svg\+xml/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the deadline after a successful capture', async () => {
    vi.useFakeTimers();
    vi.mocked(captureElementToDataUrl).mockResolvedValueOnce('data:image/png;base64,c2FmZQ==');
    expect(await capturePyqSnapshot(question, document.createElement('div'))).toContain(
      'image/png'
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
