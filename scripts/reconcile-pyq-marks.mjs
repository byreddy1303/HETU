#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
  marksFromGateQuestionNumber,
  normalizedSourceMark,
  sourceArchiveMark,
  verifiedPdfAnswerKeyMark
} from './pyq-marks.mjs';
import { PYQ_BANK_VERSION } from './pyq-taxonomy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'public', 'pyq');
const MANIFEST_PATH = path.join(OUTPUT, 'manifest.json');
const PROVENANCE_PATH = path.join(OUTPUT, 'provenance.json');
const AUDIT_PATH = path.join(OUTPUT, 'marks-audit.json');

const OFFICIAL_DOWNLOADS_URL = 'https://gate2026.iitg.ac.in/download.html';
const OFFICIAL_KEYS_URL = 'https://gate2026.iitg.ac.in/QPs-answer-keys.html';
const OFFICIAL_PATTERN_URL = 'https://gate2026.iitg.ac.in/question-paper-pattern.html';
const LEGACY_MIRROR_URL = 'https://www.gateexam.info/previous-papers/CS/';
const PAPER_MANIFEST_PATH = 'references/gate-papers/manifest.json';

// These rows came from older ExamSIDE pages whose original structured `marks`
// field was discarded by the v11 builder because it accepted only 1 or 2. The
// current source pages still display +5, and the matching legacy papers place
// each row in a five-mark descriptive section.
const LEGACY_EXAMSIDE_FIVE_MARK_IDS = new Set([
  'es:gate-cse:64qw606J87pnFuhL',
  'es:gate-cse:8lbfoY5iyMxBDAH2',
  'es:gate-cse:42fYt4sDptwdWNMt',
  'es:gate-cse:COvhSoTdYU0y44Gr',
  'es:gate-cse:DuVAZoxfjOsWDHDX',
  'es:gate-cse:NWeDD6UkmCecdvs3',
  'es:gate-cse:NiU98AZ6RGZv8vj7',
  'es:gate-cse:Or6OKb5AWMqwbI4p',
  'es:gate-cse:QgJSAcgXRgIN4A0L',
  'es:gate-cse:SpC23MOpjGBDH3Hs',
  'es:gate-cse:SwBmnsYecjGyFLm2',
  'es:gate-cse:a24nps6qmbR2uNub',
  'es:gate-cse:bQaW8n8zXVZYHe0F',
  'es:gate-cse:bdi3yWfPOSO8cY72',
  'es:gate-cse:gO3CGJqL4A0nFK9k',
  'es:gate-cse:l0ZFTJkAgkwNbneH'
]);

// These archive rows represent only one named part of a five-mark parent
// question. The paper does not publish an independent part-wise split.
const PARENT_TOTAL_ROWS = new Map([
  [
    'go:359942',
    '1995 Q7(B): the official paper assigns 5 marks to parent Question 7; it does not publish a separate allocation for part B.'
  ],
  [
    'go:2664',
    '1995 Q25(a): the official paper assigns 5 marks to parent Question 25; it does not publish a separate allocation for part (a).'
  ],
  [
    'go:314348',
    '1995 Q25(b): the official paper assigns 5 marks to parent Question 25; it does not publish a separate allocation for part (b).'
  ]
]);

function isGateQuestion(question) {
  return String(question.bookSlug ?? '').startsWith('gate-');
}

function resolveGateMark(question) {
  const pdfMark = verifiedPdfAnswerKeyMark(question.answerSource);
  if (pdfMark != null) {
    return { marks: pdfMark, evidence: 'official-pdf-answer-key' };
  }

  if (String(question.id).startsWith('es:')) {
    const urlMark = sourceArchiveMark(null, question.sourceUrl);
    if (urlMark != null) return { marks: urlMark, evidence: 'archive-canonical-url' };
    if (LEGACY_EXAMSIDE_FIVE_MARK_IDS.has(question.id)) {
      return { marks: 5, evidence: 'legacy-question-page-and-paper-section' };
    }
    const sourceMark = normalizedSourceMark(question.marks);
    if (sourceMark != null) return { marks: sourceMark, evidence: 'archive-structured-metadata' };
    const paperMark = marksFromGateQuestionNumber(question);
    if (paperMark != null) return { marks: paperMark, evidence: 'published-paper-numbering-rule' };
    return { marks: null, evidence: 'unresolved' };
  }

  // For GATE CSE/IT rows, published paper numbering outranks stale archive
  // tags. This repairs known 2009, 2013, 2014, 2024 and 2025 contradictions.
  const paperMark = marksFromGateQuestionNumber(question);
  if (paperMark != null) return { marks: paperMark, evidence: 'published-paper-numbering-rule' };
  const sourceMark = normalizedSourceMark(question.marks);
  if (sourceMark != null) return { marks: sourceMark, evidence: 'archive-structured-metadata' };
  return { marks: null, evidence: 'unresolved' };
}

function groupCounts(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function countMarks(rows, marksOf = (row) => row.marks) {
  const counts = {};
  for (const row of rows) {
    const marks = marksOf(row);
    const key = marks == null ? 'null' : String(marks);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => {
      if (left === 'null') return 1;
      if (right === 'null') return -1;
      return Number(left) - Number(right);
    })
  );
}

function questionAuditRow(question, resolution, previousMarks) {
  return {
    id: question.id,
    bookSlug: question.bookSlug,
    paperLabel: question.paperLabel,
    year: question.year,
    set: question.set,
    number: question.number,
    subjectSlug: question.subjectSlug,
    previousMarks,
    marks: resolution.marks,
    evidence: resolution.evidence,
    sourceUrl: question.sourceUrl
  };
}

function paperRows(questions) {
  const groups = groupCounts(
    questions,
    (question) =>
      `${question.bookSlug}\u0000${question.year}\u0000${question.set ?? ''}\u0000${question.paperLabel}`
  );
  return [...groups.values()]
    .map((rows) => ({
      bookSlug: rows[0].bookSlug,
      paperLabel: rows[0].paperLabel,
      year: rows[0].year,
      set: rows[0].set,
      questionCount: rows.length,
      assignedCount: rows.filter((question) => question.marks != null).length,
      missingCount: rows.filter((question) => question.marks == null).length,
      representedMarkSum: rows.reduce((sum, question) => sum + (question.marks ?? 0), 0),
      markDistribution: countMarks(rows)
    }))
    .sort(
      (left, right) =>
        left.bookSlug.localeCompare(right.bookSlug) ||
        left.year - right.year ||
        (left.set ?? 0) - (right.set ?? 0) ||
        left.paperLabel.localeCompare(right.paperLabel)
    );
}

function assertModernPaperTotals(questions) {
  const checks = [];
  for (const year of [2024, 2025, 2026]) {
    for (const set of [1, 2]) {
      const rows = questions.filter(
        (question) =>
          question.bookSlug === 'gate-cse' && question.year === year && question.set === set
      );
      const representedMarkSum = rows.reduce((sum, question) => sum + (question.marks ?? 0), 0);
      checks.push({ year, set, questionCount: rows.length, representedMarkSum });
      if (rows.length !== 65 || representedMarkSum !== 100) {
        throw new Error(
          `GATE CSE ${year} Set ${set} invariant failed: ${rows.length} questions, ${representedMarkSum} marks`
        );
      }
    }
  }
  return checks;
}

function buildAudit({ allQuestions, gateQuestions, changes, initialMissingCount }) {
  const nonGateQuestions = allQuestions.filter((question) => !isGateQuestion(question));
  const evidenceCounts = Object.fromEntries(
    [...groupCounts(gateQuestions, (question) => question.markEvidence).entries()]
      .map(([key, rows]) => [key, rows.length])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const byBook = [...groupCounts(allQuestions, (question) => question.bookSlug).entries()]
    .map(([bookSlug, rows]) => ({
      bookSlug,
      questionCount: rows.length,
      assignedCount: rows.filter((question) => question.marks != null).length,
      missingCount: rows.filter((question) => question.marks == null).length,
      markDistribution: countMarks(rows)
    }))
    .sort((left, right) => left.bookSlug.localeCompare(right.bookSlug));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bankVersion: PYQ_BANK_VERSION,
    policyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
    scope:
      'Every GATE-derived row shipped in the bank (CSE, IT, DA/AI overlap, ECE/EE Digital Logic, and cross-branch Engineering Mathematics). Non-GATE collections are reported but not modified.',
    result: {
      allQuestionCount: allQuestions.length,
      gateQuestionCount: gateQuestions.length,
      gateMissingBefore: initialMissingCount,
      gateNewlyAssigned: changes.filter((change) => change.previousMarks == null).length,
      gateCorrectedExisting: changes.filter((change) => change.previousMarks != null).length,
      gateAssignedAfter: gateQuestions.filter((question) => question.marks != null).length,
      gateMissingAfter: gateQuestions.filter((question) => question.marks == null).length,
      nonGateMissingUnchanged: nonGateQuestions.filter((question) => question.marks == null).length
    },
    markDistributionAfter: countMarks(gateQuestions),
    evidenceCounts,
    modernCompletePaperChecks: assertModernPaperTotals(gateQuestions),
    byBook,
    byPaper: paperRows(gateQuestions),
    parentQuestionTotalRows: [...PARENT_TOTAL_ROWS].map(([id, note]) => {
      const question = gateQuestions.find((candidate) => candidate.id === id);
      return {
        id,
        paperLabel: question?.paperLabel ?? null,
        number: question?.number ?? null,
        marks: question?.marks ?? null,
        scope: 'parent-question-total',
        note
      };
    }),
    bundledQuestionRows: [
      {
        id: 'go:2291',
        paperLabel: 'GATE CSE 1993',
        number: '7.1,2,3',
        marks: 6,
        scope: 'three-bundled-subquestions',
        note: 'The paper assigns 2 marks to each of 7.1, 7.2 and 7.3; the archive stores all three in one row, so its represented total is 6.'
      }
    ],
    newlyAssignedQuestions: changes.filter((change) => change.previousMarks == null),
    correctedQuestions: changes.filter((change) => change.previousMarks != null),
    unresolvedGateQuestions: gateQuestions
      .filter((question) => question.marks == null)
      .map((question) => questionAuditRow(question, { marks: null, evidence: 'unresolved' }, null)),
    sources: {
      localPaperManifest: PAPER_MANIFEST_PATH,
      officialDownloads: OFFICIAL_DOWNLOADS_URL,
      officialMasterPapersAndKeys: OFFICIAL_KEYS_URL,
      officialCurrentPattern: OFFICIAL_PATTERN_URL,
      legacyMirrorIndex: LEGACY_MIRROR_URL
    },
    limitations: [
      'The current official bulk archive starts at 2007. Pre-2007 PDFs in the local bundle are explicitly classified as legacy mirrors.',
      'No local CS 1990 or standalone IT 2004-2008 PDF was obtainable from the configured sources. Their rows use question-level archive metadata or the published numbering scheme and are not labeled locally PDF-verified.',
      'Three 1995 archive rows represent only a named part of a five-mark parent question. The official paper does not publish a separate part-wise split; the stored 5 is therefore labeled parent-question-total.'
    ]
  };
}

async function loadBank() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const subjectPayloads = await Promise.all(
    manifest.subjects.map(async (subject) => {
      const filePath = path.join(ROOT, 'public', subject.file);
      return { filePath, payload: JSON.parse(await readFile(filePath, 'utf8')) };
    })
  );
  return { manifest, subjectPayloads };
}

async function main() {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check') || !write;
  const { manifest, subjectPayloads } = await loadBank();
  const allQuestions = subjectPayloads.flatMap(({ payload }) => payload.questions);
  const gateQuestions = allQuestions.filter(isGateQuestion);
  const initialMissingCount = gateQuestions.filter((question) => question.marks == null).length;
  const changes = [];

  for (const question of gateQuestions) {
    const previousMarks = question.marks;
    const resolution = resolveGateMark(question);
    question.markEvidence = resolution.evidence;
    if (previousMarks !== resolution.marks) {
      changes.push(questionAuditRow(question, resolution, previousMarks));
      if (write) question.marks = resolution.marks;
    }
  }

  const unresolved = gateQuestions.filter((question) => question.markEvidence === 'unresolved');
  if (unresolved.length > 0) {
    const sample = unresolved
      .slice(0, 5)
      .map((question) => `${question.id} (${question.paperLabel} Q${question.number})`)
      .join(', ');
    throw new Error(`${unresolved.length} GATE mark row(s) remain unresolved: ${sample}`);
  }

  if (check && changes.length > 0) {
    throw new Error(
      `${changes.length} GATE mark row(s) do not match ${GATE_PAPER_PATTERN_MARK_POLICY_VERSION}. Run npm run pyq:marks to reconcile them.`
    );
  }

  if (write) {
    if (
      changes.length === 0 &&
      manifest.bankVersion === PYQ_BANK_VERSION &&
      manifest.gatePaperPatternMarkPolicyVersion === GATE_PAPER_PATTERN_MARK_POLICY_VERSION
    ) {
      assertModernPaperTotals(gateQuestions);
      console.log(`Verified ${gateQuestions.length} GATE rows; the reconciled bank is unchanged.`);
      return;
    }

    const audit = buildAudit({ allQuestions, gateQuestions, changes, initialMissingCount });
    if (audit.result.gateMissingAfter !== 0) {
      throw new Error(`${audit.result.gateMissingAfter} GATE row(s) still have no mark allocation`);
    }

    for (const { filePath, payload } of subjectPayloads) {
      payload.bankVersion = PYQ_BANK_VERSION;
      // `markEvidence` is an audit implementation detail, not part of the bank
      // payload. Keep the shipped question schema focused on the allocation.
      for (const question of payload.questions) delete question.markEvidence;
      await writeFile(filePath, `${JSON.stringify(payload)}\n`);
    }

    const markMetadata = {
      policyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
      auditFile: '/pyq/marks-audit.json',
      gateQuestionCount: audit.result.gateQuestionCount,
      assignedCount: audit.result.gateAssignedAfter,
      missingCount: audit.result.gateMissingAfter,
      newlyAssignedCount: audit.result.gateNewlyAssigned,
      correctedExistingCount: audit.result.gateCorrectedExisting,
      distribution: audit.markDistributionAfter
    };
    Object.assign(manifest, {
      bankVersion: PYQ_BANK_VERSION,
      generatedAt: audit.generatedAt,
      gatePaperPatternMarkPolicyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
      markMetadata
    });
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

    const provenance = JSON.parse(await readFile(PROVENANCE_PATH, 'utf8'));
    Object.assign(provenance, {
      bankVersion: PYQ_BANK_VERSION,
      gatePaperPatternMarkPolicyVersion: GATE_PAPER_PATTERN_MARK_POLICY_VERSION,
      markMetadata
    });
    await writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
    await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(
      `Assigned ${audit.result.gateNewlyAssigned} missing GATE marks, corrected ${audit.result.gateCorrectedExisting}, and left ${audit.result.gateMissingAfter} unresolved.`
    );
    return;
  }

  // In check mode, all rows already match. Validate the final paper totals too.
  assertModernPaperTotals(gateQuestions);
  if (
    manifest.bankVersion !== PYQ_BANK_VERSION ||
    manifest.gatePaperPatternMarkPolicyVersion !== GATE_PAPER_PATTERN_MARK_POLICY_VERSION ||
    manifest.markMetadata?.gateQuestionCount !== gateQuestions.length ||
    manifest.markMetadata?.assignedCount !== gateQuestions.length ||
    manifest.markMetadata?.missingCount !== 0
  ) {
    throw new Error('The PYQ manifest mark metadata is missing or stale. Run npm run pyq:marks.');
  }
  const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));
  if (
    audit.bankVersion !== PYQ_BANK_VERSION ||
    audit.policyVersion !== GATE_PAPER_PATTERN_MARK_POLICY_VERSION ||
    audit.result?.gateQuestionCount !== gateQuestions.length ||
    audit.result?.gateMissingAfter !== 0
  ) {
    throw new Error('The GATE mark audit is missing or stale. Run npm run pyq:marks.');
  }
  const provenance = JSON.parse(await readFile(PROVENANCE_PATH, 'utf8'));
  if (
    provenance.bankVersion !== PYQ_BANK_VERSION ||
    provenance.gatePaperPatternMarkPolicyVersion !== GATE_PAPER_PATTERN_MARK_POLICY_VERSION ||
    provenance.markMetadata?.gateQuestionCount !== gateQuestions.length ||
    provenance.markMetadata?.assignedCount !== gateQuestions.length ||
    provenance.markMetadata?.missingCount !== 0
  ) {
    throw new Error('The PYQ provenance mark metadata is missing or stale. Run npm run pyq:marks.');
  }
  console.log(`Verified ${gateQuestions.length} GATE rows; none are missing marks.`);
}

await main();
