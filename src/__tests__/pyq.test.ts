import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluatePyqAnswer,
  formatPyqAnswer,
  inferPyqDirectOutcome,
  matchesPyqTopicScope,
  normalizePyqManifest,
  pyqAnswerValueForLog,
  resolvePyqJournalImageUrl,
  type PyqManifest,
  type PyqQuestion
} from '@/lib/pyq';

function question(overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id: 'go:test',
    year: 2026,
    set: 1,
    number: '1',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Path',
    topicSlug: 'shortest-path',
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

  it('returns the official answer value for PYQ attempt logs', () => {
    expect(pyqAnswerValueForLog(question({ answer: 'b' }))).toBe('b');
    expect(pyqAnswerValueForLog(question({ type: 'MSQ', answer: ['D', 'B'] }))).toEqual(['B', 'D']);
    expect(pyqAnswerValueForLog(question({ type: 'NAT', answer: 0.5 }))).toBe(0.5);
    expect(
      pyqAnswerValueForLog(question({ type: 'AMBIGUOUS', answer: null, answerStatus: 'ambiguous' }))
    ).toBeNull();
  });

  it('embeds bundled PYQ figures as data URLs for journal storage', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const blob = new Blob([png], { type: 'image/png' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(blob, { status: 200, headers: { 'Content-Type': 'image/png' } })
      );
    const html = '<p>See figure</p><img src="/pyq/images/test.png" alt="fig" />';
    const dataUrl = await resolvePyqJournalImageUrl(html);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    fetchSpy.mockRestore();
  });

  it('infers direct journal outcomes for graded-correct PYQs', () => {
    const mcq = question();
    expect(inferPyqDirectOutcome(mcq, 'MARK', 60)).toBe('R');
    expect(inferPyqDirectOutcome(mcq, 'MARK', 200)).toBe('RBS');
    expect(inferPyqDirectOutcome(mcq, 'FIFTY_FIFTY', 60)).toBe('RBG');
  });
});

describe('PYQ practice scope', () => {
  const algorithm = question();
  const sorting = question({ id: 'go:sorting', topic: 'Sorting', topicSlug: 'sorting' });
  const database = question({
    id: 'go:database',
    subject: 'Database Management System',
    subjectSlug: 'databases',
    topic: 'SQL',
    topicSlug: 'sql'
  });

  it('supports mixed subjects, a complete subject, and one topic', () => {
    expect(
      [algorithm, sorting, database].filter((row) =>
        matchesPyqTopicScope(row, { subjectSlug: 'all', topicSlug: 'all' })
      )
    ).toHaveLength(3);
    expect(
      [algorithm, sorting, database].filter((row) =>
        matchesPyqTopicScope(row, { subjectSlug: 'algorithms', topicSlug: 'all' })
      )
    ).toEqual([algorithm, sorting]);
    expect(
      [algorithm, sorting, database].filter((row) =>
        matchesPyqTopicScope(row, { subjectSlug: 'algorithms', topicSlug: 'sorting' })
      )
    ).toEqual([sorting]);
  });

  it('treats a legacy set without a topic as a complete subject', () => {
    expect(matchesPyqTopicScope(algorithm, { subjectSlug: 'algorithms' })).toBe(true);
  });
});

describe('PYQ manifest compatibility', () => {
  it('treats a pre-topic cached manifest as having no selectable topics', () => {
    const legacyManifest = {
      bankVersion: 'legacy-v1',
      generatedAt: '2026-08-01T00:00:00.000Z',
      source: 'test',
      sourceUrl: 'https://example.com',
      firstYear: 2002,
      lastYear: 2026,
      questionCount: 1,
      imageCount: 0,
      answerStatuses: { available: 1, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
      years: [{ year: 2026, count: 1 }],
      subjects: [
        {
          slug: 'algorithms',
          label: 'Algorithms',
          count: 1,
          file: '/pyq/subjects/algorithms.json'
        }
      ]
    };

    expect(normalizePyqManifest(legacyManifest).subjects[0].topics).toEqual([]);
  });
});

describe('bundled PYQ bank integrity', () => {
  it('contains all 2,388 audited questions and no broken local image references', () => {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const manifest = JSON.parse(
      readFileSync(path.join(publicRoot, 'pyq', 'manifest.json'), 'utf8')
    ) as PyqManifest;
    const ids = new Set<string>();
    const questionsById = new Map<string, PyqQuestion>();
    const statuses: Record<string, number> = {};
    let questionCount = 0;
    let topicCount = 0;

    expect(manifest.questionCount).toBe(2388);
    expect(manifest.years).toHaveLength(25);
    expect(manifest.subjects).toHaveLength(14);

    for (const subject of manifest.subjects) {
      const payload = JSON.parse(readFileSync(path.join(publicRoot, subject.file), 'utf8')) as {
        questions: PyqQuestion[];
      };
      expect(payload.questions).toHaveLength(subject.count);
      const expectedTopicCounts = new Map(subject.topics.map((topic) => [topic.slug, topic.count]));
      const actualTopicCounts = new Map<string, number>();
      topicCount += subject.topics.length;
      for (const row of payload.questions) {
        questionCount += 1;
        expect(ids.has(row.id), `duplicate ${row.id}`).toBe(false);
        ids.add(row.id);
        questionsById.set(row.id, row);
        expect(row.html.trim().length, `empty question ${row.id}`).toBeGreaterThan(0);
        expect(row.subjectSlug).toBe(subject.slug);
        expect(row.subject).toBe(subject.label);
        expect(expectedTopicCounts.has(row.topicSlug), `unknown topic ${row.topicSlug}`).toBe(true);
        expect(row.topic.trim().length, `empty topic ${row.id}`).toBeGreaterThan(0);
        actualTopicCounts.set(row.topicSlug, (actualTopicCounts.get(row.topicSlug) ?? 0) + 1);
        statuses[row.answerStatus] = (statuses[row.answerStatus] ?? 0) + 1;
        for (const match of row.html.matchAll(/src="([^"]+)"/g)) {
          if (!match[1].startsWith('/pyq/')) continue;
          expect(existsSync(path.join(publicRoot, match[1])), `missing ${match[1]}`).toBe(true);
        }
      }
      expect(actualTopicCounts).toEqual(expectedTopicCounts);
    }

    expect(questionCount).toBe(manifest.questionCount);
    expect(topicCount).toBe(95);
    expect(statuses).toEqual(manifest.answerStatuses);
    expect(statuses).toEqual({ available: 2382, ambiguous: 2, 'marks-to-all': 1, unsupported: 3 });
    const taxonomyAudit = JSON.parse(
      readFileSync(path.join(publicRoot, 'pyq', 'taxonomy-audit.json'), 'utf8')
    ) as {
      manualCorrectionCount: number;
      classificationBasis: Record<string, number>;
    };
    expect(taxonomyAudit).toMatchObject({
      questionCount: 2388,
      uniqueQuestionCount: 2388,
      unclassifiedCount: 0,
      subjectCount: 14,
      topicCount: 95,
      manualCorrectionCount: 160
    });
    expect(taxonomyAudit.classificationBasis['manual-content-audit']).toBe(160);

    const representativeCorrections = [
      ['go:422818', 'discrete-mathematics', 'graph-theory'],
      ['go:460041', 'discrete-mathematics', 'group-theory'],
      ['go:460803', 'discrete-mathematics', 'lattice'],
      ['go:523097', 'digital-logic', 'combinational-circuit'],
      ['go:399301', 'digital-logic', 'sequential-circuit'],
      ['go:460056', 'c-programming', 'array-and-pointer'],
      ['go:523145', 'data-structure', 'binary-tree'],
      ['go:523132', 'algorithms', 'asymptotic-notation'],
      ['go:460070', 'algorithms', 'recurrence-relation'],
      ['go:39570', 'algorithms', 'dynamic-programming'],
      ['go:993', 'theory-of-computation', 'regular-language'],
      ['go:39675', 'compiler-design', 'intermediate-code-generation'],
      ['go:204128', 'operating-systems', 'disk-scheduling'],
      ['go:357444', 'computer-networks', 'network-layer-protocol'],
      ['go:8423', 'other-optional', 'software-engineering']
    ] as const;

    for (const [id, subjectSlug, topicSlug] of representativeCorrections) {
      expect(questionsById.get(id), `missing representative correction ${id}`).toMatchObject({
        subjectSlug,
        topicSlug
      });
    }
  });
});
