#!/usr/bin/env node
// Read-only by default. --write refreshes the reviewable report, not the bank.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const manifest = read('public/pyq/manifest.json');
const questions = manifest.subjects.flatMap((subject) => read(`public${subject.file}`).questions);
const quarantine = new Set(read('src/data/pyq-key-conflicts.json').flatMap((row) => row.ids));
const counts = (rows, key) =>
  rows.reduce((result, row) => {
    const value = key(row);
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
const grouped = (key) => {
  const groups = new Map();
  for (const question of questions) {
    const value = key(question);
    groups.set(value, [...(groups.get(value) ?? []), question]);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
};
const contentKey = (question) => question.html.trim();
const brief = (question) => ({
  id: question.id,
  paper: question.paperLabel,
  number: question.number,
  subject: question.subjectSlug,
  answer: question.answer,
  marks: question.marks
});
const duplicates = grouped(contentKey);
const conflicts = duplicates.filter(
  (rows) =>
    new Set(rows.map((row) => JSON.stringify([row.type, row.answer, row.tolerance]))).size > 1
);
const mismatches = [];
let pdfMappingsChecked = 0;
let uidMappingsChecked = 0;
let archiveUrlMappingsChecked = 0;
for (const question of questions) {
  const source = question.answerSource;
  if (source?.question_uids) {
    uidMappingsChecked++;
    if (!source.question_uids.includes(question.id))
      mismatches.push({ id: question.id, reason: 'answer-source-uid' });
  }
  if (source?.kind === 'examside-key') {
    archiveUrlMappingsChecked++;
    if (source.url !== question.sourceUrl) {
      mismatches.push({ id: question.id, reason: 'answer-source-url' });
    }
  }
  if (source?.kind === 'pdf_answer_key') {
    pdfMappingsChecked++;
    const ga = question.subjectSlug === 'general-aptitude';
    const paperNumber = Number(question.number) + (ga ? 0 : 10);
    if (
      source.year !== question.year ||
      source.set !== question.set ||
      source.question_no !== paperNumber ||
      source.marks !== question.marks ||
      source.section !== (ga ? 'GA' : `CS-${question.set}`)
    ) {
      mismatches.push({ id: question.id, reason: 'pdf-paper-slot-or-marks' });
    }
  }
}
const report = {
  bankVersion: manifest.bankVersion,
  questionCount: questions.length,
  uniqueIdCount: new Set(questions.map((row) => row.id)).size,
  missingMarksByBook: counts(
    questions.filter((row) => row.marks == null),
    (row) => row.bookSlug
  ),
  unavailableAutomaticKeysByType: counts(
    questions.filter(
      (row) =>
        row.answerStatus !== 'available' ||
        !['MCQ', 'MSQ', 'NAT'].includes(row.type) ||
        row.answer == null
    ),
    (row) => `${row.type}/${row.answerStatus}`
  ),
  provenance: { pdfMappingsChecked, uidMappingsChecked, archiveUrlMappingsChecked, mismatches },
  duplicateContentGroups: duplicates.map((rows) => rows.map(brief)),
  conflictingKeyGroups: conflicts.map((rows) => rows.map(brief)),
  unquarantinedConflicts: conflicts
    .flat()
    .filter((row) => !quarantine.has(row.id))
    .map((row) => row.id),
  // Archive list numbers are not necessarily original paper numbers. Report
  // collisions without treating them as proof of an incorrect answer.
  archiveNumberCollisionGroups: grouped(
    (row) =>
      `${row.paperLabel}|${row.subjectSlug === 'general-aptitude' ? 'GA' : 'CS'}|${row.number}`
  ).length,
  limitations: [
    'Mapping consistency is not independent proof of mathematical answer correctness.',
    'The 130 PDF mappings check stored provenance, not a fresh extraction of original PDF keys.',
    'Older source archives include reconstructed numbering and allocations; the marks audit records evidence and limitations.',
    'Exact content deduplication does not detect reworded or option-reordered duplicates.'
  ]
};
if (process.argv.includes('--write'))
  writeFileSync(
    path.join(root, 'references/pyq-practice-audit.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
console.log(
  JSON.stringify(
    {
      questions: report.questionCount,
      uniqueIds: report.uniqueIdCount,
      duplicateContentGroups: duplicates.length,
      conflictingKeyGroups: conflicts.length,
      unquarantinedConflicts: report.unquarantinedConflicts.length,
      provenance: report.provenance,
      missingMarksByBook: report.missingMarksByBook,
      archiveNumberCollisionGroups: report.archiveNumberCollisionGroups
    },
    null,
    2
  )
);
if (
  report.uniqueIdCount !== report.questionCount ||
  mismatches.length ||
  report.unquarantinedConflicts.length
)
  process.exitCode = 1;
