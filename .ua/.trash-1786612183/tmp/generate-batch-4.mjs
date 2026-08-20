import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-4.json'), 'utf8'));
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 4);
if (!batch) throw new Error('Original batchIndex 4 was not found');

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
  'src/__tests__/answer-reveal.test.tsx': 'Verifies that saved answers stay out of the rendered page until explicitly revealed and that an absent answer exposes the add action.',
  'src/__tests__/mocks-ui.test.tsx': 'Exercises the mock-test form end to end, including total validation, Dexie persistence, recorded mistakes, confirmed deletion, and empty state.',
  'src/__tests__/question-answer.test.ts': 'Checks that the shared question-draft pipeline starts with a blank answer and trims, persists, and reloads entered solution text.',
  'src/__tests__/quick-capture.test.tsx': 'Exercises quick image capture, outcome and mistake entry, question persistence, and creation of the linked D3 re-attempt.',
  'src/__tests__/reattempt.test.ts': 'Covers the spaced re-attempt ladder, answer evaluation, queue partitioning, duplicate prevention, and Dexie-backed result persistence.',
  'src/__tests__/sync.test.ts': 'Validates offline-first synchronization, ordered pushes, queued deletes, local-pending conflict resolution, parallel pulls, and overlapping refresh deduplication.',
  'src/components/layout/PageHeader.tsx': 'Renders the standard page heading, optional description and actions, and a mobile brand mark with shared responsive spacing.',
  'src/components/shared/AnswerReveal.tsx': 'Keeps a saved solution concealed for active recall, toggles an accessible reveal panel, and offers an add action when no answer exists.',
  'src/components/shared/ImagePreview.tsx': 'Provides a full-screen animated question-image viewer with keyboard, wheel, double-click, drag-to-pan, and two-finger pinch zoom controls.',
  'src/components/shared/QuestionEditor.tsx': 'Edits the complete question draft, including source metadata, prompt and answer, compressed image, result analysis, decision data, date, and timing.',
  'src/components/shared/SessionEditor.tsx': 'Edits or deletes an existing study session, synchronizes changes locally, and safely orphans its questions instead of deleting them.',
  'src/components/shared/Timer.tsx': 'Displays elapsed time against a target with visual urgency states and compact clock formatting.',
  'src/components/shared/questionDraft.ts': 'Defines the editable question shape and converts between persisted question rows, normalized editor drafts, and new-question defaults.',
  'src/components/tags/SourceStep.tsx': 'Implements the source-capture step for tagging a question, with subject and exam metadata, prompt and answer text, image compression, marks, format, and keyboard shortcuts.',
  'src/components/ui/Badge.tsx': 'Provides a reusable badge primitive with semantic color tones and composable styling.',
  'src/components/ui/Card.tsx': 'Provides card container, header, and body primitives used to structure elevated content panels.',
  'src/components/ui/Dialog.tsx': 'Renders an accessible animated modal dialog with backdrop dismissal, Escape handling, body-scroll locking, and focus restoration.',
  'src/components/ui/Empty.tsx': 'Renders a consistent empty-state panel with optional hint, action, and custom styling.',
  'src/components/ui/Input.tsx': 'Provides a styled, ref-forwarding input primitive with optional monospaced numeric presentation.',
  'src/components/ui/Kbd.tsx': 'Renders keyboard shortcuts with a compact keycap visual treatment.',
  'src/components/ui/Progress.tsx': 'Renders an accessible bounded progress bar with accent and semantic tone variants.',
  'src/components/ui/Select.tsx': 'Provides a styled, ref-forwarding native select primitive for forms.',
  'src/components/ui/Tabs.tsx': 'Renders a compact tab selector with native haptic feedback, keyboard-friendly buttons, and active-state styling.',
  'src/components/ui/Textarea.tsx': 'Provides a styled, ref-forwarding multiline text input primitive.',
  'src/hooks/useAuth.ts': 'Selects the authenticated user identity, status, and sandbox mode from the central auth store.',
  'src/hooks/useVisibilityChange.ts': 'Invokes a current callback when the document becomes hidden, with optional runtime enablement.'
};

const functionSummaries = {
  ladderRow: 'Builds a deterministic re-attempt row fixture at a requested ladder stage and date.',
  sessionRow: 'Builds a minimal session fixture for synchronization tests.',
  PageHeader: 'Composes the shared responsive page title, supporting copy, actions, and optional mobile brand mark.',
  AnswerReveal: 'Manages concealed-answer state and renders accessible add, reveal, and hide interactions.',
  ImagePreview: 'Coordinates modal lifecycle, zoom state, pan state, pointer gestures, keyboard controls, and animated image rendering.',
  Chip: 'Renders a generic toggle chip used for question metadata choices.',
  QuestionEditor: 'Coordinates the complete controlled question-editing form and compressed image attachment workflow.',
  Field: 'Wraps a form label and its children in the editor’s consistent vertical field layout.',
  DeleteBar: 'Renders the reusable destructive-action footer for deleting a question.',
  SessionEditor: 'Manages session form state, synchronized saves, confirmed deletion, and preservation of orphaned question rows.',
  Timer: 'Formats elapsed seconds and derives target-relative visual states for the study timer.',
  detectSource: 'Parses a persisted source reference into source kind, set, question number, and question format.',
  draftFromRow: 'Converts a persisted question row into the normalized editor draft shape.',
  emptyDraft: 'Creates a new question draft with current GATE defaults and empty optional evidence fields.',
  applyDraftToRow: 'Normalizes an edited draft back into a persisted question row while preserving identity and timestamp details.',
  MarksChip: 'Renders a selectable one-mark or two-mark source metadata chip.',
  FormatChip: 'Renders a selectable question-format chip with explanatory hover text.',
  SetChip: 'Renders a selectable GATE set-number chip.',
  SourceStep: 'Manages source-capture state, keeps year, set, and subtopic values valid, compresses images, and submits normalized data.',
  ImageUpload: 'Renders the image capture, preview, replace, remove, loading, and error controls for source evidence.',
  Badge: 'Renders a compact semantic label using the selected tone styles.',
  Card: 'Renders the base elevated card container.',
  CardHeader: 'Renders a card title with optional aside content and responsive alignment.',
  CardBody: 'Renders the padded body region of a card.',
  Dialog: 'Manages modal focus, Escape and backdrop dismissal, scroll locking, and animated dialog presentation.',
  Empty: 'Renders a reusable empty state with optional guidance and action content.',
  Kbd: 'Renders inline content as a styled keyboard keycap.',
  Progress: 'Clamps a progress value and renders an accessible tone-aware completion bar.',
  Tabs: 'Renders tab buttons, announces selection visually, and triggers light haptics before changing tabs.',
  useAuth: 'Returns the stable authentication slice consumed by components and pages.',
  useVisibilityChange: 'Registers a visibilitychange listener that calls the latest callback when the document becomes hidden.'
};

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

function testDomain(filePath) {
  if (filePath.includes('reattempt')) return 'spaced-repetition';
  if (filePath.includes('sync')) return 'offline-sync';
  if (filePath.includes('answer')) return 'answer-persistence';
  if (filePath.includes('capture')) return 'quick-capture';
  if (filePath.includes('mocks')) return 'mock-tests';
  return 'ui-behavior';
}

function fileTags(filePath) {
  if (filePath.includes('/__tests__/')) return ['test', 'vitest', testDomain(filePath)];
  if (filePath.includes('/components/ui/')) return ['component', 'ui-primitive', 'design-system'];
  if (filePath.includes('/components/layout/')) return ['component', 'layout', 'page-header'];
  if (filePath.includes('/components/tags/')) return ['component', 'question-tagging', 'data-entry'];
  if (filePath.endsWith('questionDraft.ts')) return ['data-model', 'serialization', 'question-editing'];
  if (filePath.includes('/hooks/')) return ['hook', 'react', filePath.includes('Auth') ? 'authentication' : 'browser-events'];
  if (filePath.includes('/components/shared/')) return ['component', 'shared-ui', path.basename(filePath).replace(/\.(tsx|ts)$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()];
  return ['component', 'react', 'typescript'];
}

function functionTags(filePath) {
  if (filePath.includes('/__tests__/')) return ['test-fixture', 'test', testDomain(filePath)];
  if (filePath.includes('/components/ui/')) return ['component', 'ui-primitive', 'design-system'];
  if (filePath.includes('/components/layout/')) return ['component', 'layout', 'page-header'];
  if (filePath.endsWith('questionDraft.ts')) return ['utility', 'serialization', 'question-editing'];
  if (filePath.includes('/components/tags/')) return ['component', 'question-tagging', 'data-entry'];
  if (filePath.includes('/hooks/')) return ['hook', 'react', filePath.includes('Auth') ? 'authentication' : 'browser-events'];
  return ['component', 'shared-ui', 'question-workflow'];
}

const nodes = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  const summary = fileSummaries[file.path];
  if (!summary) throw new Error(`Missing file summary for ${file.path}`);
  nodes.push({
    id: `file:${file.path}`,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary,
    tags: fileTags(file.path),
    complexity: complexity(result.nonEmptyLines),
    languageNotes: file.path.endsWith('.tsx') ? 'React component written in TypeScript with JSX.' : 'TypeScript module.'
  });

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
      tags: functionTags(file.path),
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
    if (exportedNames.has(node.name)) {
      edges.push({ source, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }
}

// Tests expose the relationship from their local node. Assembly canonicalizes
// tested_by to production -> test, including production nodes in other batches.
for (const testFile of batch.files.filter((file) => file.path.includes('/__tests__/'))) {
  for (const productionPath of batch.batchImportData[testFile.path] ?? []) {
    edges.push({
      source: `file:${testFile.path}`,
      target: `file:${productionPath}`,
      type: 'tested_by',
      direction: 'forward',
      weight: 0.5
    });
  }
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
for (const edge of edges) if (edge.source === edge.target) throw new Error(`Self edge generated for ${edge.source}`);

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedPaths = batch.files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
const chunkSize = Math.ceil(sortedPaths.length / partCount);
for (let index = 0; index < partCount; index += 1) {
  const partPaths = new Set(sortedPaths.slice(index * chunkSize, (index + 1) * chunkSize));
  const partNodes = nodes.filter((node) => partPaths.has(node.filePath));
  const partNodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partNodeIds.has(edge.source));
  writeFileSync(
    path.join(uaDir, `intermediate/batch-4-part-${index + 1}.json`),
    `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`,
    'utf8'
  );
}

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount }));
