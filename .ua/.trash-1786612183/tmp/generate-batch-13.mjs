import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-13.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 13);
if (!batch) throw new Error('Original batchIndex 13 was not found');

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
const skipped = new Set(extraction.filesSkipped ?? []);
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result && !skipped.has(file.path)) throw new Error(`Missing extraction outcome for ${file.path}`);
  if (result && (result.path !== file.path || result.language !== file.language || result.fileCategory !== file.fileCategory || result.totalLines !== file.sizeLines)) {
    throw new Error(`Extraction metadata mismatch for ${file.path}`);
  }
}

const definitions = {
  'AGENTS.md': {
    summary: 'Records two repository working agreements covering task-scoped commits, pushes to origin, and protection of unrelated changes.',
    tags: ['documentation', 'repository-policy', 'version-control'],
    complexity: 'simple'
  },
  'ANDROID.md': {
    summary: 'Explains how HETU is packaged and released as a local-bundle Capacitor Android app, including Firebase push setup, signing, device verification, app links, and performance budgets.',
    tags: ['documentation', 'android', 'capacitor', 'release-process'],
    complexity: 'moderate',
    languageNotes: 'Markdown combines shell commands, numbered release checks, and security constraints for the native distribution workflow.'
  },
  'DEPLOY.md': {
    summary: 'Provides an end-to-end production deployment runbook for Supabase, edge functions, secrets, authentication, Vercel, cron schedules, smoke testing, operations, and rollback.',
    tags: ['documentation', 'deployment', 'supabase', 'vercel', 'operations'],
    complexity: 'moderate',
    languageNotes: 'Markdown runbook is organized as an idempotent, ordered production rollout with explicit CLI commands and verification steps.'
  },
  'README.md': {
    summary: 'Introduces HETU as a local-first GATE PYQ analysis and buddy-study application, then covers setup, account access, data isolation, product philosophy, stack, testing, deployment, and Android distribution.',
    tags: ['documentation', 'entry-point', 'project-overview', 'getting-started'],
    complexity: 'moderate'
  },
  'index.html': {
    summary: 'Defines the Vite application shell, preloads branding, restores the preferred color theme before React hydration, and mounts the client entry point at the root element.',
    tags: ['entry-point', 'html-shell', 'theme-bootstrap', 'vite'],
    complexity: 'simple',
    languageNotes: 'An inline defensive IIFE applies theme data and browser theme color before the ES module entry loads, avoiding a light/dark flash.'
  },
  'package.json': {
    summary: 'Defines the Node 22 ESM package, Vite and TypeScript build commands, test and deployment scripts, Capacitor Android workflows, and the application dependency set.',
    tags: ['configuration', 'build-system', 'dependencies', 'npm-scripts'],
    complexity: 'moderate'
  },
  'tsconfig.json': {
    summary: 'Configures strict no-emit TypeScript compilation for browser source code with ES2022 libraries, React JSX, bundler resolution, and the @ path alias.',
    tags: ['configuration', 'typescript', 'strict-mode', 'build-system'],
    complexity: 'simple',
    languageNotes: 'Uses project references for Node-side tooling while the main source tree compiles as isolated ESNext modules.'
  },
  'tsconfig.node.json': {
    summary: 'Defines the composite TypeScript project for Vite and Capacitor configuration files, emitting build metadata into a local cache directory.',
    tags: ['configuration', 'typescript', 'build-tooling'],
    complexity: 'simple'
  },
  'vercel.json': {
    summary: 'Configures Vercel SPA fallback routing while preserving static asset and service-worker paths, and assigns tailored cache policies to application assets, PYQ data, notes, and push-worker code.',
    tags: ['configuration', 'vercel', 'routing', 'caching'],
    complexity: 'simple',
    languageNotes: 'The fallback rewrite uses a negative-lookahead exclusion list, with immutable, revalidation, stale-while-revalidate, and no-store cache policies by asset class.'
  }
};

function nodeId(file) {
  if (file.fileCategory === 'docs') return `document:${file.path}`;
  if (file.fileCategory === 'config') return `config:${file.path}`;
  return `file:${file.path}`;
}

function nodeType(file) {
  if (file.fileCategory === 'docs') return 'document';
  if (file.fileCategory === 'config') return 'config';
  return 'file';
}

const nodes = batch.files.map((file) => {
  const definition = definitions[file.path];
  if (!definition) throw new Error(`Missing semantic definition for ${file.path}`);
  return {
    id: nodeId(file),
    type: nodeType(file),
    name: path.basename(file.path),
    filePath: file.path,
    ...definition
  };
});

const edges = [
  { source: 'document:ANDROID.md', target: 'config:package.json', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'document:DEPLOY.md', target: 'config:package.json', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'document:DEPLOY.md', target: 'config:vercel.json', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'document:README.md', target: 'document:ANDROID.md', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'document:README.md', target: 'document:DEPLOY.md', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'document:README.md', target: 'config:package.json', type: 'documents', direction: 'forward', weight: 0.5 },
  { source: 'config:package.json', target: 'file:index.html', type: 'configures', direction: 'forward', weight: 0.6 },
  { source: 'config:package.json', target: 'config:tsconfig.json', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'config:tsconfig.json', target: 'config:tsconfig.node.json', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'config:vercel.json', target: 'file:index.html', type: 'routes', direction: 'forward', weight: 0.6 }
];

for (const file of batch.files) {
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source: nodeId(file), target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

const nodeIds = new Set(nodes.map((node) => node.id));
if (nodeIds.size !== nodes.length) throw new Error('Duplicate node IDs generated');
const edgeKeys = new Set();
for (const edge of edges) {
  const key = `${edge.source}|${edge.target}|${edge.type}`;
  if (edgeKeys.has(key)) throw new Error(`Duplicate edge generated: ${key}`);
  edgeKeys.add(key);
  if (edge.source === edge.target) throw new Error(`Self edge generated: ${key}`);
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Unresolved local edge: ${key}`);
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) {
  throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  path.join(uaDir, 'intermediate/batch-13.json'),
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount, filesSkipped: [...skipped] }));
