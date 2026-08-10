// Opt-in daily reminders for every authenticated study surface.
// Cron runs every minute; per-user timezone/preferences decide what is due.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { isDigestTimeDue, localDigestClock } from '../_shared/digest-schedule.ts';
import {
  deliverToSubscription,
  truncate,
  type PushCopy,
  type SubscriptionRow
} from '../_shared/push.ts';
import {
  dailyPyqCopy,
  detailedDayPlanCopy,
  parseStudyPlanBlocks,
  type StudyPlanBlock,
  type StudyPlanItem
} from '../_shared/study-notification-copy.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('BUDDY_PUSH_CRON_SECRET') ?? '';
const ACTION_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/notification-actions`;
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CATEGORIES = [
  'dashboard',
  'planner',
  'reattempts',
  'pyq',
  'sessions',
  'log',
  'journal',
  'patterns',
  'heatmap',
  'calibration',
  'readiness',
  'trigger_drill',
  'formulas',
  'syllabus',
  'weekly_review'
] as const;
type Category = (typeof CATEGORIES)[number];

interface UserRow {
  id: string;
  name: string;
  timezone: string | null;
  study_notifications_enabled: boolean;
}

interface PreferenceRow {
  user_id: string;
  category: Category;
  enabled: boolean;
  hour_local: number;
  minute_local: number;
  last_sent_on: string | null;
  muted_until: string | null;
}

interface StudyEventRow {
  id: string;
  user_id: string;
  subscription_id: string;
  category: Category;
  local_date: string;
  title: string;
  body: string;
  route: string;
  primary_label: string;
  remind_at: string | null;
  reminder_sent_at: string | null;
}

interface StudyContext {
  planBlocks: StudyPlanBlock[];
  openPlanItems: StudyPlanItem[];
  reattemptsDue: number;
  pyqLast24h: number;
  sessionsToday: number;
  questionsLast24h: number;
  questionsLast7d: number;
  markedLast24h: number;
  formulasDue: number;
  patternCount: number;
  weakPatterns: number;
  triggerCount: number;
  readinessScore: number | null;
  weeklyFix: string | null;
}

const CATEGORY_META: Record<Category, { label: string; route: string; action: string }> = {
  dashboard: { label: 'Daily overview', route: '/', action: 'View today' },
  planner: { label: 'Planner', route: '/planner', action: 'Open plan' },
  reattempts: { label: 'Re-attempts', route: '/reattempts', action: 'Start queue' },
  pyq: { label: 'PYQ practice', route: '/pyq', action: 'Solve PYQs' },
  sessions: { label: 'Focused session', route: '/session/new', action: 'Start session' },
  log: { label: 'Question log', route: '/log', action: 'Log a question' },
  journal: { label: 'Journal', route: '/journal', action: 'Write reflection' },
  patterns: { label: 'Pattern library', route: '/patterns', action: 'Review patterns' },
  heatmap: { label: 'Study heatmap', route: '/heatmap', action: 'View consistency' },
  calibration: { label: 'Calibration', route: '/calibration', action: 'Check decisions' },
  readiness: { label: 'Exam readiness', route: '/readiness', action: 'View next move' },
  trigger_drill: { label: 'Trigger drill', route: '/trigger-drill', action: 'Run drill' },
  formulas: { label: 'Formula review', route: '/formulas', action: 'Review formulas' },
  syllabus: { label: 'Syllabus tracker', route: '/syllabus', action: 'Update coverage' },
  weekly_review: { label: 'Weekly review', route: '/weekly-review', action: 'Review the week' }
};

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function category(value: unknown): Category | null {
  return typeof value === 'string' && CATEGORIES.includes(value as Category)
    ? (value as Category)
    : null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function freshActionToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64Url(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return { token, hash: hex(new Uint8Array(digest)) };
}

async function issueActionToken(args: {
  sourceKey: string;
  sourceId: string;
  userId: string;
  subscriptionId: string;
  category: Category;
  route: string;
}): Promise<string> {
  const actionToken = await freshActionToken();
  const { error } = await admin.from('notification_action_tokens').upsert(
    {
      token_hash: actionToken.hash,
      source_key: args.sourceKey,
      source_kind: 'study',
      source_id: args.sourceId,
      user_id: args.userId,
      subscription_id: args.subscriptionId,
      category: args.category,
      route: args.route,
      allowed_actions: ['study_remind_1h', 'study_mute'],
      used_actions: [],
      expires_at: new Date(Date.now() + 8 * 86_400_000).toISOString(),
      updated_at: new Date().toISOString()
    },
    { onConflict: 'source_key' }
  );
  if (error) throw new Error(error.message);
  return actionToken.token;
}

function bodyFor(categoryName: Category, context: StudyContext): string {
  switch (categoryName) {
    case 'dashboard':
      return detailedDayPlanCopy({
        blocks: context.planBlocks,
        openItems: context.openPlanItems,
        reattemptsDue: context.reattemptsDue
      }).body;
    case 'planner':
      return detailedDayPlanCopy({
        blocks: context.planBlocks,
        openItems: context.openPlanItems,
        reattemptsDue: context.reattemptsDue
      }).body;
    case 'reattempts':
      return context.reattemptsDue > 0
        ? `${context.reattemptsDue} re-attempts are due. Clear the oldest one first.`
        : 'The due queue is clear. Review what becomes due next.';
    case 'pyq':
      return dailyPyqCopy({
        blocks: context.planBlocks,
        attemptedLast24h: context.pyqLast24h
      }).body;
    case 'sessions':
      return `${context.sessionsToday} sessions logged today. Protect the next focused block.`;
    case 'log':
      return context.questionsLast24h > 0
        ? `${context.questionsLast24h} questions logged recently. Capture the next one while the reasoning is fresh.`
        : 'Capture one solved question, decision, and mistake while the reasoning is fresh.';
    case 'journal':
      return context.questionsLast24h > 0
        ? `Reflect on the ${context.questionsLast24h} questions you handled recently.`
        : 'Record one honest observation about today’s preparation.';
    case 'patterns':
      return context.patternCount > 0
        ? `${context.weakPatterns} of ${context.patternCount} patterns still need stronger reflex.`
        : 'Name the pattern behind your next solved question.';
    case 'heatmap':
      return `${context.questionsLast7d} questions logged across the last seven days. Check the gaps.`;
    case 'calibration':
      return `${context.markedLast24h} mark/skip decisions recorded recently. Inspect whether confidence matched accuracy.`;
    case 'readiness':
      return context.readinessScore === null
        ? 'Open readiness to generate your evidence-based next move.'
        : `Current readiness is ${context.readinessScore}/100. Act on the weakest component.`;
    case 'trigger_drill':
      return context.triggerCount > 0
        ? `${context.triggerCount} trigger phrases are available. Run a short reflex drill.`
        : 'Add a trigger phrase from the next question you review.';
    case 'formulas':
      return context.formulasDue > 0
        ? `${context.formulasDue} formulas are due for review.`
        : 'Formula queue clear. Scan the library for one fragile recall.';
    case 'syllabus':
      return 'Update coverage using evidence from your latest sessions and PYQs.';
    case 'weekly_review':
      return context.weeklyFix
        ? `Current fix: ${truncate(context.weeklyFix, 180)}`
        : 'Turn this week’s mistakes into one concrete correction.';
  }
}

async function loadContext(userId: string, today: string): Promise<StudyContext> {
  const recent24h = new Date(Date.now() - 86_400_000).toISOString();
  const recent7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    storedPlan,
    planItemsResult,
    completionsResult,
    reattemptResult,
    pyqResult,
    sessionResult,
    recentQuestionsResult,
    weeklyQuestionsResult,
    markedResult,
    formulaResult,
    patternResult,
    triggerResult,
    readinessResult,
    weeklyResult
  ] = await Promise.all([
    admin
      .from('planner_day_plans')
      .select('sessions')
      .eq('user_id', userId)
      .eq('plan_date', today)
      .maybeSingle(),
    admin.rpc('plan_items_due_on', { uid: userId, on_date: today }),
    admin
      .from('plan_item_completions')
      .select('item_id')
      .eq('user_id', userId)
      .eq('on_date', today),
    admin
      .from('reattempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('scheduled_date', today)
      .neq('stage', 'MASTERED'),
    admin
      .from('pyq_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('attempted_at', recent24h),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('date', today),
    admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', recent24h),
    admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', recent7d),
    admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('mark_decision', 'is', null)
      .gte('created_at', recent24h),
    admin
      .from('formulas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_review', today),
    admin.from('patterns').select('mastery_level').eq('user_id', userId),
    admin
      .from('trigger_phrases')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    admin
      .from('readiness_snapshots')
      .select('score')
      .eq('user_id', userId)
      .order('on_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('weekly_reviews')
      .select('this_weeks_fix')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const sessions = (storedPlan.data as { sessions?: unknown } | null)?.sessions;
  const planBlocks = parseStudyPlanBlocks(sessions);
  const completed = new Set(
    ((completionsResult.data as Array<{ item_id: string }> | null) ?? []).map((row) => row.item_id)
  );
  const planItems =
    (planItemsResult.data as Array<{
      id: string;
      title: string;
      subject: string | null;
      target_min: number | null;
    }> | null) ?? [];
  const patterns = (patternResult.data as Array<{ mastery_level: number | null }> | null) ?? [];

  return {
    planBlocks,
    openPlanItems: planItems
      .filter((item) => !completed.has(item.id))
      .map((item) => ({
        id: item.id,
        title: item.title,
        subject: item.subject,
        targetMin: item.target_min
      })),
    reattemptsDue: reattemptResult.count ?? 0,
    pyqLast24h: pyqResult.count ?? 0,
    sessionsToday: sessionResult.count ?? 0,
    questionsLast24h: recentQuestionsResult.count ?? 0,
    questionsLast7d: weeklyQuestionsResult.count ?? 0,
    markedLast24h: markedResult.count ?? 0,
    formulasDue: formulaResult.count ?? 0,
    patternCount: patterns.length,
    weakPatterns: patterns.filter((row) => (row.mastery_level ?? 0) < 3).length,
    triggerCount: triggerResult.count ?? 0,
    readinessScore: (readinessResult.data as { score?: number } | null)?.score ?? null,
    weeklyFix:
      (weeklyResult.data as { this_weeks_fix?: string | null } | null)?.this_weeks_fix ?? null
  };
}

function studyCopy(
  categoryName: Category,
  localDate: string,
  context: StudyContext,
  actionToken: string
): PushCopy {
  const meta = CATEGORY_META[categoryName];
  const detailedPlan = detailedDayPlanCopy({
    blocks: context.planBlocks,
    openItems: context.openPlanItems,
    reattemptsDue: context.reattemptsDue
  });
  const pyq = dailyPyqCopy({
    blocks: context.planBlocks,
    attemptedLast24h: context.pyqLast24h
  });
  return {
    title:
      categoryName === 'dashboard' || categoryName === 'planner'
        ? detailedPlan.title
        : categoryName === 'pyq'
          ? pyq.title
          : `HETU · ${meta.label}`,
    body: bodyFor(categoryName, context),
    kind: `study_${categoryName}`,
    route: meta.route,
    tagId: `study-${categoryName}-${localDate}`,
    channelId: 'study_reminders',
    priority: 'normal',
    actionToken,
    actionUrl: ACTION_URL,
    actions: [
      { id: `open_${categoryName}`, label: meta.action, type: 'open', route: meta.route },
      { id: 'study_remind_1h', label: 'Remind in 1h', type: 'api' },
      { id: 'study_mute', label: 'Mute', type: 'api' }
    ]
  };
}

function eventCopy(event: StudyEventRow, actionToken: string): PushCopy {
  return {
    title: event.title,
    body: event.body,
    kind: `study_${event.category}`,
    route: event.route,
    tagId: `study-reminder-${event.id}`,
    channelId: 'study_reminders',
    priority: 'normal',
    actionToken,
    actionUrl: ACTION_URL,
    actions: [
      {
        id: `open_${event.category}`,
        label: event.primary_label,
        type: 'open',
        route: event.route
      },
      { id: 'study_mute', label: 'Mute', type: 'api' }
    ]
  };
}

async function upsertEvent(args: {
  userId: string;
  subscriptionId: string;
  category: Category;
  localDate: string;
  title: string;
  body: string;
  route: string;
  primaryLabel: string;
}): Promise<string> {
  const { data, error } = await admin
    .from('study_notification_events')
    .upsert(
      {
        user_id: args.userId,
        subscription_id: args.subscriptionId,
        category: args.category,
        local_date: args.localDate,
        title: args.title,
        body: args.body,
        route: args.route,
        primary_label: args.primaryLabel,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,subscription_id,category,local_date' }
    )
    .select('id')
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? 'could not create notification event');
  return String(data.id);
}

async function sendScheduled(args: {
  user: UserRow;
  preference: PreferenceRow;
  subscriptions: SubscriptionRow[];
  localDate: string;
  context: StudyContext;
  dryRun: boolean;
}): Promise<{ sent: number; failed: number }> {
  const meta = CATEGORY_META[args.preference.category];
  const template = studyCopy(args.preference.category, args.localDate, args.context, 'pending');
  if (args.dryRun) return { sent: args.subscriptions.length, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const subscription of args.subscriptions) {
    try {
      const eventId = await upsertEvent({
        userId: args.user.id,
        subscriptionId: subscription.id,
        category: args.preference.category,
        localDate: args.localDate,
        title: template.title,
        body: template.body,
        route: template.route,
        primaryLabel: meta.action
      });
      const actionToken = await issueActionToken({
        sourceKey: `study:${eventId}`,
        sourceId: eventId,
        userId: args.user.id,
        subscriptionId: subscription.id,
        category: args.preference.category,
        route: template.route
      });
      const result = await deliverToSubscription(
        subscription,
        studyCopy(args.preference.category, args.localDate, args.context, actionToken)
      );
      await admin
        .from('study_notification_events')
        .update({
          sent_at: result.error ? null : new Date().toISOString(),
          provider_status: result.providerStatus,
          last_error: result.error,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId);
      if (result.error) {
        failed += 1;
        if (result.permanent) {
          await admin
            .from('push_subscriptions')
            .update({ enabled: false })
            .eq('id', subscription.id);
        }
      } else {
        sent += 1;
      }
    } catch (error) {
      failed += 1;
      console.error('[study-push] scheduled delivery failed:', (error as Error).message);
    }
  }
  if (sent > 0) {
    await admin
      .from('study_notification_preferences')
      .update({ last_sent_on: args.localDate, updated_at: new Date().toISOString() })
      .eq('user_id', args.user.id)
      .eq('category', args.preference.category);
  }
  return { sent, failed };
}

async function sendDueReminders(
  usersById: Map<string, UserRow>,
  preferences: PreferenceRow[],
  subscriptionsById: Map<string, SubscriptionRow>
): Promise<number> {
  const { data } = await admin
    .from('study_notification_events')
    .select(
      'id,user_id,subscription_id,category,local_date,title,body,route,primary_label,remind_at,reminder_sent_at'
    )
    .not('remind_at', 'is', null)
    .is('reminder_sent_at', null)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at')
    .limit(100);
  const events = (data as StudyEventRow[] | null) ?? [];
  let sent = 0;
  for (const event of events) {
    const user = usersById.get(event.user_id);
    const preference = preferences.find(
      (row) => row.user_id === event.user_id && row.category === event.category
    );
    const subscription = subscriptionsById.get(event.subscription_id);
    if (!user?.study_notifications_enabled || !preference?.enabled || !subscription) {
      continue;
    }
    const actionToken = await issueActionToken({
      sourceKey: `study:${event.id}`,
      sourceId: event.id,
      userId: event.user_id,
      subscriptionId: event.subscription_id,
      category: event.category,
      route: event.route
    });
    const result = await deliverToSubscription(subscription, eventCopy(event, actionToken));
    await admin
      .from('study_notification_events')
      .update({
        reminder_sent_at: result.error ? null : new Date().toISOString(),
        provider_status: result.providerStatus,
        last_error: result.error,
        updated_at: new Date().toISOString()
      })
      .eq('id', event.id);
    if (!result.error) sent += 1;
  }
  return sent;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  let body: {
    user_id?: string;
    category?: string;
    force?: boolean;
    test?: boolean;
    dry_run?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Cron has no body.
  }
  const requestedCategory = body.category === undefined ? null : category(body.category);
  if (body.category !== undefined && !requestedCategory) {
    return json({ ok: false, error: 'invalid category' }, 400);
  }

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const cronSecret = req.headers.get('x-air-journal-cron-secret') ?? '';
  const serviceCall = Boolean(
    (CRON_SECRET && safeEqual(cronSecret, CRON_SECRET)) || (SERVICE && safeEqual(bearer, SERVICE))
  );
  if (body.user_id && !serviceCall) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (error || data.user?.id !== body.user_id)
      return json({ ok: false, error: 'forbidden' }, 403);
  } else if (!body.user_id && !serviceCall) {
    return json({ ok: false, error: 'cron authorization required' }, 403);
  }

  let userQuery = admin
    .from('users')
    .select('id,name,timezone,study_notifications_enabled')
    .limit(1000);
  if (body.user_id) userQuery = userQuery.eq('id', body.user_id);
  else userQuery = userQuery.eq('study_notifications_enabled', true);
  const { data: userData, error: userError } = await userQuery;
  if (userError) return json({ ok: false, error: 'could not load recipients' }, 500);
  const users = (userData as UserRow[] | null) ?? [];
  if (users.length === 0) return json({ ok: true, sent: 0, failed: 0, reminders: 0 });
  const userIds = users.map((user) => user.id);

  let preferenceQuery = admin
    .from('study_notification_preferences')
    .select('user_id,category,enabled,hour_local,minute_local,last_sent_on,muted_until')
    .in('user_id', userIds)
    .eq('enabled', true)
    .limit(5000);
  if (requestedCategory) preferenceQuery = preferenceQuery.eq('category', requestedCategory);
  const [preferenceResult, subscriptionResult] = await Promise.all([
    preferenceQuery,
    admin
      .from('push_subscriptions')
      .select(
        'id,user_id,platform,web_endpoint,web_p256dh,web_auth,native_token,active_buddy_id,last_seen_at,push_quiet_until'
      )
      .in('user_id', userIds)
      .eq('enabled', true)
      .eq('study_enabled', true)
      .limit(5000)
  ]);
  if (preferenceResult.error || subscriptionResult.error) {
    return json({ ok: false, error: 'could not load notification settings' }, 500);
  }
  const preferences = (preferenceResult.data as PreferenceRow[] | null) ?? [];
  const subscriptionRows =
    (subscriptionResult.data as Array<SubscriptionRow & { user_id: string }> | null) ?? [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const subscriptionsByUser = new Map<string, SubscriptionRow[]>();
  const subscriptionsById = new Map<string, SubscriptionRow>();
  for (const row of subscriptionRows) {
    subscriptionsById.set(row.id, row);
    const list = subscriptionsByUser.get(row.user_id) ?? [];
    list.push(row);
    subscriptionsByUser.set(row.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  const contexts = new Map<string, Promise<StudyContext>>();
  const now = new Date();
  for (const preference of preferences) {
    const user = usersById.get(preference.user_id);
    if (!user) continue;
    const clock = localDigestClock(now, user.timezone || 'Asia/Kolkata');
    const muteUntil = Date.parse(preference.muted_until ?? '');
    const due = Boolean(
      body.force ||
      body.test ||
      ((!Number.isFinite(muteUntil) || muteUntil <= Date.now()) &&
        preference.last_sent_on !== clock.isoDate &&
        isDigestTimeDue(
          { hour: clock.hour, minute: clock.minute },
          preference.hour_local,
          preference.minute_local
        ))
    );
    if (!due) continue;
    const subscriptions = subscriptionsByUser.get(user.id) ?? [];
    if (subscriptions.length === 0) continue;
    let contextPromise = contexts.get(user.id);
    if (!contextPromise) {
      contextPromise = loadContext(user.id, clock.isoDate);
      contexts.set(user.id, contextPromise);
    }
    const result = await sendScheduled({
      user,
      preference,
      subscriptions,
      localDate: clock.isoDate,
      context: await contextPromise,
      dryRun: body.dry_run === true
    });
    sent += result.sent;
    failed += result.failed;
  }

  const reminders = body.test
    ? 0
    : await sendDueReminders(usersById, preferences, subscriptionsById);
  return json({ ok: true, sent, failed, reminders });
});
