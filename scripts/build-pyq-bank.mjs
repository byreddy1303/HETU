#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { classifyPyqQuestion, PYQ_BANK_VERSION, PYQ_TAXONOMY } from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'public', 'pyq');
const IMAGE_OUTPUT = path.join(OUTPUT, 'images');
const CUSTOM_QUESTION_PATHS = [
  'go-classes-coa-topic-test.json',
  'go-classes-coa-topic-test-2.json'
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

const TITLE_PATTERN =
  /GATE CSE (?<year>\d{4})(?:\s*\|?\s*Set\s*[-:]?\s*(?<set>\d+))?\s*\|\s*(?:GA\s*(?:\|\s*)?)?Question:\s*(?<question>.+)$/i;

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

function marksFromTags(tags) {
  if (tags.includes('one-mark')) return 1;
  if (tags.includes('two-marks')) return 2;
  return null;
}

function cleanTags(tags) {
  const ignored =
    /^(?:gate|isro|barc|ugcnet|pgee|tifr|easy$|normal$|hard$|one-mark$|two-marks$|non-gate|out-of|subjective$|descriptive$)/i;
  return [...new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))]
    .filter((tag) => !ignored.test(tag))
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

async function loadExamSideSourceRows() {
  await mkdir(CACHE, { recursive: true });
  const snapshotPath = path.join(CACHE, 'examside-digital-logic-1990-2026-v1.json');
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch {
    // A chapter page contains one link per question. Detail pages carry the
    // structured options and answer keys, so fetch them concurrently and cache
    // the resulting source snapshot for repeatable local rebuilds.
    const chapterRows = await Promise.all(
      EXAMSIDE_DIGITAL_LOGIC_CATEGORIES.map(async (category) => {
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
  if (source.isBonus) return 'MARKS_TO_ALL';
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
      answerStatus: source.isBonus ? 'marks-to-all' : answerStatus(type, hasAnswer, !hasAnswer),
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
      marks: source.marks === 1 || source.marks === 2 ? source.marks : null,
      type,
      answer,
      tolerance: numericKey?.tolerance ?? null,
      answerStatus: source.isBonus ? 'marks-to-all' : answerStatus(type, hasAnswer, !hasAnswer),
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
    supplementalCse,
    customQuestionPayloads
  ] = await Promise.all([
    cachedJson(SEARCH_URL, 'question-search-index.json'),
    cachedJson(ANSWERS_URL, 'answers-by-question-uid.json'),
    cachedJson(UNSUPPORTED_URL, 'unsupported-question-uids.json'),
    examSideDigitalLogicQuestions(),
    examSideCseQuestions(),
    Promise.all(
      CUSTOM_QUESTION_PATHS.map((filename) => readFile(filename, 'utf8').then(JSON.parse))
    )
  ]);
  const answers = answerPayload.records_by_question_uid ?? answerPayload;
  const unsupported = new Set(unsupportedPayload.question_uids ?? []);

  const primary = [];
  for (const source of searchIndex) {
    const match = normalizedTitle(source.title).match(TITLE_PATTERN);
    if (!match) continue;
    const year = Number(match.groups.year);
    if (year < 1990 || year > 2026) continue;
    if (EXAMSIDE_CSE_REPLACEMENT_YEARS.has(year)) continue;
    primary.push({
      ...source,
      parsedYear: year,
      parsedSet: match.groups.set ? Number(match.groups.set) : null,
      parsedNumber: match.groups.question
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
    const tags = cleanTags(detail.tags ?? source.tags ?? []);
    const type = String(answerMeta?.type || source.type || 'UNSUPPORTED').toUpperCase();
    return {
      id: source.question_uid,
      year: source.parsedYear,
      set: source.parsedSet,
      number: source.parsedNumber,
      paperLabel: `GATE CSE ${source.parsedYear}${source.parsedSet ? ` Set ${source.parsedSet}` : ''}`,
      subject,
      subjectSlug,
      subtopics: tags,
      marks: marksFromTags(detail.tags ?? source.tags ?? []),
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
    ...MANUAL_QUESTIONS.map((question) => ({
      ...question,
      paperLabel: `GATE CSE ${question.year}`,
      subtopics: question.tags,
      tolerance: null,
      answerSource: { kind: 'manual-audit' }
    }))
  );
  questions.push(...supplementalCse);
  questions.push(...supplementalDigitalLogic);
  questions.push(...customQuestionPayloads.flatMap((payload) => payload.questions));
  for (const question of questions) {
    const classification = classifyPyqQuestion(question);
    question.subject = classification.subject;
    question.subjectSlug = classification.subjectSlug;
    question.topic = classification.topic;
    question.topicSlug = classification.topicSlug;
  }
  questions.sort(stableQuestionSort);

  if (questions.length !== 3200)
    throw new Error(`Expected 3,200 audited questions, found ${questions.length}`);
  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) throw new Error('Duplicate question IDs found in the bank');

  const remoteImages = new Set();
  for (const question of questions) {
    for (const src of imageSources(question.html)) remoteImages.add(absoluteImageUrl(src));
  }

  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
  const imageMap = await downloadImages(remoteImages);
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

  const years = [...new Set(questions.map((question) => question.year))]
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      count: questions.filter((question) => question.year === year).length
    }));
  const answerStatuses = Object.fromEntries(
    ['available', 'ambiguous', 'marks-to-all', 'unsupported'].map((status) => [
      status,
      questions.filter((question) => question.answerStatus === status).length
    ])
  );
  const manifest = {
    bankVersion: PYQ_BANK_VERSION,
    generatedAt: new Date().toISOString(),
    source:
      'GateQA/GATE Overflow CSE archive, syllabus-filtered ExamSIDE ECE/EE Digital Logic records, and the learner-provided GO Classes COA Topic Tests',
    sourceUrl: SOURCE_ROOT,
    firstYear: 1990,
    lastYear: 2026,
    questionCount: questions.length,
    imageCount: imageMap.size,
    answerStatuses,
    years,
    subjects
  };
  await writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(OUTPUT, 'provenance.json'),
    `${JSON.stringify(
      {
        bankVersion: PYQ_BANK_VERSION,
        sources: [
          {
            name: 'GateQA',
            url: SOURCE_ROOT,
            role: 'Full question HTML, diagrams, metadata, and answer map'
          },
          {
            name: 'GATE Overflow',
            url: 'https://gateoverflow.in/previous-years',
            role: 'Question provenance and the three restored older records'
          },
          {
            name: 'Official GATE archive',
            url: 'https://www.iitk.ac.in/gate/download.php',
            role: 'Paper-count audit and original wording verification'
          },
          {
            name: 'ExamSIDE',
            url: EXAMSIDE_ROOT,
            role: 'ECE and EE Digital Logic question text, diagrams, metadata, and answer keys'
          },
          {
            name: 'GO Classes',
            url: customQuestionPayloads[0].sourceUrl,
            role: 'Learner-provided COA Topic Test question text, answer keys, and source tags'
          }
        ],
        notes: [
          'Question content is bundled for the private, invite-only HETU practice experience.',
          'ECE and EE supplements are restricted to the project topics: Number System, Boolean Algebra, Combinational Circuit, and Sequential Circuit.',
          'Converter, semiconductor-memory, logic-family, microprocessor, communication-code, and architecture questions are excluded.',
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
  console.log(`Answer statuses: ${JSON.stringify(answerStatuses)}`);
}

await main();
