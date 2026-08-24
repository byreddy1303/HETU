#!/usr/bin/env node

/**
 * Independent official-scope audit for the immutable bundled PYQ bank.
 *
 * This script deliberately does not import `pyq-taxonomy.mjs` or call the
 * classifier. It compares the already-built manifest/payloads with the
 * versioned official registry, so a classifier bug cannot validate itself.
 * Run with `--write` only when the registry or immutable bank intentionally
 * changes; the default mode verifies the committed artifact byte-for-byte.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  verifiedPdfAnswerKeyMark,
  VERIFIED_PDF_MARK_POLICY_VERSION
} from './pyq-marks.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const PYQ_ROOT = path.join(ROOT, 'public', 'pyq');
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'gate-2027.json');
const ARTIFACT_PATH = path.join(PYQ_ROOT, 'gate-2027-taxonomy-audit.json');
const writeArtifact = process.argv.includes('--write');

const [registry, manifest] = await Promise.all([
  readJson(REGISTRY_PATH),
  readJson(path.join(PYQ_ROOT, 'manifest.json'))
]);
const payloads = await Promise.all(
  manifest.subjects.map((subject) => readJson(path.join(ROOT, 'public', subject.file)))
);
const questions = payloads.flatMap((payload) => payload.questions);
const failures = [];

function readJson(file) {
  return readFile(file, 'utf8').then(JSON.parse);
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function countBy(values, key) {
  const counts = new Map();
  for (const value of values) {
    const rawKey = key(value);
    const label = rawKey == null ? 'unknown' : String(rawKey);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function roundedPercent(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

function taxonomyStatus(scope, topicSlug) {
  const memberships = [
    ['current', scope.current],
    ['supporting', scope.supporting],
    ['historical', scope.historical],
    ['review-required', scope.reviewRequired]
  ].filter(([, topics]) => topics.includes(topicSlug));
  check(
    memberships.length === 1,
    `${scope.bankSubjectSlug}/${topicSlug} has ${memberships.length} registry statuses`
  );
  return memberships[0]?.[0] ?? 'unclassified';
}

check(registry.paperCode === 'CS', 'Official registry paper code is not CS');
check(registry.subjectScopes.length === 12, 'Official registry must contain 12 canonical subjects');
check(
  new Set(registry.subjectScopes.map((scope) => scope.subjectId)).size === 12,
  'Official registry subject IDs are not unique'
);
check(registry.blueprint.durationMinutes === 180, 'Official duration must be 180 minutes');
check(registry.blueprint.questionCount === 65, 'Official question count must be 65');
check(registry.blueprint.totalMarks === 100, 'Official total must be 100 marks');
check(
  Object.values(registry.blueprint.sectionMarks).reduce((sum, marks) => sum + marks, 0) === 100,
  'Official section marks do not sum to 100'
);
check(
  registry.blueprint.sectionMarks.generalAptitude === 15 &&
    registry.blueprint.sectionMarks.engineeringMathematics === 13 &&
    registry.blueprint.sectionMarks.coreSubject === 72,
  'Official CS section split must be 15/13/72'
);
for (const [sourceName, sourceUrl] of Object.entries(registry.sources)) {
  check(
    new URL(sourceUrl).hostname === 'gate2027.iitm.ac.in',
    `${sourceName} is not an official IIT Madras source`
  );
}

check(
  manifest.questionCount === questions.length,
  'Manifest question count does not match payloads'
);
check(
  new Set(questions.map((question) => question.id)).size === questions.length,
  'Question IDs are not unique'
);
for (const payload of payloads) {
  check(
    payload.bankVersion === manifest.bankVersion,
    `${payload.subject} payload version is stale`
  );
}
const payloadBySubject = new Map(payloads.map((payload) => [payload.subject, payload]));
for (const subject of manifest.subjects) {
  const payload = payloadBySubject.get(subject.slug);
  check(Boolean(payload), `Missing payload for ${subject.slug}`);
  if (!payload) continue;
  check(
    payload.questions.length === subject.count,
    `${subject.slug} manifest subject count is stale`
  );
  check(
    payload.questions.every((question) => question.subjectSlug === subject.slug),
    `${subject.slug} payload contains a question assigned to another subject`
  );
  for (const topic of subject.topics) {
    const actual = payload.questions.filter(
      (question) => question.topicSlug === topic.slug
    ).length;
    check(actual === topic.count, `${subject.slug}/${topic.slug} manifest count is stale`);
  }
}

const manifestSubjectSlugs = new Set(manifest.subjects.map((subject) => subject.slug));
const registryBankScopes = new Map(
  registry.bankTaxonomy.map((scope) => [scope.bankSubjectSlug, scope])
);
check(
  registryBankScopes.size === registry.bankTaxonomy.length,
  'Official registry contains duplicate bank-subject scopes'
);
for (const slug of manifestSubjectSlugs) {
  check(registryBankScopes.has(slug), `No official-registry scope for bank subject ${slug}`);
}
for (const slug of registryBankScopes.keys()) {
  check(manifestSubjectSlugs.has(slug), `Registry references missing bank subject ${slug}`);
}

const knownTopicKeys = new Set();
const topicRows = [];
for (const subject of manifest.subjects) {
  const scope = registryBankScopes.get(subject.slug);
  if (!scope) continue;
  const registeredTopics = [
    ...scope.current,
    ...scope.supporting,
    ...scope.historical,
    ...scope.reviewRequired
  ];
  check(
    new Set(registeredTopics).size === registeredTopics.length,
    `${subject.slug} registers a topic in more than one scope`
  );
  check(
    registeredTopics.length === subject.topics.length,
    `${subject.slug} registry has ${registeredTopics.length} topics; manifest has ${subject.topics.length}`
  );

  for (const topic of subject.topics) {
    const topicKey = `${subject.slug}/${topic.slug}`;
    knownTopicKeys.add(topicKey);
    topicRows.push({
      bankSubjectSlug: subject.slug,
      canonicalSubjectId: scope.canonicalSubjectId,
      topicSlug: topic.slug,
      status: taxonomyStatus(scope, topic.slug),
      questionCount: topic.count
    });
  }
}

for (const scope of registry.subjectScopes) {
  const leafIds = new Set();
  for (const leaf of scope.officialCurrent) {
    check(!leafIds.has(leaf.id), `${scope.subjectId} duplicates official leaf ${leaf.id}`);
    leafIds.add(leaf.id);
    for (const topicKey of leaf.bankTopicKeys) {
      check(
        knownTopicKeys.has(topicKey),
        `${scope.subjectId}/${leaf.id} references missing ${topicKey}`
      );
    }
  }
  for (const topic of [...scope.supporting, ...scope.historical]) {
    for (const topicKey of topic.bankTopicKeys) {
      check(
        knownTopicKeys.has(topicKey),
        `${scope.subjectId}/${topic.id} references missing ${topicKey}`
      );
    }
  }
}

if (failures.length > 0) {
  throw new Error(`GATE 2027 taxonomy audit failed:\n- ${failures.join('\n- ')}`);
}

const questionStatusByTopicKey = new Map(
  topicRows.map((topic) => [
    `${topic.bankSubjectSlug}/${topic.topicSlug}`,
    { status: topic.status, canonicalSubjectId: topic.canonicalSubjectId }
  ])
);
const questionScopeCounts = { current: 0, supporting: 0, historical: 0, 'review-required': 0 };
const canonicalSubjectCounts = Object.fromEntries(
  registry.subjectScopes.map((scope) => [scope.subjectId, 0])
);
for (const question of questions) {
  const scope = questionStatusByTopicKey.get(`${question.subjectSlug}/${question.topicSlug}`);
  check(Boolean(scope), `${question.id} has an unregistered taxonomy key`);
  if (!scope) continue;
  questionScopeCounts[scope.status] += 1;
  if (scope.canonicalSubjectId) canonicalSubjectCounts[scope.canonicalSubjectId] += 1;
}
if (failures.length > 0) {
  throw new Error(`GATE 2027 question-scope audit failed:\n- ${failures.join('\n- ')}`);
}

const officialLeaves = registry.subjectScopes.flatMap((scope) =>
  scope.officialCurrent.map((leaf) => ({ subjectId: scope.subjectId, ...leaf }))
);
const coverageCounts = countBy(officialLeaves, (leaf) => leaf.bankCoverage);
const nonExplicitCoverage = officialLeaves
  .filter((leaf) => leaf.bankCoverage !== 'explicit')
  .map((leaf) => ({
    subjectId: leaf.subjectId,
    topicId: leaf.id,
    label: leaf.label,
    coverage: leaf.bankCoverage,
    bankTopicKeys: leaf.bankTopicKeys
  }));

const standardQuestionTypes = new Set(['MCQ', 'MSQ', 'NAT']);
const standardQuestions = questions.filter((question) => standardQuestionTypes.has(question.type));
const answerAvailableStandard = standardQuestions.filter(
  (question) => question.answerStatus === 'available'
);

function hasAnswerProvenance(question) {
  if (typeof question.answerSource === 'string') return Boolean(question.answerSource.trim());
  return Boolean(
    question.answerSource &&
      typeof question.answerSource === 'object' &&
      Object.keys(question.answerSource).length > 0
  );
}

function answerProvenanceKind(question) {
  if (typeof question.answerSource === 'string') {
    return question.answerSource.trim() ? 'legacy-string' : 'missing';
  }
  if (!question.answerSource || typeof question.answerSource !== 'object') return 'missing';
  if (typeof question.answerSource.kind === 'string' && question.answerSource.kind.trim()) {
    return question.answerSource.kind;
  }
  return Object.keys(question.answerSource).length > 0 ? 'legacy-structured' : 'missing';
}

function hasValidScoringAnswer(question) {
  if (question.type === 'MCQ') {
    return !Array.isArray(question.answer) && String(question.answer ?? '').trim().length > 0;
  }
  if (question.type === 'MSQ') {
    if (!Array.isArray(question.answer) || question.answer.length === 0) return false;
    const normalized = question.answer.map((answer) => String(answer).trim()).filter(Boolean);
    return normalized.length === question.answer.length && new Set(normalized).size === normalized.length;
  }
  if (question.type === 'NAT') {
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (answers.length === 0 || answers.some((answer) => !Number.isFinite(Number(answer)))) {
      return false;
    }
    const tolerance = question.tolerance?.abs ?? 0;
    return Number.isFinite(tolerance) && tolerance >= 0;
  }
  return false;
}

const marksPresentRuleEvaluable = answerAvailableStandard.filter(
  (question) =>
    (question.marks === 1 || question.marks === 2) &&
    hasValidScoringAnswer(question) &&
    hasAnswerProvenance(question)
);
const invalidRuleCandidates = answerAvailableStandard.filter(
  (question) =>
    (question.marks === 1 || question.marks === 2) &&
    (!hasValidScoringAnswer(question) || !hasAnswerProvenance(question))
);
for (const question of invalidRuleCandidates) {
  check(false, `${question.id} has marks but lacks a valid answer/provenance for rule scoring`);
}

const bonusQuestions = questions.filter(
  (question) => question.type === 'MARKS_TO_ALL' || question.answerStatus === 'marks-to-all'
);
for (const question of bonusQuestions) {
  check(
    question.type === 'MARKS_TO_ALL' && question.answerStatus === 'marks-to-all',
    `${question.id} has inconsistent MARKS_TO_ALL metadata`
  );
  check(question.answer == null, `${question.id} invents an answer for a marks-to-all row`);
}
const ruleEvaluableBonus = bonusQuestions.filter(
  (question) =>
    (question.marks === 1 || question.marks === 2) && hasAnswerProvenance(question)
);
check(bonusQuestions.length === 2, `Expected two marks-to-all rows, found ${bonusQuestions.length}`);
check(
  ruleEvaluableBonus.length === 1,
  `Expected one rule-evaluable marks-to-all row, found ${ruleEvaluableBonus.length}`
);

const pdfAnswerKeyRows = questions.filter(
  (question) => question.answerSource?.kind === 'pdf_answer_key'
);
const pdfMarkConflicts = [];
for (const question of pdfAnswerKeyRows) {
  const verifiedMark = verifiedPdfAnswerKeyMark(question.answerSource);
  check(verifiedMark != null, `${question.id} has malformed PDF answer-key mark provenance`);
  check(
    question.answerSource.year === question.year,
    `${question.id} PDF answer-key year does not match the question`
  );
  if (verifiedMark != null && question.marks !== verifiedMark) {
    pdfMarkConflicts.push({
      questionId: question.id,
      questionMarks: question.marks,
      verifiedMarks: verifiedMark
    });
    check(false, `${question.id} question marks disagree with its PDF answer key`);
  }
}
const verifiedPdfExact = marksPresentRuleEvaluable.filter(
  (question) => verifiedPdfAnswerKeyMark(question.answerSource) === question.marks
);
const verifiedPdfOneMark = verifiedPdfExact.filter((question) => question.marks === 1).length;
const verifiedPdfTwoMark = verifiedPdfExact.filter((question) => question.marks === 2).length;
check(pdfAnswerKeyRows.length === 130, 'Expected 130 PDF-answer-key-provenance questions');
check(verifiedPdfExact.length === 130, 'All 130 PDF-key rows must be verified-exact');
check(
  verifiedPdfOneMark === 60 && verifiedPdfTwoMark === 70,
  `Expected the 2026 PDF-key split 60x1M/70x2M, found ${verifiedPdfOneMark}x1M/${verifiedPdfTwoMark}x2M`
);
check(
  manifest.verifiedPdfMarkMetadata?.policyVersion === VERIFIED_PDF_MARK_POLICY_VERSION &&
    manifest.verifiedPdfMarkMetadata?.questionCount === 130 &&
    manifest.verifiedPdfMarkMetadata?.oneMarkCount === 60 &&
    manifest.verifiedPdfMarkMetadata?.twoMarkCount === 70,
  'Manifest verified-PDF mark provenance is stale'
);
if (failures.length > 0) {
  throw new Error(`GATE 2027 scoring-metadata audit failed:\n- ${failures.join('\n- ')}`);
}

const report = {
  registryVersion: registry.version,
  registryRetrievedOn: registry.retrievedOn,
  officialSources: registry.sources,
  blueprint: registry.blueprint,
  bankVersion: manifest.bankVersion,
  bankGeneratedAt: manifest.generatedAt,
  auditKind: 'independent-official-scope-audit',
  scopeLimit: registry.auditPolicy.scopeLimit,
  bank: {
    questionCount: questions.length,
    bankSubjectCount: manifest.subjects.length,
    bankTopicCount: topicRows.length,
    canonicalSubjectQuestionCounts: canonicalSubjectCounts,
    questionScopeCounts,
    questionTypes: countBy(questions, (question) => question.type),
    marks: countBy(questions, (question) => question.marks),
    answerStatuses: countBy(questions, (question) => question.answerStatus),
    answerProvenanceKinds: countBy(questions, answerProvenanceKind),
    books: (manifest.books ?? []).map((book) => ({
      slug: book.slug,
      label: book.label,
      questionCount: book.count,
      sourceClass: book.sourceClass,
      difficultyFloor: book.difficultyFloor,
      sourceUrl: book.sourceUrl
    })),
    scoringMetadata: {
      standardQuestionCount: standardQuestions.length,
      answerAvailableStandardQuestionCount: answerAvailableStandard.length,
      standardRuleEvaluableQuestionCount: marksPresentRuleEvaluable.length,
      standardRuleEvaluablePercentOfAnswerAvailableStandard: roundedPercent(
        marksPresentRuleEvaluable.length,
        answerAvailableStandard.length
      ),
      marksToAllQuestionCount: bonusQuestions.length,
      ruleEvaluableMarksToAllQuestionCount: ruleEvaluableBonus.length,
      totalRuleEvaluableQuestionCount:
        marksPresentRuleEvaluable.length + ruleEvaluableBonus.length,
      officialKeyVerifiedExactQuestionCount: verifiedPdfExact.length,
      officialKeyVerifiedOneMarkCount: verifiedPdfOneMark,
      officialKeyVerifiedTwoMarkCount: verifiedPdfTwoMark,
      unverifiedMarkProvenanceRuleEvaluableCount:
        marksPresentRuleEvaluable.length - verifiedPdfExact.length,
      pdfMarkConflicts,
      policy:
        'Stored MCQ/MSQ/NAT rows with a valid answer, answer provenance, and 1/2-mark metadata are standard GATE-rule-evaluable rows. MARKS_TO_ALL rows are counted separately and are rule-evaluable only when 1/2-mark metadata and provenance are present. Only matching structured PDF-answer-key marks are labelled official-key verified exact; tag-only marks are not promoted to verified provenance.'
    }
  },
  officialTopicCoverage: {
    currentLeafCount: officialLeaves.length,
    byCoverage: coverageCounts,
    nonExplicitCoverage
  },
  supportingAndHistorical: registry.subjectScopes
    .filter((scope) => scope.supporting.length > 0 || scope.historical.length > 0)
    .map((scope) => ({
      subjectId: scope.subjectId,
      supporting: scope.supporting,
      historical: scope.historical
    })),
  bankTopicScopes: topicRows,
  policies: registry.auditPolicy,
  conclusions: [
    `The ${questions.length.toLocaleString()}-question immutable bank is preserved; this audit does not delete or rewrite questions.`,
    'Historical and supporting questions remain available but are excluded from current-syllabus coverage evidence.',
    'Broad and review-required leaves are visible gaps, not claims of verified row-level coverage.',
    'Book sourceClass and difficultyFloor describe a source collection; row-level answer and mark authority remains explicit in answerSource.',
    `${marksPresentRuleEvaluable.length.toLocaleString()} standard rows and ${ruleEvaluableBonus.length.toLocaleString()} marks-to-all row are GATE-rule-evaluable from stored metadata; only ${verifiedPdfExact.length.toLocaleString()} standard rows have official PDF-key-verified marks.`,
    'Structured PDF-answer-key marks are authoritative over contradictory archive tags; the 2026 split is locked at 60 one-mark and 70 two-mark questions.'
  ]
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (writeArtifact) {
  await writeFile(ARTIFACT_PATH, serialized);
  console.log(`Wrote ${path.relative(ROOT, ARTIFACT_PATH)}.`);
} else {
  const committed = await readFile(ARTIFACT_PATH, 'utf8').catch(() => '');
  if (committed !== serialized) {
    throw new Error(
      'GATE 2027 taxonomy artifact is stale. Review registry/bank changes, then run this script with --write.'
    );
  }
}

console.log(
  `Audited ${questions.length.toLocaleString()} PYQs against ${officialLeaves.length} official topic leaves (${marksPresentRuleEvaluable.length.toLocaleString()} standard + ${ruleEvaluableBonus.length.toLocaleString()} bonus rule-evaluable; ${verifiedPdfExact.length.toLocaleString()} official-key verified exact).`
);
