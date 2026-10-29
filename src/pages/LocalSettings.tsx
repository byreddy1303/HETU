import { useEffect, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import LocalWorkspaceCard from '@/components/settings/LocalWorkspaceCard';
import BackupHealthCard from '@/components/settings/BackupHealthCard';
import DailyBriefCard from '@/components/settings/DailyBriefCard';
import LocalModelSettings from '@/components/settings/LocalModelSettings';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore, type ProfilePatch } from '@/stores/auth';
import { usePrefsStore, WEEKDAYS, type DurationMin, type FontScale } from '@/stores/prefs';
import { collectProgressReport, downloadProgressReport } from '@/lib/progress-export';
import { QUESTION_COUNT_CHOICES, SUBJECTS, TARGET_DURATIONS_MIN, TIMEZONES } from '@/lib/constants';
import type { ThemeMode } from '@/lib/theme';
import '@/supporting-surfaces.css';

export default function LocalSettings() {
  const { userId } = useAuth();
  const profile = useAuthStore((state) => state.profile);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const prefs = usePrefsStore();
  const [patch, setPatch] = useState<ProfilePatch>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setPatch({});
  }, [profile?.id]);
  const sections = [
    ...(window.electronAPI ? [['daily-brief', 'Daily desktop brief']] : []),
    ['local', 'Local workspace & MCP'],
    ['backups', 'Backups'],
    ['model', 'Local model'],
    ['study', 'Study defaults'],
    ['focus', 'Appearance'],
    ['profile', 'Your profile'],
    ['progress', 'Export']
  ];
  async function saveProfile() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await updateProfile(patch);
      if (result.error) throw new Error(result.error);
      setPatch({});
      setNotice('Profile saved on this workspace.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your profile could not save.');
    } finally {
      setBusy(false);
    }
  }
  async function exportProgress() {
    if (!userId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      downloadProgressReport(await collectProgressReport(userId, profile?.name || 'Learner'));
      setNotice('Progress report downloaded.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export could not complete.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-workspace space-y-4">
      <PageHeader title="Settings" description="Controls for your local desktop workspace." />
      <div className="settings-layout">
        <nav className="settings-wayfinding" aria-label="Settings sections">
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={`#settings-${id}`}
              onClick={(event) => {
                event.preventDefault();
                const target = document.getElementById(`settings-${id}`);
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target?.focus({ preventScroll: true });
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="settings-content space-y-4">
          <DailyBriefCard />
          <LocalWorkspaceCard />
          <BackupHealthCard />
          <LocalModelSettings />
          <Card id="settings-study" className="settings-anchor" tabIndex={-1}>
            <CardHeader title="Study defaults" />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Daily question target
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={prefs.dailyQuestionTarget}
                  onChange={(event) =>
                    prefs.set(
                      'dailyQuestionTarget',
                      Math.max(1, Math.min(200, Math.round(Number(event.target.value) || 1)))
                    )
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Weekly session target
                <Input
                  type="number"
                  min={1}
                  max={21}
                  value={prefs.weeklySessionTarget}
                  onChange={(event) =>
                    prefs.set(
                      'weeklySessionTarget',
                      Math.max(1, Math.min(21, Math.round(Number(event.target.value) || 1)))
                    )
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Default subject
                <Select
                  value={prefs.defaultSubject || ''}
                  onChange={(event) => prefs.set('defaultSubject', event.target.value || null)}
                >
                  <option value="">Choose each time</option>
                  {SUBJECTS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                Session duration
                <Select
                  value={String(prefs.defaultDurationMin)}
                  onChange={(event) =>
                    prefs.set('defaultDurationMin', Number(event.target.value) as DurationMin)
                  }
                >
                  {TARGET_DURATIONS_MIN.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                Default question count
                <Select
                  value={String(prefs.defaultQuestionCount)}
                  onChange={(event) =>
                    prefs.set('defaultQuestionCount', Number(event.target.value))
                  }
                >
                  {QUESTION_COUNT_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                Weekly review day
                <Select
                  value={String(prefs.weeklyReviewDay)}
                  onChange={(event) =>
                    prefs.set(
                      'weeklyReviewDay',
                      Number(event.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6
                    )
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </Select>
              </label>
            </CardBody>
          </Card>
          <Card id="settings-focus" className="settings-anchor" tabIndex={-1}>
            <CardHeader title="Appearance" />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Theme
                  <Select
                    value={prefs.colorTheme}
                    onChange={(event) => prefs.set('colorTheme', event.target.value as ThemeMode)}
                  >
                    <option value="system">Follow system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  Text size
                  <Select
                    value={prefs.fontScale}
                    onChange={(event) => prefs.set('fontScale', event.target.value as FontScale)}
                  >
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </Select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.compactRows}
                  onChange={(event) => prefs.set('compactRows', event.target.checked)}
                />
                Use compact rows
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.showCountdown}
                  onChange={(event) => prefs.set('showCountdown', event.target.checked)}
                />
                Show exam countdown
              </label>
              <details>
                <summary className="cursor-pointer text-sm text-text-muted">
                  Reset study and appearance defaults
                </summary>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => prefs.reset()}>
                  Reset preferences
                </Button>
              </details>
            </CardBody>
          </Card>
          <Card id="settings-profile" className="settings-anchor" tabIndex={-1}>
            <CardHeader title="Your profile" />
            <CardBody className="space-y-3">
              {profile?.username && <p className="text-sm text-text-muted">@{profile.username}</p>}
              <fieldset disabled={!profile || busy} className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Name
                  <Input
                    value={patch.name ?? profile?.name ?? ''}
                    onChange={(event) => setPatch({ ...patch, name: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Exam date
                  <Input
                    type="date"
                    value={patch.exam_date ?? profile?.exam_date ?? ''}
                    onChange={(event) => setPatch({ ...patch, exam_date: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Target AIR
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    value={patch.target_rank ?? profile?.target_rank ?? 100}
                    onChange={(event) =>
                      setPatch({
                        ...patch,
                        target_rank: Math.max(
                          1,
                          Math.min(100000, Math.round(Number(event.target.value) || 1))
                        )
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Study timezone
                  <Select
                    value={patch.timezone ?? profile?.timezone ?? 'Asia/Kolkata'}
                    onChange={(event) => setPatch({ ...patch, timezone: event.target.value })}
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </fieldset>
              {Object.keys(patch).length > 0 && (
                <Button size="sm" disabled={busy || !profile} onClick={() => void saveProfile()}>
                  Save profile
                </Button>
              )}
            </CardBody>
          </Card>
          <Card id="settings-progress" className="settings-anchor" tabIndex={-1}>
            <CardHeader title="Export" />
            <CardBody className="space-y-3">
              <p className="text-sm text-text-muted">
                Download your recorded study progress as CSV. Database recovery uses the verified
                backups above.
              </p>
              <Button size="sm" disabled={!userId || busy} onClick={() => void exportProgress()}>
                Download progress
              </Button>
            </CardBody>
          </Card>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-text-muted">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
