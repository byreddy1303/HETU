import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluatePyqAnswer,
  formatPyqAnswer,
  inferPyqBookSlug,
  inferPyqDirectOutcome,
  matchesPyqBookScope,
  matchesPyqTopicScope,
  normalizePyqQuestionHtml,
  normalizePyqManifest,
  pyqPlainText,
  pyqAnswerValueForLog,
  resolvePyqJournalImageUrl,
  type PyqManifest,
  type PyqQuestion
} from '@/lib/pyq';

describe('PYQ journal text', () => {
  it('preserves answer labels and line breaks when flattening archived HTML', () => {
    const html = String.raw`<p>Choose the expression:</p><ol style="list-style-type:upper-alpha"><li>$A+B$</li><li>$A-B$</li><li>$AB$</li><li>$A/B$</li></ol>`;

    expect(pyqPlainText(html)).toBe(
      ['Choose the expression:', 'A. $A+B$', 'B. $A-B$', 'C. $AB$', 'D. $A/B$'].join('\n')
    );
  });
});

function question(overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id: 'go:test',
    bookSlug: 'gate-cse',
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

  it('scopes books without weakening legacy or all-book sessions', () => {
    const gateIt = question({ bookSlug: 'gate-it', paperLabel: 'GATE IT 2007' });
    expect(matchesPyqBookScope(gateIt, { bookSlug: 'gate-it' })).toBe(true);
    expect(matchesPyqBookScope(gateIt, { bookSlug: 'gate-cse' })).toBe(false);
    expect(matchesPyqBookScope(gateIt, { bookSlug: 'all' })).toBe(true);
    expect(matchesPyqBookScope(algorithm, {})).toBe(true);
    expect(inferPyqBookSlug('GATE AI 2025')).toBe('gate-da-overlap');
    expect(inferPyqBookSlug('GATE ECE 2019 Set 1')).toBe('gate-cross-digital');
    expect(inferPyqBookSlug('IIIT-H PGEE 2018 · Audited Sample')).toBe('iiith-pgee');
    expect(inferPyqBookSlug('TIFR GS 2026 · Computer Science')).toBe('tifr-gs-cs');
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

    const normalized = normalizePyqManifest(legacyManifest);
    expect(normalized.subjects[0].topics).toEqual([]);
    expect(normalized.defaultBookSlug).toBe('gate-cse');
    expect(normalized.books).toHaveLength(1);
    expect(normalized.books[0]).toMatchObject({
      slug: 'gate-cse',
      difficultyFloor: 'gate',
      count: 1
    });
  });
});

describe('PYQ source HTML normalization', () => {
  it('joins archive line-break tags inside display math', () => {
    const html = String.raw`<p>Match the lists:<br>\[<br>\begin{array}{|l|l|}<br>\hline<br>P & 1 \\<br>\hline<br>\end{array}<br>\]</p>`;
    const normalized = normalizePyqQuestionHtml(html);

    expect(normalized).toContain(String.raw`\begin{array}{|l|l|}`);
    expect(normalized).not.toMatch(/\\\[[\s\S]*?<br\s*\/?>(?=[\s\S]*?\\\])/i);
  });

  it('wraps a bare multiline math environment for KaTeX', () => {
    const html = String.raw`<p>Format:<br>\begin{array}{|l|l|}<br>A & B \\<br>\end{array}</p>`;
    const normalized = normalizePyqQuestionHtml(html);

    expect(normalized).toContain(String.raw`\[\begin{array}{|l|l|}`);
    expect(normalized).toContain(String.raw`\end{array}\]`);
  });

  it('leaves ordinary inline math and HTML structure intact', () => {
    const html = String.raw`<p>If $x &lt; 2$, choose:</p><ol><li>$1$</li></ol>`;
    expect(normalizePyqQuestionHtml(html)).toBe(html);
  });
});

describe('bundled PYQ bank integrity', () => {
  it('contains all 4,210 audited questions and no broken local image references', () => {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const manifest = JSON.parse(
      readFileSync(path.join(publicRoot, 'pyq', 'manifest.json'), 'utf8')
    ) as PyqManifest;
    const ids = new Set<string>();
    const questionsById = new Map<string, PyqQuestion>();
    const statuses: Record<string, number> = {};
    let questionCount = 0;
    let topicCount = 0;
    const repairedQuestions: PyqQuestion[] = [];

    expect(manifest.questionCount).toBe(4210);
    expect(manifest.firstYear).toBe(1990);
    expect(manifest.lastYear).toBe(2026);
    expect(manifest.years).toHaveLength(37);
    expect(manifest.subjects).toHaveLength(14);
    expect(manifest.defaultBookSlug).toBe('gate-cse');
    expect(manifest.books).toHaveLength(11);
    expect(new Set(manifest.books.map((book) => book.difficultyFloor))).toEqual(
      new Set(['gate', 'mixed', 'above-gate'])
    );
    expect(Object.fromEntries(manifest.books.map((book) => [book.slug, book.count]))).toEqual({
      'gate-cse': 2911,
      'gate-it': 360,
      'gate-da-overlap': 89,
      'gate-cross-digital': 259,
      'gate-cross-math': 424,
      'isro-cs-overlap': 45,
      'iiith-pgee': 8,
      'tifr-gs-cs': 36,
      'cmi-cs-objective': 27,
      'ugc-net-cs-overlap': 21,
      'go-classes-coa': 30
    });
    const bookSlugs = new Set(manifest.books.map((book) => book.slug));

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
        expect(bookSlugs.has(row.bookSlug), `unknown book ${row.bookSlug}`).toBe(true);
        expect(row.subject).toBe(subject.label);
        expect(expectedTopicCounts.has(row.topicSlug), `unknown topic ${row.topicSlug}`).toBe(true);
        expect(row.topic.trim().length, `empty topic ${row.id}`).toBeGreaterThan(0);
        const normalizedHtml = normalizePyqQuestionHtml(row.html);
        if (normalizedHtml !== row.html) repairedQuestions.push(row);
        for (const displayMath of normalizedHtml.matchAll(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g)) {
          expect(displayMath[0], `broken display math line in ${row.id}`).not.toMatch(
            /<br\s*\/?>/i
          );
        }
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
    expect(repairedQuestions).toHaveLength(791);
    expect(new Set(repairedQuestions.map((row) => row.subjectSlug)).size).toBe(13);
    expect(new Set(repairedQuestions.map((row) => row.topicSlug)).size).toBe(85);
    expect(statuses).toEqual(manifest.answerStatuses);
    expect(statuses).toEqual({
      available: 4115,
      ambiguous: 3,
      'marks-to-all': 2,
      unsupported: 90
    });
    const taxonomyAudit = JSON.parse(
      readFileSync(path.join(publicRoot, 'pyq', 'taxonomy-audit.json'), 'utf8')
    ) as {
      manualCorrectionCount: number;
      classificationBasis: Record<string, number>;
    };
    expect(taxonomyAudit).toMatchObject({
      questionCount: 4210,
      uniqueQuestionCount: 4210,
      unclassifiedCount: 0,
      subjectCount: 14,
      topicCount: 95,
      manualCorrectionCount: 160
    });
    expect(taxonomyAudit.classificationBasis['manual-content-audit']).toBe(160);

    for (const book of manifest.books) {
      const rows = [...questionsById.values()].filter((row) => row.bookSlug === book.slug);
      expect(rows).toHaveLength(book.count);
      expect(book.subjects.reduce((total, subject) => total + subject.count, 0)).toBe(book.count);
    }
    const newlyImported = [...questionsById.values()].filter((row) =>
      ['gate-it', 'gate-da-overlap'].includes(row.bookSlug)
    );
    expect(newlyImported).toHaveLength(449);
    expect(
      newlyImported.every((row) => ['available', 'marks-to-all'].includes(row.answerStatus))
    ).toBe(true);

    const allQuestions = [...questionsById.values()];
    const variableChoiceQuestions = allQuestions.filter((row) => row.choices !== undefined);
    expect(variableChoiceQuestions).toHaveLength(137);
    expect(variableChoiceQuestions.filter((row) => row.choices?.length === 5)).toHaveLength(44);
    expect(
      variableChoiceQuestions.every((row) => {
        if (row.answerStatus !== 'available' || row.type === 'NAT') return true;
        const answers = Array.isArray(row.answer) ? row.answer : [row.answer];
        return answers.every((answer) => row.choices?.includes(String(answer)));
      })
    ).toBe(true);

    const goClassesCoaTest = allQuestions.filter((row) =>
      row.id.startsWith('goclasses:coa-topic-test:')
    );
    expect(goClassesCoaTest).toHaveLength(15);
    expect(goClassesCoaTest.every((row) => row.subjectSlug === 'coa')).toBe(true);
    expect(new Set(goClassesCoaTest.map((row) => row.topicSlug))).toEqual(
      new Set(['machine-instruction', 'memory-chip-design'])
    );
    expect(
      goClassesCoaTest.every((row) => row.subtopics.includes('goclasses-coa-topic-test'))
    ).toBe(true);
    expect(goClassesCoaTest.map((row) => row.answer)).toEqual([
      'B',
      8,
      19,
      -12,
      192,
      252,
      ['A', 'C', 'D'],
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C'],
      ['A', 'B', 'C'],
      3,
      'B',
      114,
      108,
      109
    ]);

    const goClassesCoaTest2 = allQuestions.filter((row) =>
      row.id.startsWith('goclasses:coa-topic-test-2:')
    );
    expect(goClassesCoaTest2).toHaveLength(15);
    expect(goClassesCoaTest2.every((row) => row.subjectSlug === 'coa')).toBe(true);
    expect(new Set(goClassesCoaTest2.map((row) => row.topicSlug))).toEqual(
      new Set([
        'addressing-modes',
        'machine-instruction',
        'alu-data-path-and-control-unit',
        'pipeline-processor'
      ])
    );
    expect(
      goClassesCoaTest2.every((row) => row.subtopics.includes('goclasses-coa-topic-test-2'))
    ).toBe(true);
    expect(goClassesCoaTest2.map((row) => row.answer)).toEqual([
      1024,
      87,
      'C',
      ['A', 'B'],
      ['B', 'C'],
      'B',
      'C',
      'A',
      'B',
      'C',
      96,
      'A',
      'D',
      'C',
      82032
    ]);

    const cseCounts1990To2001 = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const year = 1990 + index;
        return [
          year,
          allQuestions.filter((row) => row.year === year && row.paperLabel.startsWith('GATE CSE '))
            .length
        ];
      })
    );
    expect(cseCounts1990To2001).toEqual({
      1990: 36,
      1991: 21,
      1992: 24,
      1993: 36,
      1994: 36,
      1995: 51,
      1996: 56,
      1997: 57,
      1998: 57,
      1999: 51,
      2000: 44,
      2001: 54
    });

    const supplementalDigital = allQuestions.filter(
      (row) => row.bookSlug === 'gate-cross-digital'
    );
    expect(supplementalDigital).toHaveLength(259);
    expect(supplementalDigital.filter((row) => row.id.startsWith('es:gate-ece:'))).toHaveLength(
      189
    );
    expect(supplementalDigital.filter((row) => row.id.startsWith('es:gate-ee:'))).toHaveLength(70);
    expect(new Set(supplementalDigital.map((row) => row.topicSlug))).toEqual(
      new Set(['number-system', 'boolean-algebra', 'combinational-circuit', 'sequential-circuit'])
    );
    expect(supplementalDigital.every((row) => row.subjectSlug === 'digital-logic')).toBe(true);

    const supplementalMath = allQuestions.filter((row) => row.bookSlug === 'gate-cross-math');
    expect(supplementalMath).toHaveLength(424);
    expect(
      supplementalMath.every((row) => row.subjectSlug === 'engineering-mathematics')
    ).toBe(true);
    expect(new Set(supplementalMath.map((row) => row.topicSlug))).toEqual(
      new Set(['linear-algebra', 'probability-statistics'])
    );
    for (const excludedId of [
      'es:gate-ece:mh0zaha8',
      'es:gate-ece:lxkz4pq9',
      'es:gate-ece:mnakhyvy',
      'es:gate-ece:QYG4jGkiGfUvKy9W7Xjf7629jjz1ohdez',
      'es:gate-ece:589SRjK3y40rjla4',
      'es:gate-ece:9vcls9FnVvUYretl',
      'es:gate-ee:Ba8wZaECHPY46VeW',
      'es:gate-ece:8pDeC2YQ1GPFFeDM',
      'es:gate-ee:1nULlooFrc4T22Ll',
      'es:gate-ece:ReSpUjRF5CcMjWyG',
      'es:gate-ece:41qJJSu5hHotIUnLHGjf769xsjziqwe4s',
      'es:gate-ece:1l056k4ej'
    ]) {
      expect(questionsById.has(excludedId), `out-of-scope question ${excludedId}`).toBe(false);
    }

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
