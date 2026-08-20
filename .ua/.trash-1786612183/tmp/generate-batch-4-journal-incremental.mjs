import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const batches = JSON.parse(readFileSync(`${root}/.ua/intermediate/batches.json`, 'utf8'));
const extraction = JSON.parse(readFileSync(`${root}/.ua/tmp/ua-file-extract-results-4.json`, 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 4);
if (!batch) throw new Error('Incremental original batchIndex 4 was not found');
if (batch.files.length !== 1 || extraction.results.length !== 1) throw new Error('Expected one batch and extraction file');

const file = batch.files[0];
const result = extraction.results[0];
if (
  result.path !== file.path ||
  result.language !== file.language ||
  result.fileCategory !== file.fileCategory ||
  result.totalLines !== file.sizeLines
) throw new Error(`Extraction metadata mismatch for ${file.path}`);

const fileNodeId = `file:${file.path}`;
const nodes = [
  {
    id: fileNodeId,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary: 'Verifies that the Journal initially includes a standalone imported question, renders its pattern and attached image action, and reports the correct entry count under a mocked signed-in sandbox user.',
    tags: ['test', 'vitest', 'journal', 'indexeddb'],
    complexity: 'moderate',
    languageNotes: 'React Testing Library renders the page inside MemoryRouter while Vitest mocks authentication and Dexie is cleared and seeded before the assertion.'
  }
];

const edges = (batch.batchImportData[file.path] ?? []).map((importedPath) => ({
  source: fileNodeId,
  target: `file:${importedPath}`,
  type: 'imports',
  direction: 'forward',
  weight: 0.7
}));

edges.push(
  {
    source: fileNodeId,
    target: 'file:src/lib/db.ts',
    type: 'tested_by',
    direction: 'forward',
    weight: 0.5
  },
  {
    source: fileNodeId,
    target: 'file:src/pages/Journal.tsx',
    type: 'tested_by',
    direction: 'forward',
    weight: 0.5
  }
);

const expectedImports = batch.batchImportData[file.path] ?? [];
const actualImports = edges.filter((edge) => edge.type === 'imports');
if (actualImports.length !== 3 || actualImports.length !== expectedImports.length) {
  throw new Error(`Expected exactly 3 imports, generated ${actualImports.length}`);
}
for (const importedPath of expectedImports) {
  const matches = actualImports.filter(
    (edge) => edge.source === fileNodeId && edge.target === `file:${importedPath}`
  );
  if (matches.length !== 1) throw new Error(`Import relation mismatch for ${importedPath}`);
}

const edgeKeys = new Set();
for (const edge of edges) {
  const key = `${edge.source}|${edge.target}|${edge.type}`;
  if (edgeKeys.has(key)) throw new Error(`Duplicate edge: ${key}`);
  edgeKeys.add(key);
  if (edge.source === edge.target) throw new Error(`Self edge: ${key}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  `${root}/.ua/intermediate/batch-4.json`,
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImports.length, filesSkipped: extraction.filesSkipped ?? [] }));
