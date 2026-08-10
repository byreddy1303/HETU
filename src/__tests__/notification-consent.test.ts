import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const digestSource = readFileSync('supabase/functions/daily-digest/index.ts', 'utf8');
const buddyPushSource = readFileSync('supabase/functions/buddy-notifications/index.ts', 'utf8');
const buddyRequestSource = readFileSync('supabase/functions/buddy-request/index.ts', 'utf8');
const sharedPushSource = readFileSync('supabase/functions/_shared/push.ts', 'utf8');
const studySettingsSource = readFileSync(
  'src/components/settings/StudyNotificationsCard.tsx',
  'utf8'
);

describe('notification channel consent boundaries', () => {
  it('does not treat a Buddy-message push registration as daily-digest consent', () => {
    expect(digestSource).not.toContain("from('push_subscriptions')");
    expect(digestSource).not.toContain("kind: 'daily_digest'");
  });

  it('still delivers Android alerts when optional inline-reply setup fails', () => {
    expect(buddyPushSource).toContain("console.warn('[buddy-push] Android reply unavailable:'");
    expect(buddyPushSource).toMatch(/Android reply unavailable:[\s\S]*return enriched;/);
  });

  it('keeps Buddy requests inside Buddy consent and gives them a relevant action', () => {
    expect(buddyRequestSource).toContain(".eq('buddy_enabled', true)");
    expect(buddyRequestSource).toContain("label: 'View request'");
  });

  it('does not show study reminders as enabled until this device opts in', () => {
    expect(studySettingsSource).toContain(
      'profile?.study_notifications_enabled === true && studyPushOptedIn()'
    );
  });

  it('keeps a system fallback and follows it with an interactive Android upgrade', () => {
    expect(sharedPushSource).toContain('notification: { title: copy.title, body: copy.body }');
    expect(sharedPushSource).toContain('channel_id: channelId');
    expect(sharedPushSource).toContain('tag: tagKey');
    expect(sharedPushSource).toContain("renderMode: 'fallback'");
    expect(sharedPushSource).toContain("renderMode: 'interactive'");
    expect(sharedPushSource).toContain("replaceSystemNotification: '1'");
  });
});
