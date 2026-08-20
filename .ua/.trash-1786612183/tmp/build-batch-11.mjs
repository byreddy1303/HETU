import fs from 'node:fs';
import path from 'node:path';

const uaDir = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu/.ua';
const input = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-analyzer-input-11.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-11.json'), 'utf8'));

if (!extraction.scriptCompleted || extraction.filesSkipped.length !== 0) {
  throw new Error(`Structural extraction incomplete: ${JSON.stringify(extraction.filesSkipped)}`);
}

const fileMeta = {
  'scripts/audit-pyq-taxonomy.mjs': ['Audits the generated 3,200-question PYQ bank for version, ID, subject and topic counts, classifier consistency, and retention of every manual content correction.', ['script', 'pyq-bank', 'taxonomy', 'validation']],
  'scripts/build-go-classes-coa-log-migration.mjs': ['Transforms the first learner-provided GO Classes COA topic-test attempt set into an idempotent SQL migration for PYQ receipts, journal questions, and D3 reattempt rows.', ['script', 'migration', 'pyq-import', 'coa']],
  'scripts/build-go-classes-coa-test-2-log-migration.mjs': ['Transforms the second GO Classes COA topic-test attempt set into an idempotent SQL migration that preserves immutable answer receipts and journal evidence.', ['script', 'migration', 'pyq-import', 'coa']],
  'scripts/build-pyq-bank.mjs': ['Builds the immutable 1990–2026 PYQ bank from GateQA, ExamSIDE, audited replacements, and custom payloads, localizing images and emitting subject shards, manifest, audit, and provenance files.', ['script', 'pyq-bank', 'data-pipeline', 'asset-localization', 'validation']],
  'scripts/classify-pyq-bank.mjs': ['Reclassifies the complete generated PYQ corpus with the canonical taxonomy, rewrites subject payloads and manifest counts, and emits a manual-correction audit without changing the question ID set.', ['script', 'pyq-bank', 'taxonomy', 'data-pipeline']],
  'scripts/pyq-taxonomy.mjs': ['Defines the versioned 95-topic PYQ taxonomy, audited manual overrides, and tag-and-content classifiers that map each question into a canonical GATE subject and topic.', ['data-model', 'pyq-bank', 'taxonomy', 'classification', 'gate-cs']]
};

const functionSummaries = {
  'scripts/build-go-classes-coa-log-migration.mjs:uuidFromString': 'Derives stable UUIDs from import keys so repeated migration runs address the same attempt, journal, and reattempt rows.',
  'scripts/build-go-classes-coa-log-migration.mjs:plainText': 'Converts question HTML into readable line-oriented text while retaining ordered-list labels and structural breaks.',
  'scripts/build-go-classes-coa-test-2-log-migration.mjs:uuidFromString': 'Derives stable UUIDs for the second topic-test import from deterministic string seeds.',
  'scripts/build-go-classes-coa-test-2-log-migration.mjs:plainText': 'Converts richer question HTML, including lists and tables, into normalized journal text.',
  'scripts/build-pyq-bank.mjs:sanitizeSourceHtml': 'Removes executable, embedded, event-handler, unsafe URL, and source-specific attributes from imported question HTML.',
  'scripts/build-pyq-bank.mjs:absoluteImageUrl': 'Resolves an image source against the fixed archive origin and normalizes legacy GateQA path prefixes.',
  'scripts/build-pyq-bank.mjs:fetchWithRetry': 'Fetches an allowlisted source with a project user agent and incremental retry delays before surfacing the final error.',
  'scripts/build-pyq-bank.mjs:cachedJson': 'Reads a cached JSON payload or fetches and persists it for repeatable bank rebuilds.',
  'scripts/build-pyq-bank.mjs:cachedText': 'Reads a cached text payload or fetches and stores it locally on a cache miss.',
  'scripts/build-pyq-bank.mjs:extractJavascriptArray': 'Scans a JavaScript source fragment to extract a balanced array literal while respecting quotes and escapes.',
  'scripts/build-pyq-bank.mjs:examSideQuestionFromHtml': 'Parses ExamSIDE detail HTML and extracts the structured question matching the page permalink from its embedded payload.',
  'scripts/build-pyq-bank.mjs:loadExamSideSourceRows': 'Crawls and caches audited ECE and EE Digital Logic detail rows with bounded concurrent workers.',
  'scripts/build-pyq-bank.mjs:loadExamSideCseSourceRows': 'Loads and caches the selected ExamSIDE CSE replacement-year question rows in stable archive order.',
  'scripts/build-pyq-bank.mjs:numericExamSideKey': 'Normalizes ExamSIDE numeric answers and ranges into a value plus optional absolute tolerance.',
  'scripts/build-pyq-bank.mjs:examSideQuestionType': 'Maps ExamSIDE source metadata and answer structure into MCQ, MSQ, NAT, marks-to-all, or unsupported types.',
  'scripts/build-pyq-bank.mjs:examSideCseClassification': 'Maps replacement CSE questions to canonical subject and topic pairs using source chapters and question text cues.',
  'scripts/build-pyq-bank.mjs:examSideDigitalLogicQuestions': 'Builds and count-validates the scoped 259-question ECE and EE Digital Logic supplement.',
  'scripts/build-pyq-bank.mjs:examSideCseQuestions': 'Builds and validates the 192-question CSE gap-fill supplement with canonical classifications and answer metadata.',
  'scripts/build-pyq-bank.mjs:imageExtension': 'Chooses a safe local image extension from content type or the source URL.',
  'scripts/build-pyq-bank.mjs:downloadImages': 'Downloads or substitutes source images concurrently, hashes their filenames, and returns source-to-local mappings.',
  'scripts/build-pyq-bank.mjs:localizedHtml': 'Rewrites every non-bundled image in sanitized HTML to its local asset and enables lazy asynchronous decoding.',
  'scripts/build-pyq-bank.mjs:main': 'Orchestrates source loading, normalization, deduplication, classification, image localization, validation, and all final PYQ bank artifacts.',
  'scripts/pyq-taxonomy.mjs:result': 'Validates a subject and topic slug pair against the canonical taxonomy and returns labeled classification metadata.',
  'scripts/pyq-taxonomy.mjs:contextFor': 'Normalizes question tags and HTML text into reusable exact-tag, partial-tag, and text-pattern predicates.',
  'scripts/pyq-taxonomy.mjs:classifyDiscrete': 'Classifies discrete mathematics questions across logic, sets, relations, functions, lattices, groups, graphs, counting, and recurrence boundaries.',
  'scripts/pyq-taxonomy.mjs:classifyEngineering': 'Classifies engineering mathematics questions into linear algebra, calculus, or probability and statistics.',
  'scripts/pyq-taxonomy.mjs:classifyDigitalLogic': 'Classifies digital logic questions into number systems, Boolean algebra, combinational circuits, or sequential circuits.',
  'scripts/pyq-taxonomy.mjs:classifyDataStructure': 'Classifies data-structure questions across arrays, lists, stacks, queues, tree families, heaps, and hashing.',
  'scripts/pyq-taxonomy.mjs:classifyProgramming': 'Classifies C programming questions across arithmetic, control flow, loops, arrays and pointers, and functions.',
  'scripts/pyq-taxonomy.mjs:classifyAlgorithms': 'Classifies algorithm questions across analysis, recurrence, divide-and-conquer, sorting, greedy, graph algorithms, and dynamic programming.',
  'scripts/pyq-taxonomy.mjs:classifyToc': 'Classifies theory-of-computation questions across regular formalisms, context-free languages, automata, Turing machines, and undecidability.',
  'scripts/pyq-taxonomy.mjs:classifyCompiler': 'Classifies compiler questions across lexical analysis, parsing, translation, intermediate code, runtime, and matching topics.',
  'scripts/pyq-taxonomy.mjs:classifyOs': 'Classifies operating-systems questions across processes, scheduling, synchronization, deadlocks, memory, files, disks, calls, and threads.',
  'scripts/pyq-taxonomy.mjs:classifyDatabases': 'Classifies database questions across schema, algebra, normalization, transactions, constraints, SQL, calculus, and storage.',
  'scripts/pyq-taxonomy.mjs:classifyNetworks': 'Classifies networking questions across protocol layers, routing, transport, applications, and security.',
  'scripts/pyq-taxonomy.mjs:classifyCoa': 'Classifies computer-organization questions across instructions, addressing, datapath, I/O, interrupts, pipelines, caches, storage, and memory design.',
  'scripts/pyq-taxonomy.mjs:classifyOptional': 'Routes optional-syllabus questions through recognizable core-topic cues before falling back to software engineering.',
  'scripts/pyq-taxonomy.mjs:classifyPyqQuestion': 'Applies manual corrections and audited source hints first, then dispatches the normalized question context to the appropriate subject classifier.',
  'scripts/pyq-taxonomy.mjs:taxonomySubject': 'Returns canonical subject metadata for a taxonomy slug or null when the slug is unknown.'
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

const functionIdsByPath = new Map();
for (const node of nodes.filter((candidate) => candidate.type === 'function')) {
  if (!functionIdsByPath.has(node.filePath)) functionIdsByPath.set(node.filePath, new Map());
  functionIdsByPath.get(node.filePath).set(node.name, node.id);
}
const callKeys = new Set();
for (const result of extraction.results) {
  const functions = functionIdsByPath.get(result.path);
  if (!functions) continue;
  for (const call of result.callGraph ?? []) {
    const source = functions.get(call.caller);
    const target = functions.get(call.callee);
    if (!source || !target || source === target) continue;
    const key = `${source}->${target}`;
    if (callKeys.has(key)) continue;
    callKeys.add(key);
    edges.push({ source, target, type: 'calls', direction: 'forward', weight: 0.8 });
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

const significantClasses = extraction.results.flatMap((result) => {
  const exported = new Set((result.exports ?? []).map((entry) => entry.name));
  return (result.classes ?? []).filter((cls) => (cls.methods ?? []).length >= 2 || cls.endLine - cls.startLine + 1 >= 20 || exported.has(cls.name));
});
if (significantClasses.length !== 0) throw new Error(`Unemitted significant classes: ${JSON.stringify(significantClasses)}`);

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
fs.writeFileSync(path.join(uaDir, 'intermediate/batch-11.json'), `${JSON.stringify({ nodes, edges }, null, 2)}\n`);

console.log(JSON.stringify({ parts, nodes: nodes.length, edges: edges.length, imports: importEdges.length, calls: callKeys.size }));
