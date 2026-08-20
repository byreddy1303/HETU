import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-11.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 11);
if (!batch) throw new Error('Incremental original batchIndex 11 was not found');

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
if (batch.files.length !== extraction.results.length) throw new Error('Batch/extraction file count mismatch');
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing extraction result for ${file.path}`);
  if (result.path !== file.path || result.language !== file.language || result.fileCategory !== file.fileCategory || result.totalLines !== file.sizeLines) {
    throw new Error(`Extraction metadata mismatch for ${file.path}`);
  }
}

const fileDefinitions = {
  'scripts/build-go-classes-coa-test-2-log-migration.mjs': {
    summary: 'Converts a learner’s 15-question GO Classes COA Topic Test 2 log into an idempotent Supabase SQL migration that preserves immutable PYQ receipts, journal questions, and scheduled D3 re-attempts after validating answer evidence.',
    tags: ['migration-generator', 'pyq', 'data-import', 'supabase', 'audit-trail'],
    languageNotes: 'Top-level ESM reads structured source data, derives stable identifiers and timestamps, and embeds validated JSON into a PostgreSQL procedural migration.'
  },
  'scripts/build-pyq-bank.mjs': {
    summary: 'Builds the audited 3,200-question GATE PYQ archive by combining GateQA, GATE Overflow, ExamSIDE supplements, and learner-provided tests, then classifying questions, localizing images, and writing subject shards, manifest, and provenance data.',
    tags: ['build-script', 'pyq', 'content-pipeline', 'web-scraping', 'data-validation'],
    languageNotes: 'Node ESM uses cached and concurrent network ingestion, JSDOM parsing, strict count assertions, content sanitization, and deterministic artifact generation.'
  }
};

const functionDefinitions = {
  'scripts/build-go-classes-coa-test-2-log-migration.mjs:uuidFromString': 'Derives a stable RFC 4122-shaped version-four UUID from a string seed using two evolving integer hashes.',
  'scripts/build-go-classes-coa-test-2-log-migration.mjs:plainText': 'Converts question HTML into readable journal text while preserving ordered-list labels, line breaks, and table-cell boundaries.',
  'scripts/build-pyq-bank.mjs:sanitizeSourceHtml': 'Removes scripts, styles, embedded active content, inline event handlers, unsafe JavaScript URLs, and source-only attributes from imported question HTML.',
  'scripts/build-pyq-bank.mjs:absoluteImageUrl': 'Resolves an image reference against GateQA and normalizes the source repository’s legacy Gate_QA path prefix.',
  'scripts/build-pyq-bank.mjs:fetchWithRetry': 'Fetches an archive URL with the project user agent and bounded linear backoff before surfacing the final failure.',
  'scripts/build-pyq-bank.mjs:cachedJson': 'Returns a parsed JSON artifact from the temporary cache or downloads, persists, and parses it on a cache miss.',
  'scripts/build-pyq-bank.mjs:cachedText': 'Returns a text artifact from the temporary cache or downloads and persists it on a cache miss.',
  'scripts/build-pyq-bank.mjs:extractJavascriptArray': 'Scans a JavaScript source payload for one balanced array literal while respecting quoted strings and escape characters.',
  'scripts/build-pyq-bank.mjs:examSideQuestionFromHtml': 'Extracts ExamSIDE’s embedded structured question array from an allowlisted detail page and finds the record matching its permalink.',
  'scripts/build-pyq-bank.mjs:loadExamSideSourceRows': 'Builds or loads a cached, deduplicated snapshot of audited ECE and EE Digital Logic detail records using bounded concurrent fetches.',
  'scripts/build-pyq-bank.mjs:loadExamSideCseSourceRows': 'Builds or loads a sorted cached snapshot of ExamSIDE CSE questions used to replace five incomplete archive years.',
  'scripts/build-pyq-bank.mjs:numericExamSideKey': 'Normalizes ExamSIDE numeric answers, converting ranges into midpoint answers with absolute tolerances and rejecting ambiguous values.',
  'scripts/build-pyq-bank.mjs:examSideQuestionType': 'Maps ExamSIDE bonus, MCQ, MSQ, and numeric metadata into the bank’s supported answer-type vocabulary.',
  'scripts/build-pyq-bank.mjs:examSideCseClassification': 'Maps ExamSIDE CSE subjects, chapters, and question-text signals onto the project’s canonical subject and topic taxonomy.',
  'scripts/build-pyq-bank.mjs:examSideDigitalLogicQuestions': 'Transforms audited ECE and EE Digital Logic records into canonical bank questions and enforces the expected 259-question source split.',
  'scripts/build-pyq-bank.mjs:examSideCseQuestions': 'Transforms the five replacement-year CSE snapshots into canonical questions and enforces the expected 192-question count.',
  'scripts/build-pyq-bank.mjs:imageExtension': 'Chooses a safe image filename extension from the HTTP content type, falling back to a validated URL suffix.',
  'scripts/build-pyq-bank.mjs:downloadImages': 'Downloads or substitutes remote question images concurrently, validates media types, and writes hash-named local assets with a URL map.',
  'scripts/build-pyq-bank.mjs:localizedHtml': 'Rewrites imported image references to bundled paths and adds lazy, asynchronous image-decoding attributes.',
  'scripts/build-pyq-bank.mjs:main': 'Orchestrates source ingestion, normalization, taxonomy classification, count and uniqueness audits, image localization, subject sharding, and manifest and provenance generation.'
};

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

function functionTags(filePath, functionName) {
  if (filePath.includes('log-migration')) {
    return functionName === 'uuidFromString'
      ? ['utility', 'deterministic-id', 'migration-generator']
      : ['utility', 'html-parsing', 'data-import'];
  }
  if (functionName === 'sanitizeSourceHtml') return ['utility', 'sanitization', 'security'];
  if (functionName.includes('Image') || functionName === 'imageExtension' || functionName === 'localizedHtml') {
    return ['utility', 'image-processing', 'asset-pipeline'];
  }
  if (functionName.startsWith('load') || functionName.startsWith('cached') || functionName === 'fetchWithRetry') {
    return ['utility', 'data-ingestion', 'caching'];
  }
  if (functionName.startsWith('examSide') || functionName === 'numericExamSideKey') {
    return ['utility', 'examside', 'data-normalization'];
  }
  if (functionName === 'main') return ['entry-point', 'content-pipeline', 'data-validation'];
  return ['utility', 'javascript-parsing', 'data-ingestion'];
}

const nodes = [];
for (const file of batch.files) {
  const definition = fileDefinitions[file.path];
  if (!definition) throw new Error(`Missing file definition for ${file.path}`);
  const result = resultByPath.get(file.path);
  nodes.push({
    id: `file:${file.path}`,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary: definition.summary,
    tags: definition.tags,
    complexity: complexity(result.nonEmptyLines),
    languageNotes: definition.languageNotes
  });

  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const fn of result.functions ?? []) {
    const lines = fn.endLine - fn.startLine + 1;
    if (lines < 10 && !exportedNames.has(fn.name)) continue;
    const key = `${file.path}:${fn.name}`;
    const summary = functionDefinitions[key];
    if (!summary) throw new Error(`Missing function definition for ${key}`);
    nodes.push({
      id: `function:${file.path}:${fn.name}`,
      type: 'function',
      name: fn.name,
      filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary,
      tags: functionTags(file.path, fn.name),
      complexity: complexity(lines)
    });
  }
}

const edges = [];
for (const file of batch.files) {
  const source = `file:${file.path}`;
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
  for (const node of nodes.filter((candidate) => candidate.filePath === file.path && candidate.id !== source)) {
    edges.push({ source, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
  }
}

edges.push({
  source: 'function:scripts/build-pyq-bank.mjs:main',
  target: 'function:scripts/pyq-taxonomy.mjs:classifyPyqQuestion',
  type: 'calls',
  direction: 'forward',
  weight: 0.8
});

const nodeIds = new Set(nodes.map((node) => node.id));
if (nodeIds.size !== nodes.length) throw new Error('Duplicate node IDs generated');
const allowedExternalFileTargets = new Set(Object.values(batch.batchImportData).flat().map((filePath) => `file:${filePath}`));
const allowedExternalSymbolTargets = new Set(
  Object.values(batch.neighborMap).flatMap((neighbors) =>
    neighbors.flatMap((neighbor) =>
      neighbor.symbols.flatMap((symbol) => [
        `function:${neighbor.path}:${symbol}`,
        `class:${neighbor.path}:${symbol}`
      ])
    )
  )
);
const edgeKeys = new Set();
for (const edge of edges) {
  const key = `${edge.source}|${edge.target}|${edge.type}`;
  if (edgeKeys.has(key)) throw new Error(`Duplicate edge generated: ${key}`);
  edgeKeys.add(key);
  if (edge.source === edge.target) throw new Error(`Self edge generated: ${key}`);
  if (!nodeIds.has(edge.source)) throw new Error(`Unresolved source: ${key}`);
  if (!nodeIds.has(edge.target) && !allowedExternalFileTargets.has(edge.target) && !allowedExternalSymbolTargets.has(edge.target)) {
    throw new Error(`Unresolved target: ${key}`);
  }
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) {
  throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  path.join(uaDir, 'intermediate/batch-11.json'),
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount, filesSkipped: extraction.filesSkipped ?? [] }));
