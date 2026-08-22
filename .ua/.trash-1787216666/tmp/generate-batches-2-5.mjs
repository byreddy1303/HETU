import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const uaDir = path.join(root, '.ua');
const batchesDoc = JSON.parse(
  fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8')
);
const stalePath = 'src/lib/queryClient.ts';

const fileMeta = {
  'src/App.tsx': {
    summary:
      'Defines the root React application shell, initializing authentication and display preferences before mounting routing, native runtimes, loading fallback, and global toasts.',
    tags: ['entry-point', 'component', 'authentication', 'theme', 'runtime']
  },
  'src/__tests__/theme.test.ts': {
    summary:
      'Verifies theme resolution, DOM and browser-chrome application, and the accessible light/dark toggle backed by persisted preferences.',
    tags: ['test', 'theme', 'accessibility', 'state-store']
  },
  'src/components/dashboard/WelcomeOverlay.tsx': {
    summary:
      'Presents the one-time onboarding walkthrough for HETU\'s session, tagging, and reattempt loop, persisting dismissal locally and to the signed-in profile.',
    tags: ['component', 'onboarding', 'persistence', 'authentication']
  },
  'src/components/shared/LoadingScreen.tsx': {
    summary:
      'Renders the branded full-screen loading state used while application routes and authentication state resolve.',
    tags: ['component', 'loading-state', 'branding', 'shared-ui']
  },
  'src/components/shared/RequireAuth.tsx': {
    summary:
      'Guards authenticated routes, showing a loading screen during initialization and routing signed-out visitors to the landing or sign-in experience.',
    tags: ['component', 'authentication', 'route-guard', 'lazy-loading']
  },
  'src/components/shared/RootErrorBoundary.tsx': {
    summary:
      'Handles root routing errors and recovers once from stale deployment chunks before presenting a branded manual reload screen.',
    tags: ['component', 'error-boundary', 'recovery', 'dynamic-import']
  },
  'src/components/shared/ThemeToggle.tsx': {
    summary:
      'Provides an accessible light/dark toggle that resolves system preference, applies the DOM theme immediately, persists the choice, and emits native haptics.',
    tags: ['component', 'theme', 'accessibility', 'preferences']
  },
  'src/components/ui/Toast.tsx': {
    summary:
      'Renders the global dismissible toast stack from UI state and emits success or error haptic feedback once per notification.',
    tags: ['component', 'notification', 'state-store', 'accessibility']
  },
  'src/lib/lazyWithRetry.ts': {
    summary:
      'Wraps React lazy imports with one-shot reload recovery for stale deployment chunk hashes while preserving non-chunk failures.',
    tags: ['utility', 'lazy-loading', 'error-recovery', 'deployment']
  },
  'src/main.tsx': {
    summary:
      'Bootstraps the React client, disables service workers in the native shell, and configures deferred, periodic PWA update checks for web installations.',
    tags: ['entry-point', 'pwa', 'service-worker', 'native-runtime']
  },
  'src/pages/Auth.tsx': {
    summary:
      'Implements the invite-only username and six-digit PIN sign-in page, including validation, deferred auth loading, redirects, and a development sandbox fallback.',
    tags: ['component', 'authentication', 'validation', 'sandbox']
  },
  'src/pages/Settings.tsx': {
    summary:
      'Composes account and device settings for study defaults, profile data, notifications, invites, progress export, backup and restore, local-data reset, and sign-out.',
    tags: ['component', 'preferences', 'profile', 'backup', 'data-management']
  },
  'src/stores/auth.ts': {
    summary:
      'Defines the Zustand authentication store for Supabase username/PIN sessions and the local sandbox, including profile refresh, tenant-safe sign-out, and profile updates.',
    tags: ['state-store', 'authentication', 'local-sandbox', 'tenant-isolation']
  },
  'src/stores/prefs.ts': {
    summary:
      'Defines locally persisted study, session, display, haptic, and backup-reminder preferences together with defaults and reminder helpers.',
    tags: ['state-store', 'preferences', 'persistence', 'configuration']
  },
  'src/__tests__/answer-reveal.test.tsx': {
    summary:
      'Exercises answer concealment and explicit reveal/hide behavior, plus the add-answer action for questions without a saved answer.',
    tags: ['test', 'component', 'answer-recall', 'accessibility']
  },
  'src/__tests__/journal-ui.test.tsx': {
    summary:
      'Integration-tests Journal rendering for standalone imported questions and complete PYQ session receipts, including answers, photos, outcomes, and root-cause analysis.',
    tags: ['test', 'integration-test', 'journal', 'pyq', 'attempt-logging']
  },
  'src/__tests__/sync.test.ts': {
    summary:
      'Validates the local-first synchronization engine across offline writes, sign-out draining, FK-safe failures, queued deletes, pull conflicts, and overlapping refreshes.',
    tags: ['test', 'integration-test', 'sync', 'offline-first', 'conflict-resolution']
  },
  'src/components/shared/AnswerReveal.tsx': {
    summary:
      'Keeps saved answers concealed for active recall until explicitly revealed, supports reduced-motion transitions, and offers an add action when no answer exists.',
    tags: ['component', 'answer-recall', 'accessibility', 'animation']
  },
  'src/lib/sync.ts': {
    summary:
      'Implements the local-first Dexie-to-Supabase synchronization engine with tracked writes, FK-ordered pushes, queued deletes, exponential retry, parallel pulls, and pending-local conflict precedence.',
    tags: ['service', 'sync', 'offline-first', 'conflict-resolution', 'data-persistence']
  },
  'src/pages/Journal.tsx': {
    summary:
      'Provides the searchable and filterable mistake journal, preserving standalone analyses and full PYQ attempt receipts while supporting question and session editing.',
    tags: ['component', 'journal', 'pyq', 'attempt-logging', 'root-cause-analysis']
  },
  'src/pages/SessionActive.tsx': {
    summary:
      'Runs the active timed-session solve/tag loop, persisting reload-safe state, logging interruptions, saving structured question evidence, reconciling patterns, and scheduling required reattempts.',
    tags: ['component', 'test-interface', 'attempt-logging', 'reattempts', 'timer']
  },
  'src/pages/SyllabusTracker.tsx': {
    summary:
      'Tracks studied syllabus topics and combines completion state with PYQ, mistake, reattempt, accuracy, and recency evidence to recommend the next topic.',
    tags: ['component', 'syllabus', 'progress-tracking', 'pyq-evidence', 'recommendation']
  }
};

const functionMeta = {
  'src/App.tsx:App': {
    summary:
      'Initializes authentication and persisted presentation settings, synchronizes browser and native themes, and mounts the global application runtimes and router.',
    tags: ['component', 'entry-point', 'authentication', 'theme']
  },
  'src/components/dashboard/WelcomeOverlay.tsx:WelcomeOverlay': {
    summary:
      'Checks local and account-level onboarding state, renders a four-slide walkthrough, and records dismissal without allowing storage or network failures to block the UI.',
    tags: ['component', 'onboarding', 'persistence', 'event-handler']
  },
  'src/components/shared/LoadingScreen.tsx:LoadingScreen': {
    summary: 'Renders the reusable branded loading surface for route and authentication boundaries.',
    tags: ['component', 'loading-state', 'branding']
  },
  'src/components/shared/RequireAuth.tsx:RequireAuth': {
    summary:
      'Selects the loading, public landing, authentication redirect, or protected child tree from the current authentication state and route.',
    tags: ['component', 'authentication', 'route-guard']
  },
  'src/components/shared/RootErrorBoundary.tsx:RootErrorBoundary': {
    summary:
      'Classifies route and chunk-loading failures, attempts one automatic recovery reload, and otherwise renders a diagnostic fallback with manual reload.',
    tags: ['component', 'error-boundary', 'error-recovery']
  },
  'src/components/shared/ThemeToggle.tsx:ThemeToggle': {
    summary:
      'Resolves the effective theme from device and stored preference, then applies and persists a direct light/dark switch with accessible state.',
    tags: ['component', 'theme', 'preferences', 'accessibility']
  },
  'src/components/ui/Toast.tsx:Toaster': {
    summary:
      'Projects UI-store notifications into a dismissible live region and deduplicates native haptic feedback for newly observed toasts.',
    tags: ['component', 'notification', 'accessibility', 'state-store']
  },
  'src/lib/lazyWithRetry.ts:lazyWithRetry': {
    summary:
      'Creates a React lazy component whose deployment-chunk errors trigger at most one reload, while successful loads clear recovery state and other errors propagate.',
    tags: ['utility', 'lazy-loading', 'error-recovery', 'factory']
  },
  'src/main.tsx:disableNativeServiceWorkers': {
    summary:
      'Unregisters all service workers in the native shell and reloads once when the current document was still controlled.',
    tags: ['native-runtime', 'service-worker', 'cleanup']
  },
  'src/main.tsx:configurePwaUpdates': {
    summary:
      'Registers the PWA service worker, reloads on replacement controller activation, and checks for updates periodically and on visibility changes.',
    tags: ['pwa', 'service-worker', 'update-management']
  },
  'src/main.tsx:schedulePwaUpdates': {
    summary:
      'Defers PWA update configuration until an idle callback or short timeout so initial application rendering remains responsive.',
    tags: ['pwa', 'scheduling', 'performance']
  },
  'src/pages/Auth.tsx:Auth': {
    summary:
      'Validates username and PIN input, drives asynchronous sign-in state, redirects authenticated users, and exposes the development sandbox when Supabase is absent.',
    tags: ['component', 'authentication', 'validation', 'form']
  },
  'src/pages/Settings.tsx:Settings': {
    summary:
      'Orchestrates preference controls, profile and notification cards, access and invite management, progress export, backup operations, and safe sign-out.',
    tags: ['component', 'preferences', 'profile', 'data-management']
  },
  'src/pages/Settings.tsx:NumberField': {
    summary: 'Renders a labelled numeric preference editor and clamps rounded input to its allowed range.',
    tags: ['component', 'form-control', 'validation']
  },
  'src/pages/Settings.tsx:SelectField': {
    summary: 'Renders a labelled select preference editor from a normalized value-and-label option list.',
    tags: ['component', 'form-control', 'preferences']
  },
  'src/pages/Settings.tsx:SegmentField': {
    summary: 'Renders an accessible segmented preference selector with explicit pressed state for each option.',
    tags: ['component', 'form-control', 'accessibility']
  },
  'src/pages/Settings.tsx:ToggleRow': {
    summary: 'Renders an accessible binary setting row with native selection feedback and styled switch state.',
    tags: ['component', 'form-control', 'accessibility', 'haptics']
  },
  'src/pages/Settings.tsx:ProfileCard': {
    summary:
      'Edits profile identity, exam, rank, and timezone fields independently with per-field dirty and saving state for Supabase or sandbox persistence.',
    tags: ['component', 'profile', 'form', 'persistence']
  },
  'src/pages/Settings.tsx:CopyButton': {
    summary: 'Copies an invite value to the clipboard and briefly reports successful completion.',
    tags: ['component', 'clipboard', 'event-handler']
  },
  'src/pages/Settings.tsx:InvitesCard': {
    summary:
      'Lists active and consumed invitation tokens, creates expiring invitations, and handles sandbox, loading, and error states.',
    tags: ['component', 'invitation', 'supabase', 'data-management']
  },
  'src/pages/Settings.tsx:ProgressExportCard': {
    summary:
      'Collects the learner progress report, downloads it as an artifact, and reports success or failure through the global toast system.',
    tags: ['component', 'progress-export', 'download', 'event-handler']
  },
  'src/pages/Settings.tsx:DataCard': {
    summary:
      'Exports and imports versioned local backups and provides a confirmed local-state wipe for sandbox users.',
    tags: ['component', 'backup', 'data-import', 'data-export', 'validation']
  },
  'src/stores/auth.ts:preloadAuthActions': {
    summary:
      'Memoizes the dynamic authentication-actions import and clears the cache after failure so later sign-in attempts can retry.',
    tags: ['utility', 'authentication', 'lazy-loading', 'error-recovery']
  },
  'src/stores/auth.ts:currentUserId': {
    summary: 'Returns the account-scoped identifier for the live Supabase user or the local sandbox profile.',
    tags: ['utility', 'authentication', 'tenant-isolation']
  },
  'src/stores/prefs.ts:daysSinceBackup': {
    summary: 'Computes whole elapsed days since the last recorded backup, returning null when no backup exists.',
    tags: ['utility', 'backup', 'date-calculation']
  },
  'src/stores/prefs.ts:needsBackupReminder': {
    summary: 'Determines whether the configured backup-reminder cadence has been reached or no backup exists yet.',
    tags: ['utility', 'backup', 'reminder']
  },
  'src/components/shared/AnswerReveal.tsx:AnswerReveal': {
    summary:
      'Conceals a saved answer until the learner requests it, animates reveal and hide accessibly, and delegates answer creation when nothing is stored.',
    tags: ['component', 'answer-recall', 'accessibility', 'animation']
  },
  'src/__tests__/sync.test.ts:sessionRow': {
    summary:
      'Builds a deterministic session fixture scoped to the sync-test user, with overridable identity and subject fields.',
    tags: ['test-utility', 'fixture', 'sync']
  },
  'src/lib/sync.ts:isSyncEnabled': {
    summary: 'Reports whether the remote synchronization engine is currently enabled for an authenticated user.',
    tags: ['utility', 'sync', 'state-query']
  },
  'src/lib/sync.ts:writeLocal': {
    summary: 'Persists one row to Dexie with the appropriate sync status and schedules an immediate background push when enabled.',
    tags: ['service', 'local-write', 'offline-first', 'sync']
  },
  'src/lib/sync.ts:writeLocalBatch': {
    summary:
      'Writes heterogeneous rows atomically across their Dexie tables, tracks completion, and schedules one background synchronization pass.',
    tags: ['service', 'batch-write', 'transaction', 'sync']
  },
  'src/lib/sync.ts:deleteLocal': {
    summary:
      'Deletes a local row immediately and records a durable remote-delete request for the next successful synchronization pass.',
    tags: ['service', 'deletion', 'offline-first', 'sync']
  },
  'src/lib/sync.ts:flushPushQueue': {
    summary:
      'Serializes overlapping flushes, waits for local writes, pushes pending tables in foreign-key order, drains deletes, and retries failures with bounded exponential backoff.',
    tags: ['service', 'sync', 'queue', 'retry', 'conflict-avoidance']
  },
  'src/lib/sync.ts:pullAll': {
    summary:
      'Fetches all synchronized tables concurrently for one user and merges remote rows into Dexie while preserving unsynced local changes.',
    tags: ['service', 'sync', 'conflict-resolution', 'parallel-fetch']
  },
  'src/lib/sync.ts:resumeSync': {
    summary: 'Reconciles pending pushes and stale pulls when the native application returns to the foreground.',
    tags: ['service', 'sync', 'native-runtime']
  },
  'src/lib/sync.ts:initSync': {
    summary:
      'Enables account-scoped synchronization, installs online and focus listeners once, starts a pull, and schedules pending pushes.',
    tags: ['service', 'sync', 'initialization', 'event-handler']
  },
  'src/lib/sync.ts:stopSync': {
    summary: 'Disables synchronization, clears account and pull state, and cancels the scheduled push timer.',
    tags: ['service', 'sync', 'cleanup']
  },
  'src/lib/sync.ts:_enableForTests': {
    summary: 'Test hook that enables account-scoped synchronization without installing browser event listeners.',
    tags: ['test-utility', 'sync', 'state-control']
  },
  'src/pages/Journal.tsx:Row': {
    summary:
      'Renders an expandable journal-table row with source, outcome, timing, root-cause details, image preview, editing, and concealed saved answers.',
    tags: ['component', 'journal-entry', 'root-cause-analysis', 'answer-recall']
  },
  'src/pages/Journal.tsx:attemptResult': {
    summary: 'Maps a PYQ attempt decision and correctness state to its learner-facing result label and visual tone.',
    tags: ['utility', 'pyq', 'attempt-evaluation']
  },
  'src/pages/Journal.tsx:PyqAttemptDetail': {
    summary:
      'Renders a complete immutable PYQ attempt receipt with prompt snapshot, screenshot, submitted and official answers, timing, and optional journal analysis.',
    tags: ['component', 'pyq', 'attempt-receipt', 'attempt-logging']
  },
  'src/pages/Journal.tsx:PyqSessionDetails': {
    summary:
      'Aggregates a selected PYQ session into correctness and analysis totals and renders every preserved attempt in original order.',
    tags: ['component', 'pyq', 'session-summary', 'attempt-logging']
  },
  'src/pages/Journal.tsx:Journal': {
    summary:
      'Loads local questions, sessions, and PYQ receipts; applies URL-aware multi-dimensional filters and pagination; and coordinates edit, delete, preview, and review actions.',
    tags: ['component', 'journal', 'filtering', 'pyq', 'data-management']
  },
  'src/pages/Journal.tsx:RecentSessionsCard': {
    summary:
      'Lists recent practice sessions with question counts and exposes selection, editing, and review navigation actions.',
    tags: ['component', 'session-history', 'navigation']
  },
  'src/pages/SessionActive.tsx:reconcilePattern': {
    summary:
      'Recounts a named mistake pattern from question evidence and creates or updates its local-first mastery record.',
    tags: ['service', 'pattern-analysis', 'data-reconciliation', 'local-write']
  },
  'src/pages/SessionActive.tsx:SessionActive': {
    summary:
      'Coordinates per-question and session timers, solve-to-tag transitions, evidence persistence, reattempt scheduling, interruption logging, reload recovery, and session completion.',
    tags: ['component', 'test-interface', 'attempt-logging', 'reattempts', 'timer']
  },
  'src/pages/SyllabusTracker.tsx:summariesFor': {
    summary: 'Reduces stored topic completions into per-subject counts, percentages, and not-started, active, or complete status.',
    tags: ['utility', 'syllabus', 'aggregation']
  },
  'src/pages/SyllabusTracker.tsx:nextTopicFrom': {
    summary: 'Selects the first unfinished topic from an in-progress subject, falling back to the next untouched subject.',
    tags: ['utility', 'recommendation', 'syllabus']
  },
  'src/pages/SyllabusTracker.tsx:SyllabusTracker': {
    summary:
      'Merges local and synchronized topic progress, builds practice evidence, recommends the next topic, and coordinates search, filters, completion toggles, and subject expansion.',
    tags: ['component', 'syllabus', 'progress-tracking', 'pyq-evidence', 'recommendation']
  },
  'src/pages/SyllabusTracker.tsx:SyllabusOrbit': {
    summary: 'Visualizes overall and per-subject syllabus completion as a segmented accessible progress orbit.',
    tags: ['component', 'progress-visualization', 'syllabus', 'accessibility']
  },
  'src/pages/SyllabusTracker.tsx:SubjectLedger': {
    summary:
      'Renders one expandable subject with completion progress, topic checkboxes, and evidence summaries for every visible topic.',
    tags: ['component', 'syllabus', 'progress-tracking', 'form-control']
  },
  'src/pages/SyllabusTracker.tsx:TopicEvidenceLine': {
    summary:
      'Formats a topic\'s evidence status, practice count, accuracy, open mistakes, and recency into a compact status line.',
    tags: ['component', 'pyq-evidence', 'progress-status']
  }
};

const semanticEdges = {
  2: [
    ['function:src/App.tsx:App', 'function:src/lib/theme.ts:resolveTheme', 'calls'],
    ['function:src/App.tsx:App', 'function:src/lib/theme.ts:applyTheme', 'calls'],
    ['function:src/App.tsx:App', 'function:src/lib/native.ts:configureNativeChrome', 'calls'],
    ['function:src/components/dashboard/WelcomeOverlay.tsx:WelcomeOverlay', 'function:src/lib/utils.ts:cn', 'calls'],
    ['function:src/components/shared/RequireAuth.tsx:RequireAuth', 'function:src/hooks/useAuth.ts:useAuth', 'calls'],
    ['file:src/lib/theme.ts', 'file:src/__tests__/theme.test.ts', 'tested_by'],
    ['file:src/components/shared/ThemeToggle.tsx', 'file:src/__tests__/theme.test.ts', 'tested_by'],
    ['file:src/stores/prefs.ts', 'file:src/__tests__/theme.test.ts', 'tested_by']
  ],
  3: [
    ['function:src/components/shared/ThemeToggle.tsx:ThemeToggle', 'function:src/lib/native.ts:haptic', 'calls'],
    ['function:src/components/shared/ThemeToggle.tsx:ThemeToggle', 'function:src/lib/theme.ts:resolveTheme', 'calls'],
    ['function:src/components/shared/ThemeToggle.tsx:ThemeToggle', 'function:src/lib/theme.ts:applyTheme', 'calls'],
    ['function:src/components/shared/ThemeToggle.tsx:ThemeToggle', 'function:src/lib/utils.ts:cn', 'calls'],
    ['function:src/components/ui/Toast.tsx:Toaster', 'function:src/lib/native.ts:haptic', 'calls'],
    ['function:src/components/ui/Toast.tsx:Toaster', 'function:src/lib/utils.ts:cn', 'calls'],
    ['function:src/pages/Auth.tsx:Auth', 'function:src/hooks/useAuth.ts:useAuth', 'calls'],
    ['function:src/pages/Auth.tsx:Auth', 'function:src/stores/auth.ts:preloadAuthActions', 'calls'],
    ['function:src/pages/Settings.tsx:Settings', 'function:src/hooks/useAuth.ts:useAuth', 'calls'],
    ['function:src/pages/Settings.tsx:Settings', 'function:src/stores/prefs.ts:daysSinceBackup', 'calls'],
    ['function:src/pages/Settings.tsx:Settings', 'function:src/stores/prefs.ts:needsBackupReminder', 'calls'],
    ['function:src/pages/Settings.tsx:ToggleRow', 'function:src/lib/native.ts:haptic', 'calls'],
    ['function:src/pages/Settings.tsx:InvitesCard', 'function:src/lib/utils.ts:uuid', 'calls'],
    ['function:src/pages/Settings.tsx:ProgressExportCard', 'function:src/lib/progress-export.ts:collectProgressReport', 'calls'],
    ['function:src/pages/Settings.tsx:ProgressExportCard', 'function:src/lib/progress-export.ts:downloadProgressReport', 'calls'],
    ['function:src/pages/Settings.tsx:DataCard', 'function:src/lib/backup.ts:exportAll', 'calls'],
    ['function:src/pages/Settings.tsx:DataCard', 'function:src/lib/backup.ts:importEnvelope', 'calls']
  ],
  4: [
    ['function:src/components/shared/AnswerReveal.tsx:AnswerReveal', 'function:src/lib/utils.ts:cn', 'calls'],
    ['file:src/components/shared/AnswerReveal.tsx', 'file:src/__tests__/answer-reveal.test.tsx', 'tested_by'],
    ['file:src/pages/Journal.tsx', 'file:src/__tests__/journal-ui.test.tsx', 'tested_by'],
    ['file:src/lib/db.ts', 'file:src/__tests__/journal-ui.test.tsx', 'tested_by'],
    ['file:src/lib/sync.ts', 'file:src/__tests__/sync.test.ts', 'tested_by'],
    ['file:src/lib/db.ts', 'file:src/__tests__/sync.test.ts', 'tested_by']
  ],
  5: [
    ['function:src/lib/sync.ts:writeLocal', 'function:src/lib/db.ts:table', 'calls'],
    ['function:src/lib/sync.ts:writeLocalBatch', 'function:src/lib/db.ts:table', 'calls'],
    ['function:src/lib/sync.ts:deleteLocal', 'function:src/lib/db.ts:table', 'calls'],
    ['function:src/lib/sync.ts:flushPushQueue', 'function:src/lib/db.ts:table', 'calls'],
    ['function:src/lib/sync.ts:pullAll', 'function:src/lib/db.ts:table', 'calls'],
    ['function:src/pages/Journal.tsx:Row', 'function:src/lib/utils.ts:formatDate', 'calls'],
    ['function:src/pages/Journal.tsx:Row', 'function:src/lib/subjectInk.ts:subjectInk', 'calls'],
    ['function:src/pages/Journal.tsx:Journal', 'function:src/lib/sync.ts:writeLocal', 'calls'],
    ['function:src/pages/Journal.tsx:Journal', 'function:src/lib/sync.ts:deleteLocal', 'calls'],
    ['function:src/pages/SessionActive.tsx:reconcilePattern', 'function:src/lib/sync.ts:writeLocal', 'calls'],
    ['function:src/pages/SessionActive.tsx:SessionActive', 'function:src/lib/sync.ts:writeLocal', 'calls'],
    ['function:src/pages/SessionActive.tsx:SessionActive', 'function:src/lib/sync.ts:deleteLocal', 'calls'],
    ['function:src/pages/SessionActive.tsx:SessionActive', 'function:src/lib/reattempt.ts:needsReattempt', 'calls'],
    ['function:src/pages/SessionActive.tsx:SessionActive', 'function:src/lib/reattempt.ts:scheduleReattempt', 'calls'],
    ['function:src/pages/SessionActive.tsx:SessionActive', 'function:src/lib/planner-execution.ts:updatePlannerBlockExecution', 'calls'],
    ['function:src/pages/SyllabusTracker.tsx:SyllabusTracker', 'function:src/lib/topic-evidence.ts:buildTopicEvidence', 'calls'],
    ['function:src/pages/SyllabusTracker.tsx:SyllabusTracker', 'function:src/stores/auth.ts:currentUserId', 'calls'],
    ['function:src/pages/SyllabusTracker.tsx:SyllabusTracker', 'function:src/stores/topic-progress.ts:mergeTopicProgressRows', 'calls'],
    ['function:src/pages/SyllabusTracker.tsx:SyllabusTracker', 'function:src/stores/topic-progress.ts:syncTopicProgressFromDb', 'calls'],
    ['function:src/pages/SyllabusTracker.tsx:SyllabusTracker', 'function:src/stores/topic-progress.ts:topicProgressId', 'calls'],
    ['file:src/lib/sync.ts', 'file:src/__tests__/sync.test.ts', 'tested_by']
  ]
};

const weights = {
  contains: 1.0,
  imports: 0.7,
  calls: 0.8,
  exports: 0.8,
  tested_by: 0.5
};

function complexityForLines(lines) {
  if (lines > 200) return 'complex';
  if (lines >= 50) return 'moderate';
  return 'simple';
}

function fileNode(result) {
  const meta = fileMeta[result.path];
  if (!meta) throw new Error(`Missing file metadata for ${result.path}`);
  return {
    id: `file:${result.path}`,
    type: 'file',
    name: path.basename(result.path),
    filePath: result.path,
    summary: meta.summary,
    tags: meta.tags,
    complexity: complexityForLines(result.nonEmptyLines)
  };
}

function functionNode(result, fn) {
  const key = `${result.path}:${fn.name}`;
  const meta = functionMeta[key];
  if (!meta) throw new Error(`Missing function metadata for ${key}`);
  return {
    id: `function:${key}`,
    type: 'function',
    name: fn.name,
    filePath: result.path,
    lineRange: [fn.startLine, fn.endLine],
    summary: meta.summary,
    tags: meta.tags,
    complexity: complexityForLines(fn.endLine - fn.startLine + 1)
  };
}

function addEdge(edges, source, target, type) {
  if (source === target) throw new Error(`Self edge: ${source}`);
  if (!(type in weights)) throw new Error(`Unsupported edge type: ${type}`);
  edges.push({ source, target, type, direction: 'forward', weight: weights[type] });
}

function validateFragment(fragment, index, batch, emittedNodeIds) {
  if (!Array.isArray(fragment.nodes) || !Array.isArray(fragment.edges)) {
    throw new Error(`Batch ${index} does not contain nodes and edges arrays`);
  }
  const ids = new Set(fragment.nodes.map((node) => node.id));
  if (ids.size !== fragment.nodes.length) throw new Error(`Duplicate node id in batch ${index}`);
  const knownFilePaths = new Set();
  const knownSymbols = new Set();
  for (const values of Object.values(batch.batchImportData)) {
    for (const value of values) knownFilePaths.add(value);
  }
  for (const [sourcePath, neighbors] of Object.entries(batch.neighborMap)) {
    knownFilePaths.add(sourcePath);
    for (const neighbor of neighbors) {
      knownFilePaths.add(neighbor.path);
      for (const symbol of neighbor.symbols) knownSymbols.add(`${neighbor.path}:${symbol}`);
    }
  }
  for (const node of fragment.nodes) {
    if (!node.summary || !Array.isArray(node.tags) || node.tags.length < 3 || node.tags.length > 5) {
      throw new Error(`Invalid metadata for ${node.id}`);
    }
    if (node.id.includes(stalePath)) throw new Error(`Stale node emitted: ${node.id}`);
  }
  for (const edge of fragment.edges) {
    if (edge.source.includes(stalePath) || edge.target.includes(stalePath)) {
      throw new Error(`Stale edge emitted: ${edge.source} -> ${edge.target}`);
    }
    for (const endpoint of [edge.source, edge.target]) {
      if (ids.has(endpoint) || emittedNodeIds.has(endpoint)) continue;
      if (endpoint.startsWith('file:') && knownFilePaths.has(endpoint.slice(5))) continue;
      const functionMatch = endpoint.match(/^(?:function|class):(.+):([^:]+)$/);
      if (functionMatch && knownSymbols.has(`${functionMatch[1]}:${functionMatch[2]}`)) continue;
      throw new Error(`Batch ${index} has unresolved edge endpoint ${endpoint}`);
    }
  }
}

for (const index of [2, 3, 4, 5]) {
  const batch = batchesDoc.batches.find((candidate) => candidate.batchIndex === index);
  if (!batch) throw new Error(`Missing batch ${index}`);
  const extraction = JSON.parse(
    fs.readFileSync(path.join(uaDir, 'tmp', `ua-file-extract-results-${index}.json`), 'utf8')
  );
  if (!extraction.scriptCompleted) throw new Error(`Extraction did not complete for batch ${index}`);

  const nodes = [];
  const edges = [];
  const emittedNodeIds = new Set();
  const resultPaths = new Set(extraction.results.map((result) => result.path));

  for (const result of extraction.results) {
    const parent = fileNode(result);
    nodes.push(parent);
    emittedNodeIds.add(parent.id);
    const exported = new Set((result.exports ?? []).map((item) => item.name));
    for (const fn of result.functions ?? []) {
      const significant = exported.has(fn.name) || fn.endLine - fn.startLine + 1 >= 10;
      if (!significant) continue;
      const child = functionNode(result, fn);
      nodes.push(child);
      emittedNodeIds.add(child.id);
      addEdge(edges, parent.id, child.id, 'contains');
      if (exported.has(fn.name)) addEdge(edges, parent.id, child.id, 'exports');
    }
  }

  for (const [sourcePath, targets] of Object.entries(batch.batchImportData)) {
    if (!resultPaths.has(sourcePath)) continue;
    for (const targetPath of targets) {
      if (targetPath === stalePath) continue;
      addEdge(edges, `file:${sourcePath}`, `file:${targetPath}`, 'imports');
    }
  }

  for (const [source, target, type] of semanticEdges[index]) addEdge(edges, source, target, type);

  const dedupedEdges = [
    ...new Map(edges.map((edge) => [`${edge.source}\u0000${edge.target}\u0000${edge.type}`, edge])).values()
  ];
  nodes.sort((left, right) => left.id.localeCompare(right.id));
  dedupedEdges.sort((left, right) =>
    `${left.source}\u0000${left.type}\u0000${left.target}`.localeCompare(
      `${right.source}\u0000${right.type}\u0000${right.target}`
    )
  );

  const fragment = { nodes, edges: dedupedEdges };
  if (nodes.length > 60 || dedupedEdges.length > 120) {
    throw new Error(
      `Batch ${index} requires multipart output (${nodes.length} nodes, ${dedupedEdges.length} edges)`
    );
  }
  validateFragment(fragment, index, batch, emittedNodeIds);
  const outputPath = path.join(uaDir, 'intermediate', `batch-${index}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(fragment, null, 2)}\n`);
  console.log(
    `batch ${index}: ${nodes.length} nodes, ${dedupedEdges.length} edges, skipped ${(extraction.filesSkipped ?? []).join(',') || 'none'}`
  );
}
