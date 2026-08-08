export interface TelegramCommand {
  name: 'start' | 'stop' | 'status' | 'today' | 'timetable' | 'tomorrow' | 'help';
  argument: string | null;
}

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'today', description: "Show today's plan and due re-attempts" },
  { command: 'tomorrow', description: "Show tomorrow's study plan" },
  { command: 'timetable', description: "Show this week's study timetable" },
  { command: 'status', description: 'Check Telegram delivery status' },
  { command: 'stop', description: 'Pause the daily digest' },
  { command: 'help', description: 'Show available commands' }
] as const;
export interface TelegramStudySession {
  subject: string;
  customSubject?: string;
  durationMin: number;
  mode: string;
  target: string;
}

export interface TelegramDigestInput {
  dateLabel: string;
  quote: string;
  quoteAttribution: string;
  sessions: TelegramStudySession[];
  reAttemptTotal: number;
  subjectCounts: Array<{ subject: string; count: number }>;
}

export interface TelegramTimetableDay {
  isoDate: string;
  sessions: TelegramStudySession[];
}

export interface TelegramTimetableInput {
  todayIsoDate: string;
  days: TelegramTimetableDay[];
}

export interface TelegramTomorrowInput {
  isoDate: string;
  sessions: TelegramStudySession[];
}

export interface TelegramTodayInput {
  isoDate: string;
  quote: string;
  quoteAttribution: string;
  sessions: TelegramStudySession[];
  reAttemptTotal: number;
  subjectCounts: Array<{ subject: string; count: number }>;
}

export interface TelegramSendResult {
  ok: boolean;
  id?: number;
  error?: string;
}

export function parseTelegramCommand(text: string | undefined): TelegramCommand | null {
  if (!text) return null;
  const match = text
    .trim()
    .match(
      /^\/(start|stop|status|today|timetable|tomorrow|help)(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/i
    );
  if (!match) return null;
  return {
    name: match[1].toLowerCase() as TelegramCommand['name'],
    argument: match[2] ?? null
  };
}

export function parseTelegramStudySessions(value: unknown): TelegramStudySession[] {
  if (!Array.isArray(value)) return [];
  const sessions: TelegramStudySession[] = [];
  for (const item of value.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const subject = typeof row.subject === 'string' ? row.subject.trim().slice(0, 120) : '';
    const durationMin =
      typeof row.durationMin === 'number' && Number.isFinite(row.durationMin)
        ? Math.max(0, Math.min(480, Math.round(row.durationMin)))
        : 0;
    if (!subject || durationMin === 0) continue;
    sessions.push({
      subject,
      customSubject:
        typeof row.customSubject === 'string' ? row.customSubject.trim().slice(0, 120) : undefined,
      durationMin,
      mode: typeof row.mode === 'string' ? row.mode.trim().slice(0, 80) : 'Study',
      target: typeof row.target === 'string' ? row.target.trim().slice(0, 280) : ''
    });
  }
  return sessions;
}

export function isoDateForTimezone(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function addUtcDays(isoDate: string, amount: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Monday-through-Sunday dates for the week containing `now` in a user's timezone. */
export function weekIsoDatesForTimezone(now: Date, timeZone: string): string[] {
  const localIsoDate = isoDateForTimezone(now, timeZone);
  const weekday = new Date(`${localIsoDate}T12:00:00Z`).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = addUtcDays(localIsoDate, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addUtcDays(monday, index));
}

export function tomorrowIsoDateForTimezone(now: Date, timeZone: string): string {
  return addUtcDays(isoDateForTimezone(now, timeZone), 1);
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function airJournalUrl(baseUrl: string, route: string): string {
  const base = (baseUrl.trim() || 'https://hetu-app.vercel.app').replace(/\/+$/, '');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return new URL(normalizedRoute, `${base}/`).toString();
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function compactText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeCompactTelegramHtml(
  value: string,
  maxVisibleLength: number,
  maxEncodedLength: number
): string {
  let clean = compactText(value, maxVisibleLength);
  let encoded = escapeTelegramHtml(clean);
  while (encoded.length > maxEncodedLength && clean.length > 1) {
    clean = `${clean.slice(0, Math.max(1, clean.length - 2)).trimEnd()}…`;
    encoded = escapeTelegramHtml(clean);
  }
  return encoded;
}

function timetableDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('weekday')} · ${part('day')} ${part('month')}`.toUpperCase();
}

function timetableWeekLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
    .format(date)
    .toUpperCase();
}

function fullDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('weekday')} · ${part('day')} ${part('month')}`.toUpperCase();
}

function renderTelegramDay(
  input: TelegramDigestInput,
  heading: 'HETU' | 'HETU · TODAY'
): string {
  const sessions = input.sessions.slice(0, 6);
  const totalMinutes = input.sessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationMin || 0),
    0
  );
  const lines: string[] = [
    `<b>${heading}</b>`,
    `<b>${escapeTelegramHtml(input.dateLabel)}</b>`,
    '',
    `<i>“${escapeTelegramHtml(input.quote)}”</i>`,
    `— ${escapeTelegramHtml(input.quoteAttribution)}`,
    '',
    `<b>TODAY'S PLAN · ${formatDuration(totalMinutes)}</b>`,
    ''
  ];

  sessions.forEach((session, index) => {
    const subject =
      session.subject === 'Custom...' && session.customSubject
        ? session.customSubject
        : session.subject;
    lines.push(
      `<b>${String(index + 1).padStart(2, '0')} · ${escapeTelegramHtml(subject)}</b>`,
      `${formatDuration(session.durationMin)} · ${escapeTelegramHtml(session.mode)}`
    );
    if (session.target.trim()) lines.push(escapeTelegramHtml(session.target.trim()));
    lines.push('');
  });

  if (input.sessions.length > sessions.length) {
    lines.push(`${input.sessions.length - sessions.length} more sessions in HETU`, '');
  }

  if (input.reAttemptTotal === 0) {
    lines.push('<b>RE-ATTEMPTS · CLEAR</b>');
  } else {
    lines.push(`<b>RE-ATTEMPTS · ${input.reAttemptTotal}</b>`);
    for (const row of input.subjectCounts.slice(0, 4)) {
      lines.push(`${escapeTelegramHtml(row.subject)} · ${row.count}`);
    }
  }

  const sessionWord = input.sessions.length === 1 ? 'session' : 'sessions';
  lines.push('', `${input.sessions.length} ${sessionWord}. Finish them cleanly.`);

  return lines.join('\n').slice(0, 3900);
}

export function renderTelegramDigest(input: TelegramDigestInput): string {
  return renderTelegramDay(input, 'HETU');
}

export function renderTelegramTodayUpdate(input: TelegramTodayInput): string {
  return renderTelegramDay(
    {
      dateLabel: fullDateLabel(input.isoDate),
      quote: input.quote,
      quoteAttribution: input.quoteAttribution,
      sessions: input.sessions,
      reAttemptTotal: input.reAttemptTotal,
      subjectCounts: input.subjectCounts
    },
    'HETU · TODAY'
  );
}

export function renderTelegramConnectionTest(): string {
  return [
    '<b>HETU · CONNECTED</b>',
    '',
    '<i>“The line is live. The rest is execution.”</i>',
    '— HETU',
    '',
    'Telegram delivery is working.',
    'Planned days will arrive here at your chosen local time.',
    '',
    '<b>No plan. No noise.</b>'
  ].join('\n');
}

export function renderTelegramTimetable(input: TelegramTimetableInput): string {
  const totalSessions = input.days.reduce((sum, day) => sum + day.sessions.length, 0);
  const totalMinutes = input.days.reduce(
    (sum, day) =>
      sum +
      day.sessions.reduce((daySum, session) => daySum + Math.max(0, session.durationMin || 0), 0),
    0
  );
  const weekStart = input.days[0]?.isoDate ?? input.todayIsoDate;
  const lines: string[] = [
    '<b>HETU · TIMETABLE</b>',
    `<b>WEEK OF ${timetableWeekLabel(weekStart)}</b>`,
    '',
    `<b>${totalSessions} ${totalSessions === 1 ? 'SESSION' : 'SESSIONS'} · ${formatDuration(totalMinutes)}</b>`,
    ''
  ];

  for (const day of input.days.slice(0, 7)) {
    const dayMinutes = day.sessions.reduce(
      (sum, session) => sum + Math.max(0, session.durationMin || 0),
      0
    );
    const todayMark = day.isoDate === input.todayIsoDate ? ' · TODAY' : '';
    const durationMark = dayMinutes > 0 ? ` · ${formatDuration(dayMinutes)}` : ' · OPEN';
    lines.push(`<b>${timetableDayLabel(day.isoDate)}${todayMark}${durationMark}</b>`);

    if (day.sessions.length === 0) {
      lines.push('<i>No study sessions planned.</i>', '');
      continue;
    }

    day.sessions.forEach((session, index) => {
      const rawSubject =
        session.subject === 'Custom...' && session.customSubject
          ? session.customSubject
          : session.subject;
      const subject = escapeCompactTelegramHtml(rawSubject, 48, 58);
      const mode = escapeCompactTelegramHtml(session.mode || 'Study', 32, 38);
      lines.push(
        `${String(index + 1).padStart(2, '0')}  <b>${subject}</b> · ${formatDuration(session.durationMin)} · <i>${mode}</i>`
      );
    });

    lines.push('');
  }

  lines.push('<b>The week is visible. Now execute it.</b>');
  return lines.join('\n');
}

export function renderTelegramTomorrowPlan(input: TelegramTomorrowInput): string {
  const totalMinutes = input.sessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationMin || 0),
    0
  );
  const lines: string[] = [
    '<b>HETU · TOMORROW</b>',
    `<b>${fullDateLabel(input.isoDate)}</b>`,
    ''
  ];

  if (input.sessions.length === 0) {
    lines.push(
      '<i>No study sessions planned yet.</i>',
      '',
      '<b>Tomorrow is open. Plan it when you mean it.</b>'
    );
    return lines.join('\n');
  }

  lines.push(
    `<b>${input.sessions.length} ${input.sessions.length === 1 ? 'SESSION' : 'SESSIONS'} · ${formatDuration(totalMinutes)}</b>`,
    ''
  );

  const visibleSessions = input.sessions.slice(0, 8);
  visibleSessions.forEach((session, index) => {
    const rawSubject =
      session.subject === 'Custom...' && session.customSubject
        ? session.customSubject
        : session.subject;
    const subject = escapeCompactTelegramHtml(rawSubject, 60, 72);
    const mode = escapeCompactTelegramHtml(session.mode || 'Study', 40, 48);
    const target = escapeCompactTelegramHtml(session.target, 110, 140);
    lines.push(
      `<b>${String(index + 1).padStart(2, '0')} · ${subject}</b>`,
      `${formatDuration(session.durationMin)} · <i>${mode}</i>`
    );
    if (target) lines.push(target);
    lines.push('');
  });

  if (input.sessions.length > visibleSessions.length) {
    lines.push(`+${input.sessions.length - visibleSessions.length} more sessions in Planner`, '');
  }

  lines.push('<b>Tomorrow is already decided. Show up and collect it.</b>');
  return lines.join('\n');
}

export async function sendTelegramMessage(args: {
  token: string;
  chatId: string | number;
  text: string;
  appUrl?: string;
  fetcher?: typeof fetch;
}): Promise<TelegramSendResult> {
  if (!args.token) return { ok: false, error: 'Telegram bot token missing' };

  const body: Record<string, unknown> = {
    chat_id: String(args.chatId),
    text: args.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }
  };

  if (args.appUrl) {
    body.reply_markup = {
      inline_keyboard: [[{ text: 'Open HETU', url: args.appUrl }]]
    };
  }

  const request = args.fetcher ?? fetch;
  const response = await request(`https://api.telegram.org/bot${args.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number };
  };

  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      error: `telegram ${response.status}: ${payload.description ?? 'send failed'}`
    };
  }

  return { ok: true, id: payload.result?.message_id };
}
