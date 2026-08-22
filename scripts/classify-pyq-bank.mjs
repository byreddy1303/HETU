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
import {
  verifiedPdfAnswerKeyMark,
  VERIFIED_PDF_MARK_POLICY_VERSION
} from './pyq-marks.mjs';

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
const inputQuestions = payloads.flatMap((payload) => payload.questions);
const correctedPdfMarkIds = [];
const questions = inputQuestions.map((question) => {
  const verifiedMark = verifiedPdfAnswerKeyMark(question.answerSource);
  if (verifiedMark == null || question.marks === verifiedMark) return question;
  correctedPdfMarkIds.push(question.id);
  return { ...question, marks: verifiedMark };
});
const originalIds = new Set(questions.map((question) => question.id));
const manualClassificationEntries = Object.entries(PYQ_MANUAL_CLASSIFICATIONS);

if (questions.length !== 3200 || originalIds.size !== questions.length) {
  throw new Error(
    `Expected 3,200 unique input questions, found ${questions.length} rows and ${originalIds.size} IDs`
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

const verifiedPdfRows = classified.filter(
  (question) => verifiedPdfAnswerKeyMark(question.answerSource) != null
);
const verifiedPdfMismatches = verifiedPdfRows.filter(
  (question) => question.marks !== verifiedPdfAnswerKeyMark(question.answerSource)
);
const verifiedPdfMarkMetadata = {
  policyVersion: VERIFIED_PDF_MARK_POLICY_VERSION,
  authoritativeSourceKind: 'pdf_answer_key',
  questionCount: verifiedPdfRows.length,
  oneMarkCount: verifiedPdfRows.filter((question) => question.marks === 1).length,
  twoMarkCount: verifiedPdfRows.filter((question) => question.marks === 2).length,
  correctedQuestionIds: [
    ...new Set([
      ...(manifest.verifiedPdfMarkMetadata?.correctedQuestionIds ?? []),
      ...correctedPdfMarkIds
    ])
  ].sort()
};
if (
  verifiedPdfMarkMetadata.questionCount !== 130 ||
  verifiedPdfMarkMetadata.oneMarkCount !== 60 ||
  verifiedPdfMarkMetadata.twoMarkCount !== 70 ||
  verifiedPdfMismatches.length > 0
) {
  throw new Error(
    `Verified PDF mark invariant failed: ${JSON.stringify({
      ...verifiedPdfMarkMetadata,
      mismatchIds: verifiedPdfMismatches.map((question) => question.id)
    })}`
  );
}

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
  years: [...new Set(classified.map((question) => question.year))]
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      count: classified.filter((question) => question.year === year).length
    })),
  answerStatuses: Object.fromEntries(
    ['available', 'ambiguous', 'marks-to-all', 'unsupported'].map((status) => [
      status,
      classified.filter((question) => question.answerStatus === status).length
    ])
  ),
  verifiedPdfMarkMetadata,
  subjects
};
await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
const provenancePath = path.join(OUTPUT, 'provenance.json');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
await writeFile(
  provenancePath,
  `${JSON.stringify(
    {
      ...provenance,
      bankVersion: PYQ_BANK_VERSION,
      verifiedPdfMarkMetadata,
      notes: [
        ...(provenance.notes ?? []).filter(
          (note) => !String(note).startsWith('For rows backed by a structured PDF answer key')
        ),
        'For rows backed by a structured PDF answer key, that key\'s 1/2-mark value is authoritative over contradictory archive tags.'
      ]
    },
    null,
    2
  )}\n`
);
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
