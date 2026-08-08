#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  classifyPyqQuestion,
  PYQ_BANK_VERSION,
  PYQ_MANUAL_CLASSIFICATIONS,
  PYQ_TAXONOMY
} from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'public', 'pyq');
const manifestPath = path.join(OUTPUT, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const payloads = await Promise.all(
  manifest.subjects.map(async (subject) =>
    JSON.parse(await readFile(path.join(ROOT, 'public', subject.file), 'utf8'))
  )
);
const questions = payloads.flatMap((payload) => payload.questions);
const originalIds = new Set(questions.map((question) => question.id));
const manualClassificationEntries = Object.entries(PYQ_MANUAL_CLASSIFICATIONS);

if (questions.length !== 2388 || originalIds.size !== questions.length) {
  throw new Error(
    `Expected 2,388 unique input questions, found ${questions.length} rows and ${originalIds.size} IDs`
  );
}

const missingManualIds = manualClassificationEntries
  .map(([id]) => id)
  .filter((id) => !originalIds.has(id));
if (missingManualIds.length > 0) {
  throw new Error(
    `Manual PYQ classifications reference missing IDs: ${missingManualIds.join(', ')}`
  );
}

const basisCounts = new Map();
const classified = questions.map((question) => {
  const classification = classifyPyqQuestion(question);
  basisCounts.set(
    classification.classificationBasis,
    (basisCounts.get(classification.classificationBasis) ?? 0) + 1
  );
  return {
    ...question,
    subject: classification.subject,
    subjectSlug: classification.subjectSlug,
    topic: classification.topic,
    topicSlug: classification.topicSlug
  };
});

const grouped = new Map();
for (const question of classified) {
  const rows = grouped.get(question.subjectSlug) ?? [];
  rows.push(question);
  grouped.set(question.subjectSlug, rows);
}

const subjects = PYQ_TAXONOMY.filter((subject) => grouped.has(subject.slug)).map((subject) => {
  const rows = grouped.get(subject.slug);
  const topics = subject.topics
    .map((topic) => ({
      ...topic,
      count: rows.filter((question) => question.topicSlug === topic.slug).length
    }))
    .filter((topic) => topic.count > 0);
  return {
    slug: subject.slug,
    label: subject.label,
    count: rows.length,
    file: `/pyq/subjects/${subject.slug}.json`,
    topics
  };
});

for (const subject of subjects) {
  await writeFile(
    path.join(OUTPUT, 'subjects', `${subject.slug}.json`),
    `${JSON.stringify({
      bankVersion: PYQ_BANK_VERSION,
      subject: subject.slug,
      questions: grouped.get(subject.slug)
    })}\n`
  );
}

const nextManifest = {
  ...manifest,
  bankVersion: PYQ_BANK_VERSION,
  generatedAt: new Date().toISOString(),
  questionCount: classified.length,
  subjects
};
await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
const outputIds = new Set(classified.map((question) => question.id));
await writeFile(
  path.join(OUTPUT, 'taxonomy-audit.json'),
  `${JSON.stringify(
    {
      bankVersion: nextManifest.bankVersion,
      questionCount: classified.length,
      uniqueQuestionCount: outputIds.size,
      unclassifiedCount: 0,
      subjectCount: subjects.length,
      topicCount: subjects.reduce((total, subject) => total + subject.topics.length, 0),
      classificationBasis: Object.fromEntries(
        [...basisCounts].sort(([a], [b]) => a.localeCompare(b))
      ),
      manualCorrectionCount: manualClassificationEntries.length,
      manualCorrections: manualClassificationEntries
        .map(([id, correction]) => {
          const question = classified.find((row) => row.id === id);
          return {
            id,
            year: question.year,
            set: question.set,
            number: question.number,
            subjectSlug: correction.subjectSlug,
            topicSlug: correction.topicSlug,
            reason: correction.reason
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
      subjects: subjects.map((subject) => ({
        slug: subject.slug,
        count: subject.count,
        topics: subject.topics
      }))
    },
    null,
    2
  )}\n`
);

if (outputIds.size !== originalIds.size || [...originalIds].some((id) => !outputIds.has(id))) {
  throw new Error('Classification changed the audited PYQ ID set');
}

console.log(
  `Classified ${classified.length.toLocaleString()} questions into ${subjects.length} subjects.`
);
for (const subject of subjects) {
  console.log(
    `${subject.label}: ${subject.count} (${subject.topics.map((topic) => `${topic.label} ${topic.count}`).join(', ')})`
  );
}
