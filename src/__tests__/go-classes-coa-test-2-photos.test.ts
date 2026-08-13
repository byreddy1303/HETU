import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GO Classes COA Topic Test 2 screenshot archive', () => {
  it('bundles answer-free practice images and full attempt receipts', async () => {
    const bank = await import('../../public/pyq/subjects/coa.json');
    const questions = bank.default.questions.filter((question) =>
      question.id.startsWith('goclasses:coa-topic-test-2:')
    );

    expect(questions).toHaveLength(15);
    for (const question of questions) {
      const number = String(question.number).padStart(2, '0');
      const imageDirectory = path.resolve(
        'public/pyq/images/go-classes-coa-topic-test-2'
      );

      expect(question.html).toContain(
        `/pyq/images/go-classes-coa-topic-test-2/practice-q${number}-v2.png`
      );
      expect(question.html).not.toContain(
        `/pyq/images/go-classes-coa-topic-test-2/attempt-q${number}.png`
      );
      expect(existsSync(path.join(imageDirectory, `practice-q${number}-v2.png`))).toBe(
        true
      );
      expect(existsSync(path.join(imageDirectory, `attempt-q${number}.png`))).toBe(
        true
      );
    }
  });

  it('keeps result receipts out of re-attempt and journal image fields', () => {
    const migration = readFileSync(
      path.resolve(
        'supabase/migrations/20260813000006_go_classes_coa_topic_test_2_answer_free_reattempts.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      "screenshot_url = '/pyq/images/go-classes-coa-topic-test-2/practice-q'"
    );
    expect(migration).toContain(
      "set image_url = '/pyq/images/go-classes-coa-topic-test-2/practice-q'"
    );
    expect(migration).not.toContain(
      "screenshot_url = '/pyq/images/go-classes-coa-topic-test-2/attempt-q'"
    );
    expect(migration).not.toContain(
      "set image_url = '/pyq/images/go-classes-coa-topic-test-2/attempt-q'"
    );
  });
});
