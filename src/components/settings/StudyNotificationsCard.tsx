import { useCallback, useEffect, useState } from 'react';
import { BellRing, Clock3, Loader2, Send } from 'lucide-react';
import {
  disableStudyNotifications,
  enableStudyNotifications,
  studyPushOptedIn
} from '@/lib/buddyNotifications';
import {
  STUDY_NOTIFICATION_CATEGORIES,
  ensureStudyNotificationPreferences,
  notificationTime,
  parseNotificationTime,
  sendStudyNotificationTest,
  updateStudyNotificationPreference,
  type StudyNotificationCategory,
  type StudyNotificationPreference
} from '@/lib/studyNotifications';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { UserRow } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

interface Props {
  profile: UserRow | null;
  sandbox: boolean;
}

export default function StudyNotificationsCard({ profile, sandbox }: Props) {
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const pushToast = useUiStore((state) => state.pushToast);
  const [preferences, setPreferences] = useState<StudyNotificationPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<StudyNotificationCategory | null>(null);

  const load = useCallback(async () => {
    if (!profile || sandbox) return;
    setLoading(true);
    try {
      setPreferences(await ensureStudyNotificationPreferences());
    } catch (error) {
      pushToast((error as Error).message || 'Could not load study reminders.', 'neutral');
    } finally {
      setLoading(false);
    }
  }, [profile, pushToast, sandbox]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMaster(enabled: boolean) {
    if (!profile || sandbox) return;
    setSaving('master');
    try {
      if (enabled) {
        const result = await enableStudyNotifications();
        if (!result.ok) throw new Error(result.error ?? 'Could not enable device notifications.');
        if (preferences.length === 0) setPreferences(await ensureStudyNotificationPreferences());
      } else {
        const result = await disableStudyNotifications();
        if (!result.ok) throw new Error(result.error ?? 'Could not disable study notifications.');
      }
      const result = await updateProfile({ study_notifications_enabled: enabled });
      if (result.error) throw new Error(result.error);
      pushToast(
        enabled ? 'Daily study reminders enabled.' : 'Daily study reminders paused.',
        'success'
      );
    } catch (error) {
      pushToast((error as Error).message || 'Could not update study reminders.', 'neutral');
    } finally {
      setSaving(null);
    }
  }

  async function updateCategory(
    category: StudyNotificationCategory,
    patch: Partial<Pick<StudyNotificationPreference, 'enabled' | 'hour_local' | 'minute_local'>>
  ) {
    if (!profile || sandbox) return;
    const before = preferences;
    setPreferences((rows) =>
      rows.map((row) => (row.category === category ? { ...row, ...patch } : row))
    );
    setSaving(category);
    try {
      await updateStudyNotificationPreference(profile.id, category, patch);
    } catch (error) {
      setPreferences(before);
      pushToast((error as Error).message || 'Could not update this reminder.', 'neutral');
    } finally {
      setSaving(null);
    }
  }

  async function sendTest(category: StudyNotificationCategory) {
    if (!profile || sandbox) return;
    setTesting(category);
    try {
      await sendStudyNotificationTest(profile.id, category);
      pushToast('Interactive test notification sent.', 'success');
    } catch (error) {
      pushToast((error as Error).message || 'Could not send the test.', 'neutral');
    } finally {
      setTesting(null);
    }
  }

  const byCategory = new Map(preferences.map((preference) => [preference.category, preference]));
  // Account consent gates the cron; local consent confirms this particular
  // installation is registered for the study channel. Showing only the
  // account flag would make a newly installed phone look enabled when it is not.
  const masterEnabled = profile?.study_notifications_enabled === true && studyPushOptedIn();

  return (
    <Card id="study-notifications">
      <CardHeader
        title={
          <span>
            <span className="block">Interactive study reminders</span>
            <span className="mt-0.5 block normal-case tracking-normal text-[10.5px] font-normal text-text-faint">
              Module-specific daily schedules and actions
            </span>
          </span>
        }
        aside={<BellRing size={17} strokeWidth={1.75} className="text-accent" />}
      />
      <CardBody className="space-y-4">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-[12.5px] font-semibold text-text">
              Daily study reminders on this device
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-text-muted">
              Separate from Buddy messages and Telegram. Times use{' '}
              {profile?.timezone ?? 'your timezone'}.
            </span>
          </span>
          <input
            type="checkbox"
            checked={masterEnabled}
            onChange={(event) => void toggleMaster(event.target.checked)}
            disabled={!profile || sandbox || saving === 'master'}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
        </label>

        <div className="rounded border border-border/80 bg-bg-overlay/20">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading module schedules…
            </div>
          ) : (
            STUDY_NOTIFICATION_CATEGORIES.map((item) => {
              const preference = byCategory.get(item.id);
              if (!preference) return null;
              const busy = saving === item.id;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_96px_auto_auto] items-center gap-2 border-b border-border/70 px-3 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-text">{item.label}</p>
                    <p className="truncate text-[10.5px] text-text-faint">
                      {item.action} · Remind in 1h · Mute
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5">
                    <Clock3 size={12} className="text-text-faint" />
                    <input
                      type="time"
                      step={900}
                      value={notificationTime(preference)}
                      onChange={(event) => {
                        const parsed = parseNotificationTime(event.target.value);
                        if (parsed)
                          void updateCategory(item.id, {
                            hour_local: parsed.hour,
                            minute_local: parsed.minute
                          });
                      }}
                      disabled={!masterEnabled || !preference.enabled || busy || sandbox}
                      className="u-control h-8 w-[88px] rounded border border-border bg-bg-raised px-1.5 text-[11px] text-text disabled:opacity-50"
                      aria-label={`${item.label} reminder time`}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void sendTest(item.id)}
                    disabled={!masterEnabled || !preference.enabled || testing !== null || sandbox}
                    aria-label={`Send ${item.label} test notification`}
                  >
                    {testing === item.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                  </Button>
                  <input
                    type="checkbox"
                    checked={preference.enabled}
                    onChange={(event) =>
                      void updateCategory(item.id, { enabled: event.target.checked })
                    }
                    disabled={!masterEnabled || busy || sandbox}
                    className="h-4 w-4 accent-accent"
                    aria-label={`Enable ${item.label} reminder`}
                  />
                </div>
              );
            })
          )}
        </div>
        <p className="text-[10.5px] leading-relaxed text-text-faint">
          Android shows at most three relevant actions. Mute disables only that module; it never
          disables Buddy messages.
        </p>
      </CardBody>
    </Card>
  );
}
