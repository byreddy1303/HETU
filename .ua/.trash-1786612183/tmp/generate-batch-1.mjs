import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu';
const uaDir = path.join(projectRoot, '.ua');
const extraction = JSON.parse(readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-1.json'), 'utf8'));
const batches = JSON.parse(readFileSync(path.join(uaDir, 'intermediate/batches.json'), 'utf8'));
const batch = batches.batches.find((candidate) => candidate.batchIndex === 1);
if (!batch) throw new Error('Original batchIndex 1 was not found');

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
if (batch.files.length !== extraction.results.length) throw new Error('Batch/extraction file count mismatch');
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing extraction result for ${file.path}`);
  for (const field of ['path', 'language', 'fileCategory']) {
    if (result[field] !== file[field]) throw new Error(`Extraction changed ${field} for ${file.path}`);
  }
  if (result.totalLines !== file.sizeLines) throw new Error(`Extraction changed sizeLines for ${file.path}`);
}

const fileSummaries = {
  'src/__tests__/cron-auth.test.ts': 'Verifies JWT role-claim extraction for valid service-role tokens, non-service roles, malformed tokens, and missing claims.',
  'src/__tests__/digest-schedule.test.ts': 'Exercises timezone-aware digest clock calculation and the grace-window logic that decides when a scheduled digest is due.',
  'src/__tests__/study-notification-copy.test.ts': 'Validates study-plan parsing and concise notification copy for detailed day plans and daily PYQ reminders.',
  'src/__tests__/telegram.test.ts': 'Covers Telegram command parsing, timezone date helpers, timetable and digest renderers, message limits, and deterministic motivational content.',
  'src/components/shared/DailyQuote.tsx': 'Renders a deterministic motivational quote selected from the current date and authenticated user, giving the shared shell stable daily encouragement.',
  'src/lib/motivational-quotes.ts': 'Exposes the shared quote catalog through browser-facing aliases and provides deterministic daily and random quote selection helpers.',
  'src/lib/one_liners.ts': 'Provides a compatibility alias for motivational one-liners and deterministic date-and-seed selection.',
  'supabase/functions/_shared/cors.ts': 'Defines permissive CORS headers and a consistent JSON Response helper reused by Supabase Edge Function handlers.',
  'supabase/functions/_shared/cron-auth.ts': 'Decodes JWT payloads defensively to identify service-role cron invocations without accepting malformed tokens.',
  'supabase/functions/_shared/digest-schedule.ts': 'Computes a user-local calendar clock and determines whether a configured digest time falls within the current grace window.',
  'supabase/functions/_shared/email.ts': 'Routes transactional email through Gmail or Resend and builds escaped HTML templates for access, invite, PIN-reset, and buddy workflows.',
  'supabase/functions/_shared/push.ts': 'Provides Web Push and Firebase Cloud Messaging delivery, service-account token exchange, payload normalization, and permanent-error classification.',
  'supabase/functions/_shared/quotes.ts': 'Stores the curated motivational quote catalog and selects stable daily quotes and time-sensitive greetings.',
  'supabase/functions/_shared/study-notification-copy.ts': 'Parses planner blocks and produces compact, actionable copy for detailed study-plan and daily PYQ notifications.',
  'supabase/functions/_shared/telegram.ts': 'Implements Telegram command parsing, timezone date helpers, HTML-safe study-plan renderers, and Bot API message delivery.',
  'supabase/functions/approve-request/index.ts': 'Authenticates the account owner, approves an access request through a database RPC, creates an invite link, and emails it to the requester.',
  'supabase/functions/buddy-notifications/index.ts': 'Processes buddy-message notification outbox jobs, creates secure Android actions and inline replies, suppresses in-chat or snoozed delivery, and dispatches push notifications.',
  'supabase/functions/buddy-request/index.ts': 'Creates an authenticated buddy request through a database RPC and sends best-effort email and push notifications without exposing account existence.',
  'supabase/functions/compute-readiness/index.ts': 'Runs an authorized weekly cron calculation over question, pattern, re-attempt, and exam data and upserts readiness snapshots for users.',
  'supabase/functions/daily-digest/index.ts': 'Selects due recipients by local schedule, builds study digests from planner and re-attempt data, and delivers them through email and Telegram.',
  'supabase/functions/decline-request/index.ts': 'Allows the account owner to decline an access request through a database RPC and optionally sends a polite reason by email.',
  'supabase/functions/login/index.ts': 'Maps a username to its private authentication email and performs PIN-based Supabase sign-in while returning uniform errors to prevent account discovery.',
  'supabase/functions/notification-actions/index.ts': 'Validates opaque notification action tokens and delegates bounded buddy and study actions to a database RPC.',
  'supabase/functions/request-access/index.ts': 'Validates and rate-limits public access requests, stores them without leaking existing accounts, and notifies the owner by email.',
  'supabase/functions/request-pin-reset/index.ts': 'Accepts a username, generates a recovery link for the associated account, and sends a PIN-reset email without exposing account existence.',
  'supabase/functions/schedule-reattempts/index.ts': 'Nightly cron wrapper that invokes the database routine responsible for rolling overdue re-attempts forward.',
  'supabase/functions/signup-via-invite/index.ts': 'Validates invite-bound identity details, creates an invite-only PIN account atomically, and prevents email or username pivoting.',
  'supabase/functions/study-notifications/index.ts': 'Loads study context, creates actionable notification events, sends scheduled category reminders, and retries due reminders across push subscriptions.',
  'supabase/functions/telegram-webhook/index.ts': 'Handles authenticated Telegram webhook commands for connecting, pausing, checking, and rendering today, tomorrow, and weekly study plans.'
};

const functionSummaries = {
  DailyQuote: 'Selects and renders the authenticated user’s deterministic quote for the current day.',
  quoteForDate: 'Selects a stable motivational quote for an ISO date and optional seed salt.',
  randomQuote: 'Returns a randomly selected motivational quote from the shared catalog.',
  pickOneLinerFor: 'Selects a stable one-liner for a date and seed through the shared quote picker.',
  json: 'Serializes a value into a JSON Response with shared CORS and content-type headers.',
  jwtRoleClaim: 'Safely decodes a JWT payload and returns its string role claim when available.',
  localDigestClock: 'Converts an instant into local date, weekday, hour, and minute fields for a requested timezone.',
  isDigestTimeDue: 'Checks whether a local clock is at or shortly after a configured digest time.',
  sendViaGmail: 'Sends one transactional email through a configured Gmail SMTP transport.',
  sendViaResend: 'Sends one transactional email through the Resend HTTP API and normalizes provider errors.',
  sendEmail: 'Chooses the configured email provider and returns a normalized delivery result.',
  shell: 'Wraps notification-specific markup in the shared branded responsive email document.',
  newRequestNotification: 'Builds the owner email announcing a new access request.',
  inviteApproved: 'Builds the requester email containing an approved signup invitation.',
  pinResetRequested: 'Builds the account-recovery email containing a PIN reset link.',
  buddyRequestReceived: 'Builds the email notifying a user that a buddy request arrived.',
  inviteDeclined: 'Builds the email explaining that an access request was declined.',
  truncate: 'Clamps optional push text to a provider-safe maximum length.',
  serviceAccount: 'Loads and validates Firebase service-account credentials from the runtime environment.',
  getFcmAccessToken: 'Creates a signed service-account assertion and exchanges it for a cached Firebase access token.',
  sendWebPush: 'Delivers normalized notification copy to a browser Web Push subscription.',
  sendNativePush: 'Builds and sends an Android FCM payload with routes, actions, and optional inline reply metadata.',
  deliverToSubscription: 'Dispatches notification copy through the web or native provider selected by the subscription platform.',
  pickQuoteForDay: 'Hashes a date and seed into a stable index in the curated quote catalog.',
  greetingForHour: 'Returns a personalized morning, afternoon, or evening greeting for a local hour.',
  formatMinutes: 'Formats a minute count as compact hours-and-minutes notification text.',
  parseStudyPlanBlocks: 'Parses serialized planner data into normalized study blocks while tolerating invalid input.',
  detailedDayPlanCopy: 'Builds concise notification title and body text from the day’s remaining planner blocks.',
  dailyPyqCopy: 'Builds a daily PYQ reminder from unfinished PYQ blocks and attempt context.',
  parseTelegramCommand: 'Normalizes Telegram bot input into a supported command without bot-name suffixes.',
  parseTelegramStudySessions: 'Parses stored planner session data into normalized Telegram-renderable sessions.',
  isoDateForTimezone: 'Formats an instant as an ISO calendar date in a requested timezone.',
  weekIsoDatesForTimezone: 'Returns the seven local ISO dates in the week containing the supplied instant.',
  tomorrowIsoDateForTimezone: 'Returns tomorrow’s local ISO date for a supplied instant and timezone.',
  escapeTelegramHtml: 'Escapes user-controlled text for Telegram’s HTML parse mode.',
  airJournalUrl: 'Builds an application deep link for a normalized route.',
  escapeCompactTelegramHtml: 'Compacts visible text and escapes it without exceeding Telegram’s encoded-length constraints.',
  timetableDayLabel: 'Formats an ISO date as a short weekday-and-day timetable label.',
  timetableWeekLabel: 'Formats an ISO date as a short week range label.',
  fullDateLabel: 'Formats an ISO date as a full human-readable calendar label.',
  renderTelegramDay: 'Renders one day’s sessions, due re-attempts, and actions as bounded Telegram HTML.',
  renderTelegramDigest: 'Renders the standard daily Telegram digest from study context.',
  renderTelegramTodayUpdate: 'Renders an on-demand current-day Telegram plan update.',
  renderTelegramConnectionTest: 'Renders the confirmation message used to test a Telegram connection.',
  renderTelegramTimetable: 'Renders a grouped weekly study timetable within Telegram message limits.',
  renderTelegramTomorrowPlan: 'Renders tomorrow’s planned sessions and navigation action for Telegram.',
  sendTelegramMessage: 'Posts an HTML message and optional application button through the Telegram Bot API.',
  inlineReplyToken: 'Creates a signed, hashed token bound to a buddy message, device subscription, and recipient.',
  notificationActionToken: 'Persists a short-lived token authorizing bounded actions for one buddy notification.',
  notificationCopyForSubscription: 'Adds platform-specific Android actions and inline reply metadata to buddy notification copy.',
  notificationCopy: 'Builds privacy-aware buddy-message notification text and route metadata.',
  finishJob: 'Marks an outbox job complete, retryable, or failed with normalized timing and error data.',
  processJob: 'Loads a buddy message and recipient subscriptions, records deliveries, applies suppression rules, and sends each notification.',
  authenticatedUserId: 'Resolves the signed-in user ID from a request bearer token.',
  localDate: 'Formats an instant as a calendar date in a user timezone with a UTC fallback.',
  handleRequest: 'Authorizes a digest invocation, selects due recipients, builds channel content, sends it, and records delivery dates.',
  telegramDateLabel: 'Formats an ISO date for use in Telegram digest headings.',
  buildDigest: 'Loads planner, re-attempt, question, completion, and review data and assembles email and Telegram digest content.',
  renderEmail: 'Renders a branded responsive HTML email from assembled daily digest sections.',
  validate: 'Normalizes and validates public access-request fields before persistence.',
  inviteBundle: 'Loads an invite together with the account request that established its authoritative identity.',
  issueActionToken: 'Creates and stores a short-lived token for the actions attached to a study notification.',
  bodyFor: 'Selects contextual notification copy for a study category from the user’s current progress data.',
  loadContext: 'Loads planner, attempt, question, formula, pattern, readiness, and review signals needed for study notifications.',
  studyCopy: 'Combines category metadata, contextual copy, and action-token routes into one push payload.',
  eventCopy: 'Rebuilds push copy for a persisted study notification reminder event.',
  upsertEvent: 'Creates or updates the idempotent notification event for a user, subscription, category, and local date.',
  sendScheduled: 'Builds, persists, and delivers scheduled study notifications while recording provider outcomes.',
  sendDueReminders: 'Finds reminders whose delay has elapsed, validates current settings, sends them, and records outcomes.',
  ensureTelegramCommandMenu: 'Registers the supported HETU commands with Telegram once per warm function instance.'
};

function complexity(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

function fileTags(filePath) {
  if (filePath.includes('/__tests__/')) {
    const domain = filePath.includes('telegram') ? 'telegram' : filePath.includes('digest') ? 'scheduling' : filePath.includes('cron') ? 'authorization' : 'study-notifications';
    return ['test', 'vitest', domain];
  }
  if (filePath.endsWith('DailyQuote.tsx')) return ['component', 'daily-quote', 'motivational-content'];
  if (filePath.includes('motivational-quotes') || filePath.includes('one_liners')) return ['utility', 'motivational-content', 'quote-selection'];
  if (filePath.includes('/_shared/')) {
    const base = path.basename(filePath, '.ts');
    const domains = {
      cors: ['http', 'cors'],
      'cron-auth': ['authorization', 'jwt'],
      'digest-schedule': ['scheduling', 'timezone'],
      email: ['email', 'notification-copy'],
      push: ['push-notifications', 'delivery'],
      quotes: ['motivational-content', 'quote-selection'],
      'study-notification-copy': ['study-notifications', 'notification-copy'],
      telegram: ['telegram', 'message-formatting']
    };
    return ['service', ...(domains[base] ?? ['shared-utility', 'supabase-function'])];
  }
  const folder = filePath.split('/').at(-2);
  const domain = folder === 'approve-request' || folder === 'decline-request' || folder === 'request-access'
    ? 'access-control'
    : folder === 'login' || folder === 'signup-via-invite' || folder === 'request-pin-reset'
      ? 'authentication'
      : folder?.replaceAll('_', '-');
  return ['api-handler', 'supabase-function', domain || 'backend'];
}

function functionTags(filePath) {
  if (filePath.endsWith('DailyQuote.tsx')) return ['component', 'react', 'daily-quote'];
  if (filePath.includes('motivational-quotes') || filePath.includes('one_liners') || filePath.endsWith('/quotes.ts')) return ['utility', 'motivational-content', 'quote-selection'];
  if (filePath.endsWith('/cors.ts')) return ['utility', 'http', 'serialization'];
  if (filePath.endsWith('/cron-auth.ts')) return ['utility', 'authorization', 'jwt'];
  if (filePath.endsWith('/digest-schedule.ts')) return ['utility', 'scheduling', 'timezone'];
  if (filePath.endsWith('/email.ts')) return ['service', 'email', 'notification-copy'];
  if (filePath.endsWith('/push.ts')) return ['service', 'push-notifications', 'delivery'];
  if (filePath.endsWith('/study-notification-copy.ts')) return ['utility', 'study-planning', 'notification-copy'];
  if (filePath.endsWith('/telegram.ts')) return ['service', 'telegram', 'message-formatting'];
  if (filePath.includes('/buddy-notifications/')) return ['service', 'buddy-notifications', 'push-notifications'];
  if (filePath.includes('/compute-readiness/')) return ['utility', 'readiness', 'date-handling'];
  if (filePath.includes('/daily-digest/')) return ['service', 'daily-digest', 'notification'];
  if (filePath.includes('/request-access/')) return ['api-handler', 'access-control', 'validation'];
  if (filePath.includes('/signup-via-invite/')) return ['api-handler', 'authentication', 'invite'];
  if (filePath.includes('/study-notifications/')) return ['service', 'study-notifications', 'push-notifications'];
  if (filePath.includes('/telegram-webhook/')) return ['api-handler', 'telegram', 'webhook'];
  return ['utility', 'backend', 'typescript'];
}

const nodes = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  const summary = fileSummaries[file.path];
  if (!summary) throw new Error(`Missing file summary for ${file.path}`);
  const node = {
    id: `file:${file.path}`,
    type: 'file',
    name: path.basename(file.path),
    filePath: file.path,
    summary,
    tags: fileTags(file.path),
    complexity: complexity(result.nonEmptyLines)
  };
  if (file.path.includes('/_shared/') || file.path.startsWith('supabase/functions/')) {
    node.languageNotes = 'TypeScript targeting the Deno-based Supabase Functions runtime.';
  }
  nodes.push(node);

  const exportedNames = new Set((result.exports ?? []).map((item) => item.name));
  for (const fn of result.functions ?? []) {
    const exported = exportedNames.has(fn.name);
    const significant = fn.endLine - fn.startLine + 1 >= 10 || exported;
    if (!significant) continue;
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

  for (const cls of result.classes ?? []) {
    const exported = exportedNames.has(cls.name);
    const significant = cls.endLine - cls.startLine + 1 >= 20 || (cls.methods?.length ?? 0) >= 2 || exported;
    if (!significant) continue;
    if (cls.name !== 'PushDeliveryError') throw new Error(`Missing class summary for ${file.path}:${cls.name}`);
    nodes.push({
      id: `class:${file.path}:${cls.name}`,
      type: 'class',
      name: cls.name,
      filePath: file.path,
      lineRange: [cls.startLine, cls.endLine],
      summary: 'Carries normalized push-provider failure details, including whether a subscription should be disabled permanently.',
      tags: ['error-handling', 'push-notifications', 'delivery'],
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

for (const testFile of batch.files.filter((file) => file.path.includes('/__tests__/'))) {
  for (const productionPath of batch.batchImportData[testFile.path] ?? []) {
    edges.push({
      source: `file:${productionPath}`,
      target: `file:${testFile.path}`,
      type: 'tested_by',
      direction: 'forward',
      weight: 0.5
    });
  }
}

const expectedImportCount = Object.values(batch.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
const actualImportCount = edges.filter((edge) => edge.type === 'imports').length;
if (actualImportCount !== expectedImportCount) {
  throw new Error(`Import edge mismatch: expected ${expectedImportCount}, generated ${actualImportCount}`);
}
for (const edge of edges) {
  if (edge.source === edge.target) throw new Error(`Self edge generated for ${edge.source}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedPaths = batch.files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
const chunkSize = Math.ceil(sortedPaths.length / partCount);
for (let index = 0; index < partCount; index += 1) {
  const partPaths = new Set(sortedPaths.slice(index * chunkSize, (index + 1) * chunkSize));
  const partNodes = nodes.filter((node) => partPaths.has(node.filePath));
  const partNodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partNodeIds.has(edge.source));
  const part = { nodes: partNodes, edges: partEdges };
  writeFileSync(
    path.join(uaDir, `intermediate/batch-1-part-${index + 1}.json`),
    `${JSON.stringify(part, null, 2)}\n`,
    'utf8'
  );
}

console.log(JSON.stringify({ partCount, nodeCount: nodes.length, edgeCount: edges.length, importCount: actualImportCount }));
