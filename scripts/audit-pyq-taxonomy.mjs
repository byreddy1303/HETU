#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
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

const manifest = JSON.parse(await readFile(path.join(PYQ_ROOT, 'manifest.json'), 'utf8'));
const audit = JSON.parse(await readFile(path.join(PYQ_ROOT, 'taxonomy-audit.json'), 'utf8'));
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

check(manifest.bankVersion === PYQ_BANK_VERSION, 'Manifest bank version is stale');
check(audit.bankVersion === PYQ_BANK_VERSION, 'Taxonomy audit bank version is stale');
check(
  questions.length === PYQ_BANK_QUESTION_COUNT,
  `Expected ${PYQ_BANK_QUESTION_COUNT.toLocaleString()} questions, found ${questions.length}`
);
check(questionById.size === questions.length, 'Question IDs are not unique');
check(manifest.subjects.length === PYQ_TAXONOMY.length, 'Manifest subject count is incomplete');
check(
  manifest.subjects.reduce((total, subject) => total + subject.topics.length, 0) === 95,
  'Manifest topic count is incomplete'
);

for (const payload of payloads) {
  check(payload.bankVersion === PYQ_BANK_VERSION, `${payload.subject} payload version is stale`);
}

for (const question of questions) {
  check(
    manifest.books.some((book) => book.slug === question.bookSlug),
    `${question.id} has unknown book ${question.bookSlug}`
  );
  const expected = classifyPyqQuestion(question);
  check(
    question.subjectSlug === expected.subjectSlug && question.topicSlug === expected.topicSlug,
    `${question.id} is ${question.subjectSlug}/${question.topicSlug}; expected ${expected.subjectSlug}/${expected.topicSlug}`
  );
  if (question.choices !== undefined) {
    const validChoices = Array.isArray(question.choices) && question.choices.length >= 2;
    check(
      validChoices,
      `${question.id} has an invalid source choice set`
    );
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (validChoices && question.answerStatus === 'available' && question.type !== 'NAT') {
      check(
        answers.every((answer) => question.choices.includes(String(answer))),
        `${question.id} has an answer outside its source choice set`
      );
    }
  }
}

check(manifest.defaultBookSlug === 'gate-cse', 'Default PYQ book is stale');
check(manifest.books.length === 11, 'Manifest must expose exactly eleven audited books');
for (const book of manifest.books) {
  const rows = questions.filter((question) => question.bookSlug === book.slug);
  check(
    ['gate', 'mixed', 'above-gate'].includes(book.difficultyFloor),
    `${book.slug} has an invalid difficulty band`
  );
  check(
    ['official-exam', 'official-sample', 'reconstructed-exam', 'audited-gate-prep'].includes(
      book.sourceClass
    ),
    `${book.slug} has an invalid source class`
  );
  check(rows.length === book.count, `${book.slug} question count is stale`);
  check(
    book.subjects.reduce((total, subject) => total + subject.count, 0) === book.count,
    `${book.slug} subject counts are stale`
  );
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
