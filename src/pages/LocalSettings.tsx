import { useEffect, useState } from 'react';
import { Bell, Download, Palette, Settings2, UserRound } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import Brand from '@/components/shared/Brand';
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
import { usePrefsStore, type DurationMin, type FontScale } from '@/stores/prefs';
import { collectProgressReport, downloadProgressReport } from '@/lib/progress-export';
import { QUESTION_COUNT_CHOICES, SUBJECTS, TARGET_DURATIONS_MIN, TIMEZONES } from '@/lib/constants';
import type { ThemeMode } from '@/lib/theme';
import '@/components/settings/local-settings.css';

export default function LocalSettings() {
  const { userId } = useAuth();
  const profile = useAuthStore((state) => state.profile);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const prefs = usePrefsStore();
  const [patch, setPatch] = useState<ProfilePatch>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const [advancedLoaded, setAdvancedLoaded] = useState(false);
  useEffect(() => {
    setPatch({});
    setProfileError('');
    setProfileNotice('');
  }, [profile?.id]);
  async function saveProfile() {
    setProfileBusy(true);
    setProfileError('');
    setProfileNotice('');
    try {
      const result = await updateProfile(patch);
      if (result.error) throw new Error(result.error);
      setPatch({});
      setProfileNotice('Profile saved.');
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Your profile could not save.');
    } finally {
      setProfileBusy(false);
    }
  }
  async function exportProgress() {
    if (!userId) return;
    setExportBusy(true);
    setExportError('');
    setExportNotice('');
    try {
      downloadProgressReport(await collectProgressReport(userId, profile?.name || 'Learner'));
      setExportNotice('Progress report downloaded.');
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'The export could not complete.');
    } finally {
      setExportBusy(false);
    }
  }
  return (
    <div className="local-settings">
      <Brand size="md" tagline className="mb-3" />
      <PageHeader compact title="Settings" description="A few preferences for your study space." />
      <Card id="settings-focus" className="settings-anchor" tabIndex={-1}>
        <CardHeader
          title={
            <>
              <Palette size={17} aria-hidden="true" /> Appearance
            </>
          }
        />
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
          <label className="local-settings__toggle">
            <input
              type="checkbox"
              checked={prefs.compactRows}
              onChange={(event) => prefs.set('compactRows', event.target.checked)}
            />
            Use compact rows
          </label>
          <label className="local-settings__toggle">
            <input
              type="checkbox"
              checked={prefs.showCountdown}
              onChange={(event) => prefs.set('showCountdown', event.target.checked)}
            />
            Show exam countdown
          </label>
        </CardBody>
      </Card>
      <Card id="settings-profile" className="settings-anchor" tabIndex={-1}>
        <CardHeader
          title={
            <>
              <UserRound size={17} aria-hidden="true" /> Your study
            </>
          }
        />
        <CardBody className="space-y-3">
          <fieldset disabled={!profile || profileBusy} className="grid gap-3 sm:grid-cols-2">
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
            <Button size="sm" disabled={profileBusy || !profile} onClick={() => void saveProfile()}>
              {profileBusy ? 'Saving…' : 'Save profile'}
            </Button>
          )}
          {profileError && (
            <p role="alert" className="text-sm text-danger">
              {profileError}
            </p>
          )}
          {profileNotice && (
            <p role="status" className="text-sm text-text-muted">
              {profileNotice}
            </p>
          )}
        </CardBody>
      </Card>

      {window.electronAPI && (
        <details className="local-settings__disclosure">
          <summary>
            <Bell size={17} aria-hidden="true" />
            <span>
              Daily brief<small>Your desktop study reminder</small>
            </span>
          </summary>
          <div className="local-settings__disclosure-body">
            <DailyBriefCard />
          </div>
        </details>
      )}
      <BackupHealthCard>
        <div className="local-settings__export">
          <div>
            <h3>Progress report</h3>
            <p>Download your recorded study progress as CSV.</p>
          </div>
          <Button size="sm" disabled={!userId || exportBusy} onClick={() => void exportProgress()}>
            <Download size={14} aria-hidden="true" />
            {exportBusy ? 'Preparing…' : 'Download progress'}
          </Button>
        </div>
        {exportError && (
          <p role="alert" className="text-sm text-danger">
            {exportError}
          </p>
        )}
        {exportNotice && (
          <p role="status" className="text-sm text-text-muted">
            {exportNotice}
          </p>
        )}
      </BackupHealthCard>
      <details
        className="local-settings__disclosure"
        onToggle={(event) => {
          if (event.currentTarget.open) setAdvancedLoaded(true);
        }}
      >
        <summary>
          <Settings2 size={17} aria-hidden="true" />
          <span>
            Advanced<small>Session defaults, AI & workspace tools</small>
          </span>
        </summary>
        {advancedLoaded && (
          <div className="local-settings__disclosure-body">
            <Card id="settings-study" className="settings-anchor" tabIndex={-1}>
              <CardHeader title="Session defaults & goals" />
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
              </CardBody>
            </Card>

            <LocalModelSettings />
            <LocalWorkspaceCard />
            <details className="local-settings__reset">
              <summary>Reset preferences</summary>
              <p>Restore study and appearance defaults. Your study records are kept.</p>
              <Button variant="ghost" size="sm" onClick={() => prefs.reset()}>
                Restore defaults
              </Button>
            </details>
          </div>
        )}
      </details>
    </div>
  );
}
