import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Calendar date for an instant in the learner's configured timezone.
 *
 * `created_at` values are UTC instants. Slicing their ISO string silently
 * assigns work done after midnight in India to the previous study day. Keep
 * all dashboard and analysis bucketing on this one conversion path instead.
 */
export function calendarDateInTimeZone(
  value: string | Date,
  timeZone = 'Asia/Kolkata'
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return format(date, 'yyyy-MM-dd');
  }
}

/** Today's calendar date in a named timezone. */
export function todayISOInTimeZone(timeZone = 'Asia/Kolkata'): string {
  return calendarDateInTimeZone(new Date(), timeZone);
}

export function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
}

/** Monday of the week containing `d` (weekly reviews key on this). */
export function weekStartISO(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function formatDate(iso: string, pattern = 'dd MMM yyyy'): string {
  return format(parseISO(iso), pattern);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** mm:ss below one hour, h:mm:ss above. */
export function secondsToClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Iterative Levenshtein distance, case-insensitive. */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  let curr = new Array<number>(t.length + 1);
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
