#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPyqQuestion,
  PYQ_BANK_QUESTION_COUNT,
  PYQ_BANK_VERSION,
  PYQ_MANUAL_CLASSIFICATIONS,
  PYQ_TAXONOMY
} from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const PYQ_ROOT = path.join(PUBLIC_ROOT, 'pyq');
const EXPECTED_BOOK_COUNTS = {
  'gate-cse': 2911,
  'gate-it': 360,
  'gate-da-overlap': 89,
  'gate-cross-digital': 259,
  'gate-cross-math': 424,
  'isro-cs-overlap': 45,
  'iiith-pgee': 8,
  'tifr-gs-cs': 65,
  'cmi-cs-objective': 122,
  'ugc-net-cs-overlap': 21,
  'go-classes-coa': 30
};
const EXPECTED_IMAGE_COUNT = 706;
const ANSWER_STATUSES = ['available', 'ambiguous', 'marks-to-all', 'unsupported'];
const BOOK_SOURCE_CLASSES = new Set([
  'official-exam',
  'official-sample',
  'reconstructed-exam',
  'audited-gate-prep'
]);
const BOOK_DIFFICULTY_FLOORS = new Set(['gate', 'mixed', 'above-gate']);

const manifest = JSON.parse(await readFile(path.join(PYQ_ROOT, 'manifest.json'), 'utf8'));
const audit = JSON.parse(await readFile(path.join(PYQ_ROOT, 'taxonomy-audit.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(PYQ_ROOT, 'provenance.json'), 'utf8'));
const payloads = await Promise.all(
  manifest.subjects.map(async (subject) =>
    JSON.parse(await readFile(path.join(PUBLIC_ROOT, subject.file), 'utf8'))
  )
);
const questions = payloads.flatMap((payload) => payload.questions);
const questionById = new Map(questions.map((question) => [question.id, question]));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function countAnswerStatuses(rows) {
  return Object.fromEntries(
    ANSWER_STATUSES.map((status) => [
      status,
      rows.filter((question) => question.answerStatus === status).length
    ])
  );
}

function countYears(rows) {
  return [...new Set(rows.map((question) => question.year))]
    .sort((left, right) => right - left)
    .map((year) => ({
      year,
      count: rows.filter((question) => question.year === year).length
    }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

check(manifest.bankVersion === PYQ_BANK_VERSION, 'Manifest bank version is stale');
check(audit.bankVersion === PYQ_BANK_VERSION, 'Taxonomy audit bank version is stale');
check(
  questions.length === PYQ_BANK_QUESTION_COUNT,
  `Expected ${PYQ_BANK_QUESTION_COUNT.toLocaleString()} questions, found ${questions.length}`
);
check(questionById.size === questions.length, 'Question IDs are not unique');
check(manifest.questionCount === questions.length, 'Manifest question count is stale');
check(manifest.imageCount === EXPECTED_IMAGE_COUNT, 'Manifest image count is stale');
check(manifest.defaultBookSlug === 'gate-cse', 'Default PYQ book must remain GATE CSE');
check(manifest.subjects.length === PYQ_TAXONOMY.length, 'Manifest subject count is incomplete');
check(
  manifest.subjects.reduce((total, subject) => total + subject.topics.length, 0) === 95,
  'Manifest topic count is incomplete'
);
check(
  sameJson(manifest.answerStatuses, countAnswerStatuses(questions)),
  'Manifest answer-status totals are stale'
);
check(sameJson(manifest.years, countYears(questions)), 'Manifest year totals are stale');
check(provenance.bankVersion === PYQ_BANK_VERSION, 'Provenance bank version is stale');
check(
  sameJson(provenance.verifiedPdfMarkMetadata, manifest.verifiedPdfMarkMetadata),
  'Provenance verified-PDF metadata disagrees with the manifest'
);
check(
  new Set(provenance.sources?.map((source) => source.name)).size === 10,
  'Provenance must name all ten source authorities'
);
for (const source of provenance.sources ?? []) {
  check(/^https:\/\//.test(source.url), `Provenance source ${source.name} is not HTTPS`);
  check(Boolean(String(source.role ?? '').trim()), `Provenance source ${source.name} has no role`);
}
check(
  (provenance.notes ?? []).some((note) =>
    /source class.+not row-level|not row-level.+source class/i.test(String(note))
  ),
  'Provenance does not distinguish collection source class from row-level verification'
);

const expectedBookSlugs = Object.keys(EXPECTED_BOOK_COUNTS);
check(Array.isArray(manifest.books), 'Manifest has no books registry');
check(manifest.books?.length === expectedBookSlugs.length, 'Manifest must contain eleven books');
check(
  sameJson(
    [...(manifest.books ?? []).map((book) => book.slug)].sort(),
    [...expectedBookSlugs].sort()
  ),
  'Manifest book slugs do not match the audited registry'
);

const referencedImages = new Set();
const imageChecks = [];

for (const payload of payloads) {
  check(payload.bankVersion === PYQ_BANK_VERSION, `${payload.subject} payload version is stale`);
}

for (const question of questions) {
  check(
    Object.hasOwn(EXPECTED_BOOK_COUNTS, question.bookSlug),
    `${question.id} references unknown book ${question.bookSlug}`
  );
  if (question.choices != null) {
    check(
      Array.isArray(question.choices) && question.choices.length >= 2,
      `${question.id} has malformed choices`
    );
    if (Array.isArray(question.choices)) {
      const choices = question.choices.map((choice) => String(choice).trim());
      check(
        choices.every(Boolean) && new Set(choices).size === choices.length,
        `${question.id} has blank or duplicate choices`
      );
      if (question.answerStatus === 'available' && ['MCQ', 'MSQ'].includes(question.type)) {
        const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
        check(
          answers.every((answer) => choices.includes(String(answer).trim())),
          `${question.id} has an answer outside its choices`
        );
      }
    }
  }
  for (const match of question.html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const reference = match[1];
    check(reference.startsWith('/pyq/images/'), `${question.id} has a non-local image ${reference}`);
    if (!reference.startsWith('/pyq/images/')) continue;
    referencedImages.add(reference);
    imageChecks.push(
      access(path.join(PUBLIC_ROOT, reference.slice(1))).catch(() => {
        failures.push(`${question.id} references missing image ${reference}`);
      })
    );
  }
  check(!/\/attempt-q\d+\./i.test(question.html), `${question.id} embeds an unsafe attempt image`);
  const expected = classifyPyqQuestion(question);
  check(
    question.subjectSlug === expected.subjectSlug && question.topicSlug === expected.topicSlug,
    `${question.id} is ${question.subjectSlug}/${question.topicSlug}; expected ${expected.subjectSlug}/${expected.topicSlug}`
  );
}
await Promise.all(imageChecks);
check(
  referencedImages.size === EXPECTED_IMAGE_COUNT,
  `Expected ${EXPECTED_IMAGE_COUNT} unique referenced images, found ${referencedImages.size}`
);

for (const book of manifest.books ?? []) {
  const rows = questions.filter((question) => question.bookSlug === book.slug);
  check(
    rows.length === EXPECTED_BOOK_COUNTS[book.slug],
    `${book.slug} has ${rows.length} rows; expected ${EXPECTED_BOOK_COUNTS[book.slug]}`
  );
  check(book.count === rows.length, `${book.slug} manifest count is stale`);
  check(BOOK_SOURCE_CLASSES.has(book.sourceClass), `${book.slug} has invalid source class`);
  check(BOOK_DIFFICULTY_FLOORS.has(book.difficultyFloor), `${book.slug} has invalid difficulty floor`);
  check(
    book.firstYear === Math.min(...rows.map((question) => question.year)) &&
      book.lastYear === Math.max(...rows.map((question) => question.year)),
    `${book.slug} year range is stale`
  );
  check(
    sameJson(book.answerStatuses, countAnswerStatuses(rows)),
    `${book.slug} answer-status totals are stale`
  );
  check(sameJson(book.years, countYears(rows)), `${book.slug} year totals are stale`);
  check(
    (book.subjects ?? []).reduce((sum, subject) => sum + subject.count, 0) === rows.length,
    `${book.slug} subject totals are stale`
  );
  for (const subject of book.subjects ?? []) {
    const subjectRows = rows.filter((question) => question.subjectSlug === subject.slug);
    check(subject.count === subjectRows.length, `${book.slug}/${subject.slug} count is stale`);
    for (const topic of subject.topics ?? []) {
      check(
        topic.count === subjectRows.filter((question) => question.topicSlug === topic.slug).length,
        `${book.slug}/${subject.slug}/${topic.slug} count is stale`
      );
    }
  }
}

const manualEntries = Object.entries(PYQ_MANUAL_CLASSIFICATIONS);
check(
  audit.manualCorrectionCount === manualEntries.length,
  'Taxonomy audit manual-correction count is stale'
);
check(
  audit.classificationBasis?.['manual-content-audit'] === manualEntries.length,
  'Not every manual content correction was applied'
);

for (const [id, correction] of manualEntries) {
  const question = questionById.get(id);
  check(Boolean(question), `Manual correction references missing question ${id}`);
  if (!question) continue;
  check(
    question.subjectSlug === correction.subjectSlug && question.topicSlug === correction.topicSlug,
    `${id} did not retain its audited classification`
  );
}

for (const subject of manifest.subjects) {
  const payload = payloads.find((candidate) => candidate.subject === subject.slug);
  check(Boolean(payload), `Missing payload for ${subject.slug}`);
  if (!payload) continue;
  check(payload.questions.length === subject.count, `${subject.slug} subject count is stale`);
  for (const topic of subject.topics) {
    const count = payload.questions.filter((question) => question.topicSlug === topic.slug).length;
    check(count === topic.count, `${subject.slug}/${topic.slug} count is stale`);
  }
}

if (failures.length > 0) {
  throw new Error(`PYQ taxonomy audit failed:\n- ${failures.join('\n- ')}`);
}

console.log(
  `Audited ${questions.length.toLocaleString()} unique PYQs across ${manifest.subjects.length} subjects and 95 topics; ${manualEntries.length} content corrections are locked.`
);

// Keep the existing classifier-regression audit and the independent official
// 2027 scope audit in the same CI/package command.
await import('./audit-gate-2027-taxonomy.mjs');
