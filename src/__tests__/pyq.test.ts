import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePyqAnswer, formatPyqAnswer, type PyqManifest, type PyqQuestion } from '@/lib/pyq';

function question(overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id: 'go:test',
    year: 2026,
    set: 1,
    number: '1',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    subtopics: [],
    marks: 1,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>Question</p><ol><li>A</li><li>B</li><li>C</li><li>D</li></ol>',
    sourceUrl: 'https://gateoverflow.in/test',
    answerSource: null,
    ...overrides
  };
}

describe('PYQ answer evaluation', () => {
  it('grades MCQ answers without case sensitivity', () => {
    expect(evaluatePyqAnswer(question(), 'b', 'MARK')).toBe(true);
    expect(evaluatePyqAnswer(question(), 'A', 'MARK')).toBe(false);
  });

  it('requires an exact set for MSQ answers regardless of selection order', () => {
    const row = question({ type: 'MSQ', answer: ['B', 'D'] });
    expect(evaluatePyqAnswer(row, ['D', 'B'], 'MARK')).toBe(true);
    expect(evaluatePyqAnswer(row, ['B'], 'MARK')).toBe(false);
    expect(evaluatePyqAnswer(row, ['A', 'B', 'D'], 'MARK')).toBe(false);
  });

  it('honours NAT tolerances and audited alternative numeric keys', () => {
    const tolerant = question({ type: 'NAT', answer: 0.5, tolerance: { abs: 0.01 } });
    expect(evaluatePyqAnswer(tolerant, 0.509, 'MARK')).toBe(true);
    expect(evaluatePyqAnswer(tolerant, 0.52, 'MARK')).toBe(false);

    const alternatives = question({ type: 'NAT', answer: [205, 820], tolerance: { abs: 0 } });
    expect(evaluatePyqAnswer(alternatives, 820, 'MARK')).toBe(true);
  });

  it('does not fabricate correctness for skips or defective/ambiguous keys', () => {
    expect(evaluatePyqAnswer(question(), null, 'SKIP')).toBeNull();
    const unsupported = question({
      type: 'UNSUPPORTED',
      answer: null,
      answerStatus: 'unsupported'
    });
    expect(evaluatePyqAnswer(unsupported, 'B', 'MARK')).toBeNull();
    expect(formatPyqAnswer(unsupported)).toContain('no key invented');
  });
});

describe('bundled PYQ bank integrity', () => {
  it('contains all 2,388 audited questions and no broken local image references', () => {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const manifest = JSON.parse(
      readFileSync(path.join(publicRoot, 'pyq', 'manifest.json'), 'utf8')
    ) as PyqManifest;
    const ids = new Set<string>();
    const statuses: Record<string, number> = {};
    let questionCount = 0;

    expect(manifest.questionCount).toBe(2388);
    expect(manifest.years).toHaveLength(25);
    expect(manifest.subjects).toHaveLength(13);

    for (const subject of manifest.subjects) {
      const payload = JSON.parse(readFileSync(path.join(publicRoot, subject.file), 'utf8')) as {
        questions: PyqQuestion[];
      };
      expect(payload.questions).toHaveLength(subject.count);
      for (const row of payload.questions) {
        questionCount += 1;
        expect(ids.has(row.id), `duplicate ${row.id}`).toBe(false);
        ids.add(row.id);
        expect(row.html.trim().length, `empty question ${row.id}`).toBeGreaterThan(0);
        statuses[row.answerStatus] = (statuses[row.answerStatus] ?? 0) + 1;
        for (const match of row.html.matchAll(/src="([^"]+)"/g)) {
          if (!match[1].startsWith('/pyq/')) continue;
          expect(existsSync(path.join(publicRoot, match[1])), `missing ${match[1]}`).toBe(true);
        }
      }
    }

    expect(questionCount).toBe(manifest.questionCount);
    expect(statuses).toEqual(manifest.answerStatuses);
    expect(statuses).toEqual({ available: 2382, ambiguous: 2, 'marks-to-all': 1, unsupported: 3 });
  });
});
