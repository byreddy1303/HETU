// POST /functions/v1/daily-digest
// Body (optional):
// { user_id?: uuid, dry_run?: boolean, force?: boolean, test?: boolean,
//   channel?: 'email' | 'telegram' }
//
// When called by cron with no body, loops every user whose
// digest_hour_local matches the "current local hour" AND hasn't received
// today's digest yet. When called with {user_id}, generates + sends just
// for that user (used for testing + Settings "Send now" button).
//
// Content per digest:
//   greeting        — time-of-day + first name
//   quote           — deterministic per-day pick, one per user
//   re_attempts     — count + up-to-8 lines grouped by subject
//   planner         — today's synced calendar study sessions
//   planner_items   — legacy plan_items_due_on, for email compatibility
//   weekly_fix      — Mondays only, latest 'this_weeks_fix' if present
//
// Delivery: optional email and opt-in Telegram bot message. Delivery markers
// are per channel so one channel failing never duplicates the other.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { jwtRoleClaim } from '../_shared/cron-auth.ts';
import { isDigestTimeDue, localDigestClock } from '../_shared/digest-schedule.ts';
import { sendEmail } from '../_shared/email.ts';
import { greetingForHour, pickQuoteForDay } from '../_shared/quotes.ts';
import {
  airJournalUrl,
  parseTelegramStudySessions,
  renderTelegramConnectionTest,
  renderTelegramDigest,
  sendTelegramMessage,
  type TelegramStudySession
} from '../_shared/telegram.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('VITE_APP_URL') ?? '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const DIGEST_CRON_SECRET = Deno.env.get('DAILY_DIGEST_CRON_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface UserForDigest {
  id: string;
  name: string;
  email: string;
  timezone: string;
  digest_email_enabled: boolean;
  digest_hour_local: number;
  digest_minute_local: number;
  last_digest_sent_on: string | null;
}

interface TelegramSubscription {
  user_id: string;
  chat_id: string | number | null;
  enabled: boolean;
  last_digest_sent_on: string | null;
}

type DigestChannel = 'email' | 'telegram';

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  let body: {
    user_id?: string;
    dry_run?: boolean;
    force?: boolean;
    test?: boolean;
    channel?: DigestChannel;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // no body is fine — cron path.
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const cronSecret = req.headers.get('x-air-journal-cron-secret') ?? '';
  // The gateway verifies this JWT before invoking the function. Check its
  // service-role claim instead of requiring byte equality with the injected
  // key: hosted pg_cron and Edge Functions can expose different valid key
  // generations during API-key rotation.
  const isServiceCall = Boolean(
    (DIGEST_CRON_SECRET && cronSecret === DIGEST_CRON_SECRET) ||
    (token && (token === SERVICE || jwtRoleClaim(token) === 'service_role'))
  );
  if (body.user_id) {
    if (!isServiceCall) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || data.user?.id !== body.user_id) {
        return json({ ok: false, error: 'forbidden' }, 403);
      }
    }
  } else if (!isServiceCall) {
    return json({ ok: false, error: 'cron authorization required' }, 403);
  }

  const dryRun = body.dry_run === true;
  const force = body.force === true;
  const test = body.test === true;
  const allowEmail = body.channel !== 'telegram';
  const allowTelegram = body.channel !== 'email';
  const now = new Date();

  let userQuery = admin
    .from('users')
    .select(
      'id, name, email, timezone, digest_email_enabled, digest_hour_local, digest_minute_local, last_digest_sent_on'
    )
    .limit(1000);
  let telegramQuery = admin
    .from('telegram_subscriptions')
    .select('user_id, chat_id, enabled, last_digest_sent_on')
    .limit(1000);
  if (body.user_id) {
    userQuery = userQuery.eq('id', body.user_id);
    telegramQuery = telegramQuery.eq('user_id', body.user_id);
  }

  const [{ data: userData, error: userError }, { data: telegramData, error: telegramError }] =
    await Promise.all([userQuery, telegramQuery]);
  if (userError || telegramError) {
    console.error(
      'Daily digest candidate load failed:',
      userError?.message,
      telegramError?.message
    );
    return json({ ok: false, error: 'could not load digest recipients' }, 500);
  }

  const subscriptions = (telegramData as TelegramSubscription[]) ?? [];
  const telegramByUser = new Map(subscriptions.map((row) => [row.user_id, row]));
  const users = ((userData as UserForDigest[]) ?? []).filter((user) => {
    const telegram = telegramByUser.get(user.id);
    return Boolean(body.user_id || user.digest_email_enabled || telegram?.enabled);
  });

  const report: Array<Record<string, unknown>> = [];
  for (const u of users) {
    const telegram = telegramByUser.get(u.id);
    const tz = u.timezone || 'Asia/Kolkata';
    const { hour, minute, isoDate, weekday } = localDigestClock(now, tz);
    const wantHour = u.digest_hour_local;
    const wantMinute = u.digest_minute_local ?? 0;
    if (!force && !isDigestTimeDue({ hour, minute }, wantHour, wantMinute)) {
      report.push({
        user: u.id,
        skipped: 'wrong_time',
        hour,
        minute,
        wantHour,
        wantMinute
      });
      continue;
    }

    const emailDue = Boolean(
      allowEmail && u.digest_email_enabled && (force || u.last_digest_sent_on !== isoDate)
    );
    const telegramEligible = Boolean(
      allowTelegram &&
      telegram?.enabled &&
      telegram.chat_id !== null &&
      (force || telegram.last_digest_sent_on !== isoDate)
    );
    if (!emailDue && !telegramEligible) {
      report.push({ user: u.id, skipped: 'already_sent_or_disabled' });
      continue;
    }

    const digest = await buildDigest(u, isoDate, hour, weekday);
    // A manual test proves the Telegram connection even on an empty planning
    // day. Scheduled delivery remains silent when there is no recorded plan.
    const telegramDue = telegramEligible && (test || digest.has_planner_sessions);
    if (dryRun) {
      report.push({ user: u.id, dry: true, telegram_would_send: telegramDue, digest });
      continue;
    }
    if (!emailDue && !telegramDue) {
      report.push({
        user: u.id,
        skipped: 'no_planner_sessions',
        telegram_err: 'No study sessions are planned for today.'
      });
      continue;
    }
    let email_ok = false;
    let telegram_ok = false;
    let email_err: string | undefined;
    let telegram_err: string | undefined =
      telegramEligible && !test && !digest.has_planner_sessions
        ? 'No study sessions are planned for today.'
        : undefined;

    if (emailDue && u.email) {
      const res = await sendEmail({
        to: u.email,
        subject: `Your HETU · ${isoDate}`,
        html: digest.html
      });
      email_ok = res.ok;
      if (!res.ok) email_err = res.error;
    }

    if (telegramDue && telegram && telegram.chat_id !== null) {
      const res = await sendTelegramMessage({
        token: TELEGRAM_BOT_TOKEN,
        chatId: telegram.chat_id,
        text: test ? renderTelegramConnectionTest() : digest.telegram_text,
        appUrl: airJournalUrl(APP_URL, test ? '/settings' : `/planner?date=${isoDate}`)
      });
      telegram_ok = res.ok;
      if (!res.ok) telegram_err = res.error;
    }

    if (email_ok && !test) {
      await admin.from('users').update({ last_digest_sent_on: isoDate }).eq('id', u.id);
    }
    if (telegram_ok && !test) {
      await admin
        .from('telegram_subscriptions')
        .update({ last_digest_sent_on: isoDate, updated_at: new Date().toISOString() })
        .eq('user_id', u.id);
    }
    report.push({
      user: u.id,
      email_ok,
      telegram_ok,
      email_err,
      telegram_err
    });
  }

  return json({ ok: true, count: users.length, report });
}

Deno.serve((req: Request) =>
  handleRequest(req).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown digest error';
    console.error('Daily digest unhandled failure:', error);
    return json({ ok: false, error: 'daily digest failed', diagnostic: message.slice(0, 240) }, 500);
  })
);

interface Digest {
  html: string;
  telegram_text: string;
  summary: string;
  has_planner_sessions: boolean;
}

function telegramDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('weekday')} · ${value('day')} ${value('month')}`.toUpperCase();
}

async function buildDigest(
  u: UserForDigest,
  isoDate: string,
  hour: number,
  weekday: number
): Promise<Digest> {
  const firstName = (u.name ?? '').split(/\s+/)[0] ?? '';
  const greeting = greetingForHour(hour, firstName);
  const quote = pickQuoteForDay(isoDate, u.id);

  const { data: storedPlan, error: storedPlanError } = await admin
    .from('planner_day_plans')
    .select('sessions')
    .eq('user_id', u.id)
    .eq('plan_date', isoDate)
    .maybeSingle();
  if (storedPlanError) {
    console.error('Planner day load failed:', u.id, storedPlanError.message);
  }
  const studySessions = parseTelegramStudySessions(
    (storedPlan as { sessions?: unknown } | null)?.sessions
  );

  // Re-attempts due today (not yet done)
  const { data: reattempts } = await admin
    .from('reattempts')
    .select('id, question_id, stage')
    .eq('user_id', u.id)
    .lte('scheduled_date', isoDate)
    .neq('stage', 'MASTERED');
  const reAttemptRows = (reattempts as { id: string; question_id: string; stage: string }[]) ?? [];

  let subjectCounts: { subject: string; count: number }[] = [];
  let sampleTitles: string[] = [];
  if (reAttemptRows.length > 0) {
    const qids = reAttemptRows.map((r) => r.question_id);
    const { data: qs } = await admin
      .from('questions')
      .select('id, subject, question_text')
      .in('id', qids);
    const map = new Map<string, number>();
    ((qs as { id: string; subject: string; question_text: string | null }[]) ?? []).forEach((q) => {
      map.set(q.subject, (map.get(q.subject) ?? 0) + 1);
      if (sampleTitles.length < 6 && q.question_text) {
        sampleTitles.push(`${q.subject}: ${q.question_text.slice(0, 80)}`);
      }
    });
    subjectCounts = Array.from(map, ([subject, count]) => ({ subject, count })).sort(
      (a, b) => b.count - a.count
    );
  }

  // Planner items due today, minus completed
  const { data: plannerDue } = await admin.rpc('plan_items_due_on', {
    uid: u.id,
    on_date: isoDate
  });
  const planItems =
    (plannerDue as {
      id: string;
      title: string;
      subject: string | null;
      target_min: number | null;
    }[]) ?? [];
  const { data: completions } = await admin
    .from('plan_item_completions')
    .select('item_id')
    .eq('user_id', u.id)
    .eq('on_date', isoDate);
  const doneIds = new Set(((completions as { item_id: string }[]) ?? []).map((c) => c.item_id));
  const openItems = planItems.filter((i) => !doneIds.has(i.id));

  // Weekly fix — only on Mondays (ISO weekday 1). JS getUTCDay/Intl short: Mon=1.
  let weeklyFix: string | null = null;
  if (weekday === 1) {
    const { data: wr } = await admin
      .from('weekly_reviews')
      .select('this_weeks_fix, week_start')
      .eq('user_id', u.id)
      .order('week_start', { ascending: false })
      .limit(1);
    weeklyFix = ((wr as { this_weeks_fix: string | null }[]) ?? [])[0]?.this_weeks_fix ?? null;
  }

  const summaryLine =
    reAttemptRows.length > 0
      ? `${reAttemptRows.length} re-attempt${reAttemptRows.length === 1 ? '' : 's'} due · ${openItems.length} planner item${openItems.length === 1 ? '' : 's'}${weeklyFix ? ` · fix: ${weeklyFix}` : ''}`
      : openItems.length > 0
        ? `Clean re-attempt queue · ${openItems.length} planner item${openItems.length === 1 ? '' : 's'} today`
        : `Free morning. No re-attempts, no planner load. Recover.`;

  const html = renderEmail({
    greeting,
    quote: quote.text,
    quoteAttribution: quote.attribution,
    isoDate,
    subjectCounts,
    sampleTitles,
    reAttemptTotal: reAttemptRows.length,
    openItems,
    weeklyFix,
    appUrl: APP_URL || 'https://hetu-app.vercel.app'
  });

  const telegram_text = renderTelegramDigest({
    dateLabel: telegramDateLabel(isoDate),
    quote: quote.text,
    quoteAttribution: quote.attribution,
    sessions: studySessions,
    reAttemptTotal: reAttemptRows.length,
    subjectCounts
  });

  return {
    html,
    telegram_text,
    summary: summaryLine,
    has_planner_sessions:
      studySessions.length > 0 || reAttemptRows.length > 0 || openItems.length > 0
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmail(args: {
  greeting: string;
  quote: string;
  quoteAttribution: string;
  isoDate: string;
  subjectCounts: { subject: string; count: number }[];
  sampleTitles: string[];
  reAttemptTotal: number;
  openItems: { id: string; title: string; subject: string | null; target_min: number | null }[];
  weeklyFix: string | null;
  appUrl: string;
}): string {
  const {
    greeting,
    quote,
    quoteAttribution,
    isoDate,
    subjectCounts,
    sampleTitles,
    reAttemptTotal,
    openItems,
    weeklyFix,
    appUrl
  } = args;

  const reBlock =
    reAttemptTotal === 0
      ? `<p style="margin:0 0 8px 0;font-size:13px;color:#67575D;">No re-attempts due today. Enjoy the clean queue.</p>`
      : `
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#1B191C;">${reAttemptTotal} question${reAttemptTotal === 1 ? '' : 's'} due for re-attempt.</p>
        <ul style="margin:0 0 10px 18px;padding:0;font-size:13px;color:#67575D;line-height:1.7;">
          ${subjectCounts
            .slice(0, 6)
            .map(
              (s) =>
                `<li>${esc(s.subject)} — <span style="font-family:monospace;color:#1B191C;">${s.count}</span></li>`
            )
            .join('')}
        </ul>
        ${
          sampleTitles.length > 0
            ? `
        <details style="margin:0 0 10px 0;">
          <summary style="cursor:pointer;font-size:11.5px;color:#7D6C72;">Sample questions</summary>
          <ul style="margin:8px 0 0 18px;padding:0;font-size:12px;color:#67575D;line-height:1.65;">
            ${sampleTitles.map((t) => `<li>${esc(t)}</li>`).join('')}
          </ul>
        </details>`
            : ''
        }
      `;

  const planBlock =
    openItems.length === 0
      ? `<p style="margin:0 0 8px 0;font-size:13px;color:#67575D;">No planner items open for today. Add one from the planner if you want an anchor.</p>`
      : `
        <ul style="margin:0 0 10px 18px;padding:0;font-size:13px;color:#1B191C;line-height:1.75;">
          ${openItems
            .slice(0, 12)
            .map(
              (i) =>
                `<li>${esc(i.title)}${i.subject ? ` <span style="color:#67575D;font-size:11.5px;">· ${esc(i.subject)}</span>` : ''}${i.target_min ? ` <span style="font-family:monospace;color:#7D6C72;font-size:11.5px;">${i.target_min}m</span>` : ''}</li>`
            )
            .join('')}
        </ul>
      `;

  const fixBlock = weeklyFix
    ? `
      <div style="margin:8px 0 16px 0;padding:12px 14px;background:#F7EDCF;border-left:3px solid #8A5B13;border-radius:6px;">
        <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A5B13;">this week's fix</p>
        <p style="margin:4px 0 0 0;font-size:14px;color:#1B191C;font-weight:600;">${esc(weeklyFix)}</p>
      </div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F1E9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1B191C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF9;border:1px solid #E0D5CD;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 30px 4px 30px;border-left:3px solid #98182B;">
          <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#67575D;">HETU · ${esc(isoDate)}</p>
        </td></tr>
        <tr><td style="padding:12px 30px 4px 30px;">
          <p style="margin:0;font-size:20px;font-weight:700;line-height:1.25;">${esc(greeting)}</p>
        </td></tr>
        <tr><td style="padding:6px 30px 18px 30px;">
          <p style="margin:0 0 12px 0;font-size:15px;font-style:italic;line-height:1.55;color:#1B191C;">
            <span style="background:linear-gradient(180deg,transparent 62%,#F3D58A 62%,#F3D58A 92%,transparent 92%);padding:0 2px;">${esc(quote)}</span>
          </p>
          <p style="margin:-8px 0 14px 0;font-size:11.5px;color:#7D6C72;">— ${esc(quoteAttribution)}</p>
          ${fixBlock}
          <p style="margin:16px 0 4px 0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#67575D;">re-attempts due today</p>
          ${reBlock}
          <p style="margin:12px 0 4px 0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#67575D;">planner · today</p>
          ${planBlock}
          <p style="margin:18px 0 0 0;">
            <a href="${esc(appUrl)}" style="display:inline-block;padding:10px 20px;background:#98182B;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:13.5px;">Open HETU</a>
          </p>
        </td></tr>
        <tr><td style="padding:14px 30px;border-top:1px solid #E0D5CD;background:#EFE7E2;font-size:11px;color:#7D6C72;">
          Turn off digest emails in Settings · one message per day, at your chosen local hour.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
