import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-19.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 19);
if (!batch) throw new Error('Original batchIndex 19 was not found');

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
  'capacitor.config.ts': {
    summary: 'Configures HETU’s Capacitor Android shell to load the production HTTPS host, disable unsafe WebView behavior, and tune keyboard, splash-screen, and push-notification plugins.',
    tags: ['configuration', 'capacitor', 'android', 'native-shell'],
    complexity: 'simple',
    languageNotes: 'A typed Capacitor configuration uses plugin enums and production-focused WebView security settings.'
  },
  'playwright.config.ts': {
    summary: 'Runs Chromium end-to-end tests against a managed local Vite server with serial execution, CI retries and reporting, and first-retry tracing.',
    tags: ['configuration', 'playwright', 'end-to-end-testing'],
    complexity: 'simple'
  },
  'postcss.config.js': {
    summary: 'Enables Tailwind CSS processing and vendor-prefix generation in the PostCSS pipeline.',
    tags: ['configuration', 'postcss', 'tailwind', 'build-system'],
    complexity: 'simple'
  },
  'public/.well-known/assetlinks.json': {
    summary: 'Publishes the Android Digital Asset Links statement authorizing the signed HETU application package to handle URLs for the hosting domain.',
    tags: ['configuration', 'android-app-links', 'security', 'domain-verification'],
    complexity: 'simple'
  },
  'public/push-sw.js': {
    summary: 'Handles web-push delivery and notification clicks inside the service worker, validating payload fields, presenting legacy or supplied actions, managing app badges, securely invoking API actions, and focusing or opening the routed client.',
    tags: ['service-worker', 'web-push', 'notifications', 'event-handler', 'security'],
    complexity: 'moderate',
    languageNotes: 'Classic service-worker JavaScript uses event.waitUntil to preserve asynchronous notification, fetch, badge, and client-navigation work.'
  },
  'scripts/build-android-release.sh': {
    summary: 'Validates release version inputs and JDK 21, then builds and stages both the production-signed Android release APK and a debug-certificate friend-update variant.',
    tags: ['build-script', 'android', 'release-process', 'gradle'],
    complexity: 'simple',
    languageNotes: 'Strict Bash mode, a temporary staging directory, and an EXIT trap make artifact replacement fail-fast and cleanup-safe.'
  },
  'scripts/build-topper-notes.mjs': {
    summary: 'Builds the curated GATE topper-notes archive by validating source PDFs, compressing large documents with Ghostscript, copying the linear-algebra lab, and generating the public metadata manifest.',
    tags: ['build-script', 'content-pipeline', 'pdf-processing', 'manifest-generation'],
    complexity: 'complex'
  },
  'scripts/deploy.sh': {
    summary: 'Performs an idempotent Supabase backend deployment by validating credentials and CLI access, linking the project, rotating Vault cron secrets, applying migrations, deploying edge functions, setting optional secrets, and configuring Telegram.',
    tags: ['deployment', 'supabase', 'secrets-management', 'automation', 'operations'],
    complexity: 'moderate',
    languageNotes: 'Strict Bash combines indirect environment-variable expansion, Supabase Vault SQL, and guarded optional integrations.'
  },
  'src/__tests__/e2e/dashboard-analysis.spec.ts': {
    summary: 'Verifies that the local-first sandbox reaches the dashboard, every practical study-loop route renders its expected heading, and the core mobile navigation remains visible at phone width.',
    tags: ['test', 'playwright', 'dashboard', 'responsive-design'],
    complexity: 'simple'
  },
  'src/__tests__/native-scroll.test.ts': {
    summary: 'Guards the Android document-scroll fix by asserting that the native body uses horizontal overflow clipping instead of a hidden overflow container.',
    tags: ['test', 'vitest', 'android', 'css-regression'],
    complexity: 'simple'
  },
  'src/__tests__/notification-consent.test.ts': {
    summary: 'Enforces source-level notification consent boundaries and fallback behavior across daily digests, Buddy pushes and requests, device study settings, and Android interactive delivery.',
    tags: ['test', 'vitest', 'notifications', 'consent'],
    complexity: 'simple'
  },
  'src/__tests__/pyq-migration.test.ts': {
    summary: 'Audits the production PYQ migration text for one-active-session enforcement, immutable version-two attempt receipts, and removal of the delete policy.',
    tags: ['test', 'vitest', 'database-migration', 'pyq'],
    complexity: 'simple'
  },
  'src/__tests__/setup.ts': {
    summary: 'Bootstraps browser-like Vitest state with fake IndexedDB, DOM matchers, resilient in-memory local and session storage, and a no-op ResizeObserver for chart rendering.',
    tags: ['test', 'vitest', 'test-fixture', 'browser-polyfill'],
    complexity: 'moderate'
  },
  'src/__tests__/topper-notes.test.ts': {
    summary: 'Validates the topper-notes manifest’s size, ordering, unique identifiers and links, then confirms every PDF and the linear-algebra lab are present and byte-synchronized.',
    tags: ['test', 'vitest', 'content-integrity', 'topper-notes'],
    complexity: 'simple'
  },
  'src/index.css': {
    summary: 'Implements HETU’s global Tailwind-backed design system with light and dark tokens, typography, safe-area and native WebView behavior, responsive components, tables, print rules, reduced-motion support, and PYQ and topper-notes content styling.',
    tags: ['design-system', 'tailwind', 'responsive-design', 'accessibility', 'native-layout'],
    complexity: 'complex',
    languageNotes: 'CSS custom properties form the theme contract while Tailwind layers, media queries, native data attributes, and safe-area environment variables specialize presentation.'
  },
  'src/lib/flags.ts': {
    summary: 'Defines the UI freeze date and a helper that determines whether a supplied or current date falls after the freeze deadline.',
    tags: ['utility', 'feature-flag', 'date-handling'],
    complexity: 'simple'
  },
  'src/reattempt.css': {
    summary: 'Styles the question-first re-attempt flow with expanded-card states, responsive question sheets and timer panels, mobile spacing, and reduced-motion behavior.',
    tags: ['stylesheet', 'reattempt', 'responsive-design', 'accessibility'],
    complexity: 'moderate'
  },
  'src/types/db.ts': {
    summary: 'Defines the TypeScript contracts mirroring Supabase and Dexie data for users, planning, study sessions, questions, re-attempts, PYQ audit history, mocks, Buddy collaboration, notifications, and access control.',
    tags: ['type-definition', 'database', 'supabase', 'domain-model'],
    complexity: 'complex',
    languageNotes: 'Exported interfaces preserve PostgreSQL nullability and distinguish immutable server evidence from locally synchronized row extensions.'
  },
  'src/vite-env.d.ts': {
    summary: 'Augments Vite’s import metadata with typed optional environment variables for application URLs, Supabase, web push, Sentry, and Telegram.',
    tags: ['type-definition', 'vite', 'environment-variables'],
    complexity: 'simple'
  },
  'supabase/config.toml': {
    summary: 'Configures the local Supabase API, PostgreSQL 15, Studio, authentication and one-shot edge runtime, including per-function JWT verification policies for scheduled and public handlers.',
    tags: ['configuration', 'supabase', 'local-development', 'edge-functions', 'authentication'],
    complexity: 'simple'
  },
  'supabase/functions/_shared/wa.ts': {
    summary: 'Adapts approved Meta WhatsApp Business templates for Supabase functions by checking environment configuration, normalizing destination numbers, assembling parameterized payloads, and returning bounded API errors or message IDs.',
    tags: ['service', 'whatsapp', 'api-client', 'validation', 'supabase-function'],
    complexity: 'moderate',
    languageNotes: 'Deno environment access and a structured result union keep secrets server-side and transport failures explicit.'
  },
  'supabase/functions/buddy-notifications/deno.json': {
    summary: 'Lets the Buddy notifications Supabase function resolve npm packages automatically in the Deno runtime.',
    tags: ['configuration', 'deno', 'buddy-notifications'],
    complexity: 'simple'
  },
  'supabase/functions/study-notifications/deno.json': {
    summary: 'Applies strict Deno TypeScript settings and browser-compatible libraries to the study notifications function.',
    tags: ['configuration', 'deno', 'study-notifications', 'strict-mode'],
    complexity: 'simple'
  },
  'tailwind.config.js': {
    summary: 'Maps semantic CSS variables into Tailwind colors, typography, radii, shadows, spacing and transition tokens while scanning the HTML shell and TypeScript component tree.',
    tags: ['configuration', 'tailwind', 'design-tokens', 'build-system'],
    complexity: 'moderate'
  },
  'vite.config.ts': {
    summary: 'Builds the React application and PWA, validates native Supabase settings, configures icons and Workbox caching for PYQ assets, imports the push worker, and removes hosted topper notes from Capacitor bundles.',
    tags: ['configuration', 'vite', 'pwa', 'workbox', 'capacitor'],
    complexity: 'moderate',
    languageNotes: 'A mode-aware Vite factory disables PWA generation for native builds and adds a closeBundle cleanup plugin only for Capacitor output.'
  }
};

const functionSummaries = {
  'scripts/build-topper-notes.mjs:compressPdf': 'Invokes Ghostscript with bounded ebook-quality image and font compression settings and fails if conversion does not complete successfully.',
  'scripts/build-topper-notes.mjs:main': 'Rebuilds the public notes archive and manifest, copying small PDFs, compressing large ones, and excluding the lab’s source-only build script.',
  'src/__tests__/e2e/dashboard-analysis.spec.ts:enterLocalSandbox': 'Enters the local sandbox, conditionally dismisses onboarding, and waits for core dashboard analysis surfaces.',
  'src/__tests__/setup.ts:makeMemoryStorage': 'Creates a Map-backed implementation of the browser Storage contract for deterministic tests.',
  'src/lib/flags.ts:isFrozen': 'Compares a date against the end of the configured UI freeze day.',
  'supabase/functions/_shared/wa.ts:waConfigured': 'Reports whether both required Meta WhatsApp credentials are present in the Deno environment.',
  'supabase/functions/_shared/wa.ts:sendWhatsAppTemplate': 'Validates a recipient, builds a parameterized WhatsApp template request, calls the Meta Graph API, and returns a message ID or bounded error.'
};

function nodeId(file) {
  return file.fileCategory === 'config' ? `config:${file.path}` : `file:${file.path}`;
}

function nodeType(file) {
  return file.fileCategory === 'config' ? 'config' : 'file';
}

function functionTags(filePath) {
  if (filePath.includes('/__tests__/')) return ['test-fixture', 'test', 'utility'];
  if (filePath.endsWith('/flags.ts')) return ['utility', 'feature-flag', 'date-handling'];
  if (filePath.endsWith('/wa.ts')) return ['api-client', 'whatsapp', 'supabase-function'];
  return ['build-script', 'content-pipeline', 'utility'];
}

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

const nodes = [];
for (const file of batch.files) {
  const definition = definitions[file.path];
  if (!definition) throw new Error(`Missing semantic definition for ${file.path}`);
  nodes.push({
    id: nodeId(file),
    type: nodeType(file),
    name: path.basename(file.path),
    filePath: file.path,
    ...definition
  });

  const result = resultByPath.get(file.path);
  if (!result || file.fileCategory !== 'code' && file.fileCategory !== 'script') continue;
  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const fn of result.functions ?? []) {
    const exported = exportedNames.has(fn.name);
    const lines = fn.endLine - fn.startLine + 1;
    if (lines < 10 && !exported) continue;
    const key = `${file.path}:${fn.name}`;
    const summary = functionSummaries[key];
    if (!summary) throw new Error(`Missing function summary for ${key}`);
    nodes.push({
      id: `function:${file.path}:${fn.name}`,
      type: 'function',
      name: fn.name,
      filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary,
      tags: functionTags(file.path),
      complexity: complexity(lines)
    });
  }
}

const edges = [];
for (const file of batch.files) {
  const source = nodeId(file);
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
  const result = resultByPath.get(file.path);
  if (!result) continue;
  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const node of nodes.filter((candidate) => candidate.filePath === file.path && candidate.id !== source)) {
    edges.push({ source, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exportedNames.has(node.name)) {
      edges.push({ source, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }
}

edges.push(
  { source: 'config:public/.well-known/assetlinks.json', target: 'file:capacitor.config.ts', type: 'related', direction: 'forward', weight: 0.5 },
  { source: 'config:supabase/config.toml', target: 'file:scripts/deploy.sh', type: 'configures', direction: 'forward', weight: 0.6 },
  { source: 'file:playwright.config.ts', target: 'file:src/__tests__/e2e/dashboard-analysis.spec.ts', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:postcss.config.js', target: 'file:tailwind.config.js', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:tailwind.config.js', target: 'file:src/index.css', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:vite.config.ts', target: 'file:public/push-sw.js', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:src/index.css', target: 'file:src/main.tsx', type: 'related', direction: 'forward', weight: 0.5 },
  { source: 'file:src/reattempt.css', target: 'file:src/pages/Reattempts.tsx', type: 'related', direction: 'forward', weight: 0.5 },
  { source: 'file:src/index.css', target: 'file:src/__tests__/native-scroll.test.ts', type: 'tested_by', direction: 'forward', weight: 0.5 },
  { source: 'file:scripts/build-topper-notes.mjs', target: 'file:src/__tests__/topper-notes.test.ts', type: 'tested_by', direction: 'forward', weight: 0.5 },
  { source: 'file:src/__tests__/native-scroll.test.ts', target: 'file:src/__tests__/setup.ts', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:src/__tests__/notification-consent.test.ts', target: 'file:src/__tests__/setup.ts', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:src/__tests__/pyq-migration.test.ts', target: 'file:src/__tests__/setup.ts', type: 'depends_on', direction: 'forward', weight: 0.6 },
  { source: 'file:src/__tests__/topper-notes.test.ts', target: 'file:src/__tests__/setup.ts', type: 'depends_on', direction: 'forward', weight: 0.6 }
);

const nodeIds = new Set(nodes.map((node) => node.id));
if (nodeIds.size !== nodes.length) throw new Error('Duplicate node IDs generated');
const allowedExternalFileTargets = new Set([
  ...Object.values(batch.batchImportData).flat(),
  ...Object.values(batch.neighborMap).flatMap((neighbors) => neighbors.map((neighbor) => neighbor.path))
].map((filePath) => `file:${filePath}`));
const edgeKeys = new Set();
for (const edge of edges) {
  const key = `${edge.source}|${edge.target}|${edge.type}`;
  if (edgeKeys.has(key)) throw new Error(`Duplicate edge generated: ${key}`);
  edgeKeys.add(key);
  if (edge.source === edge.target) throw new Error(`Self edge generated: ${key}`);
  if (!nodeIds.has(edge.source)) throw new Error(`Unresolved source: ${key}`);
  if (!nodeIds.has(edge.target) && !allowedExternalFileTargets.has(edge.target)) throw new Error(`Unresolved target: ${key}`);
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) {
  throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (partCount !== 1) throw new Error(`Unexpected part count ${partCount}`);
writeFileSync(
  path.join(uaDir, 'intermediate/batch-19.json'),
  `${JSON.stringify({ nodes, edges }, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount, filesSkipped: [...skipped] }));
