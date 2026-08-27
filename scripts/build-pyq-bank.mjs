#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  classifyPyqQuestion,
  PYQ_BANK_QUESTION_COUNT,
  PYQ_BANK_VERSION,
  PYQ_TAXONOMY
} from './pyq-taxonomy.mjs';
import {
  GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
  isMarksMetadataTag,
  marksFromGateQuestionNumber,
  marksFromQuestionContext,
  marksFromQuestionMetadata,
  verifiedPdfAnswerKeyMark,
  VERIFIED_PDF_MARK_POLICY_VERSION
} from './pyq-marks.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'public', 'pyq');
const IMAGE_OUTPUT = path.join(OUTPUT, 'images');
const BUNDLED_CUSTOM_ASSET_DIRS = [
  'go-classes-coa-topic-test',
  'go-classes-coa-topic-test-2'
];
const CUSTOM_QUESTION_PATHS = [
  'go-classes-coa-topic-test.json',
  'go-classes-coa-topic-test-2.json',
  'isro-cs-overlap.json',
  'iiith-pgee.json',
  'tifr-gs-cs.json',
  'cmi-cs-objective.json',
  'ugc-net-cs-overlap.json'
].map((filename) => path.join(SCRIPT_DIR, 'pyq-custom', filename));
const CACHE = '/tmp/air-journal-pyq-cache';
const SOURCE_ROOT = 'https://gateqa.in';
const SEARCH_URL = `${SOURCE_ROOT}/question-search-index.json`;
const ANSWERS_URL = `${SOURCE_ROOT}/data/answers/answers_by_question_uid_v1.json`;
const UNSUPPORTED_URL = `${SOURCE_ROOT}/data/answers/unsupported_question_uids_v1.json`;
const EXAMSIDE_ROOT = 'https://questions.examside.com';
const USER_AGENT = 'HETU personal PYQ archive builder/1.0';
const IMAGE_OVERRIDES = new Map([
  [
    'http://gatecse.in/w/images/c/c5/2012_12.png',
    path.join(SCRIPT_DIR, 'pyq-assets', 'gate-cse-2012-q12-diagram.png')
  ]
]);

const GATE_CSE_TITLE_PATTERN =
  /^GATE CSE (?<year>\d{4})(?:\s*\|?\s*Set\s*[-:]?\s*(?<set>\d+))?\s*\|\s*(?:GA\s*(?:\|\s*)?)?Question:\s*(?<question>.+)$/i;
const GATE_IT_TITLE_PATTERN =
  /^GATE IT (?<year>\d{4})(?:\s*\|?\s*Set\s*[-:]?\s*(?<set>\d+))?\s*\|\s*(?:GA\s*(?:\|\s*)?)?Question:\s*(?<question>.+)$/i;

const PYQ_BOOKS = [
  {
    slug: 'gate-cse',
    label: 'GATE CSE Core',
    shortLabel: 'GATE CSE',
    description: 'The complete CSE archive, including audited restorations for older papers.',
    difficultyFloor: 'gate',
    sourceClass: 'official-exam',
    source: 'GATE CSE',
    sourceUrl: 'https://gate2026.iitg.ac.in/QPs-answer-keys.html',
    expectedCount: 2911
  },
  {
    slug: 'gate-it',
    label: 'GATE IT Archive',
    shortLabel: 'GATE IT',
    description: 'The 2004–2008 Information Technology papers, restricted to the CSE syllabus.',
    difficultyFloor: 'gate',
    sourceClass: 'official-exam',
    source: 'GATE IT',
    sourceUrl: 'https://gateoverflow.in/previous-years',
    expectedCount: 360
  },
  {
    slug: 'gate-da-overlap',
    label: 'GATE DA/AI · CSE Overlap',
    shortLabel: 'GATE DA/AI',
    description: 'Only GATE DA/AI questions that directly exercise the current CSE syllabus.',
    difficultyFloor: 'gate',
    sourceClass: 'official-exam',
    source: 'GATE Data Science & Artificial Intelligence',
    sourceUrl: 'https://gate2026.iitg.ac.in/QPs-answer-keys.html',
    expectedCount: 89
  },
  {
    slug: 'gate-cross-digital',
    label: 'Cross-Branch Digital Logic',
    shortLabel: 'GATE ECE/EE',
    description: 'Audited ECE and EE questions limited to the GATE CSE Digital Logic syllabus.',
    difficultyFloor: 'gate',
    sourceClass: 'official-exam',
    source: 'GATE ECE and EE',
    sourceUrl: 'https://questions.examside.com/past-years/gate',
    expectedCount: 259
  },
  {
    slug: 'gate-cross-math',
    label: 'Cross-Branch Engineering Mathematics',
    shortLabel: 'GATE Math',
    description: 'Official ECE, EE, ME, CE and IN questions limited to Linear Algebra and Probability.',
    difficultyFloor: 'gate',
    sourceClass: 'official-exam',
    source: 'GATE ECE, EE, ME, CE and IN',
    sourceUrl: 'https://questions.examside.com/past-years/gate',
    expectedCount: 424
  },
  {
    slug: 'isro-cs-overlap',
    label: 'ISRO Scientist/Engineer CS',
    shortLabel: 'ISRO CS',
    description: 'Official ISRO CS questions filtered to the current GATE CSE syllabus.',
    difficultyFloor: 'mixed',
    sourceClass: 'official-exam',
    source: 'ISRO Scientist/Engineer CS',
    sourceUrl: 'https://www.isro.gov.in/ICRB_Recruitment9.html',
    expectedCount: 45
  },
  {
    slug: 'iiith-pgee',
    label: 'IIIT-H PGEE · Audited Sample',
    shortLabel: 'IIIT-H PGEE',
    description: 'High-confidence CSE questions from the published PGEE sample, independently keyed.',
    difficultyFloor: 'mixed',
    sourceClass: 'official-sample',
    source: 'IIIT Hyderabad PGEE',
    sourceUrl: 'https://pgadmissions.iiit.ac.in/monsoon_syllabus/',
    expectedCount: 8
  },
  {
    slug: 'tifr-gs-cs',
    label: 'TIFR GS Computer Science',
    shortLabel: 'TIFR GS CS',
    description: 'Official 2022–2026 CS sections with marked solutions; diagram-dependent items are excluded.',
    difficultyFloor: 'above-gate',
    sourceClass: 'official-exam',
    source: 'TIFR Graduate School Computer Science',
    sourceUrl: 'https://main.tifr.res.in/academics/past_question_papers.php',
    expectedCount: 65
  },
  {
    slug: 'cmi-cs-objective',
    label: 'CMI MSc/PhD CS · Objective',
    shortLabel: 'CMI CS',
    description: 'Official Part A objective questions and solutions, excluding diagram-dependent items.',
    difficultyFloor: 'above-gate',
    sourceClass: 'official-exam',
    source: 'Chennai Mathematical Institute Computer Science',
    sourceUrl: 'https://www.cmi.ac.in/admissions/syllabus.php',
    expectedCount: 122
  },
  {
    slug: 'ugc-net-cs-overlap',
    label: 'UGC NET CS · Filtered Overlap',
    shortLabel: 'UGC NET CS',
    description: 'Official keyed questions restricted to useful GATE CSE overlap; dated and flawed items are excluded.',
    difficultyFloor: 'mixed',
    sourceClass: 'official-exam',
    source: 'UGC NET Computer Science',
    sourceUrl: 'https://www.ugcnetonline.in/previous_question_papers.php',
    expectedCount: 21
  },
  {
    slug: 'go-classes-coa',
    label: 'GO Classes COA Topic Tests',
    shortLabel: 'GO Classes COA',
    description: 'Learner-provided COA tests audited to meet the GATE difficulty floor.',
    difficultyFloor: 'gate',
    sourceClass: 'audited-gate-prep',
    source: 'GO Classes',
    sourceUrl: 'https://www.goclasses.in/',
    expectedCount: 30
  }
];
const PYQ_BOOK_BY_SLUG = new Map(PYQ_BOOKS.map((book) => [book.slug, book]));

const SUBJECTS = {
  'General Aptitude': ['general-aptitude', 'General Aptitude'],
  'Discrete Mathematics': ['discrete-mathematics', 'Discrete Mathematics'],
  'Engineering Mathematics': ['engineering-mathematics', 'Engineering Mathematics'],
  'Digital Logic': ['digital-logic', 'Digital Logic'],
  'CO & Architecture': ['coa', 'COA'],
  'Programming and DS': ['programming-and-ds', 'Programming & DS'],
  'Programming in C': ['programming-and-ds', 'Programming & DS'],
  Algorithms: ['algorithms', 'Algorithms'],
  'Theory of Computation': ['theory-of-computation', 'Theory of Computation'],
  'Compiler Design': ['compiler-design', 'Compiler Design'],
  'Operating System': ['operating-systems', 'Operating Systems'],
  Databases: ['databases', 'Databases'],
  'Computer Networks': ['computer-networks', 'Computer Networks'],
  'Other / Optional': ['other-optional', 'Other / Optional']
};

const EXAMSIDE_DIGITAL_LOGIC_CATEGORIES = [
  {
    exam: 'gate-ece',
    path: '/past-years/gate/gate-ece/digital-circuits/number-system-and-code-convertions',
    topicSlug: 'number-system'
  },
  {
    exam: 'gate-ece',
    path: '/past-years/gate/gate-ece/digital-circuits/boolean-algebra',
    topicSlug: 'boolean-algebra'
  },
  {
    exam: 'gate-ece',
    path: '/past-years/gate/gate-ece/digital-circuits/logic-gates',
    topicSlug: 'boolean-algebra'
  },
  {
    exam: 'gate-ece',
    path: '/past-years/gate/gate-ece/digital-circuits/combinational-circuits',
    topicSlug: 'combinational-circuit'
  },
  {
    exam: 'gate-ece',
    path: '/past-years/gate/gate-ece/digital-circuits/sequential-circuits',
    topicSlug: 'sequential-circuit'
  },
  {
    exam: 'gate-ee',
    path: '/past-years/gate/gate-ee/digital-electronics/boolean-algebra',
    topicSlug: 'boolean-algebra'
  },
  {
    exam: 'gate-ee',
    path: '/past-years/gate/gate-ee/digital-electronics/logic-gates',
    topicSlug: 'boolean-algebra'
  },
  {
    exam: 'gate-ee',
    path: '/past-years/gate/gate-ee/digital-electronics/minimization',
    topicSlug: 'boolean-algebra'
  },
  {
    exam: 'gate-ee',
    path: '/past-years/gate/gate-ee/digital-electronics/combinational-circuits',
    topicSlug: 'combinational-circuit'
  },
  {
    exam: 'gate-ee',
    path: '/past-years/gate/gate-ee/digital-electronics/sequential-circuits',
    topicSlug: 'sequential-circuit'
  }
];

const EXAMSIDE_CROSS_BRANCH_MATH_CATEGORIES = [
  ...['gate-ece', 'gate-ee', 'gate-me', 'gate-ce', 'gate-in'].flatMap((exam) => [
    {
      exam,
      path: `/past-years/gate/${exam}/engineering-mathematics/linear-algebra`,
      topicSlug: 'linear-algebra'
    },
    {
      exam,
      path: `/past-years/gate/${exam}/engineering-mathematics/probability-and-statistics`,
      topicSlug: 'probability-statistics'
    }
  ])
];

// GATE DA/AI is admitted only where its published syllabus overlaps the
// current GATE CSE taxonomy. General Aptitude and every ML/AI/Python chapter
// are deliberately absent, so this archive adds problem-solving depth without
// expanding the learner's syllabus by accident.
const EXAMSIDE_GATE_DA_CATEGORIES = [
  ['algorithms/complexity-analysis-and-asymptotic-notations', 'algorithms', 'asymptotic-notation'],
  ['algorithms/divide-and-conquer-method', 'algorithms', 'divide-and-conquer'],
  ['algorithms/dynamic-programming', 'algorithms', 'dynamic-programming'],
  ['algorithms/greedy-method', 'algorithms', 'greedy-technique'],
  ['algorithms/searching-and-sorting', 'algorithms', 'sorting'],
  [
    'calculus-and-optimization/functions-of-a-single-variable-limit-continuity-differentiability-taylor-series',
    'engineering-mathematics',
    'calculus'
  ],
  [
    'calculus-and-optimization/maxima-and-minima-optimization-involving-a-single-variable',
    'engineering-mathematics',
    'calculus'
  ],
  ['data-structures/hashing', 'data-structure', 'hashing'],
  ['data-structures/stacks-and-queues', 'data-structure', 'stack'],
  ['data-structures/trees', 'data-structure', 'n-ary-tree'],
  ['database-management-system-and-warehousing/er-diagrams', 'databases', 'er-model'],
  [
    'database-management-system-and-warehousing/file-structures-and-indexing',
    'databases',
    'file-system'
  ],
  [
    'database-management-system-and-warehousing/functional-dependencies-and-normalization',
    'databases',
    'normal-form'
  ],
  [
    'database-management-system-and-warehousing/relational-algebra',
    'databases',
    'relational-algebra'
  ],
  ['database-management-system-and-warehousing/structured-query-language', 'databases', 'sql'],
  ['discrete-mathematics/combinatorics', 'discrete-mathematics', 'combination'],
  ['discrete-mathematics/graph-theory', 'discrete-mathematics', 'graph-theory'],
  ['discrete-mathematics/mathematical-logic', 'discrete-mathematics', 'propositional-logic'],
  [
    'linear-algebra/determinant-rank-nullity-quadratic-forms',
    'engineering-mathematics',
    'linear-algebra'
  ],
  [
    'linear-algebra/eigenvalues-eigenvectors-lu-qr-decomposition',
    'engineering-mathematics',
    'linear-algebra'
  ],
  [
    'linear-algebra/matrices-types-operations-special-matrices-22-25-properties',
    'engineering-mathematics',
    'linear-algebra'
  ],
  [
    'linear-algebra/systems-of-linear-equations-gaussian-elimination',
    'engineering-mathematics',
    'linear-algebra'
  ],
  [
    'linear-algebra/vectors-vector-spaces-subspaces-linear-dependence-independence',
    'engineering-mathematics',
    'linear-algebra'
  ],
  [
    'probability-and-statistics/conditional-joint-marginal-probability-bayes-theorem',
    'engineering-mathematics',
    'probability-statistics'
  ],
  [
    'probability-and-statistics/counting-permutations-combinations',
    'discrete-mathematics',
    'combination'
  ],
  [
    'probability-and-statistics/expectation-variance-central-limit-theorem',
    'engineering-mathematics',
    'probability-statistics'
  ],
  [
    'probability-and-statistics/mean-median-mode-sd-correlation-covariance',
    'engineering-mathematics',
    'probability-statistics'
  ],
  [
    'probability-and-statistics/probability-axioms-sample-space-events',
    'engineering-mathematics',
    'probability-statistics'
  ],
  [
    'probability-and-statistics/random-variables-probability-distributions',
    'engineering-mathematics',
    'probability-statistics'
  ]
].map(([chapterPath, subjectSlug, topicSlug]) => ({
  exam: 'gate-da',
  path: `/past-years/gate/gate-da/${chapterPath}`,
  chapterPath,
  subjectSlug,
  topicSlug
}));

const EXAMSIDE_CSE_REPLACEMENT_YEARS = new Set([1990, 1991, 1992, 1998, 2001]);
const EXAMSIDE_CSE_SUBJECTS = {
  'theory-of-computation': ['theory-of-computation', 'Theory of Computation'],
  'operating-systems': ['operating-systems', 'Operating Systems'],
  algorithms: ['algorithms', 'Algorithms'],
  'digital-logic': ['digital-logic', 'Digital Logic'],
  'database-management-system': ['databases', 'Databases'],
  'data-structures': ['programming-and-ds', 'Programming & DS'],
  'computer-networks': ['computer-networks', 'Computer Networks'],
  'software-engineering': ['other-optional', 'Other / Optional'],
  'web-technologies': ['other-optional', 'Other / Optional'],
  'compiler-design': ['compiler-design', 'Compiler Design'],
  'general-aptitude': ['general-aptitude', 'General Aptitude'],
  'discrete-mathematics': ['discrete-mathematics', 'Discrete Mathematics'],
  'programming-languages': ['programming-and-ds', 'Programming & DS'],
  'computer-organization': ['coa', 'COA']
};

// ExamSIDE's chapter pages are broader than HETU's GATE CSE Digital Logic
// syllabus. Every exclusion here is audited from the question text; converter,
// memory, logic-family, communication-code, and architecture questions are never
// admitted merely because a source site filed them below a digital heading.
const EXAMSIDE_SCOPE_EXCLUSIONS = new Map([
  ['mh0zaha8', 'Hamming-code communication question'],
  ['lxkz4pq9', 'instruction-format architecture question'],
  ['mnakhyvy', 'transistor-level CMOS circuit'],
  ['QYG4jGkiGfUvKy9W7Xjf7629jjz1ohdez', 'nMOS wired-logic electrical behavior'],
  ['589SRjK3y40rjla4', 'ring-oscillator device-delay question'],
  ['9vcls9FnVvUYretl', 'ring-oscillator device-delay question'],
  ['Ba8wZaECHPY46VeW', 'monoshot multivibrator waveform question'],
  ['8pDeC2YQ1GPFFeDM', 'digital-to-analog converter question'],
  ['1nULlooFrc4T22Ll', 'analog-to-digital converter question'],
  ['ReSpUjRF5CcMjWyG', 'resistor power-dissipation question'],
  ['41qJJSu5hHotIUnLHGjf769xsjziqwe4s', 'probability and sampled-voltage question'],
  ['1l056k4ej', 'Markov-chain transition-probability question']
]);

const EXAMSIDE_TOPIC_OVERRIDES = new Map([
  ['t9TIiZlVbt4G81eX', 'sequential-circuit'],
  ['kcqRiXeOvgtGgoSl', 'sequential-circuit'],
  ['h9diQecoE5EPRFhE', 'sequential-circuit'],
  ['1lfjh1dg3', 'sequential-circuit'],
  ['1U55uIEKgWyWASeB', 'sequential-circuit']
]);

const MANUAL_QUESTIONS = [
  {
    id: 'go:1019',
    year: 2004,
    set: null,
    number: '22',
    subject: 'Computer Networks',
    subjectSlug: 'computer-networks',
    marks: null,
    type: 'MCQ',
    answer: 'B',
    answerStatus: 'available',
    sourceUrl: 'https://gateoverflow.in/1019/gate-cse-2004-question-22',
    tags: ['computer-networks', 'serial-communication'],
    html: `<p>How many $8$-bit characters can be transmitted per second over a $9600$ baud serial communication link using asynchronous mode of transmission with one start bit, eight data bits, two stop bits, and one parity bit?</p><ol style="list-style-type:upper-alpha"><li>$600$</li><li>$800$</li><li>$876$</li><li>$1200$</li></ol>`
  },
  {
    id: 'go:1224',
    year: 2007,
    set: null,
    number: '26',
    subject: 'Engineering Mathematics',
    subjectSlug: 'engineering-mathematics',
    marks: null,
    type: 'MCQ',
    answer: 'C',
    answerStatus: 'available',
    sourceUrl: 'https://gateoverflow.in/1224/gate-cse-2007-question-26',
    tags: ['set-theory', 'partial-order'],
    html: String.raw`<p>Consider the set $S=\{a,b,c,d\}$. Consider the following four partitions $\pi_1,\pi_2,\pi_3,\pi_4$ on $S$: $\pi_1=\{\overline{abcd}\}$, $\pi_2=\{\overline{ab},\overline{cd}\}$, $\pi_3=\{\overline{abc},\overline d\}$, and $\pi_4=\{\bar a,\bar b,\bar c,\bar d\}$. Let $\prec$ be the partial order on $S'=\{\pi_1,\pi_2,\pi_3,\pi_4\}$ where $\pi_i\prec\pi_j$ iff $\pi_i$ refines $\pi_j$. The poset diagram for $(S',\prec)$ is:</p><ol style="list-style-type:upper-alpha"><li><img alt="Option A poset" src="https://gateoverflow.in/?qa=blob&amp;qa_blobid=7063953787985753577"></li><li><img alt="Option B poset" src="https://gateoverflow.in/?qa=blob&amp;qa_blobid=15829712462675881946"></li><li><img alt="Option C poset" src="https://gateoverflow.in/?qa=blob&amp;qa_blobid=6911681601381639870"></li><li><img alt="Option D poset" src="https://gateoverflow.in/?qa=blob&amp;qa_blobid=980281266076466065"></li></ol>`
  },
  {
    id: 'go:67287',
    year: 2008,
    set: null,
    number: '21',
    subject: 'Engineering Mathematics',
    subjectSlug: 'engineering-mathematics',
    marks: 2,
    type: 'MCQ',
    answer: 'A',
    answerStatus: 'available',
    sourceUrl: 'https://gateoverflow.in/67287/gate-cse-2008-question-21',
    tags: ['numerical-methods', 'trapezoidal-rule'],
    html: String.raw`<p>The minimum number of equal-length subintervals needed to approximate $\int_1^2 xe^x\,dx$ to an accuracy of at least $\frac{1}{3}\times10^{-6}$ using the trapezoidal rule is</p><ol style="list-style-type:upper-alpha"><li>$1000e$</li><li>$1000$</li><li>$100e$</li><li>$100$</li></ol>`
  }
];

function normalizedTitle(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugLabel(rawSubject) {
  return SUBJECTS[rawSubject] ?? SUBJECTS['Other / Optional'];
}

function answerStatus(type, hasAnswer, unsupported) {
  if (type === 'AMBIGUOUS') return 'ambiguous';
  if (type === 'MARKS_TO_ALL') return 'marks-to-all';
  if (!hasAnswer || unsupported) return 'unsupported';
  return 'available';
}

// Before the PDF-key authority policy shipped, the builder checked one-mark
// before two-marks. The 2026 archive happens to carry both tags on 91 rows, so
// that legacy ordering emitted the wrong value for the 41 two-mark rows. Keep
// this tiny compatibility parser only to make the corrected-ID provenance
// reproducible; all emitted marks use the conflict-safe parser above.
function legacyArchiveMark(tags) {
  const normalized = (tags ?? []).map((tag) => String(tag).trim().toLowerCase());
  if (normalized.includes('one-mark')) return 1;
  if (normalized.includes('two-marks')) return 2;
  return null;
}

function cleanTags(tags) {
  const ignored =
    /^(?:gate|isro|barc|ugcnet|pgee|tifr|easy$|normal$|hard$|non-gate|out-of|subjective$|descriptive$)/i;
  return [...new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))]
    .filter((tag) => !ignored.test(tag) && !isMarksMetadataTag(tag))
    .slice(0, 8);
}

function sanitizeSourceHtml(value) {
  return String(value ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<(?:iframe|object|embed)\b[\s\S]*?<\/(?:iframe|object|embed)>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\sdata-orsrc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<a\s+name=["'][^"']+["']\s*><\/a>/gi, '')
    .trim();
}

function imageSources(html) {
  return [...String(html).matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) =>
    match[1].replaceAll('&amp;', '&')
  );
}

function isBundledPyqImage(src) {
  return BUNDLED_CUSTOM_ASSET_DIRS.some((directory) =>
    src.startsWith(`/pyq/images/${directory}/`)
  );
}

function customQuestionWithImage(source) {
  const { questionImageUrl, ...question } = source;
  if (!questionImageUrl) return question;
  return {
    ...question,
    html: `${question.html}<figure><img src="${questionImageUrl}" alt="${question.paperLabel} question ${question.number} source screenshot"></figure>`
  };
}

function absoluteImageUrl(src) {
  if (/^data:/i.test(src)) return src;
  const url = new URL(src, SOURCE_ROOT);
  // The detail shards retain the source repository's /Gate_QA prefix, while the
  // deployed static site serves the same assets directly from the site root.
  if (url.origin === SOURCE_ROOT && url.pathname.startsWith('/Gate_QA/')) {
    url.pathname = url.pathname.slice('/Gate_QA'.length);
  }
  return url.href;
}

function naturalQuestionNumber(value) {
  const parts = String(value).match(/\d+/g)?.map(Number) ?? [Number.MAX_SAFE_INTEGER];
  return parts.reduce((score, part, index) => score + part / 100 ** index, 0);
}

function stableQuestionSort(a, b) {
  return (
    b.year - a.year ||
    (b.set ?? 0) - (a.set ?? 0) ||
    naturalQuestionNumber(a.number) - naturalQuestionNumber(b.number) ||
    a.id.localeCompare(b.id)
  );
}

const BENCHMARK_QUESTION_TYPES = new Set(['MCQ', 'MSQ', 'NAT']);
const GATE_CSE_BENCHMARK_LABEL = /^GATE CSE (?<year>\d{4})(?: Set (?<set>\d+))?$/i;

function benchmarkPaperIdentity(question) {
  if (question.bookSlug !== 'gate-cse') return null;
  const paperLabel = normalizedTitle(question.paperLabel);
  const match = paperLabel.match(GATE_CSE_BENCHMARK_LABEL);
  if (!match?.groups) return null;

  const year = Number(match.groups.year);
  const set = match.groups.set == null ? null : Number(match.groups.set);
  if (question.year !== year || question.set !== set) return null;
  return { paperLabel, year, set };
}

function benchmarkQuestionSort(left, right) {
  const leftIsGa = left.subjectSlug === 'general-aptitude' || /^GA[-_\s]*\d+/i.test(left.number);
  const rightIsGa = right.subjectSlug === 'general-aptitude' || /^GA[-_\s]*\d+/i.test(right.number);
  return (
    Number(rightIsGa) - Number(leftIsGa) ||
    naturalQuestionNumber(left.number) - naturalQuestionNumber(right.number) ||
    left.id.localeCompare(right.id)
  );
}

function benchmarkPaperId(paperLabel) {
  return paperLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function benchmarkPapersForManifest(questions) {
  const grouped = new Map();
  for (const question of questions) {
    const identity = benchmarkPaperIdentity(question);
    if (!identity) continue;
    const key = `${identity.year}\u0000${identity.set ?? ''}\u0000${identity.paperLabel}`;
    if (!grouped.has(key)) grouped.set(key, { identity, questionsByUid: new Map() });
    grouped.get(key).questionsByUid.set(question.id, question);
  }

  return [...grouped.values()]
    .flatMap(({ identity, questionsByUid }) => {
      const paperQuestions = [...questionsByUid.values()];
      const hasKnownMarks = paperQuestions.every(
        (question) => question.marks === 1 || question.marks === 2
      );
      const isBenchmark =
        paperQuestions.length === 65 &&
        hasKnownMarks &&
        paperQuestions.reduce((sum, question) => sum + question.marks, 0) === 100 &&
        paperQuestions.every((question) => BENCHMARK_QUESTION_TYPES.has(question.type)) &&
        paperQuestions.every((question) => question.answerStatus === 'available');
      if (!isBenchmark) return [];

      return [
        {
          id: benchmarkPaperId(identity.paperLabel),
          bookSlug: 'gate-cse',
          paperLabel: identity.paperLabel,
          year: identity.year,
          set: identity.set,
          questionCount: 65,
          maxMarks: 100,
          questionUids: paperQuestions.sort(benchmarkQuestionSort).map((question) => question.id)
        }
      ];
    })
    .sort(
      (left, right) =>
        right.year - left.year ||
        (left.set ?? 0) - (right.set ?? 0) ||
        left.paperLabel.localeCompare(right.paperLabel)
    );
}

function questionYears(rows) {
  return [...new Set(rows.map((question) => question.year))]
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      count: rows.filter((question) => question.year === year).length
    }));
}

function questionAnswerStatuses(rows) {
  return Object.fromEntries(
    ['available', 'ambiguous', 'marks-to-all', 'unsupported'].map((status) => [
      status,
      rows.filter((question) => question.answerStatus === status).length
    ])
  );
}

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message ?? lastError}`);
}

async function cachedJson(url, cacheName) {
  await mkdir(CACHE, { recursive: true });
  const cachePath = path.join(CACHE, cacheName);
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    const response = await fetchWithRetry(url);
    const text = await response.text();
    await writeFile(cachePath, text);
    return JSON.parse(text);
  }
}

async function cachedText(url, cacheName) {
  await mkdir(CACHE, { recursive: true });
  const cachePath = path.join(CACHE, cacheName);
  try {
    return await readFile(cachePath, 'utf8');
  } catch {
    const response = await fetchWithRetry(url);
    const text = await response.text();
    await writeFile(cachePath, text);
    return text;
  }
}

function extractJavascriptArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker} in ExamSIDE detail payload`);
  const start = markerIndex + marker.length - 1;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '[') depth += 1;
    if (character === ']' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${marker} in ExamSIDE detail payload`);
}

function examSideQuestionFromHtml(html, href) {
  const document = new JSDOM(html).window.document;
  const payload = [...document.scripts]
    .map((script) => script.textContent ?? '')
    .find((text) => text.includes('questions:['));
  if (!payload) throw new Error(`Missing structured question data in ${href}`);
  const permalink = new URL(href, EXAMSIDE_ROOT).pathname.split('/').at(-1);
  let markerIndex = -1;
  let question = null;
  while ((markerIndex = payload.indexOf('questions:[', markerIndex + 1)) >= 0 && !question) {
    const literal = extractJavascriptArray(payload.slice(markerIndex), 'questions:[');
    // The Svelte payload is a JavaScript object literal rather than JSON. It is
    // downloaded from the fixed, allowlisted archive origin above.
    const rows = Function(`"use strict"; return (${literal});`)();
    const stack = [...rows];
    while (stack.length > 0 && !question) {
      const row = stack.shift();
      if (Array.isArray(row)) stack.push(...row);
      else if (Array.isArray(row?.questions)) stack.push(...row.questions);
      if (row?.question && (row.permalink === permalink || row.question_id === permalink)) {
        question = row;
      }
    }
  }
  if (!question) throw new Error(`Could not match ${permalink} in its ExamSIDE detail payload`);
  return { question, detailTitle: document.title };
}

async function loadExamSideCategorySourceRows(categories, snapshotName) {
  await mkdir(CACHE, { recursive: true });
  const snapshotPath = path.join(CACHE, snapshotName);
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch {
    // A chapter page contains one link per question. Detail pages carry the
    // structured options and answer keys, so fetch them concurrently and cache
    // the resulting source snapshot for repeatable local rebuilds.
    const chapterRows = await Promise.all(
      categories.map(async (category) => {
        const cacheName = `examside-${category.exam}-${category.path.split('/').at(-1)}.html`;
        const html = await cachedText(`${EXAMSIDE_ROOT}${category.path}`, cacheName);
        const document = new JSDOM(html).window.document;
        const hrefs = [
          ...new Set(
            [...document.querySelectorAll('a[href*="/past-years/gate/question/"]')].map((anchor) =>
              anchor.getAttribute('href')
            )
          )
        ].filter(Boolean);
        return hrefs.map((href) => ({ ...category, href }));
      })
    );

    const unique = new Map();
    for (const row of chapterRows.flat()) {
      const key = `${row.exam}:${row.href}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    const jobs = [...unique.values()];
    const results = [];
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        const digest = createHash('sha1').update(job.href).digest('hex').slice(0, 16);
        const url = new URL(job.href, EXAMSIDE_ROOT).href;
        const html = await cachedText(url, `examside-detail-${digest}.html`);
        const detail = examSideQuestionFromHtml(html, job.href);
        results.push({ ...job, ...detail, sourceUrl: url });
      }
    }
    await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, () => worker()));
    results.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
    await writeFile(snapshotPath, `${JSON.stringify(results)}\n`);
    return results;
  }
}

function loadExamSideSourceRows() {
  return loadExamSideCategorySourceRows(
    EXAMSIDE_DIGITAL_LOGIC_CATEGORIES,
    'examside-digital-logic-1990-2026-v1.json'
  );
}

function loadExamSideCrossBranchMathRows() {
  return loadExamSideCategorySourceRows(
    EXAMSIDE_CROSS_BRANCH_MATH_CATEGORIES,
    'examside-cross-branch-math-1990-2026-v1.json'
  );
}

function loadExamSideDaSourceRows() {
  return loadExamSideCategorySourceRows(
    EXAMSIDE_GATE_DA_CATEGORIES,
    'examside-gate-da-cse-overlap-2024-2026-v1.json'
  );
}

async function loadExamSideCseSourceRows() {
  await mkdir(CACHE, { recursive: true });
  const snapshotPath = path.join(CACHE, 'examside-cse-replacement-years-v1.json');
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch {
    const yearRows = await Promise.all(
      [...EXAMSIDE_CSE_REPLACEMENT_YEARS].map(async (year) => {
        const paperPath = `/past-years/year-wise/gate/gate-cse/gate-cse-${year}`;
        const html = await cachedText(
          `${EXAMSIDE_ROOT}${paperPath}`,
          `examside-gate-cse-${year}.html`
        );
        const document = new JSDOM(html).window.document;
        return [...document.querySelectorAll(`a[href^="${paperPath}/"]`)]
          .map((anchor) => ({
            href: anchor.getAttribute('href'),
            archiveNumber: anchor.querySelector('div')?.textContent?.trim() ?? null
          }))
          .filter((row) => row.href && row.archiveNumber);
      })
    );
    const unique = new Map();
    for (const row of yearRows.flat()) {
      if (!unique.has(row.href)) unique.set(row.href, row);
    }
    const jobs = [...unique.values()];
    const results = [];
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        const digest = createHash('sha1').update(job.href).digest('hex').slice(0, 16);
        const url = new URL(job.href, EXAMSIDE_ROOT).href;
        const html = await cachedText(url, `examside-cse-detail-${digest}.html`);
        const detail = examSideQuestionFromHtml(html, job.href);
        results.push({ ...job, ...detail, sourceUrl: url });
      }
    }
    await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, () => worker()));
    results.sort(
      (a, b) =>
        a.question.year - b.question.year ||
        Number(a.archiveNumber) - Number(b.archiveNumber) ||
        a.question.question_id.localeCompare(b.question.question_id)
    );
    await writeFile(snapshotPath, `${JSON.stringify(results)}\n`);
    return results;
  }
}

function numericExamSideKey(value) {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ranges = [
    ...text.matchAll(
      /([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:to|–|—)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi
    )
  ];
  if (ranges.length > 0) {
    const match = ranges.at(-1);
    const lower = Number(match[1]);
    const upper = Number(match[2]);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      return {
        answer: Number(((lower + upper) / 2).toFixed(12)),
        tolerance: { abs: Number((Math.abs(upper - lower) / 2).toFixed(12)) }
      };
    }
  }
  const values = Array.isArray(value) ? value : [value];
  const parsed = values.map((entry) => {
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
    const numbers = String(entry ?? '').match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? [];
    if (numbers.length !== 1) return null;
    const numeric = Number(numbers[0]);
    return Number.isFinite(numeric) ? numeric : null;
  });
  if (parsed.some((entry) => entry == null)) return null;
  return { answer: parsed.length === 1 ? parsed[0] : parsed, tolerance: null };
}

function examSideQuestionType(source) {
  if (source.isBonus || /^\s*MTA\s*$/i.test(String(source.question?.en?.answer ?? '')))
    return 'MARKS_TO_ALL';
  const rawType = String(source.type ?? '').toLowerCase();
  const correct = source.question?.en?.correct_options ?? [];
  if (rawType === 'mcq') return correct.length > 1 ? 'MSQ' : 'MCQ';
  if (rawType === 'msq' || rawType === 'mcqm') return 'MSQ';
  if (['integer', 'nat', 'numeric', 'numerical'].includes(rawType)) return 'NAT';
  if (rawType === 'fill-blanks' && numericExamSideKey(source.question?.en?.answer)) return 'NAT';
  return 'UNSUPPORTED';
}

function examSideAnswer(source, type) {
  if (type === 'MCQ') return source.question?.en?.correct_options?.[0] ?? null;
  if (type === 'MSQ') {
    const correct = source.question?.en?.correct_options ?? [];
    return correct.length > 0 ? correct : null;
  }
  if (type === 'NAT') return numericExamSideKey(source.question?.en?.answer)?.answer ?? null;
  return null;
}

function examSideQuestionHtml(source) {
  const language = source.question?.en ?? {};
  const content = sanitizeSourceHtml(language.content);
  const options = language.options ?? [];
  if (options.length === 0) return content;
  const list = options.map((option) => `<li>${sanitizeSourceHtml(option.content)}</li>`).join('');
  return `${content}<ol style="list-style-type:upper-alpha">${list}</ol>`;
}

function examSidePlainText(source) {
  return String(source.question?.en?.content ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function examSideCseClassification(source) {
  const text = examSidePlainText(source);
  const chapter = source.chapter;
  switch (source.subject) {
    case 'digital-logic':
      if (chapter === 'number-systems') return ['digital-logic', 'number-system'];
      if (chapter === 'combinational-circuits') return ['digital-logic', 'combinational-circuit'];
      if (chapter === 'sequential-circuits') return ['digital-logic', 'sequential-circuit'];
      return ['digital-logic', 'boolean-algebra'];
    case 'discrete-mathematics':
      if (chapter === 'calculus') return ['engineering-mathematics', 'calculus'];
      if (chapter === 'linear-algebra') return ['engineering-mathematics', 'linear-algebra'];
      if (chapter === 'probability') return ['engineering-mathematics', 'probability-statistics'];
      if (chapter === 'combinatorics') return ['discrete-mathematics', 'combination'];
      if (chapter === 'mathematical-logic') return ['discrete-mathematics', 'propositional-logic'];
      if (chapter === 'graph-theory') {
        if (/tautolog/.test(text)) return ['discrete-mathematics', 'propositional-logic'];
        if (/planar|kuratowski|homeomorphic/.test(text))
          return ['discrete-mathematics', 'planar-graph'];
        return ['discrete-mathematics', 'graph-theory'];
      }
      if (/\bgroup\b|semigroup/.test(text)) return ['discrete-mathematics', 'group-theory'];
      if (/relation|partition|equivalence/.test(text)) return ['discrete-mathematics', 'relation'];
      if (/\bfunction|\bonto\b|one.to.one/.test(text)) return ['discrete-mathematics', 'functions'];
      return ['discrete-mathematics', 'set-theory'];
    case 'algorithms':
      if (/minimum spanning tree|kruskal|prim(?:'s)?/.test(text))
        return ['algorithms', 'minimum-spanning-tree'];
      if (/shortest path|shortest distances|floyd/.test(text)) {
        return chapter === 'dynamic-programming'
          ? ['algorithms', 'dynamic-programming']
          : ['algorithms', 'shortest-path'];
      }
      if (/breadth.first|depth.first|biconnected/.test(text))
        return ['algorithms', 'graph-traversal'];
      if (/\bavl\b/.test(text)) return ['data-structure', 'avl-tree'];
      if (/hash table|linear probing/.test(text)) return ['data-structure', 'hashing'];
      if (/binary heap/.test(text)) return ['data-structure', 'heap-tree'];
      if (chapter === 'dynamic-programming') return ['algorithms', 'dynamic-programming'];
      if (chapter === 'greedy-method') return ['algorithms', 'greedy-technique'];
      if (chapter === 'divide-and-conquer-method') return ['algorithms', 'divide-and-conquer'];
      if (chapter === 'searching-and-sorting') return ['algorithms', 'sorting'];
      if (/recurrence/.test(text)) return ['algorithms', 'recurrence-relation'];
      return ['algorithms', 'asymptotic-notation'];
    case 'data-structures':
      if (/breadth.first|depth.first/.test(text)) return ['algorithms', 'graph-traversal'];
      if (chapter === 'graphs') return ['discrete-mathematics', 'graph-theory'];
      if (chapter === 'arrays') return ['data-structure', 'array'];
      if (chapter === 'stacks-and-queues') {
        return /function fun|recurs/.test(text)
          ? ['c-programming', 'function']
          : ['data-structure', 'stack'];
      }
      if (/binary tree/.test(text)) return ['data-structure', 'binary-tree'];
      return ['data-structure', 'n-ary-tree'];
    case 'computer-organization':
      if (chapter === 'computer-arithmetic') return ['digital-logic', 'number-system'];
      if (chapter === 'memory-interfacing') return ['coa', 'cache-memory'];
      if (chapter === 'machine-instructions-and-addressing-modes')
        return ['coa', 'addressing-modes'];
      if (chapter === 'alu-data-path-and-control-unit')
        return ['coa', 'alu-data-path-and-control-unit'];
      if (/interrupt/.test(text)) return ['coa', 'interrupt'];
      return ['coa', 'io-interface'];
    case 'compiler-design':
      if (chapter === 'lexical-analysis') return ['compiler-design', 'lexical-analysis'];
      if (chapter === 'parsing') return ['compiler-design', 'parsing'];
      return ['compiler-design', 'matching'];
    case 'operating-systems':
      if (chapter === 'deadlocks') return ['operating-systems', 'deadlock'];
      if (/disk scheduling|cylinders?|sstf|scan algorithm/.test(text))
        return ['operating-systems', 'disk-scheduling'];
      if (/semaphore|peterson|critical section|monitor/.test(text))
        return ['operating-systems', 'process-synchronization'];
      if (/virtual memory|page |paging|swap space|memory|partition|working set|overlay/.test(text))
        return ['operating-systems', 'memory-management'];
      if (/scheduling|round.robin|run times|response ratio|jobs are waiting/.test(text))
        return ['operating-systems', 'cpu-scheduling'];
      if (chapter === 'file-system-io-and-protection') return ['operating-systems', 'file-systems'];
      if (/system call|privileged|software interrupt|link editor|link.load/.test(text))
        return ['operating-systems', 'system-call'];
      return ['operating-systems', 'process'];
    case 'database-management-system':
      if (/relational calculus/.test(text)) return ['databases', 'tuple-calculus'];
      if (chapter === 'relational-algebra') return ['databases', 'relational-algebra'];
      if (chapter === 'functional-dependencies-and-normalization')
        return ['databases', 'normal-form'];
      if (chapter === 'structured-query-language') return ['databases', 'sql'];
      return ['databases', 'file-system'];
    case 'theory-of-computation':
      if (/context.free grammar|chomsky normal form/.test(text))
        return ['theory-of-computation', 'context-free-grammar'];
      if (/context.free language|\bcfl/.test(text))
        return ['theory-of-computation', 'context-free-language'];
      if (/regular expression/.test(text)) return ['theory-of-computation', 'regular-expression'];
      if (/undecid|decidable|halts?/.test(text)) return ['theory-of-computation', 'undecidability'];
      if (/turing machine|non-deterministic machine/.test(text))
        return ['theory-of-computation', 'turing-machine'];
      if (/recursively enumerable|recursive language/.test(text))
        return ['theory-of-computation', 'recursive-language'];
      if (/dfa|nfa|finite.state|finite automa/.test(text))
        return ['theory-of-computation', 'finite-automata'];
      if (/substrings of different lengths/.test(text))
        return ['discrete-mathematics', 'combination'];
      return ['theory-of-computation', 'regular-language'];
    case 'programming-languages':
      if (chapter === 'pointer-and-structure-in-c') return ['c-programming', 'array-and-pointer'];
      if (chapter === 'function-and-recursion' || /parameter|activation record|call by/.test(text))
        return ['c-programming', 'function'];
      return ['c-programming', 'arithmetic-operation'];
    default: {
      const [subjectSlug] = EXAMSIDE_CSE_SUBJECTS[source.subject];
      return [
        subjectSlug,
        subjectSlug === 'general-aptitude' ? 'general-aptitude' : 'software-engineering'
      ];
    }
  }
}

function examSideDaClassification(row) {
  const text = examSidePlainText(row.question);
  if (row.chapterPath === 'data-structures/stacks-and-queues') {
    return [row.subjectSlug, /\bqueue\b|\bfifo\b/.test(text) ? 'queue' : 'stack'];
  }
  if (row.chapterPath === 'data-structures/trees') {
    if (/\bavl\b/.test(text)) return [row.subjectSlug, 'avl-tree'];
    if (/binary search tree|\bbst\b/.test(text)) return [row.subjectSlug, 'binary-search-tree'];
    if (/\bheap\b/.test(text)) return [row.subjectSlug, 'heap-tree'];
    if (/binary tree/.test(text)) return [row.subjectSlug, 'binary-tree'];
  }
  return [row.subjectSlug, row.topicSlug];
}

async function examSideDaQuestions() {
  const sourceRows = await loadExamSideDaSourceRows();
  const questions = [];
  for (const row of sourceRows) {
    const source = row.question;
    if (source.year < 2024 || source.year > 2026 || source.isOutOfSyllabus) continue;
    const type = examSideQuestionType(source);
    const answer = examSideAnswer(source, type);
    const numericKey = type === 'NAT' ? numericExamSideKey(source.question?.en?.answer) : null;
    const hasAnswer = answer != null && (!Array.isArray(answer) || answer.length > 0);
    const answerState = type === 'MARKS_TO_ALL'
      ? 'marks-to-all'
      : answerStatus(type, hasAnswer, !hasAnswer);
    const numberMatch = String(row.detailTitle ?? '').match(/\bQuestion\s+([\d.]+)/i);
    const setMatch = String(source.paperTitle ?? '').match(/\bSet\s*(\d+)/i);
    const [subjectSlug, topicSlug] = examSideDaClassification(row);
    const subject = PYQ_TAXONOMY.find((candidate) => candidate.slug === subjectSlug)?.label;
    if (!subject) throw new Error(`Unknown GATE DA subject scope: ${subjectSlug}`);
    questions.push({
      id: `es:${source.exam}:${source.question_id}`,
      bookSlug: 'gate-da-overlap',
      year: source.year,
      set: setMatch ? Number(setMatch[1]) : null,
      number: numberMatch?.[1] ?? source.question_id,
      paperLabel: source.paperTitle || `GATE DA ${source.year}`,
      subject,
      subjectSlug,
      classificationHint: { subjectSlug, topicSlug },
      subtopics: [row.chapterPath, source.chapter].filter(Boolean),
      marks: source.marks === 1 || source.marks === 2 ? source.marks : null,
      type,
      answer,
      tolerance: numericKey?.tolerance ?? null,
      answerStatus: answerState,
      html: examSideQuestionHtml(source),
      sourceUrl: row.sourceUrl,
      answerSource: { kind: 'examside-key', url: row.sourceUrl }
    });
  }
  if (questions.length !== PYQ_BOOK_BY_SLUG.get('gate-da-overlap').expectedCount) {
    throw new Error(`Expected 89 audited GATE DA/AI CSE-overlap questions, found ${questions.length}`);
  }
  const unkeyed = questions.filter(
    (question) => !['available', 'marks-to-all'].includes(question.answerStatus)
  );
  if (unkeyed.length > 0) {
    throw new Error(
      `GATE DA/AI admission rejected ${unkeyed.length} question(s) without authoritative keys: ${unkeyed.map((question) => question.id).join(', ')}`
    );
  }
  return questions;
}

async function examSideDigitalLogicQuestions() {
  const sourceRows = await loadExamSideSourceRows();
  const accepted = [];
  for (const row of sourceRows) {
    const source = row.question;
    if (source.year < 1990 || source.year > 2026 || source.isOutOfSyllabus) continue;
    if (EXAMSIDE_SCOPE_EXCLUSIONS.has(source.question_id)) continue;
    const type = examSideQuestionType(source);
    const answer = examSideAnswer(source, type);
    const numericKey = type === 'NAT' ? numericExamSideKey(source.question?.en?.answer) : null;
    const setMatch = String(source.paperTitle ?? '').match(/\bSet\s*(\d+)/i);
    const numberMatch = String(row.detailTitle ?? '').match(/\bQuestion\s+([\d.]+)/i);
    const hasAnswer = answer != null && (!Array.isArray(answer) || answer.length > 0);
    const topicSlug = EXAMSIDE_TOPIC_OVERRIDES.get(source.question_id) ?? row.topicSlug;
    accepted.push({
      id: `es:${source.exam}:${source.question_id}`,
      bookSlug: 'gate-cross-digital',
      year: source.year,
      set: setMatch ? Number(setMatch[1]) : null,
      number: numberMatch?.[1] ?? source.question_id,
      paperLabel: source.paperTitle,
      subject: 'Digital Logic',
      subjectSlug: 'digital-logic',
      classificationHint: { subjectSlug: 'digital-logic', topicSlug },
      subtopics: [topicSlug, source.chapter],
      marks: source.marks === 1 || source.marks === 2 ? source.marks : null,
      type,
      answer,
      tolerance: numericKey?.tolerance ?? null,
      answerStatus:
        type === 'MARKS_TO_ALL' ? 'marks-to-all' : answerStatus(type, hasAnswer, !hasAnswer),
      html: examSideQuestionHtml(source),
      sourceUrl: row.sourceUrl,
      answerSource: { kind: 'examside-key', url: row.sourceUrl }
    });
  }
  const examCounts = Object.groupBy(accepted, (question) => question.id.split(':')[1]);
  if (
    accepted.length !== 259 ||
    examCounts['gate-ece']?.length !== 189 ||
    examCounts['gate-ee']?.length !== 70
  ) {
    throw new Error(
      `Expected 259 audited ECE/EE Digital Logic questions (189 ECE, 70 EE), found ${accepted.length}`
    );
  }
  return accepted;
}

async function examSideCrossBranchMathQuestions() {
  const sourceRows = await loadExamSideCrossBranchMathRows();
  const accepted = [];
  for (const row of sourceRows) {
    const source = row.question;
    if (source.year < 1990 || source.year > 2026 || source.isOutOfSyllabus) continue;
    const type = examSideQuestionType(source);
    const answer = examSideAnswer(source, type);
    const numericKey = type === 'NAT' ? numericExamSideKey(source.question?.en?.answer) : null;
    const hasAnswer = answer != null && (!Array.isArray(answer) || answer.length > 0);
    const answerState =
      type === 'MARKS_TO_ALL' ? 'marks-to-all' : answerStatus(type, hasAnswer, !hasAnswer);
    if (!['available', 'marks-to-all'].includes(answerState)) continue;
    const setMatch = String(source.paperTitle ?? '').match(/\bSet\s*(\d+)/i);
    const numberMatch = String(row.detailTitle ?? '').match(/\bQuestion\s+([\d.]+)/i);
    accepted.push({
      id: `es:${source.exam}:${source.question_id}`,
      bookSlug: 'gate-cross-math',
      year: source.year,
      set: setMatch ? Number(setMatch[1]) : null,
      number: numberMatch?.[1] ?? source.question_id,
      paperLabel: source.paperTitle,
      subject: 'Engineering Mathematics',
      subjectSlug: 'engineering-mathematics',
      classificationHint: {
        subjectSlug: 'engineering-mathematics',
        topicSlug: row.topicSlug
      },
      subtopics: [row.topicSlug, source.chapter].filter(Boolean),
      marks: source.marks === 1 || source.marks === 2 ? source.marks : null,
      type,
      answer,
      tolerance: numericKey?.tolerance ?? null,
      answerStatus: answerState,
      html: examSideQuestionHtml(source),
      sourceUrl: row.sourceUrl,
      answerSource: { kind: 'examside-key', url: row.sourceUrl }
    });
  }
  return accepted;
}

async function examSideCseQuestions() {
  const sourceRows = await loadExamSideCseSourceRows();
  const questions = sourceRows.map((row) => {
    const source = row.question;
    const subjectMapping = EXAMSIDE_CSE_SUBJECTS[source.subject];
    if (!subjectMapping) throw new Error(`Unmapped ExamSIDE CSE subject: ${source.subject}`);
    const [subjectSlug, subject] = subjectMapping;
    const [canonicalSubjectSlug, canonicalTopicSlug] = examSideCseClassification(source);
    const type = examSideQuestionType(source);
    const answer = examSideAnswer(source, type);
    const numericKey = type === 'NAT' ? numericExamSideKey(source.question?.en?.answer) : null;
    const setMatch = String(source.paperTitle ?? '').match(/\bSet\s*(\d+)/i);
    const hasAnswer = answer != null && (!Array.isArray(answer) || answer.length > 0);
    return {
      id: `es:${source.exam}:${source.question_id}`,
      bookSlug: 'gate-cse',
      year: source.year,
      set: setMatch ? Number(setMatch[1]) : null,
      number: String(row.archiveNumber),
      paperLabel: source.paperTitle,
      subject,
      subjectSlug,
      classificationHint: {
        subjectSlug: canonicalSubjectSlug,
        topicSlug: canonicalTopicSlug
      },
      subtopics: [source.chapter].filter(Boolean),
      marks:
        source.marks === 1 || source.marks === 2
          ? source.marks
          : marksFromGateQuestionNumber({
              bookSlug: 'gate-cse',
              year: source.year,
              number: String(row.archiveNumber),
              subjectSlug
            }),
      type,
      answer,
      tolerance: numericKey?.tolerance ?? null,
      answerStatus:
        type === 'MARKS_TO_ALL' ? 'marks-to-all' : answerStatus(type, hasAnswer, !hasAnswer),
      html: examSideQuestionHtml(source),
      sourceUrl: row.sourceUrl,
      answerSource: { kind: 'examside-key', url: row.sourceUrl }
    };
  });
  if (questions.length !== 192)
    throw new Error(`Expected 192 CSE gap-fill questions, found ${questions.length}`);
  return questions;
}

function imageExtension(contentType, url) {
  const known = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg'
  };
  if (known[contentType]) return known[contentType];
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.(?:png|jpe?g|webp|gif|svg)$/.test(ext) ? ext : '.img';
}

async function downloadImages(urls) {
  const map = new Map();
  await mkdir(IMAGE_OUTPUT, { recursive: true });
  const queue = [...urls].filter((url) => !url.startsWith('data:'));
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const url = queue[cursor];
      cursor += 1;
      const overridePath = IMAGE_OVERRIDES.get(url);
      let bytes;
      let extension;
      if (overridePath) {
        bytes = await readFile(overridePath);
        extension = path.extname(overridePath);
      } else {
        const response = await fetchWithRetry(url);
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0];
        if (!contentType.startsWith('image/')) {
          throw new Error(`Expected an image from ${url}, received ${contentType || 'unknown'}`);
        }
        bytes = Buffer.from(await response.arrayBuffer());
        extension = imageExtension(contentType, url);
      }
      if (extension === '.svg') {
        bytes = Buffer.from(
          bytes.toString('utf8').replaceAll('\r\n', '\n').replace(/[ \t]+\n/g, '\n')
        );
      }
      const digest = createHash('sha1').update(url).digest('hex').slice(0, 12);
      const filename = `${digest}${extension}`;
      await writeFile(path.join(IMAGE_OUTPUT, filename), bytes);
      map.set(url, `/pyq/images/${filename}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, () => worker()));
  return map;
}

function localizedHtml(html, imageMap) {
  let localized = html;
  for (const src of imageSources(html)) {
    if (isBundledPyqImage(src)) continue;
    const absolute = absoluteImageUrl(src);
    const local = imageMap.get(absolute);
    if (!local) throw new Error(`No local image mapping for ${absolute}`);
    localized = localized.split(src).join(local).split(src.replaceAll('&', '&amp;')).join(local);
  }
  return localized.replace(/<img\b/gi, '<img loading="lazy" decoding="async"');
}

async function main() {
  const [
    searchIndex,
    answerPayload,
    unsupportedPayload,
    supplementalDigitalLogic,
    supplementalCrossBranchMath,
    supplementalCse,
    supplementalDa,
    customQuestionPayloads
  ] = await Promise.all([
    cachedJson(SEARCH_URL, 'question-search-index.json'),
    cachedJson(ANSWERS_URL, 'answers-by-question-uid.json'),
    cachedJson(UNSUPPORTED_URL, 'unsupported-question-uids.json'),
    examSideDigitalLogicQuestions(),
    examSideCrossBranchMathQuestions(),
    examSideCseQuestions(),
    examSideDaQuestions(),
    Promise.all(
      CUSTOM_QUESTION_PATHS.map((filename) => readFile(filename, 'utf8').then(JSON.parse))
    )
  ]);
  const answers = answerPayload.records_by_question_uid ?? answerPayload;
  const unsupported = new Set(unsupportedPayload.question_uids ?? []);
  const correctedPdfMarkIds = [];

  const primary = [];
  for (const source of searchIndex) {
    const title = normalizedTitle(source.title);
    const cseMatch = title.match(GATE_CSE_TITLE_PATTERN);
    const itMatch = title.match(GATE_IT_TITLE_PATTERN);
    const match = cseMatch ?? itMatch;
    if (!match) continue;
    const year = Number(match.groups.year);
    if (year < 1990 || year > 2026) continue;
    if (cseMatch && EXAMSIDE_CSE_REPLACEMENT_YEARS.has(year)) continue;
    if (itMatch && source.subjectLabel === 'Other / Optional') continue;
    const paperKind = itMatch ? 'IT' : 'CSE';
    primary.push({
      ...source,
      bookSlug: itMatch ? 'gate-it' : 'gate-cse',
      parsedYear: year,
      parsedSet: match.groups.set ? Number(match.groups.set) : null,
      parsedNumber: match.groups.question,
      parsedPaperLabel: `GATE ${paperKind} ${year}${match.groups.set ? ` Set ${match.groups.set}` : ''}`
    });
  }

  const shardKeys = [...new Set(primary.map((row) => row.detailShardKey))];
  const shardEntries = await Promise.all(
    shardKeys.map(async (key) => [
      key,
      await cachedJson(
        `${SOURCE_ROOT}/question-detail-shards/${encodeURIComponent(key)}.json`,
        `question-detail-${key}.json`
      )
    ])
  );
  const shards = new Map(shardEntries);

  const questions = primary.map((source) => {
    const detail = shards.get(source.detailShardKey)?.recordsByQuestionUid?.[source.question_uid];
    if (!detail?.question)
      throw new Error(`Missing full question detail for ${source.question_uid}`);
    const answerMeta = answers[source.question_uid] ?? null;
    const [subjectSlug, subject] = slugLabel(source.subjectLabel);
    const metadataTags = detail.tags ?? source.tags ?? [];
    const markMetadataTags = [...(detail.tags ?? []), ...(source.tags ?? [])];
    const tags = cleanTags(metadataTags);
    const type = String(answerMeta?.type || source.type || 'UNSUPPORTED').toUpperCase();
    const verifiedPdfMark = verifiedPdfAnswerKeyMark(answerMeta?.source);
    const legacyMark = legacyArchiveMark(markMetadataTags);
    if (verifiedPdfMark != null && legacyMark != null && verifiedPdfMark !== legacyMark) {
      correctedPdfMarkIds.push(source.question_uid);
    }
    const questionContext = {
      bookSlug: source.bookSlug,
      year: source.parsedYear,
      number: source.parsedNumber,
      subjectSlug
    };
    return {
      id: source.question_uid,
      bookSlug: source.bookSlug,
      year: source.parsedYear,
      set: source.parsedSet,
      number: source.parsedNumber,
      paperLabel: source.parsedPaperLabel,
      subject,
      subjectSlug,
      subtopics: tags,
      // The structured official PDF key wins when archive tags contradict
      // one another (notably on the 2026 CSE papers); documented GATE paper
      // numbering is the fallback when archive metadata omits marks.
      marks: marksFromQuestionContext(questionContext, markMetadataTags, answerMeta?.source),
      type,
      answer: answerMeta?.answer ?? null,
      tolerance: answerMeta?.tolerance ?? null,
      answerStatus: answerStatus(type, Boolean(answerMeta), unsupported.has(source.question_uid)),
      html: sanitizeSourceHtml(detail.question),
      sourceUrl: detail.link || source.link,
      answerSource: answerMeta?.source ?? null
    };
  });

  questions.push(
    ...MANUAL_QUESTIONS.map((question) => {
      const row = {
        ...question,
        bookSlug: 'gate-cse',
        paperLabel: `GATE CSE ${question.year}`,
        subtopics: question.tags,
        tolerance: null,
        answerSource: { kind: 'manual-audit' }
      };
      return {
        ...row,
        marks:
          question.marks === 1 || question.marks === 2
            ? question.marks
            : marksFromGateQuestionNumber(row)
      };
    })
  );
  questions.push(...supplementalCse);
  questions.push(...supplementalDa);
  questions.push(...supplementalDigitalLogic);
  questions.push(...supplementalCrossBranchMath);
  questions.push(
    ...customQuestionPayloads.flatMap((payload) =>
      payload.questions.map((question) => ({
        ...customQuestionWithImage(question),
        bookSlug: payload.bookSlug ?? 'go-classes-coa'
      }))
    )
  );
  for (const question of questions) {
    const classification = classifyPyqQuestion(question);
    question.subject = classification.subject;
    question.subjectSlug = classification.subjectSlug;
    question.topic = classification.topic;
    question.topicSlug = classification.topicSlug;
  }
  questions.sort(stableQuestionSort);

  if (questions.length !== PYQ_BANK_QUESTION_COUNT)
    throw new Error(
      `Expected ${PYQ_BANK_QUESTION_COUNT.toLocaleString()} audited questions, found ${questions.length}`
    );
  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) throw new Error('Duplicate question IDs found in the bank');
  for (const question of questions) {
    if (!PYQ_BOOK_BY_SLUG.has(question.bookSlug)) {
      throw new Error(`Question ${question.id} has an unknown book: ${question.bookSlug}`);
    }
  }
  for (const book of PYQ_BOOKS) {
    if (!['gate', 'above-gate', 'mixed'].includes(book.difficultyFloor)) {
      throw new Error(`Book ${book.slug} has an invalid difficulty band`);
    }
    const bookQuestions = questions.filter((question) => question.bookSlug === book.slug);
    if (bookQuestions.length !== book.expectedCount) {
      throw new Error(
        `Expected ${book.expectedCount} questions in ${book.slug}, found ${bookQuestions.length}`
      );
    }
  }
  const gateItUnkeyed = questions.filter(
    (question) =>
      question.bookSlug === 'gate-it' &&
      !['available', 'marks-to-all'].includes(question.answerStatus)
  );
  if (gateItUnkeyed.length > 0) {
    throw new Error(
      `GATE IT admission rejected ${gateItUnkeyed.length} question(s) without authoritative keys: ${gateItUnkeyed.map((question) => question.id).join(', ')}`
    );
  }

  const remoteImages = new Set();
  const bundledImages = new Set();
  for (const question of questions) {
    for (const src of imageSources(question.html)) {
      if (isBundledPyqImage(src)) bundledImages.add(src);
      else remoteImages.add(absoluteImageUrl(src));
    }
  }

  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
  const imageMap = await downloadImages(remoteImages);
  await Promise.all(
    BUNDLED_CUSTOM_ASSET_DIRS.map((directory) =>
      cp(
        path.join(SCRIPT_DIR, 'pyq-assets', directory),
        path.join(IMAGE_OUTPUT, directory),
        {
          recursive: true,
          filter: (source) => path.basename(source) !== 'README.md'
        }
      )
    )
  );
  for (const question of questions) question.html = localizedHtml(question.html, imageMap);

  const grouped = new Map();
  for (const question of questions) {
    if (!grouped.has(question.subjectSlug)) grouped.set(question.subjectSlug, []);
    grouped.get(question.subjectSlug).push(question);
  }

  const subjects = PYQ_TAXONOMY.filter((subject) => grouped.has(subject.slug)).map((subject) => {
    const rows = grouped.get(subject.slug);
    return {
      slug: subject.slug,
      label: subject.label,
      count: rows.length,
      file: `/pyq/subjects/${subject.slug}.json`,
      topics: subject.topics
        .map((topic) => ({
          ...topic,
          count: rows.filter((question) => question.topicSlug === topic.slug).length
        }))
        .filter((topic) => topic.count > 0)
    };
  });
  await mkdir(path.join(OUTPUT, 'subjects'), { recursive: true });
  await Promise.all(
    subjects.map(({ slug }) =>
      writeFile(
        path.join(OUTPUT, 'subjects', `${slug}.json`),
        `${JSON.stringify({ bankVersion: PYQ_BANK_VERSION, subject: slug, questions: grouped.get(slug) })}\n`
      )
    )
  );

  const years = questionYears(questions);
  const answerStatuses = questionAnswerStatuses(questions);
  const verifiedPdfMarkRows = questions.filter(
    (question) => verifiedPdfAnswerKeyMark(question.answerSource) != null
  );
  const verifiedPdfMarkMismatches = verifiedPdfMarkRows.filter(
    (question) => question.marks !== verifiedPdfAnswerKeyMark(question.answerSource)
  );
  const verifiedPdfMarkMetadata = {
    policyVersion: VERIFIED_PDF_MARK_POLICY_VERSION,
    authoritativeSourceKind: 'pdf_answer_key',
    questionCount: verifiedPdfMarkRows.length,
    oneMarkCount: verifiedPdfMarkRows.filter((question) => question.marks === 1).length,
    twoMarkCount: verifiedPdfMarkRows.filter((question) => question.marks === 2).length,
    correctedQuestionIds: [...new Set(correctedPdfMarkIds)].sort()
  };
  if (
    verifiedPdfMarkMetadata.questionCount !== 130 ||
    verifiedPdfMarkMetadata.oneMarkCount !== 60 ||
    verifiedPdfMarkMetadata.twoMarkCount !== 70 ||
    verifiedPdfMarkMetadata.correctedQuestionIds.length !== 41 ||
    verifiedPdfMarkMismatches.length > 0
  ) {
    throw new Error(
      `Verified PDF mark invariant failed: ${JSON.stringify({
        ...verifiedPdfMarkMetadata,
        mismatchIds: verifiedPdfMarkMismatches.map((question) => question.id)
      })}`
    );
  }
  const books = PYQ_BOOKS.map(({ expectedCount, ...book }) => {
    const rows = questions.filter((question) => question.bookSlug === book.slug);
    const bookYears = questionYears(rows);
    const bookSubjects = PYQ_TAXONOMY.flatMap((subject) => {
      const subjectRows = rows.filter((question) => question.subjectSlug === subject.slug);
      if (subjectRows.length === 0) return [];
      return [
        {
          slug: subject.slug,
          label: subject.label,
          count: subjectRows.length,
          file: `/pyq/subjects/${subject.slug}.json`,
          topics: subject.topics
            .map((topic) => ({
              ...topic,
              count: subjectRows.filter((question) => question.topicSlug === topic.slug).length
            }))
            .filter((topic) => topic.count > 0)
        }
      ];
    });
    return {
      ...book,
      count: rows.length,
      firstYear: Math.min(...rows.map((question) => question.year)),
      lastYear: Math.max(...rows.map((question) => question.year)),
      answerStatuses: questionAnswerStatuses(rows),
      years: bookYears,
      subjects: bookSubjects
    };
  });
  const benchmarkPapers = benchmarkPapersForManifest(questions);
  const manifest = {
    bankVersion: PYQ_BANK_VERSION,
    generatedAt: new Date().toISOString(),
    source:
      'Audited GATE, ISRO, IIIT-H PGEE sample, TIFR GS, CMI and UGC NET Computer Science archives plus GO Classes COA topic tests',
    sourceUrl: SOURCE_ROOT,
    defaultBookSlug: 'gate-cse',
    firstYear: 1990,
    lastYear: 2026,
    questionCount: questions.length,
    imageCount: imageMap.size + bundledImages.size,
    answerStatuses,
    verifiedPdfMarkMetadata,
    gatePaperPatternMarkPolicyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
    benchmarkPapers,
    years,
    subjects,
    books
  };
  if (manifest.imageCount !== 706) {
    throw new Error(`Expected 706 referenced local images, found ${manifest.imageCount}`);
  }
  await writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(OUTPUT, 'provenance.json'),
    `${JSON.stringify(
      {
        bankVersion: PYQ_BANK_VERSION,
        verifiedPdfMarkMetadata,
        gatePaperPatternMarkPolicyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
        benchmarkPapers,
        sources: [
          {
            name: 'GateQA',
            url: SOURCE_ROOT,
            role: 'GATE CSE and IT question HTML, diagrams, metadata, and answer map'
          },
          {
            name: 'GATE Overflow',
            url: 'https://gateoverflow.in/previous-years',
            role: 'Question provenance and the three restored older records'
          },
          {
            name: 'Official GATE archive',
            url: 'https://gate2026.iitg.ac.in/QPs-answer-keys.html',
            role: 'Official paper-pattern reference for admitted GATE collections; row-level answer and mark authority remains explicit in answerSource'
          },
          {
            name: 'ExamSIDE',
            url: EXAMSIDE_ROOT,
            role: 'GATE DA/AI overlap, cross-branch Engineering Mathematics, and ECE/EE Digital Logic question text, diagrams, metadata, and answer keys'
          },
          {
            name: 'ISRO',
            url: PYQ_BOOK_BY_SLUG.get('isro-cs-overlap').sourceUrl,
            role: 'Official Scientist/Engineer CS paper and answer key'
          },
          {
            name: 'IIIT Hyderabad',
            url: PYQ_BOOK_BY_SLUG.get('iiith-pgee').sourceUrl,
            role: 'Current PGEE syllabus and provenance for the independently keyed official sample'
          },
          {
            name: 'TIFR',
            url: PYQ_BOOK_BY_SLUG.get('tifr-gs-cs').sourceUrl,
            role: 'Official Graduate School Computer Science papers with marked solutions'
          },
          {
            name: 'Chennai Mathematical Institute',
            url: PYQ_BOOK_BY_SLUG.get('cmi-cs-objective').sourceUrl,
            role: 'Official MSc/PhD Computer Science papers and solutions'
          },
          {
            name: 'UGC NET',
            url: PYQ_BOOK_BY_SLUG.get('ugc-net-cs-overlap').sourceUrl,
            role: 'Official Computer Science paper and answer key, restricted to audited syllabus overlap'
          },
          {
            name: 'GO Classes',
            url: customQuestionPayloads[0].sourceUrl,
            role: 'Learner-provided COA Topic Test question text, answer keys, and source tags'
          }
        ],
        notes: [
          'Question content is bundled for the private, invite-only HETU practice experience.',
          'Every supplemental book carries an explicit GATE-level, mixed-level, or above-GATE difficulty band.',
          'GATE IT excludes Other / Optional material outside the current CSE syllabus.',
          'GATE DA/AI includes only Algorithms, Data Structures, DBMS, Discrete Mathematics, Linear Algebra, Calculus, and Probability chapters that overlap GATE CSE.',
          'ECE and EE supplements are restricted to the project topics: Number System, Boolean Algebra, Combinational Circuit, and Sequential Circuit.',
          'Cross-branch Engineering Mathematics is restricted to Linear Algebra and Probability & Statistics from ECE, EE, ME, CE, and IN papers.',
          'IIIT-H PGEE sample questions are explicitly identified as independently audited because no official answer key is published with the sample.',
          'TIFR and CMI are stretch collections; UGC NET and ISRO are mixed-level supplements. GATE CSE remains the default book.',
          'A book source class describes the source paper or collection, not row-level verification of every stored answer or mark; answerSource carries that provenance.',
          'Diagram-dependent, incomplete, obsolete, off-syllabus, and demonstrably flawed supplemental questions are excluded.',
          'Converter, semiconductor-memory, logic-family, microprocessor, communication-code, and architecture questions are excluded.',
          'For rows backed by a structured PDF answer key, that key\'s 1/2-mark value is authoritative over contradictory archive tags.',
          'AMBIGUOUS, MARKS_TO_ALL, and UNSUPPORTED records are never assigned an invented answer.'
        ]
      },
      null,
      2
    )}\n`
  );

  console.log(
    `Built ${questions.length.toLocaleString()} questions across ${subjects.length} subjects with ${imageMap.size.toLocaleString()} local images.`
  );
  console.log(
    `Books: ${books.map((book) => `${book.label} ${book.count.toLocaleString()}`).join(', ')}`
  );
  console.log(`Answer statuses: ${JSON.stringify(answerStatuses)}`);
}

await main();
