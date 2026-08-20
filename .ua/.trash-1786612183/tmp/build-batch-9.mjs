import fs from 'node:fs';
import path from 'node:path';

const uaDir = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu/.ua';
const input = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-analyzer-input-9.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-9.json'), 'utf8'));
const batches = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 9);

if (!batch || !extraction.scriptCompleted || extraction.filesSkipped.length !== 0) {
  throw new Error(`Batch or extraction incomplete: ${JSON.stringify(extraction.filesSkipped)}`);
}

const fileMeta = {
  'src/__tests__/contextual_gate_tips.test.ts': ['Validates route-to-coaching-tip selection for all supported study surfaces, trailing slashes, dynamic session routes, and unknown-screen fallback behavior.', ['test', 'contextual-tips', 'routing', 'validation']],
  'src/__tests__/isolation.test.ts': ['Exercises the full device-isolation contract by seeding persisted Zustand state, IndexedDB rows, metadata, and localStorage before verifying an account-safe wipe.', ['test', 'data-isolation', 'persistence', 'security']],
  'src/components/layout/MobileTabs.tsx': ['Implements mobile primary navigation with three tabs, a context-aware central session action, haptic feedback, and an animated grouped More sheet.', ['component', 'mobile-navigation', 'routing', 'session']],
  'src/components/layout/Nav.tsx': ['Builds the desktop side navigation, grouping study and analysis routes while resolving live-session resume state and authenticated profile controls.', ['component', 'desktop-navigation', 'routing', 'session']],
  'src/components/layout/Shell.tsx': ['Composes the authenticated responsive shell, starts synchronization, mounts desktop and mobile navigation, animates routed content, and adds contextual tips and daily quotes.', ['component', 'application-shell', 'responsive-layout', 'synchronization']],
  'src/components/layout/TopRightControls.tsx': ['Combines exam countdown, offline synchronization status, and theme switching into the desktop and mobile shell control cluster.', ['component', 'shell-controls', 'exam-countdown', 'sync-status']],
  'src/components/shared/ContextualGateTip.tsx': ['Renders a route-specific GATE coaching card with contextual copy, accessible labeling, and subject-ink-inspired tone styling.', ['component', 'contextual-tips', 'coaching', 'accessibility']],
  'src/components/shared/OfflineBadge.tsx': ['Shows a quiet sandbox, offline, or queued-sync status and remains hidden when the app is online and fully synchronized.', ['component', 'sync-status', 'offline', 'feedback']],
  'src/hooks/useSync.ts': ['Provides hooks that bootstrap user synchronization, track browser connectivity, and count rows still pending or errored across synchronized tables.', ['hook', 'synchronization', 'online-status', 'local-first']],
  'src/lib/contextual-gate-tips.ts': ['Defines the curated route-aware GATE preparation tip catalog and resolves dynamic or normalized paths to the appropriate coaching message.', ['utility', 'contextual-tips', 'routing', 'content']],
  'src/lib/isolation.ts': ['Performs a best-effort device wipe across persisted Zustand stores, application-owned localStorage keys, and the Dexie database to prevent cross-account residue.', ['service', 'data-isolation', 'security', 'persistence']],
  'src/stores/log.ts': ['Defines the persisted Zustand state machine for idle, single-question, and multi-question logging, including sticky drafts and batch session counters.', ['store', 'question-logging', 'zustand', 'persistence']],
  'src/stores/session.ts': ['Defines persisted ephemeral session-run state for solve and tag modes, planned count, active timer origin, and pending elapsed time.', ['store', 'study-session', 'zustand', 'persistence']]
};

const functionSummaries = {
  'src/__tests__/isolation.test.ts:seedAll': 'Seeds modified preferences, active session and log stores, Dexie rows and metadata, and owned and foreign localStorage keys for isolation tests.',
  'src/components/layout/MobileTabs.tsx:MobileTabs': 'Coordinates live-session detection, bottom-tab activity, haptic actions, and the accessible animated More navigation sheet.',
  'src/components/layout/MobileTabs.tsx:TabButton': 'Renders one mobile navigation tab with path matching, haptic selection, and a shared animated active indicator.',
  'src/components/layout/Nav.tsx:NavItem': 'Renders a desktop route link with icon, active color treatment, and hover motion.',
  'src/components/layout/Nav.tsx:Group': 'Renders an optional navigation section label and its ordered route items.',
  'src/components/layout/Nav.tsx:Nav': 'Builds grouped desktop navigation, selects resume or new-session routing from live Dexie state, and exposes profile and sign-out controls.',
  'src/components/layout/Shell.tsx:Shell': 'Bootstraps sync and arranges responsive headers, navigation, routed page animation, contextual coaching, and daily quote content.',
  'src/components/layout/TopRightControls.tsx:ExamCountdown': 'Computes days until the configured GATE date and links the optional countdown badge to the planner.',
  'src/components/layout/TopRightControls.tsx:TopRightControls': 'Groups offline status, exam countdown, and the theme toggle into a reusable shell control row.',
  'src/components/shared/ContextualGateTip.tsx:ContextualGateTip': 'Resolves the coaching tip for a pathname and renders its tone-aware accessible card.',
  'src/components/shared/OfflineBadge.tsx:OfflineBadge': 'Derives sandbox, connectivity, and pending-row state to show only the synchronization status that needs attention.',
  'src/hooks/useSync.ts:useSyncBootstrap': 'Starts the sync engine for a signed-in non-sandbox user and stops it when authentication context changes or unmounts.',
  'src/hooks/useSync.ts:useOnline': 'Tracks navigator connectivity through online and offline browser events.',
  'src/hooks/useSync.ts:usePendingCount': 'Live-counts pending and errored rows across all synchronized Dexie tables.',
  'src/lib/contextual-gate-tips.ts:contextualGateTipForPath': 'Normalizes a route and selects a tailored coaching tip for static or dynamic study screens, falling back to retrieval-first guidance.',
  'src/lib/isolation.ts:wipeLocalState': 'Independently resets in-memory stores, removes every owned air-prefixed storage key, and clears IndexedDB even when an earlier cleanup step fails.'
};

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
const nodeComplexity = (lines) => lines > 200 ? 'complex' : lines >= 50 ? 'moderate' : 'simple';
const nodes = [];

for (const batchFile of input.batchFiles) {
  const result = resultByPath.get(batchFile.path);
  const meta = fileMeta[batchFile.path];
  if (!result || !meta) throw new Error(`Missing file metadata for ${batchFile.path}`);
  nodes.push({
    id: `file:${batchFile.path}`,
    type: 'file',
    name: path.basename(batchFile.path),
    filePath: batchFile.path,
    summary: meta[0],
    tags: meta[1],
    complexity: nodeComplexity(result.nonEmptyLines)
  });
}

for (const [key, summary] of Object.entries(functionSummaries)) {
  const separator = key.lastIndexOf(':');
  const filePath = key.slice(0, separator);
  const name = key.slice(separator + 1);
  const fn = resultByPath.get(filePath)?.functions?.find((candidate) => candidate.name === name);
  if (!fn) throw new Error(`Missing extracted function ${key}`);
  nodes.push({
    id: `function:${filePath}:${name}`,
    type: 'function',
    name,
    filePath,
    lineRange: [fn.startLine, fn.endLine],
    summary,
    tags: [...fileMeta[filePath][1].slice(0, 3), 'function'],
    complexity: nodeComplexity(fn.endLine - fn.startLine + 1)
  });
}

const edges = [];
for (const batchFile of input.batchFiles) {
  for (const importedPath of input.batchImportData[batchFile.path]) {
    edges.push({ source: `file:${batchFile.path}`, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

for (const node of nodes.filter((candidate) => candidate.type === 'function')) {
  const fileId = `file:${node.filePath}`;
  edges.push({ source: fileId, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
  if ((resultByPath.get(node.filePath).exports ?? []).some((exported) => exported.name === node.name)) {
    edges.push({ source: fileId, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

const testedKeys = new Set();
for (const [filePath, neighbors] of Object.entries(batch.neighborMap)) {
  for (const neighbor of neighbors) {
    if (!neighbor.path.includes('/__tests__/')) continue;
    const key = `${filePath}->${neighbor.path}`;
    if (testedKeys.has(key)) continue;
    testedKeys.add(key);
    edges.push({ source: `file:${filePath}`, target: `file:${neighbor.path}`, type: 'tested_by', direction: 'forward', weight: 0.5 });
  }
}
for (const [filePath, imports] of Object.entries(input.batchImportData)) {
  if (!filePath.includes('/__tests__/')) continue;
  for (const importedPath of imports) {
    const key = `${filePath}->${importedPath}`;
    if (testedKeys.has(key)) continue;
    testedKeys.add(key);
    edges.push({ source: `file:${filePath}`, target: `file:${importedPath}`, type: 'tested_by', direction: 'forward', weight: 0.5 });
  }
}

const expectedFunctions = extraction.results.flatMap((result) => {
  const exported = new Set((result.exports ?? []).map((entry) => entry.name));
  return (result.functions ?? [])
    .filter((fn) => fn.endLine - fn.startLine + 1 >= 10 || exported.has(fn.name))
    .map((fn) => `function:${result.path}:${fn.name}`);
});
const actualFunctions = nodes.filter((node) => node.type === 'function').map((node) => node.id).sort();
if (JSON.stringify(actualFunctions) !== JSON.stringify(expectedFunctions.sort())) {
  const actual = new Set(actualFunctions);
  const expected = new Set(expectedFunctions);
  throw new Error(`Function coverage mismatch ${JSON.stringify({ missing: expectedFunctions.filter((id) => !actual.has(id)), extra: actualFunctions.filter((id) => !expected.has(id)) })}`);
}

const expectedClasses = extraction.results.flatMap((result) => {
  const exported = new Set((result.exports ?? []).map((entry) => entry.name));
  return (result.classes ?? []).filter((cls) => (cls.methods ?? []).length >= 2 || cls.endLine - cls.startLine + 1 >= 20 || exported.has(cls.name));
});
if (expectedClasses.length !== 0) throw new Error(`Unemitted significant classes: ${JSON.stringify(expectedClasses)}`);

const filePaths = nodes.filter((node) => node.type === 'file').map((node) => node.filePath).sort();
const expectedPaths = input.batchFiles.map((file) => file.path).sort();
if (JSON.stringify(filePaths) !== JSON.stringify(expectedPaths)) throw new Error('File-node coverage mismatch');
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate node IDs');
if (edges.some((edge) => edge.source === edge.target)) throw new Error('Self-referencing edge detected');

const importEdges = edges.filter((edge) => edge.type === 'imports');
const expectedImports = Object.values(input.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
if (importEdges.length !== expectedImports) throw new Error(`Import count mismatch: ${importEdges.length} != ${expectedImports}`);
for (const [filePath, imports] of Object.entries(input.batchImportData)) {
  const emitted = importEdges.filter((edge) => edge.source === `file:${filePath}`).map((edge) => edge.target.slice(5));
  if (JSON.stringify(emitted) !== JSON.stringify(imports)) throw new Error(`Import edge mismatch for ${filePath}`);
}

for (const node of nodes) {
  if (!node.id || !node.type || !node.name || !node.summary || !Array.isArray(node.tags) || node.tags.length < 3 || node.tags.length > 5) throw new Error(`Invalid node ${node.id}`);
  if (!['simple', 'moderate', 'complex'].includes(node.complexity)) throw new Error(`Invalid complexity ${node.id}`);
}

const parts = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (parts !== 1) throw new Error(`Unexpected split requirement: ${parts}`);
const fragment = { nodes, edges };
fs.writeFileSync(path.join(uaDir, 'intermediate/batch-9.json'), `${JSON.stringify(fragment, null, 2)}\n`);

console.log(JSON.stringify({ parts, nodes: nodes.length, edges: edges.length, imports: importEdges.length, testedBy: testedKeys.size }));
