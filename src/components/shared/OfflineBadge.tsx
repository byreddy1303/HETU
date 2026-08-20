import { useOnline, usePendingCount } from '@/hooks/useSync';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/** Quiet sync status: invisible when everything is synced and online. */
export default function OfflineBadge({ className }: { className?: string }) {
  const { sandbox } = useAuth();
  const online = useOnline();
  const pending = usePendingCount(!sandbox);

  if (sandbox) {
    return (
      <span className={cn('u-label text-text-faint', className)} title="Local sandbox — no sync">
        sandbox
      </span>
    );
  }
  if (online && pending === 0) return null;

  return (
    <span
      className={cn('u-label', online ? 'text-text-muted' : 'text-warn', className)}
      title={online ? 'Sync in progress' : 'Offline — writes are saved locally'}
    >
      {online ? `syncing ${pending}` : `offline${pending > 0 ? ` · ${pending} queued` : ''}`}
    </span>
  );
}
