import { describe, expect, it, vi } from 'vitest';
import {
  airJournalUrl,
  isoDateForTimezone,
  parseTelegramCommand,
  parseTelegramStudySessions,
  renderTelegramConnectionTest,
  renderTelegramDigest,
  renderTelegramTodayUpdate,
  renderTelegramTimetable,
  renderTelegramTomorrowPlan,
  sendTelegramMessage,
  TELEGRAM_BOT_COMMANDS,
  tomorrowIsoDateForTimezone,
  weekIsoDatesForTimezone
} from '../../supabase/functions/_shared/telegram';
import { QUOTES, pickQuoteForDay } from '../../supabase/functions/_shared/quotes';
import { pickOneLinerFor } from '@/lib/one_liners';

describe('Telegram daily digest', () => {
  it('parses supported bot commands without accepting arbitrary text', () => {
    expect(parseTelegramCommand('/start 3dbb0b09-d4ca-4dc4-8e93-f503950b7781')).toEqual({
      name: 'start',
      argument: '3dbb0b09-d4ca-4dc4-8e93-f503950b7781'
    });
    expect(parseTelegramCommand('/status@air_journal_bot')).toEqual({
      name: 'status',
      argument: null
    });
    expect(parseTelegramCommand('/timetable@Gate_prep_reminder_bot')).toEqual({
      name: 'timetable',
      argument: null
    });
    expect(parseTelegramCommand('/tomorrow@Gate_prep_reminder_bot')).toEqual({
      name: 'tomorrow',
      argument: null
    });
    expect(parseTelegramCommand('/today@Gate_prep_reminder_bot')).toEqual({
      name: 'today',
      argument: null
    });
    expect(parseTelegramCommand('send me a digest')).toBeNull();
    expect(TELEGRAM_BOT_COMMANDS[0]).toEqual({
      command: 'today',
      description: "Show today's plan and due re-attempts"
    });
  });

  it('uses the connected user timezone to find the current Monday-to-Sunday week', () => {
    const instant = new Date('2026-07-19T20:00:00.000Z');

    expect(isoDateForTimezone(instant, 'Asia/Kolkata')).toBe('2026-07-20');
    expect(tomorrowIsoDateForTimezone(instant, 'Asia/Kolkata')).toBe('2026-07-21');
    expect(weekIsoDatesForTimezone(instant, 'Asia/Kolkata')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26'
    ]);
  });

  it('sanitizes stored planner sessions before Telegram rendering', () => {
    expect(
      parseTelegramStudySessions([
        { subject: 'OS', durationMin: 90, mode: 'PYQ', target: 'Deadlocks' },
        { subject: '', durationMin: 60, mode: 'Study', target: '' },
        { subject: 'DBMS', durationMin: Number.POSITIVE_INFINITY, mode: 'Study', target: '' }
      ])
    ).toEqual([
      { subject: 'OS', customSubject: undefined, durationMin: 90, mode: 'PYQ', target: 'Deadlocks' }
    ]);
  });

  it('renders a compact, escaped study-only message', () => {
    const message = renderTelegramDigest({
      dateLabel: 'TUESDAY · 21 JULY',
      quote: 'Your competition is still deciding. You already have the map.',
      quoteAttribution: 'HETU',
      sessions: [
        {
          subject: 'Operating Systems',
          durationMin: 90,
          mode: 'PYQ Practice',
          target: 'Process synchronization questions'
        },
        {
          subject: 'DBMS',
          durationMin: 60,
          mode: 'Revision',
          target: 'Revise paging < traps'
        }
      ],
      reAttemptTotal: 3,
      subjectCounts: [
        { subject: 'Operating Systems', count: 2 },
        { subject: 'DBMS', count: 1 }
      ]
    });

    expect(message).toContain('<b>TUESDAY · 21 JULY</b>');
    expect(message).toContain('— HETU');
    expect(message).toContain("<b>TODAY'S PLAN · 2h 30m</b>");
    expect(message).toContain('<b>01 · Operating Systems</b>');
    expect(message).toContain('Revise paging &lt; traps');
    expect(message).toContain('<b>RE-ATTEMPTS · 3</b>');
    expect(message).toContain('2 sessions. Finish them cleanly.');
    expect(message.length).toBeLessThan(4096);
  });

  it('renders a useful connection test without needing a day plan', () => {
    const message = renderTelegramConnectionTest();

    expect(message).toContain('<b>HETU · CONNECTED</b>');
    expect(message).toContain('Telegram delivery is working.');
    expect(message).toContain('<b>No plan. No noise.</b>');
  });

  it("renders today's plan and due re-attempt summary on demand", () => {
    const message = renderTelegramTodayUpdate({
      isoDate: '2026-07-22',
      quote: 'The hard set should recognise you first.',
      quoteAttribution: 'HETU',
      sessions: [
        {
          subject: 'Custom...',
          customSubject: 'Compiler < Design',
          durationMin: 180,
          mode: 'Revision',
          target: 'FIRST & FOLLOW'
        },
        { subject: 'TOC', durationMin: 180, mode: 'Deep Study', target: 'PDA PYQs' }
      ],
      reAttemptTotal: 3,
      subjectCounts: [
        { subject: 'TOC', count: 2 },
        { subject: 'Compiler Design', count: 1 }
      ]
    });

    expect(message).toContain('<b>HETU · TODAY</b>');
    expect(message).toContain('<b>WEDNESDAY · 22 JULY</b>');
    expect(message).toContain("<b>TODAY'S PLAN · 6h</b>");
    expect(message).toContain('Compiler &lt; Design');
    expect(message).toContain('FIRST &amp; FOLLOW');
    expect(message).toContain('<b>RE-ATTEMPTS · 3</b>');
    expect(message).toContain('TOC · 2');
    expect(message.length).toBeLessThan(4096);
  });

  it('renders a compact, escaped Monday-to-Sunday timetable', () => {
    const message = renderTelegramTimetable({
      todayIsoDate: '2026-07-21',
      days: [
        {
          isoDate: '2026-07-20',
          sessions: [
            { subject: 'Operating Systems', durationMin: 90, mode: 'PYQ Practice', target: '' }
          ]
        },
        {
          isoDate: '2026-07-21',
          sessions: [
            {
              subject: 'Custom...',
              customSubject: 'Compiler < Design',
              durationMin: 60,
              mode: 'Revision & Recall',
              target: ''
            },
            { subject: 'TOC', durationMin: 180, mode: 'Deep Study', target: '' },
            { subject: 'Discrete Math', durationMin: 180, mode: 'Deep Study', target: '' },
            { subject: 'PYQ', durationMin: 60, mode: 'PYQ Practice', target: '' }
          ]
        },
        ...['22', '23', '24', '25', '26'].map((day) => ({
          isoDate: `2026-07-${day}`,
          sessions: []
        }))
      ]
    });

    expect(message).toContain('<b>HETU · TIMETABLE</b>');
    expect(message).toContain('<b>WEEK OF 20 JULY 2026</b>');
    expect(message).toContain('<b>5 SESSIONS · 9h 30m</b>');
    expect(message).toContain('<b>TUE · 21 JUL · TODAY · 8h</b>');
    expect(message).toContain('Compiler &lt; Design');
    expect(message).toContain('Revision &amp; Recall');
    expect(message).toContain('04  <b>PYQ</b> · 1h · <i>PYQ Practice</i>');
    expect(message).not.toContain('+1 more in Planner');
    expect(message).toContain('<b>SUN · 26 JUL · OPEN</b>');
    expect(message).toContain('The week is visible. Now execute it.');
    expect(message.length).toBeLessThan(4096);
  });

  it("renders tomorrow's plan with session targets and escaped planner text", () => {
    const message = renderTelegramTomorrowPlan({
      isoDate: '2026-07-22',
      sessions: [
        {
          subject: 'Operating Systems',
          durationMin: 90,
          mode: 'PYQ Practice',
          target: 'Deadlocks & synchronization'
        },
        {
          subject: 'Custom...',
          customSubject: 'Compiler < Design',
          durationMin: 60,
          mode: 'Revision',
          target: 'FIRST & FOLLOW sets'
        }
      ]
    });

    expect(message).toContain('<b>HETU · TOMORROW</b>');
    expect(message).toContain('<b>WEDNESDAY · 22 JULY</b>');
    expect(message).toContain('<b>2 SESSIONS · 2h 30m</b>');
    expect(message).toContain('Deadlocks &amp; synchronization');
    expect(message).toContain('Compiler &lt; Design');
    expect(message).toContain('FIRST &amp; FOLLOW sets');
    expect(message).toContain('Tomorrow is already decided. Show up and collect it.');
    expect(message.length).toBeLessThan(4096);
  });

  it('renders a quiet empty state when tomorrow has no plan', () => {
    const message = renderTelegramTomorrowPlan({
      isoDate: '2026-07-22',
      sessions: []
    });

    expect(message).toContain('No study sessions planned yet.');
    expect(message).toContain('Tomorrow is open. Plan it when you mean it.');
  });

  it('ships 60 unique, attributed quotes with stable daily selection', () => {
    expect(QUOTES).toHaveLength(60);
    expect(new Set(QUOTES.map((quote) => quote.text)).size).toBe(60);
    expect(QUOTES.every((quote) => quote.attribution.length > 0)).toBe(true);
    expect(QUOTES.filter((quote) => quote.text.includes('IISc'))).toHaveLength(2);
    expect(QUOTES.filter((quote) => quote.text.includes('IIT Bombay'))).toHaveLength(2);
    expect(QUOTES.filter((quote) => quote.text.includes('IIT Madras'))).toHaveLength(2);
    expect(pickQuoteForDay('2026-07-21', 'user-1')).toEqual(
      pickQuoteForDay('2026-07-21', 'user-1')
    );
    expect(pickOneLinerFor('2026-07-21', 'user-1')).toEqual(
      pickQuoteForDay('2026-07-21', 'user-1')
    );
  });

  it('sends HTML with a dashboard button through the Telegram Bot API', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    );

    const result = await sendTelegramMessage({
      token: 'test-token',
      chatId: 123456,
      text: '<b>HETU</b>',
      appUrl: 'https://air-journal-omega.vercel.app/planner?date=2026-07-22',
      fetcher
    });

    expect(result).toEqual({ ok: true, id: 42 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      chat_id: '123456',
      parse_mode: 'HTML',
      text: '<b>HETU</b>',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Open HETU',
              url: 'https://air-journal-omega.vercel.app/planner?date=2026-07-22'
            }
          ]
        ]
      }
    });
  });

  it('builds one HTTPS deep link for Android App Links and desktop web', () => {
    expect(airJournalUrl('https://air-journal-omega.vercel.app/', '/planner?date=2026-07-22')).toBe(
      'https://air-journal-omega.vercel.app/planner?date=2026-07-22'
    );
    expect(airJournalUrl('', '/settings')).toBe('https://air-journal-omega.vercel.app/settings');
  });
});
