import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-10.json'), 'utf8'));
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 10);
if (!batch) throw new Error('Original batchIndex 10 was not found');

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
if (batch.files.length !== extraction.results.length) throw new Error('Batch/extraction file count mismatch');
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing extraction result for ${file.path}`);
  if (result.path !== file.path || result.language !== file.language || result.fileCategory !== file.fileCategory || result.totalLines !== file.sizeLines) {
    throw new Error(`Extraction metadata mismatch for ${file.path}`);
  }
}

const fileSummaries = {
  'src/__tests__/progress_export.test.ts': 'Verifies comprehensive progress metrics, spreadsheet-safe CSV output, numeric values, and strict user scoping during report collection.',
  'src/__tests__/readiness-snapshots.test.ts': 'Covers account-isolated readiness history, prior-week comparisons, and the minimum sample span required for exam projection.',
  'src/__tests__/readiness.test.ts': 'Exercises readiness subscores, evidence tempering, client/server parity, per-subject breakdowns, recommendations, AIR bands, and deterministic exam simulation.',
  'src/__tests__/topic-progress.test.ts': 'Verifies user-scoped topic completion timestamps and removal when a syllabus topic is unticked.',
  'src/lib/progress-export.ts': 'Collects learner-owned local data and builds a versioned, spreadsheet-friendly progress report across sessions, journal, planner, PYQs, revision, readiness, syllabus, and focus metrics.',
  'src/lib/readiness-snapshots.ts': 'Persists local readiness snapshots, computes weekly movement and exam projections, and tracks long-running weak-component debt overall and by subject.',
  'src/lib/readiness.ts': 'Computes evidence-tempered overall and per-subject exam readiness, component contributions, prioritized next moves, coarse AIR bands, and deterministic exam-day simulations.',
  'src/stores/topic-progress.ts': 'Maintains user-scoped syllabus completion state in Zustand, migrates legacy local records, and mirrors deterministic topic rows through the offline sync engine.',
  'supabase/functions/_shared/readiness-score.ts': 'Implements the server-side readiness composite kept equivalent to the client scorer for scheduled snapshot computation.'
};

const functionSummaries = {
  session: 'Builds a representative completed session fixture for progress-report tests.',
  question: 'Builds a representative question fixture with configurable outcome or readiness evidence.',
  pattern: 'Builds a representative pattern-library fixture for report and readiness tests.',
  reattempt: 'Builds a representative spaced re-attempt fixture for report and readiness tests.',
  progressData: 'Assembles a complete in-memory learner dataset spanning the progress-report components.',
  snapshot: 'Builds a readiness snapshot fixture whose component values track its score.',
  buildProgressReport: 'Aggregates learner data into versioned numeric metrics for every major study, review, readiness, syllabus, and focus surface.',
  collectProgressReport: 'Loads only the selected user’s local rows, planner data, and topic completions before building the report.',
  progressReportCsv: 'Serializes the progress report as BOM-prefixed, spreadsheet-safe CSV with stable metadata and metric columns.',
  downloadProgressReport: 'Creates a temporary CSV object URL and triggers a dated browser download.',
  loadSnapshots: 'Loads and chronologically sorts one user’s locally stored readiness snapshots.',
  upsertSnapshot: 'Idempotently replaces a day’s snapshot, sorts history, trims it to the retention limit, and persists it.',
  weeklyDelta: 'Compares the latest score with the nearest snapshot around seven days earlier when a valid comparison exists.',
  projectToExam: 'Fits a linear trend to sufficiently broad recent history and projects a bounded exam-day score.',
  loadDebt: 'Loads the user’s persisted weak-component watchlist.',
  updateDebt: 'Recomputes overall and per-subject component debt, retaining below-threshold entries and updating the weeks held.',
  coverage: 'Normalizes encountered pattern count against the target pattern library.',
  retention: 'Calculates the fraction of eligible re-attempts stabilized at D30 or mastered.',
  calibration: 'Calculates correctness among questions the learner explicitly chose to mark.',
  surface: 'Converts the open re-attempt count into an inverse mistake-surface score.',
  computeReadiness: 'Combines evidence-tempered coverage, retention, calibration, and mistake surface into a score, confidence level, and counts.',
  readinessComponents: 'Expands a readiness breakdown into labeled weighted components and rounded score contributions.',
  computeReadinessBySubject: 'Joins re-attempts to questions, slices evidence by subject, scales coverage targets, and computes subject readiness and confidence.',
  nextMoves: 'Ranks up to three concrete calibration, re-attempt, coverage, stabilization, or diagnosis actions from readiness evidence.',
  estimateAIRBand: 'Maps readiness score and remaining runway into a coarse rank band with an explicit caveat.',
  simulateOnce: 'Runs one subject-weighted exam simulation using calibration as correctness probability and negative marking for misses.',
  examDaySimulator: 'Runs a deterministic seeded Monte Carlo simulation and reports P10, median, P90, and mean marks.',
  topicProgressId: 'Builds the stable subject-and-topic key used in local completion state.',
  topicProgressRowId: 'Derives a deterministic synchronized row ID from user, subject, and topic.',
  selectCompletionsForUser: 'Selects an effective user’s completions with ordered fallbacks for migrated legacy identities.',
  syncTopicProgressFromDb: 'Merges local, legacy, and synchronized topic completion rows and idempotently migrates missing records into offline sync.',
  computeReadinessScore: 'Computes the server readiness score from the same weighted and sample-tempered evidence used by the client.'
};

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

function tagsFor(filePath, isFunction = false) {
  if (filePath.includes('/__tests__/')) {
    const domain = filePath.includes('progress_export') ? 'progress-export' : filePath.includes('snapshots') ? 'readiness-history' : filePath.includes('topic-progress') ? 'topic-progress' : 'readiness';
    return [isFunction ? 'test-fixture' : 'test', 'vitest', domain];
  }
  if (filePath.endsWith('/progress-export.ts')) return [isFunction ? 'utility' : 'service', 'progress-export', 'serialization'];
  if (filePath.endsWith('/readiness-snapshots.ts')) return [isFunction ? 'utility' : 'service', 'readiness-history', 'local-storage'];
  if (filePath.endsWith('/readiness.ts')) return [isFunction ? 'utility' : 'service', 'readiness', 'analytics'];
  if (filePath.endsWith('/topic-progress.ts')) return [isFunction ? 'utility' : 'service', 'topic-progress', 'state-management'];
  if (filePath.endsWith('/readiness-score.ts')) return [isFunction ? 'utility' : 'service', 'readiness', 'supabase-function'];
  return [isFunction ? 'utility' : 'service', 'typescript', 'domain-logic'];
}

const nodes = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  const summary = fileSummaries[file.path];
  if (!summary) throw new Error(`Missing file summary for ${file.path}`);
  const node = {
    id: `file:${file.path}`,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary,
    tags: tagsFor(file.path),
    complexity: complexity(result.nonEmptyLines)
  };
  if (file.path.startsWith('supabase/functions/')) node.languageNotes = 'TypeScript targeting the Deno-based Supabase Functions runtime.';
  else node.languageNotes = 'TypeScript module.';
  nodes.push(node);

  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const fn of result.functions ?? []) {
    const exported = exportedNames.has(fn.name);
    if (fn.endLine - fn.startLine + 1 < 10 && !exported) continue;
    const fnSummary = functionSummaries[fn.name];
    if (!fnSummary) throw new Error(`Missing function summary for ${file.path}:${fn.name}`);
    nodes.push({
      id: `function:${file.path}:${fn.name}`,
      type: 'function',
      name: fn.name,
      filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary: fnSummary,
      tags: tagsFor(file.path, true),
      complexity: complexity(fn.endLine - fn.startLine + 1)
    });
  }
}

const nodeById = new Map(nodes.map((node) => [node.id, node]));
if (nodeById.size !== nodes.length) throw new Error('Duplicate node IDs generated');

const edges = [];
for (const file of batch.files) {
  const source = `file:${file.path}`;
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
  const result = resultByPath.get(file.path);
  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const node of nodes.filter((candidate) => candidate.filePath === file.path && candidate.id !== source)) {
    edges.push({ source, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exportedNames.has(node.name)) edges.push({ source, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

// Tests expose the relation from their local node; assembly canonicalizes the
// relationship to production -> test, including cross-batch production files.
for (const testFile of batch.files.filter((file) => file.path.includes('/__tests__/'))) {
  for (const productionPath of batch.batchImportData[testFile.path] ?? []) {
    edges.push({ source: `file:${testFile.path}`, target: `file:${productionPath}`, type: 'tested_by', direction: 'forward', weight: 0.5 });
  }
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
for (const edge of edges) if (edge.source === edge.target) throw new Error(`Self edge generated for ${edge.source}`);

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  path.join(uaDir, 'intermediate/batch-10.json'),
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount }));
