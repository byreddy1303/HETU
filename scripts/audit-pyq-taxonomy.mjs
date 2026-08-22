#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPyqQuestion,
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
check(questions.length === 3200, `Expected 3,200 questions, found ${questions.length}`);
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
  const expected = classifyPyqQuestion(question);
  check(
    question.subjectSlug === expected.subjectSlug && question.topicSlug === expected.topicSlug,
    `${question.id} is ${question.subjectSlug}/${question.topicSlug}; expected ${expected.subjectSlug}/${expected.topicSlug}`
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

// Keep the existing classifier-regression audit and the independent official
// 2027 scope audit in the same CI/package command.
await import('./audit-gate-2027-taxonomy.mjs');
