import { describe, expect, it } from 'vitest';
import {
  derivePyqBenchmarkPaperManifests,
  derivePyqBenchmarkPapers,
  pyqBenchmarkPaperExposure,
  type PyqBenchmarkQuestionInput
} from '@/lib/pyq-benchmark';
import { normalizePyqManifest } from '@/lib/pyq';

function question(section: 'ga' | 'technical', number: number, set = 1): PyqBenchmarkQuestionInput {
  const isOneMark = section === 'ga' ? number <= 5 : number <= 25;
  const types = ['MCQ', 'MSQ', 'NAT'] as const;
  return {
    id: `gate-cse:2026:${set}:${section}:${number}`,
    bookSlug: 'gate-cse',
    paperLabel: `GATE CSE 2026 Set ${set}`,
    year: 2026,
    set,
    number: String(number),
    subjectSlug: section === 'ga' ? 'general-aptitude' : 'algorithms',
    marks: isOneMark ? 1 : 2,
    type: types[number % types.length],
    answerStatus: 'available'
  };
}

function completePaper(set = 1): PyqBenchmarkQuestionInput[] {
  const ga = Array.from({ length: 10 }, (_, index) => question('ga', index + 1, set));
  const technical = Array.from({ length: 55 }, (_, index) => question('technical', index + 1, set));
  // Deliberately put both sections in reverse source order. Catalog order must
  // come solely from section identity and numeric question number.
  return [...technical.reverse(), ...ga.reverse()];
}

describe('PYQ benchmark-paper catalog', () => {
  it('admits complete 65-question, 100-mark GATE CSE papers in official order', () => {
    const papers = derivePyqBenchmarkPaperManifests([...completePaper(2), ...completePaper(1)]);

    expect(papers.map((paper) => paper.id)).toEqual(['gate-cse-2026-set-1', 'gate-cse-2026-set-2']);
    expect(papers[0]).toMatchObject({
      bookSlug: 'gate-cse',
      paperLabel: 'GATE CSE 2026 Set 1',
      year: 2026,
      set: 1,
      questionCount: 65,
      maxMarks: 100
    });
    expect(papers[0].questionUids.slice(0, 10)).toEqual(
      Array.from({ length: 10 }, (_, index) => `gate-cse:2026:1:ga:${index + 1}`)
    );
    expect(papers[0].questionUids.slice(10)).toEqual(
      Array.from({ length: 55 }, (_, index) => `gate-cse:2026:1:technical:${index + 1}`)
    );
  });

  it.each([
    ['fewer than 65 distinct questions', (rows: PyqBenchmarkQuestionInput[]) => rows.slice(1)],
    [
      'a duplicate question UID',
      (rows: PyqBenchmarkQuestionInput[]) =>
        rows.map((row, index) => (index === 0 ? { ...row, id: rows[1].id } : row))
    ],
    [
      'an unknown mark',
      (rows: PyqBenchmarkQuestionInput[]) =>
        rows.map((row, index) => (index === 0 ? { ...row, marks: null } : row))
    ],
    [
      'a total other than 100 marks',
      (rows: PyqBenchmarkQuestionInput[]) =>
        rows.map((row, index) => (index === 0 ? { ...row, marks: 1 as const } : row))
    ],
    [
      'a non-benchmark question type',
      (rows: PyqBenchmarkQuestionInput[]) =>
        rows.map((row, index) => (index === 0 ? { ...row, type: 'AMBIGUOUS' } : row))
    ],
    [
      'a non-available answer status',
      (rows: PyqBenchmarkQuestionInput[]) =>
        rows.map((row, index) => (index === 0 ? { ...row, answerStatus: 'marks-to-all' } : row))
    ],
    [
      'a non-GATE-CSE source',
      (rows: PyqBenchmarkQuestionInput[]) => rows.map((row) => ({ ...row, bookSlug: 'gate-it' }))
    ]
  ])('rejects a paper with %s', (_label, invalidate) => {
    expect(derivePyqBenchmarkPaperManifests(invalidate(completePaper()))).toEqual([]);
  });

  it('counts distinct prior exposure and labels unseen, partial, and repeated papers', () => {
    const [paper] = derivePyqBenchmarkPaperManifests(completePaper());

    expect(pyqBenchmarkPaperExposure(paper, [])).toEqual({
      priorExposureCount: 0,
      freshness: 'unseen',
      sealed: true
    });
    expect(
      pyqBenchmarkPaperExposure(paper, [
        { question_uid: paper.questionUids[0] },
        { question_uid: paper.questionUids[0] },
        { question_uid: paper.questionUids[1] },
        { question_uid: 'outside-this-paper' }
      ])
    ).toEqual({ priorExposureCount: 2, freshness: 'partially_seen', sealed: false });
    expect(
      pyqBenchmarkPaperExposure(
        paper,
        paper.questionUids.map((question_uid) => ({ question_uid }))
      )
    ).toEqual({ priorExposureCount: 65, freshness: 'repeated', sealed: false });
  });

  it('returns exposure alongside derived paper metadata', () => {
    const papers = derivePyqBenchmarkPapers(completePaper(), [
      { question_uid: 'gate-cse:2026:1:technical:1' }
    ]);

    expect(papers[0]).toMatchObject({
      id: 'gate-cse-2026-set-1',
      priorExposureCount: 1,
      freshness: 'partially_seen',
      sealed: false
    });
  });

  it('normalizes manifests generated before benchmark metadata existed', () => {
    const normalized = normalizePyqManifest({
      bankVersion: 'fixture-bank',
      generatedAt: '2026-08-27T00:00:00.000Z',
      source: 'Fixture',
      sourceUrl: 'https://example.com',
      firstYear: 2026,
      lastYear: 2026,
      questionCount: 65,
      imageCount: 0,
      answerStatuses: { available: 65, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
      years: [{ year: 2026, count: 65 }],
      subjects: [],
      books: []
    });

    expect(normalized.benchmarkPapers).toEqual([]);
  });
});
