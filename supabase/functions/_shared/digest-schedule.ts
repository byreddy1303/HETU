export interface LocalDigestClock {
  hour: number;
  minute: number;
  isoDate: string;
  weekday: number;
}

/** Resolve a wall-clock instant in a user's IANA timezone. */
export function localDigestClock(now: Date, timezone: string): LocalDigestClock {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    }).formatToParts(now);
    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    const weekdays: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6
    };
    return {
      hour: Number.parseInt(map.hour === '24' ? '0' : map.hour, 10),
      minute: Number.parseInt(map.minute ?? '0', 10),
      isoDate: `${map.year}-${map.month}-${map.day}`,
      weekday: weekdays[map.weekday] ?? now.getUTCDay()
    };
  } catch {
    return {
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      isoDate: now.toISOString().slice(0, 10),
      weekday: now.getUTCDay()
    };
  }
}

/**
 * The cron runs every minute. A small forward-only grace window recovers from
 * a delayed invocation without ever delivering before the chosen minute or
 * leaking a 23:59 reminder into the next day's plan.
 */
export function isDigestTimeDue(
  clock: Pick<LocalDigestClock, 'hour' | 'minute'>,
  targetHour: number,
  targetMinute: number,
  graceMinutes = 15
): boolean {
  if (
    !Number.isInteger(targetHour) ||
    targetHour < 0 ||
    targetHour > 23 ||
    !Number.isInteger(targetMinute) ||
    targetMinute < 0 ||
    targetMinute > 59
  ) {
    return false;
  }
  const elapsed = clock.hour * 60 + clock.minute - (targetHour * 60 + targetMinute);
  return elapsed >= 0 && elapsed < graceMinutes;
}
