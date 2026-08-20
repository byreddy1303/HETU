import { readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const analysis = JSON.parse(readFileSync(`${root}/.ua/tmp/ua-arch-results.json`, 'utf8'));
if (!analysis.scriptCompleted) throw new Error('Architecture analysis did not complete');
if (analysis.fileStats.totalFileNodes !== 395 || analysis.fileProfiles.length !== 395) {
  throw new Error(`Expected 395 file profiles, got ${analysis.fileProfiles.length}`);
}

const layerDefinitions = [
  {
    id: 'layer:ui',
    name: 'React UI and Navigation',
    description: 'Route pages, reusable React components, the application shell, and global responsive styling for HETU’s PYQ, planning, readiness, review, and buddy-study experiences.'
  },
  {
    id: 'layer:client-services',
    name: 'Local-First Client Services',
    description: 'Dexie persistence, Supabase synchronization, study analytics, planner and readiness logic, authentication services, reusable hooks, and browser push behavior used by the React interface.'
  },
  {
    id: 'layer:state-contracts',
    name: 'Client State and Domain Contracts',
    description: 'Zustand stores and shared TypeScript contracts that define user-scoped client state, synchronized database rows, study evidence, and build-time environment values.'
  },
  {
    id: 'layer:edge-api',
    name: 'Supabase Edge API and Delivery',
    description: 'Deno Edge Function handlers and shared server services for invite-only access, authentication, buddy workflows, readiness jobs, scheduled digests, and multi-channel notifications.'
  },
  {
    id: 'layer:database',
    name: 'Database Schema and Policies',
    description: 'Ordered PostgreSQL migrations defining HETU’s study records, PYQ audit history, planner and notification data, RLS policies, RPCs, indexes, and scheduled operations.'
  },
  {
    id: 'layer:android-native',
    name: 'Android Native Runtime',
    description: 'Capacitor-hosted Java activity and notification runtime, WorkManager receivers and workers, Gradle wrapper launchers, and the native project placeholder required for Android packaging.'
  },
  {
    id: 'layer:test',
    name: 'Tests and Verification',
    description: 'Vitest, Playwright, and Android test suites plus their runners, covering local-first behavior, study calculations, UI workflows, security boundaries, migrations, assets, and native regressions.'
  },
  {
    id: 'layer:automation',
    name: 'Content and Operations Automation',
    description: 'Repository scripts that build and audit the PYQ taxonomy and content bank, generate learner-log migrations and topper-note assets, package Android releases, and deploy the Supabase backend.'
  },
  {
    id: 'layer:configuration',
    name: 'Build and Platform Configuration',
    description: 'Web, TypeScript, Vite, Vercel, Supabase, Android Gradle, manifest, resource, app-link, environment-template, repository, and knowledge-graph settings that shape every deployment target.'
  },
  {
    id: 'layer:documentation',
    name: 'Project Documentation',
    description: 'The project overview, production deployment runbook, Android release guide, and repository working agreements for operating and maintaining HETU.'
  }
];

const configLikeFiles = new Set([
  '.deploy.env.example',
  '.gitattributes',
  '.nvmrc',
  '.ua/.understandignore',
  'capacitor.config.ts',
  'postcss.config.js',
  'tailwind.config.js',
  'vite.config.ts',
  'android/app/proguard-rules.pro',
  'android/keystore.properties.example'
]);

const uiRootFiles = new Set([
  'index.html',
  'src/App.tsx',
  'src/index.css',
  'src/main.tsx',
  'src/reattempt.css',
  'src/router.tsx'
]);

function assign(profile) {
  const filePath = profile.filePath;

  if (
    profile.pattern === 'test' ||
    filePath === 'playwright.config.ts' ||
    filePath === 'vitest.config.ts'
  ) return 'layer:test';

  if (profile.type === 'document') return 'layer:documentation';
  if (profile.type === 'table') return 'layer:database';
  if (profile.type === 'config' || configLikeFiles.has(filePath)) return 'layer:configuration';
  if (filePath.startsWith('scripts/')) return 'layer:automation';
  if (filePath.startsWith('supabase/functions/')) return 'layer:edge-api';
  if (filePath.startsWith('android/') || filePath.startsWith('android-stub/')) return 'layer:android-native';
  if (filePath.startsWith('src/components/') || filePath.startsWith('src/pages/') || uiRootFiles.has(filePath)) return 'layer:ui';
  if (filePath.startsWith('src/stores/') || filePath.startsWith('src/types/') || filePath === 'src/vite-env.d.ts') return 'layer:state-contracts';
  if (filePath.startsWith('src/lib/') || filePath.startsWith('src/hooks/') || filePath === 'public/push-sw.js') return 'layer:client-services';

  throw new Error(`No layer assignment rule matched ${profile.id} (${filePath})`);
}

const nodeIdsByLayer = new Map(layerDefinitions.map((layer) => [layer.id, []]));
for (const profile of analysis.fileProfiles) nodeIdsByLayer.get(assign(profile)).push(profile.id);

const layers = layerDefinitions.map((definition) => ({
  ...definition,
  nodeIds: nodeIdsByLayer.get(definition.id)
}));

if (layers.length < 3 || layers.length > 10) throw new Error(`Invalid layer count: ${layers.length}`);
for (const layer of layers) {
  if (!/^layer:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(layer.id)) throw new Error(`Invalid layer ID: ${layer.id}`);
  if (!layer.name || !layer.description || layer.nodeIds.length === 0) throw new Error(`Invalid or empty layer: ${layer.id}`);
}

const expectedIds = new Set(analysis.fileProfiles.map((profile) => profile.id));
const assignedIds = layers.flatMap((layer) => layer.nodeIds);
const assignedSet = new Set(assignedIds);
if (assignedIds.length !== expectedIds.size || assignedSet.size !== expectedIds.size) {
  throw new Error(`Layer assignment count/duplicate mismatch: assigned=${assignedIds.length}, unique=${assignedSet.size}, expected=${expectedIds.size}`);
}
const missing = [...expectedIds].filter((id) => !assignedSet.has(id));
const dangling = [...assignedSet].filter((id) => !expectedIds.has(id));
if (missing.length > 0 || dangling.length > 0) {
  throw new Error(`Layer reference mismatch: missing=${missing.join(', ')}, dangling=${dangling.join(', ')}`);
}

writeFileSync(`${root}/.ua/intermediate/layers.json`, `${JSON.stringify(layers, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  layerCount: layers.length,
  totalAssigned: assignedIds.length,
  counts: Object.fromEntries(layers.map((layer) => [layer.id, layer.nodeIds.length]))
}));
