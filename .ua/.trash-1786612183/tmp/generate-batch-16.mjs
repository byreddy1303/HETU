import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-16.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 16);
if (!batch) throw new Error('Original batchIndex 16 was not found');

const skipped = new Set(extraction.filesSkipped ?? []);
for (const file of batch.files) {
  if (!skipped.has(file.path)) throw new Error(`Expected skipped XML file was not recorded: ${file.path}`);
}

const definitions = {
  'android/app/src/main/res/values/colors.xml': {
    summary: 'Defines the Android application color resources for the burgundy primary and accent, paper background, dark ink, and gold brand palette.',
    tags: ['configuration', 'android-resources', 'color-palette', 'branding'],
    languageNotes: 'Android XML resource names provide stable references consumed by themes and native surfaces.'
  },
  'android/app/src/main/res/values/ic_launcher_background.xml': {
    summary: 'Defines the paper-colored background resource used by the adaptive Android launcher icon.',
    tags: ['configuration', 'android-resources', 'launcher-icon']
  },
  'android/app/src/main/res/values/strings.xml': {
    summary: 'Centralizes Android application identity, custom URL scheme, notification channel labels, reply prompts, action feedback, and mute or reminder status text.',
    tags: ['configuration', 'android-resources', 'localization', 'notifications'],
    languageNotes: 'Includes Android positional string placeholders for buddy reply and sent-message templates.'
  },
  'android/app/src/main/res/values/styles.xml': {
    summary: 'Defines the base, no-action-bar, and splash themes for the native Android shell, including system bar appearance, brand background colors, and launch drawables.',
    tags: ['configuration', 'android-resources', 'theme', 'splash-screen'],
    languageNotes: 'AppCompat and Android SplashScreen theme inheritance separates normal activity styling from launch-time presentation.'
  }
};

const nodes = batch.files.map((file) => {
  const definition = definitions[file.path];
  if (!definition) throw new Error(`Missing semantic definition for ${file.path}`);
  return {
    id: `config:${file.path}`,
    type: 'config',
    name: path.basename(file.path),
    filePath: file.path,
    summary: definition.summary,
    tags: definition.tags,
    complexity: 'simple',
    ...(definition.languageNotes ? { languageNotes: definition.languageNotes } : {})
  };
});

const edges = [
  {
    source: 'config:android/app/src/main/res/values/styles.xml',
    target: 'config:android/app/src/main/res/values/colors.xml',
    type: 'depends_on',
    direction: 'forward',
    weight: 0.6
  }
];

for (const file of batch.files) {
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({
      source: `config:${file.path}`,
      target: `file:${importedPath}`,
      type: 'imports',
      direction: 'forward',
      weight: 0.7
    });
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
  path.join(uaDir, 'intermediate/batch-16.json'),
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount, filesSkipped: [...skipped] }));
