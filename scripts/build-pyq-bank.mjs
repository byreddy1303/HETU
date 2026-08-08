#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { classifyPyqQuestion, PYQ_TAXONOMY } from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'public', 'pyq');
const IMAGE_OUTPUT = path.join(OUTPUT, 'images');
const CACHE = '/tmp/air-journal-pyq-cache';
const SOURCE_ROOT = 'https://gateqa.in';
const SEARCH_URL = `${SOURCE_ROOT}/question-search-index.json`;
const ANSWERS_URL = `${SOURCE_ROOT}/data/answers/answers_by_question_uid_v1.json`;
const UNSUPPORTED_URL = `${SOURCE_ROOT}/data/answers/unsupported_question_uids_v1.json`;
const USER_AGENT = 'AIR Journal personal PYQ archive builder/1.0';
const BANK_VERSION = 'gate-cse-2002-2026-v2-topics';
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
    .replace(/<(?:iframe|object|embed)\b[\s\S]*?<\/(?:iframe|object|embed)>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
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
  const [searchIndex, answerPayload, unsupportedPayload] = await Promise.all([
    cachedJson(SEARCH_URL, 'question-search-index.json'),
    cachedJson(ANSWERS_URL, 'answers-by-question-uid.json'),
    cachedJson(UNSUPPORTED_URL, 'unsupported-question-uids.json')
  ]);
  const answers = answerPayload.records_by_question_uid ?? answerPayload;
  const unsupported = new Set(unsupportedPayload.question_uids ?? []);

  const primary = [];
  for (const source of searchIndex) {
    const match = normalizedTitle(source.title).match(TITLE_PATTERN);
    if (!match) continue;
    const year = Number(match.groups.year);
    if (year < 2002 || year > 2026) continue;
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
  for (const question of questions) {
    const classification = classifyPyqQuestion(question);
    question.subject = classification.subject;
    question.subjectSlug = classification.subjectSlug;
    question.topic = classification.topic;
    question.topicSlug = classification.topicSlug;
  }
  questions.sort(stableQuestionSort);

  if (questions.length !== 2388) {
    throw new Error(
      `Expected 2,388 questions after the audited restores, found ${questions.length}`
    );
  }
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
        `${JSON.stringify({ bankVersion: BANK_VERSION, subject: slug, questions: grouped.get(slug) })}\n`
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
    bankVersion: BANK_VERSION,
    generatedAt: new Date().toISOString(),
    source:
      'GateQA public question bank, sourced from GATE Overflow; three audited records restored from original papers',
    sourceUrl: SOURCE_ROOT,
    firstYear: 2002,
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
        bankVersion: BANK_VERSION,
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
            url: 'https://gate2026.iitg.ac.in/download.html',
            role: 'Paper-count audit and original wording verification'
          }
        ],
        notes: [
          'Question content is bundled for the private, invite-only AIR Journal practice experience.',
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
