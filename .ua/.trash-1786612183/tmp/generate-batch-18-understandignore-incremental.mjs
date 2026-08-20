import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const batches = JSON.parse(readFileSync(`${root}/.ua/intermediate/batches.json`, 'utf8'));
const extraction = JSON.parse(readFileSync(`${root}/.ua/tmp/ua-file-extract-results-18.json`, 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 18);
if (!batch) throw new Error('Incremental original batchIndex 18 was not found');
if (batch.files.length !== 1) throw new Error(`Expected one batch file, found ${batch.files.length}`);

const file = batch.files[0];
if (!(extraction.filesSkipped ?? []).includes(file.path)) {
  throw new Error(`Expected extractor to record skipped file ${file.path}`);
}

const nodes = [
  {
    id: `file:${file.path}`,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary: 'Defines HETU-specific knowledge-graph scan exclusions for secrets, machine-local deployment state, generated build and test artifacts, analysis outputs, large PYQ datasets, and binary study assets while retaining commented cross-language test-pattern examples.',
    tags: ['configuration', 'analysis-scope', 'security', 'artifact-filtering'],
    complexity: 'moderate',
    languageNotes: 'Uses gitignore-compatible glob syntax, comments, directory suffixes, and potential negation rules to control Understand-Anything scanning.'
  }
];

const edges = [];
for (const importedPath of batch.batchImportData[file.path] ?? []) {
  edges.push({
    source: `file:${file.path}`,
    target: `file:${importedPath}`,
    type: 'imports',
    direction: 'forward',
    weight: 0.7
  });
}

const expectedImportCount = (batch.batchImportData[file.path] ?? []).length;
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) {
  throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  `${root}/.ua/intermediate/batch-18.json`,
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount, filesSkipped: extraction.filesSkipped ?? [] }));
