import { useOnline, usePendingCount, useInitialPullPending } from '@/hooks/useSync';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/** Quiet sync status: invisible when everything is synced and online. */
export default function OfflineBadge({ className }: { className?: string }) {
  const online = useOnline();
  const pending = usePendingCount();
  const initialPull = useInitialPullPending();
  const auth = useAuth();

  if (auth.sandbox) {
    return (
      <span className={cn('u-label text-text-faint', className)} title="Local sandbox — no sync">
        sandbox
      </span>
    );
  }
  if (online && pending === 0 && !initialPull) return null;

  return (
    <span
      className={cn('u-label', online ? 'text-text-muted' : 'text-warn', className)}
      title={online ? (initialPull ? 'Downloading latest data' : 'Sync in progress') : 'Offline — writes are saved locally'}
    >
      {online ? (initialPull ? 'syncing...' : `syncing ${pending}`) : `offline${pending > 0 ? ` · ${pending} queued` : ''}`}
    </span>
  );
}
