import { Cloud, RefreshCw, TriangleAlert } from 'lucide-react';
import { useSyncStatusStore } from '@/stores/sync-status';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

function clock(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Live proof that data reached Postgres. Rendered from the sync-status store,
 * which is updated by every confirmed write, every completed hydrate, and the
 * 300ms Postgres heartbeat — so the clock is the last round-trip the database
 * acknowledged.
 */
export default function SyncStatusBadge({ className }: { className?: string }) {
  const sandbox = useAuthStore((s) => s.sandbox);
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt);
  const syncing = useSyncStatusStore((s) => s.syncing);
  const degraded =
    useSyncStatusStore((s) =>
      s.lastErrorAt != null && (s.lastSyncedAt == null || s.lastErrorAt > s.lastSyncedAt)
    ) === true;

  if (sandbox) return null;

  if (!lastSyncedAt) {
    if (!syncing) return null;
    return (
      <span
        className={cn('u-label flex items-center gap-1 text-text-muted', className)}
        title="Downloading your data from the database"
      >
        <RefreshCw size={11} aria-hidden />
        connecting&hellip;
      </span>
    );
  }

  if (degraded) {
    return (
      <span
        className={cn('u-label flex items-center gap-1 text-warn', className)}
        title="Last database check failed — the app retries every 300ms"
      >
        <TriangleAlert size={11} aria-hidden />
        reconnect&hellip;
      </span>
    );
  }

  return (
    <span
      className={cn('u-label flex items-center gap-1 text-success', className)}
      title={`Every change is saved straight to your database. Last confirmed sync ${clock(lastSyncedAt)}`}
    >
      <Cloud size={11} aria-hidden />
      synced {clock(lastSyncedAt)}
    </span>
  );
}