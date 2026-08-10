import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STUDY_NOTIFICATION_CATEGORIES, parseNotificationTime } from '@/lib/studyNotifications';

const migration = readFileSync(
  'supabase/migrations/20260810000002_interactive_study_notifications.sql',
  'utf8'
);
const worker = readFileSync('supabase/functions/study-notifications/index.ts', 'utf8');
const androidService = readFileSync(
  'android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java',
  'utf8'
);

describe('interactive study notification system', () => {
  it('covers every authenticated study surface with a unique category and route', () => {
    expect(STUDY_NOTIFICATION_CATEGORIES).toHaveLength(15);
    expect(new Set(STUDY_NOTIFICATION_CATEGORIES.map((item) => item.id)).size).toBe(15);
    expect(new Set(STUDY_NOTIFICATION_CATEGORIES.map((item) => item.route)).size).toBe(15);
    expect(STUDY_NOTIFICATION_CATEGORIES.some((item) => item.route === '/log')).toBe(true);
  });

  it('accepts only cron-supported quarter-hour schedule values', () => {
    expect(parseNotificationTime('06:45')).toEqual({ hour: 6, minute: 45 });
    expect(parseNotificationTime('23:15')).toEqual({ hour: 23, minute: 15 });
    expect(parseNotificationTime('24:00')).toBeNull();
    expect(parseNotificationTime('09:10')).toBeNull();
  });

  it('requires separate study consent and supplies relevant interactive actions', () => {
    expect(migration).toContain('study_notifications_enabled boolean not null default false');
    expect(worker).toContain("{ id: 'study_remind_1h', label: 'Remind in 1h', type: 'api' }");
    expect(worker).toContain("{ id: 'study_mute', label: 'Mute', type: 'api' }");
  });

  it('adds reply and API actions to the replacement Android notification', () => {
    expect(androidService).toContain('new RemoteInput.Builder(REPLY_RESULT_KEY)');
    expect(androidService).toContain('NotificationActionReceiver.class');
    expect(androidService).toContain('replacesSystem ? 0 : notificationId(tag)');
  });
});
