import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface ImportedQuestion {
  number: string;
  subjectSlug: string;
  topicSlug: string;
  answer: string | number | string[];
}

interface ImportedAttempt {
  number: string;
  selectedAnswer: string | number | string[] | null;
  decision: 'MARK' | 'SKIP';
  markCorrect: boolean | null;
  timeSpentSec: number;
}

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), filename), 'utf8')) as T;
}

describe('GO Classes COA Topic Test 2 import', () => {
  it('locks every screenshot response to its official key and topic', () => {
    const questionPayload = readJson<{ questions: ImportedQuestion[] }>(
      'scripts/pyq-custom/go-classes-coa-topic-test-2.json'
    );
    const attemptPayload = readJson<{ questions: ImportedAttempt[] }>(
      'scripts/pyq-custom/go-classes-coa-topic-test-2-attempts.json'
    );
    const questions = new Map(
      questionPayload.questions.map((question) => [question.number, question])
    );

    expect(questionPayload.questions).toHaveLength(15);
    expect(attemptPayload.questions).toHaveLength(15);
    expect(new Set(questionPayload.questions.map((question) => question.topicSlug))).toEqual(
      new Set([
        'addressing-modes',
        'machine-instruction',
        'alu-data-path-and-control-unit',
        'pipeline-processor'
      ])
    );

    for (const attempt of attemptPayload.questions) {
      const question = questions.get(attempt.number);
      expect(question?.subjectSlug).toBe('coa');
      expect(attempt.timeSpentSec).toBeGreaterThan(0);
      if (attempt.decision === 'SKIP') {
        expect(attempt.selectedAnswer).toBeNull();
        expect(attempt.markCorrect).toBeNull();
      } else {
        expect(attempt.markCorrect).toBe(
          JSON.stringify(attempt.selectedAnswer) === JSON.stringify(question?.answer)
        );
      }
    }

    expect(attemptPayload.questions.map((attempt) => attempt.selectedAnswer)).toEqual([
      1024,
      87,
      'C',
      ['A', 'B'],
      ['B'],
      'B',
      'C',
      'A',
      'B',
      'B',
      96,
      null,
      null,
      null,
      82032
    ]);
  });

  it('writes both learner and actual answers into durable receipts and journal rows', () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260813000003_go_classes_coa_topic_test_2.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('selected_answer, correct_answer, capture_version');
    expect(migration).toContain("'Your answer: '");
    expect(migration).toContain("E'\\nActual answer: '");
    expect(migration).toContain("then 'Not attempted'");
    expect(migration.match(/"id":"goclasses:coa-topic-test-2:/g)).toHaveLength(15);
  });
});
