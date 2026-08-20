import fs from 'node:fs';
import path from 'node:path';

const uaDir = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu/.ua';
const input = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-analyzer-input-2.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-2.json'), 'utf8'));

if (!extraction.scriptCompleted || extraction.filesSkipped.length !== 0) {
  throw new Error(`Structural extraction incomplete: ${JSON.stringify(extraction.filesSkipped)}`);
}

const fileMeta = {
  'src/App.tsx': {
    summary: 'Composes the application root, initializes authentication and preferences, synchronizes the resolved theme with browser and native chrome, and mounts global runtimes around the router.',
    tags: ['entry-point', 'component', 'application-shell', 'theme']
  },
  'src/__tests__/buddy-chat-ui.test.tsx': {
    summary: 'Exercises the buddy chat composer and scrolling behavior, including pointer-specific Enter handling, hidden-conversation read state, and jump-to-latest affordances.',
    tags: ['test', 'buddy-chat', 'user-interface', 'interaction']
  },
  'src/__tests__/buddy-notifications.test.ts': {
    summary: 'Validates buddy notification client helpers for stable device identity, explicit opt-in defaults, VAPID key decoding, and safe local push routes.',
    tags: ['test', 'notifications', 'push-notifications', 'validation']
  },
  'src/__tests__/buddy-page-ui.test.tsx': {
    summary: 'Verifies that mobile buddy-chat navigation is URL-driven and that native Back returns from a conversation to the buddy list.',
    tags: ['test', 'buddy-page', 'mobile-navigation', 'routing']
  },
  'src/__tests__/buddy.test.ts': {
    summary: 'Covers buddy-domain helpers for safe shared-question payloads, message merging and grouping, pair-scoped presence, and compact chat timestamps.',
    tags: ['test', 'buddy-domain', 'message-grouping', 'validation']
  },
  'src/__tests__/image-capture.test.ts': {
    summary: 'Checks element screenshot capture behavior and confirms that light-mode styling is isolated to the cloned capture document.',
    tags: ['test', 'image-capture', 'theme-isolation', 'browser']
  },
  'src/__tests__/native.test.ts': {
    summary: 'Tests native deep-link normalization and Android Back policy across history navigation, deep-linked pages, and double-press exit behavior.',
    tags: ['test', 'native-runtime', 'deep-linking', 'android']
  },
  'src/__tests__/notification-time-editor-native.test.tsx': {
    summary: 'Verifies the native notification-time editor uses bounded in-page numeric inputs instead of Android select dialogs.',
    tags: ['test', 'notifications', 'native-interface', 'time-input']
  },
  'src/__tests__/notification-time-editor.test.tsx': {
    summary: 'Tests staged hour and minute editing, atomic time saves, and restoration of persisted values after a failed save.',
    tags: ['test', 'notifications', 'time-input', 'error-handling']
  },
  'src/__tests__/pin-input.test.tsx': {
    summary: 'Validates numeric keyboard hints, one-character PIN cells, and removal of non-digit input.',
    tags: ['test', 'authentication', 'pin-input', 'validation']
  },
  'src/__tests__/study-notifications.test.ts': {
    summary: 'Validates study-notification category coverage, minute-level scheduling, separate consent, interactive actions, and schedule-reset semantics.',
    tags: ['test', 'study-notifications', 'scheduling', 'interactive-actions']
  },
  'src/__tests__/supabase-config.test.ts': {
    summary: 'Checks Supabase URL validation for supported project URLs and rejects missing, placeholder, or unsafe values without throwing.',
    tags: ['test', 'supabase', 'configuration', 'validation']
  },
  'src/__tests__/theme.test.ts': {
    summary: 'Tests explicit and system theme resolution, semantic DOM and browser-chrome updates, and direct light/dark toggling.',
    tags: ['test', 'theme', 'preferences', 'browser-chrome']
  },
  'src/components/auth/PinInput.tsx': {
    summary: 'Renders a controlled, configurable numeric PIN as individual cells with focus movement, keyboard navigation, paste handling, and digit sanitization.',
    tags: ['component', 'authentication', 'pin-input', 'accessibility']
  },
  'src/components/buddy/BuddyAvatar.tsx': {
    summary: 'Displays a buddy initial with deterministic color styling, responsive sizing, and an optional online-presence indicator.',
    tags: ['component', 'buddy', 'avatar', 'presence']
  },
  'src/components/buddy/BuddyChat.tsx': {
    summary: 'Implements the responsive real-time buddy conversation surface with message pagination, optimistic sending, typing and read state, presence, question sharing, and unfriend controls.',
    tags: ['component', 'buddy-chat', 'realtime', 'messaging', 'question-sharing']
  },
  'src/components/buddy/BuddyPresenceRuntime.tsx': {
    summary: 'Maintains Supabase Presence channels for active buddy relationships and projects synchronized online user IDs into the buddy presence store.',
    tags: ['component', 'presence', 'realtime', 'supabase']
  },
  'src/components/dashboard/WelcomeOverlay.tsx': {
    summary: 'Presents a multi-slide onboarding overlay and persists dismissal locally and to the signed-in user profile.',
    tags: ['component', 'onboarding', 'dashboard', 'persistence']
  },
  'src/components/native/NativeRuntime.tsx': {
    summary: 'Bridges Capacitor app lifecycle events into the web application, handling Android Back, deep links, keyboard dismissal, native chrome, and sync resume.',
    tags: ['component', 'native-runtime', 'capacitor', 'deep-linking', 'lifecycle']
  },
  'src/components/notifications/BuddyNotificationRuntime.tsx': {
    summary: 'Keeps push registration synchronized and routes native notification actions into application navigation for authenticated users.',
    tags: ['component', 'push-notifications', 'native-runtime', 'routing']
  },
  'src/components/settings/AccessRequestsCard.tsx': {
    summary: 'Provides the owner-facing access request queue with status tabs, approval and decline workflows, invite-link recovery, reasons, and copy controls.',
    tags: ['component', 'access-management', 'approval-workflow', 'settings']
  },
  'src/components/settings/BuddyNotificationsCard.tsx': {
    summary: 'Manages buddy-message notification consent and delivery state, including device guidance, temporary snoozing, and foreground-preview preferences.',
    tags: ['component', 'buddy-notifications', 'push-notifications', 'settings', 'snooze']
  },
  'src/components/settings/NotificationTimeEditor.tsx': {
    summary: 'Edits an hour-and-minute notification schedule with native numeric controls, web selects, bounded values, staged changes, and asynchronous save recovery.',
    tags: ['component', 'notifications', 'time-input', 'settings']
  },
  'src/components/settings/NotificationsCard.tsx': {
    summary: 'Configures daily digest delivery through Telegram and email, including connection lifecycle, local schedule and timezone, backup preference, and test sends.',
    tags: ['component', 'notifications', 'telegram', 'digest', 'settings']
  },
  'src/components/settings/StudyNotificationsCard.tsx': {
    summary: 'Controls separate study-notification consent and per-category schedules, with preference persistence and interactive test delivery.',
    tags: ['component', 'study-notifications', 'scheduling', 'settings']
  },
  'src/components/shared/Brand.tsx': {
    summary: 'Defines the reusable HETU brand mark and size-aware wordmark used across navigation, loading, authentication, and error surfaces.',
    tags: ['component', 'branding', 'shared-interface', 'svg']
  },
  'src/components/shared/LoadingScreen.tsx': {
    summary: 'Shows the branded application loading screen with motion that respects the user reduced-motion preference.',
    tags: ['component', 'loading-state', 'branding', 'accessibility']
  },
  'src/components/shared/RequireAuth.tsx': {
    summary: 'Guards protected content behind authentication readiness, rendering a loading screen until the auth hook permits access.',
    tags: ['component', 'authentication', 'route-guard', 'loading-state']
  }
};

const functionMeta = {
  'src/App.tsx:App': ['Builds the global provider and runtime tree while initializing auth and keeping application theme state synchronized.', ['entry-point', 'component', 'initialization']],
  'src/__tests__/buddy-chat-ui.test.tsx:message': ['Creates a complete buddy-message fixture with caller-provided overrides for UI interaction tests.', ['test-helper', 'fixture', 'buddy-message']],
  'src/__tests__/buddy-chat-ui.test.tsx:setPointer': ['Mocks pointer media queries to switch buddy chat tests between coarse and desktop interaction modes.', ['test-helper', 'browser-mock', 'pointer-input']],
  'src/__tests__/buddy.test.ts:message': ['Builds a text buddy-message fixture with deterministic identifiers, timestamps, and delivery fields.', ['test-helper', 'fixture', 'buddy-message']],
  'src/components/auth/PinInput.tsx:PinInput': ['Coordinates a controlled multi-cell numeric PIN input, including focus, arrow and backspace behavior, and paste distribution.', ['component', 'pin-input', 'keyboard-navigation', 'validation']],
  'src/components/buddy/BuddyAvatar.tsx:BuddyAvatar': ['Renders a deterministic initial avatar and optional online marker for a buddy identity.', ['component', 'avatar', 'presence']],
  'src/components/buddy/BuddyChat.tsx:BuddyChat': ['Runs the full real-time buddy conversation workflow, from loading and subscribing through optimistic sends, reads, typing, scrolling, and question sharing.', ['component', 'buddy-chat', 'realtime', 'messaging']],
  'src/components/buddy/BuddyChat.tsx:MessageBubble': ['Renders one text or shared-question message with sender alignment, grouping shape, delivery state, timestamp, and entrance animation.', ['component', 'message-rendering', 'buddy-chat']],
  'src/components/buddy/BuddyChat.tsx:QuestionCard': ['Formats a shared question reference as a compact subject-colored card with source and timing metadata.', ['component', 'question-sharing', 'buddy-chat']],
  'src/components/buddy/BuddyChat.tsx:QuestionPicker': ['Loads the user question library and provides a searchable, keyboard-dismissible picker for sharing a question into chat.', ['component', 'question-picker', 'search', 'buddy-chat']],
  'src/components/buddy/BuddyPresenceRuntime.tsx:BuddyPresenceRuntime': ['Creates and reconciles one presence channel per active buddy, refreshing channels on relationship and visibility changes.', ['component', 'presence', 'realtime', 'lifecycle']],
  'src/components/dashboard/WelcomeOverlay.tsx:WelcomeOverlay': ['Controls onboarding slide navigation, accessibility dismissal, and durable welcome-seen persistence.', ['component', 'onboarding', 'persistence']],
  'src/components/native/NativeRuntime.tsx:NativeRuntime': ['Registers native lifecycle listeners and translates Back presses and app URLs into safe router and sync actions.', ['component', 'capacitor', 'native-navigation', 'lifecycle']],
  'src/components/notifications/BuddyNotificationRuntime.tsx:BuddyNotificationRuntime': ['Synchronizes push registration and consumes native notification actions before navigating to the resolved in-app route.', ['component', 'push-notifications', 'routing', 'lifecycle']],
  'src/components/settings/AccessRequestsCard.tsx:AccessRequestsCard': ['Loads and filters account requests for the owner and coordinates approval, decline, invite, and toast state.', ['component', 'access-management', 'approval-workflow']],
  'src/components/settings/AccessRequestsCard.tsx:TabButton': ['Renders a tone-aware request-status tab with selection state and an optional count badge.', ['component', 'tab-control', 'access-management']],
  'src/components/settings/AccessRequestsCard.tsx:RequestRow': ['Displays request metadata and expands into approval, invite-copy, or reasoned decline controls based on status.', ['component', 'access-request', 'approval-workflow']],
  'src/components/settings/AccessRequestsCard.tsx:CopyButton': ['Copies an invite or email value to the clipboard and briefly reports successful completion.', ['component', 'clipboard', 'feedback']],
  'src/components/settings/BuddyNotificationsCard.tsx:BuddyNotificationsCard': ['Coordinates buddy push opt-in, delivery diagnostics, snooze windows, and preview preference updates.', ['component', 'buddy-notifications', 'push-notifications', 'settings']],
  'src/components/settings/BuddyNotificationsCard.tsx:DeliveryStep': ['Displays one labeled step in the notification delivery-status explanation.', ['component', 'status-display', 'notifications']],
  'src/components/settings/NotificationTimeEditor.tsx:NotificationTimeEditor': ['Maintains bounded draft clock values and selects native or web controls before saving both fields atomically.', ['component', 'time-input', 'notifications', 'validation']],
  'src/components/settings/NotificationsCard.tsx:NotificationsCard': ['Coordinates Telegram linking, digest enablement, schedule and timezone updates, email backup, and test delivery.', ['component', 'notifications', 'telegram', 'settings']],
  'src/components/settings/NotificationsCard.tsx:DetailField': ['Provides a consistently labeled and icon-decorated field row for digest settings.', ['component', 'form-field', 'settings']],
  'src/components/settings/NotificationsCard.tsx:MasterToggle': ['Renders the accessible master digest switch with disabled state and animated visual feedback.', ['component', 'toggle', 'accessibility']],
  'src/components/settings/StudyNotificationsCard.tsx:StudyNotificationsCard': ['Loads study notification preferences and manages master consent, category enablement, schedule updates, and test sends.', ['component', 'study-notifications', 'scheduling', 'settings']],
  'src/components/shared/Brand.tsx:BrandMark': ['Renders the reusable decorative or labeled SVG symbol for the HETU brand.', ['component', 'branding', 'svg', 'accessibility']],
  'src/components/shared/Brand.tsx:Brand': ['Combines the brand mark with a size-aware HETU wordmark.', ['component', 'branding', 'shared-interface']],
  'src/components/shared/LoadingScreen.tsx:LoadingScreen': ['Renders a centered brand loading indicator with reduced-motion-aware animation.', ['component', 'loading-state', 'accessibility']],
  'src/components/shared/RequireAuth.tsx:RequireAuth': ['Uses authentication state to withhold protected children behind the shared loading screen.', ['component', 'authentication', 'route-guard']]
};

const significant = Object.keys(functionMeta).map((key) => {
  const separator = key.lastIndexOf(':');
  return { filePath: key.slice(0, separator), name: key.slice(separator + 1), key };
});

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
const nodeComplexity = (lines) => lines > 200 ? 'complex' : lines >= 50 ? 'moderate' : 'simple';
const nodes = [];

for (const batchFile of input.batchFiles) {
  const result = resultByPath.get(batchFile.path);
  const meta = fileMeta[batchFile.path];
  if (!result || !meta) throw new Error(`Missing analysis metadata for ${batchFile.path}`);
  nodes.push({
    id: `file:${batchFile.path}`,
    type: 'file',
    name: path.basename(batchFile.path),
    filePath: batchFile.path,
    summary: meta.summary,
    tags: meta.tags,
    complexity: nodeComplexity(result.nonEmptyLines)
  });
}

for (const entry of significant) {
  const result = resultByPath.get(entry.filePath);
  const fn = result.functions.find((candidate) => candidate.name === entry.name);
  if (!fn) throw new Error(`Missing extracted function ${entry.key}`);
  const [summary, tags] = functionMeta[entry.key];
  nodes.push({
    id: `function:${entry.filePath}:${entry.name}`,
    type: 'function',
    name: entry.name,
    filePath: entry.filePath,
    lineRange: [fn.startLine, fn.endLine],
    summary,
    tags,
    complexity: nodeComplexity(fn.endLine - fn.startLine + 1)
  });
}

const edges = [];
for (const batchFile of input.batchFiles) {
  const source = `file:${batchFile.path}`;
  for (const importedPath of input.batchImportData[batchFile.path]) {
    edges.push({ source, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

for (const entry of significant) {
  const fileId = `file:${entry.filePath}`;
  const functionId = `function:${entry.filePath}:${entry.name}`;
  edges.push({ source: fileId, target: functionId, type: 'contains', direction: 'forward', weight: 1.0 });
  const result = resultByPath.get(entry.filePath);
  if ((result.exports ?? []).some((exported) => exported.name === entry.name)) {
    edges.push({ source: fileId, target: functionId, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

const testedRelations = [
  ['src/__tests__/buddy-chat-ui.test.tsx', 'src/components/buddy/BuddyChat.tsx'],
  ['src/__tests__/buddy-notifications.test.ts', 'src/lib/buddyNotifications.ts'],
  ['src/__tests__/buddy-page-ui.test.tsx', 'src/pages/Buddy.tsx'],
  ['src/__tests__/buddy.test.ts', 'src/lib/buddy.ts'],
  ['src/__tests__/image-capture.test.ts', 'src/lib/image.ts'],
  ['src/__tests__/image-capture.test.ts', 'src/lib/theme.ts'],
  ['src/__tests__/native.test.ts', 'src/lib/native.ts'],
  ['src/__tests__/notification-time-editor-native.test.tsx', 'src/components/settings/NotificationTimeEditor.tsx'],
  ['src/__tests__/notification-time-editor.test.tsx', 'src/components/settings/NotificationTimeEditor.tsx'],
  ['src/__tests__/pin-input.test.tsx', 'src/components/auth/PinInput.tsx'],
  ['src/__tests__/study-notifications.test.ts', 'src/lib/studyNotifications.ts'],
  ['src/__tests__/supabase-config.test.ts', 'src/lib/supabase.ts'],
  ['src/__tests__/theme.test.ts', 'src/components/shared/ThemeToggle.tsx'],
  ['src/__tests__/theme.test.ts', 'src/lib/theme.ts'],
  ['src/__tests__/theme.test.ts', 'src/stores/prefs.ts']
];
for (const [testPath, productionPath] of testedRelations) {
  if (!input.batchImportData[testPath].includes(productionPath)) {
    throw new Error(`Unverified tested_by relation ${testPath} -> ${productionPath}`);
  }
  edges.push({
    source: `file:${testPath}`,
    target: `file:${productionPath}`,
    type: 'tested_by',
    direction: 'forward',
    weight: 0.5
  });
}

const fileNodePaths = nodes.filter((node) => node.type === 'file').map((node) => node.filePath).sort();
const expectedPaths = input.batchFiles.map((file) => file.path).sort();
if (JSON.stringify(fileNodePaths) !== JSON.stringify(expectedPaths)) throw new Error('File-node coverage mismatch');
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate node IDs');
if (edges.some((edge) => edge.source === edge.target)) throw new Error('Self-referencing edge detected');

const importEdges = edges.filter((edge) => edge.type === 'imports');
const expectedImports = Object.values(input.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
if (importEdges.length !== expectedImports) throw new Error(`Import count mismatch: ${importEdges.length} != ${expectedImports}`);
for (const [filePath, imports] of Object.entries(input.batchImportData)) {
  const emitted = importEdges.filter((edge) => edge.source === `file:${filePath}`).map((edge) => edge.target.slice(5));
  if (JSON.stringify(emitted) !== JSON.stringify(imports)) throw new Error(`Import edge mismatch for ${filePath}`);
}

const requiredNodeFields = ['id', 'type', 'name', 'summary', 'tags', 'complexity'];
for (const node of nodes) {
  if (requiredNodeFields.some((field) => node[field] === undefined)) throw new Error(`Incomplete node ${node.id}`);
  if (!Array.isArray(node.tags) || node.tags.length < 3 || node.tags.length > 5) throw new Error(`Invalid tags for ${node.id}`);
}

const parts = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = [...expectedPaths];
const chunkSize = Math.ceil(sortedFiles.length / parts);
const fragments = [];
for (let part = 0; part < parts; part += 1) {
  const paths = new Set(sortedFiles.slice(part * chunkSize, (part + 1) * chunkSize));
  const partNodes = nodes.filter((node) => paths.has(node.filePath));
  const sourceIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => sourceIds.has(edge.source));
  fragments.push({ nodes: partNodes, edges: partEdges });
}

const emittedEdges = fragments.flatMap((fragment) => fragment.edges);
if (emittedEdges.length !== edges.length) throw new Error(`Partition lost edges: ${emittedEdges.length} != ${edges.length}`);

for (let part = 0; part < fragments.length; part += 1) {
  const outputPath = path.join(uaDir, 'intermediate', `batch-2-part-${part + 1}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(fragments[part], null, 2)}\n`);
}

console.log(JSON.stringify({ parts, nodes: nodes.length, edges: edges.length, imports: importEdges.length }));
