import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function DailyBriefCard() {
  const [config, setConfig] = useState<DesktopDailyBriefConfig | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void window.electronAPI
      ?.getDailyBrief()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Daily brief settings could not load.');
      });
    return () => {
      active = false;
    };
  }, []);
  if (!window.electronAPI) return null;
  async function save() {
    if (!config) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setConfig(
        await window.electronAPI!.saveDailyBrief({
          enabled: config.enabled,
          time: config.time,
          autoLaunch: config.autoLaunch
        })
      );
      setNotice('Daily desktop brief settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings could not save.');
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await window.electronAPI!.previewDailyBrief();
      if (result.held) setNotice('Your brief will wait until the active exam is finished.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The brief could not load.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card id="settings-daily-brief" className="settings-anchor" tabIndex={-1}>
      <CardHeader title="Daily desktop brief" />
      <CardBody className="space-y-4">
        <p className="text-sm text-text-muted">
          A desktop popup with today’s Planner blocks, due reattempts and concepts to revise. It
          opens at your India-time schedule, or after the Mac next wakes. Active exams defer it.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {config?.last_error && (
          <p role="alert" className="text-sm text-danger">
            {config.last_error}
          </p>
        )}
        {!config && !error && <p role="status">Loading daily brief settings…</p>}
        {config && (
          <fieldset disabled={busy} className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
              />
              Show my daily study brief
            </label>
            <label className="flex flex-wrap items-center gap-3 text-sm">
              Daily time (India)
              <input
                type="time"
                aria-label="Daily time (India)"
                value={config.time}
                onChange={(event) => setConfig({ ...config, time: event.target.value })}
                className="rounded border border-border bg-bg p-2 text-text"
              />
              <span className="text-xs text-text-muted">Asia/Kolkata</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.autoLaunch}
                onChange={(event) => setConfig({ ...config, autoLaunch: event.target.checked })}
              />
              Launch HETU automatically if it is fully quit
            </label>
            <p className="text-xs text-text-muted">
              {config.autoLaunchInstalled
                ? 'macOS daily launch is installed. Keep this app at its current location.'
                : config.autoLaunchSupported
                  ? 'Save to apply the macOS daily launch setting.'
                  : 'Automatic launch is available in the packaged macOS app. While this app is open, the daily brief still works.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void save()}>
                Save daily brief
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void preview()}>
                Preview today’s brief
              </Button>
            </div>
          </fieldset>
        )}
        {notice && (
          <p role="status" className="text-sm text-text-muted">
            {notice}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
