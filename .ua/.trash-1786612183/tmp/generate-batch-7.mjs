import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-7.json'), 'utf8'));
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 7);
if (!batch) throw new Error('Original batchIndex 7 was not found');

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
  'src/components/tags/RootCauseStep.tsx': 'Renders the root-cause choices in the tagging flow and supports number-key selection and Escape navigation.',
  'src/components/tags/TagFlow.tsx': 'Coordinates the keyboard-first source, outcome, pattern, trigger, and root-cause workflow, including animated navigation, native back handling, and local-first save state.',
  'src/components/tags/TagOption.tsx': 'Provides a reusable keyboard-labeled tagging choice with semantic tones, selected styling, and haptic feedback.',
  'src/components/tags/TriggerStep.tsx': 'Captures the exact question phrase that should cue a method, with focused keyboard submission, skip behavior, and explanatory guidance.',
  'src/components/tags/sourceDraft.ts': 'Defines the source-capture draft and creates a new GATE PYQ-oriented default with current year and set metadata.',
  'src/hooks/useKeyboard.ts': 'Registers guarded global keyboard shortcuts while ignoring modified keystrokes and events originating from editable controls.',
  'src/hooks/useTimer.ts': 'Returns drift-resistant elapsed seconds derived from an epoch start time and refreshed twice per second.',
  'src/lib/analysis.ts': 'Provides deterministic dashboard and weekly-review analytics for mistake surface, outcomes, calibration, heatmaps, weekly summaries, and active study days.',
  'src/lib/constants.ts': 'Defines the shared GATE subjects, outcomes, root causes, source types, exam ranges, question formats, timing targets, and application defaults.',
  'src/lib/image.ts': 'Converts, captures, resizes, and compresses study images into bounded JPEG data URLs for the offline-first question store.',
  'src/lib/learning-tips.ts': 'Applies deterministic coaching rules to recent learner evidence and returns one focused dashboard learning tip.',
  'src/lib/mocks.ts': 'Validates mock-test input and calculates score, accuracy, best/worst/latest performance, and score movement summaries.',
  'src/lib/pyq-history.ts': 'Groups PYQ attempts and filters question-bank items by unseen, repeated, incorrect, guessed, slow, skipped, or unanalyzed history.',
  'src/lib/pyq-session.ts': 'Defines the durable PYQ session and attempt state machine, deterministic audit identifiers, immutable snapshots, journal linkage, and canonical practice sessions.',
  'src/lib/pyq.ts': 'Loads and normalizes the bundled PYQ bank, repairs question math markup, evaluates answers, formats evidence, and derives journal text, images, sources, and outcomes.',
  'src/lib/questionTags.ts': 'Defines the missing-tag confirmation policy; the current policy allows saving without pattern or trigger confirmation.',
  'src/lib/revision-pack.ts': 'Builds a prioritized revision pack from weekly fixes, formulas, trigger phrases, repeated mistakes, and due questions and renders it as plain text.',
  'src/lib/sessions.ts': 'Reconciles audited PYQ practice into canonical sessions and returns only meaningful finished session history while pruning empty records.',
  'src/lib/topic-evidence.ts': 'Combines PYQ attempts, journal questions, re-attempts, and study timestamps into an evidence-based topic status and accuracy summary.',
  'src/pages/Dashboard.tsx': 'Builds the learner dashboard from live local data, showing daily targets, readiness cues, mistake-surface movement, outcomes, coaching, and current priorities.',
  'src/pages/Pyq.tsx': 'Implements the full PYQ practice experience: set configuration, history filtering, timed navigation, answer decisions, audit receipts, tagging, journaling, and re-attempt scheduling.',
  'src/pages/Reattempts.tsx': 'Implements the due re-attempt queue and dedicated logged-question and PYQ test sessions, including timers, answer history, immutable receipts, navigation recovery, and ladder grading.',
  'src/types/index.ts': 'Compatibility barrel that re-exports the project’s shared database row and domain type definitions.'
};

const functionSummaries = {
  RootCauseStep: 'Renders root-cause options and maps configured number keys and Escape to selection and back actions.',
  TagFlow: 'Owns the multi-step tagging state machine, navigation, conditional root-cause step, animation direction, native back behavior, and final persistence.',
  TagOption: 'Renders one tone-aware tagging choice and emits haptic feedback before selection.',
  TriggerStep: 'Manages trigger-sentence input, focus, keyboard submission, back navigation, and explicit skip behavior.',
  makeInitialSource: 'Creates a source draft initialized to the latest available GATE year and applicable set.',
  useKeyboard: 'Registers current key handlers globally while excluding modified keys and editable targets.',
  useTimer: 'Calculates elapsed whole seconds from the system clock and refreshes the value on an interval.',
  weeklyDraftFingerprint: 'Builds a trimmed fingerprint of the three required weekly-review narratives to detect unsaved edits.',
  mistakeSurfaceOpen: 'Counts re-attempt records that have not reached the mastered stage.',
  mistakeSurfaceTrend: 'Compares the current open mistake surface with its reconstructed state one week earlier.',
  mistakeSurfaceMovement: 'Counts mistake cards opened and mastered over the trailing seven local calendar days.',
  mistakeSurfaceSeries: 'Reconstructs daily open, opened, and mastered mistake-surface points over a local-calendar window.',
  outcomeDistribution: 'Counts questions into every configured outcome bucket, including zero-count outcomes.',
  latestSession: 'Returns the newest finished session by creation timestamp.',
  dueTodayCount: 'Counts non-mastered re-attempts scheduled on or before the requested day.',
  summarizeWeek: 'Aggregates one local-calendar week by outcome, root cause, subject, and repeated pattern.',
  calibrationBySubject: 'Calculates per-subject decision accuracy and negative-marking expected value and recommends raising, lowering, or holding the answer threshold.',
  calibrationOverall: 'Combines subject calibration rows into all-subject decision counts, accuracy, and expected value.',
  isMistake: 'Classifies every non-clean outcome as part of the mistake surface.',
  heatmapCells: 'Buckets dated mistakes by subject, optional subtopic, and root cause for the weakness heatmap.',
  heatmapRowTotals: 'Totals heatmap cells by subject and subtopic row.',
  activeDaysBack: 'Counts consecutive local calendar days ending today that contain at least one tagged question.',
  examYears: 'Generates a descending valid year range for an exam source based on the current exam cycle.',
  pyqYears: 'Generates the backward-compatible descending GATE PYQ year range.',
  buildSourceRef: 'Serializes source kind, year, GATE set, question number, and format into the canonical source reference.',
  urlToDataUrl: 'Fetches an allowed image URL and converts its bytes to a data URL.',
  downscaleDataUrl: 'Draws an image to a bounded canvas and returns compressed JPEG data.',
  waitForElementMedia: 'Waits for fonts and descendant images before rasterizing a rendered element.',
  captureElementToDataUrl: 'Rasterizes a DOM element with theme-aware cloning, downsizes it, and enforces the image-size cap.',
  compressToDataUrl: 'Reads an uploaded image, resizes it to the long-edge limit, compresses it, and returns dimensions and byte size.',
  buildLearningTips: 'Selects one actionable coaching tip from recent mistakes, pace, activity, and retrieval context.',
  validateMockDraft: 'Validates mock identity, date, question totals, duration, and score bounds and returns the first user-facing error.',
  mockScorePercent: 'Converts earned and maximum marks to a one-decimal percentage.',
  mockAccuracy: 'Calculates attempted-question accuracy or returns null when nothing was attempted.',
  mockSummary: 'Identifies best, worst, and latest mock tests and computes the latest score change.',
  attemptsByQuestion: 'Groups PYQ attempts by question and sorts each history chronologically.',
  analyzedAttemptIds: 'Builds the set of persisted journal question IDs used to recognize analyzed attempts.',
  matchesPyqHistory: 'Tests a PYQ against a selected history filter using latest attempts and journal analysis state.',
  filterPyqByHistory: 'Groups attempts and filters a question list by the selected practice-history criterion.',
  createPyqSessionRow: 'Creates a new active PYQ set with selected question IDs, progress counters, timestamps, and bank version.',
  pyqAttemptId: 'Derives the deterministic identifier for a question attempt within a PYQ session.',
  pyqJournalQuestionId: 'Derives the deterministic journal question identifier for a PYQ attempt receipt.',
  pyqSourceAttemptForJournalQuestion: 'Resolves the immutable PYQ attempt behind a journal row, including a constrained legacy fallback.',
  pyqQuestionFromAttempt: 'Reconstructs the original bundled PYQ and answer metadata from a version-2 immutable attempt snapshot.',
  pyqReattemptAttemptId: 'Derives one stable PYQ re-attempt receipt identifier for a ladder round.',
  createPyqReattemptAttemptRow: 'Builds an immutable PYQ re-attempt receipt without attaching it to the already-closed original practice set.',
  pyqPracticeSubject: 'Derives a human-readable single-subject, mixed-subject, or generic label for PYQ practice rows.',
  pyqPracticeSessionRow: 'Projects an audited PYQ set into the canonical session model while preserving existing journal metadata.',
  startPyqSessionQuestion: 'Validates and records the active question and start timestamp for an open PYQ set.',
  advancePyqSessionProgress: 'Marks a question completed, advances monotonic progress, and accumulates elapsed time exactly once.',
  completePyqSession: 'Closes a PYQ set as completed and finalizes progress and timestamps.',
  abandonPyqSession: 'Closes a PYQ set as abandoned while clearing active-question timing state.',
  pausePyqSession: 'Pauses an active PYQ set and clears the current question timing state.',
  pyqQuestionSnapshot: 'Copies the immutable question-bank fields needed to audit and later restore an attempt.',
  createPyqAttemptRow: 'Validates session state, response type, decision, timing, and bank version and creates the canonical version-2 attempt receipt.',
  replaceBalancedPyqMathCommand: 'Finds balanced braced TeX commands and replaces their bodies without corrupting nested markup.',
  joinPyqMathLines: 'Normalizes line breaks and legacy TeX constructs inside extracted PYQ math.',
  pyqMathEndIndex: 'Finds the unescaped closing delimiter for a PYQ math segment while respecting brace nesting.',
  normalizePyqQuestionHtml: 'Protects and normalizes math segments while sanitizing legacy question HTML for reliable rendering.',
  loadPyqManifest: 'Loads and memoizes the versioned PYQ bank manifest.',
  normalizePyqManifest: 'Validates manifest schema expectations and supplies normalized topic arrays.',
  loadPyqQuestions: 'Loads, caches, and combines version-matched subject question payloads.',
  loadPyqQuestionByUid: 'Locates one question by stable UID, using an optional subject hint before broader lookup.',
  matchesPyqTopicScope: 'Tests whether a question falls within the configured subject and topic practice scope.',
  evaluatePyqAnswer: 'Evaluates MCQ, MSQ, or NAT responses while respecting skips, unavailable keys, and numeric tolerance.',
  formatPyqAnswer: 'Formats the authoritative answer according to the question type and answer status.',
  pyqAnswerValueForLog: 'Normalizes the authoritative answer into the value persisted with an attempt receipt.',
  wrapSnapshotText: 'Wraps plain question text into bounded lines for a generated snapshot image.',
  pyqQuestionSnapshotDataUrl: 'Builds an SVG data URL snapshot containing question identity and readable prompt text.',
  pyqSourceRef: 'Builds the canonical source reference for a bundled GATE PYQ.',
  pyqPlainText: 'Converts question HTML and math markup into readable plain text for journals and snapshots.',
  firstPyqImage: 'Extracts the first image URL from question HTML when present.',
  resolvePyqJournalImageUrl: 'Converts a discovered PYQ image to storable data or falls back to a generated question snapshot.',
  inferPyqDirectOutcome: 'Infers a direct tag outcome from answer correctness, decision confidence, and target-relative solve time.',
  needsMissingTagsConfirmation: 'Returns the current policy decision for saving questions without pattern or trigger tags.',
  buildRevisionPack: 'Prioritizes the latest weekly fix, due formulas, slow triggers, repeated mistake patterns, and due or recent mistake questions.',
  revisionPackText: 'Renders a revision pack as a structured plain-text checklist.',
  practiceQuestionCount: 'Counts canonical session questions while incorporating distinct audited PYQ attempts.',
  reconcilePyqPracticeSessions: 'Creates or updates canonical session rows for durable PYQ sets using their audited attempts and local metadata.',
  finishedSessionsWithQuestions: 'Returns newest-first finished sessions that contain meaningful questions or attempted PYQ sets.',
  pruneEmptyFinishedSessions: 'Deletes finished non-PYQ sessions that contain no tagged questions.',
  recentSessions: 'Returns a capped newest-first list of meaningful finished sessions.',
  allSessions: 'Returns every meaningful finished session in newest-first order.',
  buildTopicEvidence: 'Combines direct questions, immutable PYQ attempts, open mistakes, recency, and study state into topic evidence and status.',
  TargetMeter: 'Renders target progress, bounded completion width, and a calm remaining-work message.',
  OutcomeKey: 'Renders compact counts for every configured question outcome.',
  Dashboard: 'Queries the local learner store and composes targets, mistake surface, recent activity, outcomes, learning tips, and priority navigation.',
  sourceDraft: 'Projects a bundled PYQ and captured evidence into the tagging flow’s authoritative source draft.',
  PracticeSetup: 'Renders and manages PYQ scope, order, count, history filters, and resume, save, discard, or start actions.',
  AnswerPad: 'Renders response controls appropriate to MCQ, MSQ, or NAT questions.',
  DecisionButtons: 'Captures mark, skip, or fifty-fifty exam decisions for the current PYQ.',
  ResultPanel: 'Displays the committed answer, correctness, timing, and authoritative solution after a PYQ attempt.',
  Pyq: 'Coordinates question-bank loading, set lifecycle, timing, answer commits, audit persistence, tagging, journaling, planner state, and navigation.',
  navigationState: 'Validates and normalizes persisted router state used to resume a multi-question re-attempt round.',
  Ladder: 'Renders the D3, D10, and D30 progression with current and completed rung states.',
  RunningTimer: 'Shows the active re-attempt timer and reports final elapsed seconds when the learner finishes.',
  QueueCard: 'Summarizes one due re-attempt, its subject evidence, carry-forward state, ladder stage, and current attempt state.',
  ExamAnswerPad: 'Renders MCQ, MSQ, or NAT input controls for an exam-style re-attempt.',
  ExamDecisionButtons: 'Captures mark, skip, or fifty-fifty decisions during a re-attempt.',
  PyqAnswerHistory: 'Renders chronological immutable PYQ attempt evidence, including the current re-attempt receipt.',
  LoggedQuestionAnswerHistory: 'Renders saved and current answers, decisions, and timing for a locally logged question.',
  PyqReattemptSession: 'Runs one immutable PYQ re-attempt with timing, answer capture, audit receipt creation, navigation, and ladder result submission.',
  ReattemptSession: 'Runs a logged-question retrieval attempt with prompt editing, concealed answer, timing, evidence capture, navigation, and grading.',
  Reattempts: 'Loads the due queue, restores round navigation, resolves logged and PYQ evidence, and coordinates completed, skipped, and mastered re-attempts.'
};

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

function tagsFor(filePath, isFunction = false) {
  const first = isFunction ? 'utility' : 'service';
  if (filePath.includes('/components/tags/')) return ['component', 'question-tagging', 'workflow'];
  if (filePath.includes('/hooks/')) return ['hook', 'react', filePath.includes('Timer') ? 'timer' : 'keyboard-shortcuts'];
  if (filePath.endsWith('/analysis.ts')) return [first, 'analytics', 'learner-evidence'];
  if (filePath.endsWith('/constants.ts')) return [first, 'domain-model', 'configuration'];
  if (filePath.endsWith('/image.ts')) return [first, 'image-processing', 'offline-storage'];
  if (filePath.endsWith('/learning-tips.ts')) return [first, 'coaching', 'learner-evidence'];
  if (filePath.endsWith('/mocks.ts')) return [first, 'mock-tests', 'validation'];
  if (filePath.endsWith('/pyq-history.ts')) return [first, 'pyq', 'history-filtering'];
  if (filePath.endsWith('/pyq-session.ts')) return [first, 'pyq', 'session-state'];
  if (filePath.endsWith('/pyq.ts')) return [first, 'pyq', 'question-bank'];
  if (filePath.endsWith('/questionTags.ts')) return [first, 'question-tagging', 'validation'];
  if (filePath.endsWith('/revision-pack.ts')) return [first, 'revision', 'prioritization'];
  if (filePath.endsWith('/sessions.ts')) return [first, 'study-sessions', 'data-access'];
  if (filePath.endsWith('/topic-evidence.ts')) return [first, 'topic-mastery', 'learner-evidence'];
  if (filePath.endsWith('/Dashboard.tsx')) return ['component', 'dashboard', 'analytics'];
  if (filePath.endsWith('/Pyq.tsx')) return ['component', 'pyq', 'practice-session'];
  if (filePath.endsWith('/Reattempts.tsx')) return ['component', 'spaced-repetition', 'practice-session'];
  if (filePath.endsWith('/types/index.ts')) return ['type-definition', 'barrel', 'data-model'];
  return [first, 'typescript', 'domain-logic'];
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
    tags: tagsFor(file.path),
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
      tags: tagsFor(file.path, true),
      complexity: complexity(fn.endLine - fn.startLine + 1)
    });
  }

  for (const cls of result.classes ?? []) {
    const exported = exportedNames.has(cls.name);
    if (cls.endLine - cls.startLine + 1 < 20 && (cls.methods?.length ?? 0) < 2 && !exported) continue;
    if (cls.name !== 'ImageTooLargeError') throw new Error(`Missing class summary for ${file.path}:${cls.name}`);
    nodes.push({
      id: `class:${file.path}:${cls.name}`,
      type: 'class',
      name: cls.name,
      filePath: file.path,
      lineRange: [cls.startLine, cls.endLine],
      summary: 'Represents a compressed image that still exceeds the application’s offline storage safety limit.',
      tags: ['error-handling', 'image-processing', 'validation'],
      complexity: 'simple'
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
    path.join(uaDir, `intermediate/batch-7-part-${index + 1}.json`),
    `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`,
    'utf8'
  );
}

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount }));
