import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('GO Classes COA Topic Test screenshot archive', () => {
  it('bundles an answer-free practice image for every imported question', async () => {
    const bank = await import('../../public/pyq/subjects/coa.json');
    const questions = bank.default.questions.filter((question) =>
      question.id.startsWith('goclasses:coa-topic-test:')
    );

    expect(questions).toHaveLength(15);
    for (const question of questions) {
      const number = String(question.number).padStart(2, '0');
      expect(question.html).toContain(
        `/pyq/images/go-classes-coa-topic-test/question-q${number}.png`
      );
      expect(question.html).not.toContain(
        `/pyq/images/go-classes-coa-topic-test/attempt-q${number}.png`
      );
    }
  });
});
