import { useEffect, useState, type ReactNode } from 'react';
import { DatabaseBackup, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/lib/fastapi-client';
import { backendConfig } from '@/lib/backend-config';

interface BackupHealth {
  state: 'never' | 'running' | 'ready' | 'warning' | 'error';
  backup_dir: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  stale: boolean;
  last_backup: {
    path: string;
    size_bytes: number;
    integrity: string;
    file_available: boolean;
  } | null;
  cloud_copy: { state: 'disabled' | 'unavailable' | 'copied' | 'failed'; path: string | null };
}

function dateLabel(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

export default function BackupHealthCard({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<BackupHealth | null>(null);
  const [busy, setBusy] = useState<'loading' | 'backup' | null>('loading');
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!backendConfig.isLocal) return;
    const controller = new AbortController();
    setBusy('loading');
    setError(null);
    void apiRequest<BackupHealth>('/v1/local-backups/status', { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) setStatus(next);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Backup health could not load.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => controller.abort();
  }, [revision]);

  async function createBackup() {
    setBusy('backup');
    setError(null);
    try {
      setStatus(await apiRequest<BackupHealth>('/v1/local-backups/run', { method: 'POST' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The backup could not complete.');
      // A timeout may follow a successful snapshot; inspect its durable receipt.
      try {
        setStatus(await apiRequest<BackupHealth>('/v1/local-backups/status'));
      } catch {
        /* Keep the original error. */
      }
    } finally {
      setBusy(null);
    }
  }

  if (!backendConfig.isLocal) return null;
  const verified = status?.last_backup?.integrity === 'ok' && status.last_backup.file_available;
  const running = busy === 'backup' || status?.state === 'running';
  const label = running
    ? 'Creating a verified snapshot…'
    : !status
      ? error
        ? 'Backup status unavailable'
        : 'Checking backup health…'
      : status.state === 'error'
        ? 'Backup needs attention'
        : status.state === 'warning'
          ? 'Local snapshot saved; a copy needs attention'
          : verified && status.stale
            ? 'The last verified backup is over two hours old'
            : verified
              ? 'Verified local snapshot available'
              : 'No verified snapshot recorded';

  const checkHealthControl = (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy !== null}
      onClick={() => setRevision((value) => value + 1)}
    >
      <RefreshCw size={14} aria-hidden="true" /> Check backup health
    </Button>
  );

  return (
    <Card id="settings-backups" className="settings-anchor" tabIndex={-1}>
      <CardHeader
        title={
          <>
            <DatabaseBackup size={17} aria-hidden="true" />{' '}
            {children ? 'Backups & export' : 'Backups'}
          </>
        }
      />
      <CardBody className="space-y-3">
        <div className="local-settings__backup-overview">
          <div>
            <p role="status" className="text-sm font-semibold">
              {label}
            </p>
            {status?.last_success_at && (
              <p className="mt-1 text-xs text-text-muted">
                Last backup · {dateLabel(status.last_success_at)}
              </p>
            )}
          </div>
          <Button size="sm" disabled={busy !== null || running} onClick={() => void createBackup()}>
            <DatabaseBackup size={14} aria-hidden="true" />
            {busy === 'backup' ? 'Backing up…' : 'Back up now'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {status?.last_error && (
          <p role="alert" className="text-sm text-danger">
            {status.last_error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-text-muted">
          Automatic backups run at startup and hourly while HETU is open. Copies stay on this Mac.
        </p>
        <details className="local-settings__backup-details">
          <summary>Backup details</summary>
          {status && (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-text-muted">Last attempt</dt>
                <dd>{dateLabel(status.last_attempt_at)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Backup folder</dt>
                <dd className="break-all font-mono text-xs">{status.backup_dir}</dd>
              </div>
              {verified && (
                <div>
                  <dt className="text-text-muted">Snapshot verified when created</dt>
                  <dd>
                    SQLite integrity check passed ·{' '}
                    {Math.round(status.last_backup!.size_bytes / 1024).toLocaleString()} KB
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="text-xs leading-relaxed text-text-muted">
            A local snapshot protects against database damage. This check does not rehearse a
            restore.
          </p>
          <p className="text-xs leading-relaxed text-text-muted">
            {status?.cloud_copy?.state === 'copied'
              ? 'A matching copy was written to iCloud Drive on this Mac. Cloud upload and recovery on another device are not verified.'
              : status?.cloud_copy?.state === 'failed'
                ? 'The iCloud Drive copy failed. No off-device backup is verified.'
                : 'No off-device backup is verified. Keep a separate copy of the backup folder on another device or drive.'}
          </p>
          {!error && checkHealthControl}
        </details>
        {error && checkHealthControl}
        {children}
      </CardBody>
    </Card>
  );
}
