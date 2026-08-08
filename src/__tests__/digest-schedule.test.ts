import { describe, expect, it } from 'vitest';
import {
  isDigestTimeDue,
  localDigestClock
} from '../../supabase/functions/_shared/digest-schedule';

describe('daily digest minute scheduling', () => {
  it('resolves local hours, minutes, dates, and weekdays in the user timezone', () => {
    expect(localDigestClock(new Date('2026-08-08T10:24:00.000Z'), 'Asia/Kolkata')).toEqual({
      hour: 15,
      minute: 54,
      isoDate: '2026-08-08',
      weekday: 6
    });
  });

  it('runs at any chosen minute and tolerates a delayed cron without sending early', () => {
    expect(isDigestTimeDue({ hour: 15, minute: 54 }, 15, 54)).toBe(true);
    expect(isDigestTimeDue({ hour: 15, minute: 57 }, 15, 54)).toBe(true);
    expect(isDigestTimeDue({ hour: 15, minute: 53 }, 15, 54)).toBe(false);
    expect(isDigestTimeDue({ hour: 16, minute: 9 }, 15, 54)).toBe(false);
  });

  it('never carries a late-night reminder into the next local day', () => {
    expect(isDigestTimeDue({ hour: 0, minute: 0 }, 23, 59)).toBe(false);
  });
});
