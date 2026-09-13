import { useState } from 'react';
import { useOnline, usePendingCount, useInitialPullPending } from '@/hooks/useSync';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { reconcileAll } from '@/lib/sync';
import { flushAllDurableState } from '@/lib/durability';
import { reloadAccountState } from '@/lib/account-state';

/** Sync status badge with click-to-reconcile for explicit multi-device confidence. */
export default function OfflineBadge({ className }: { className?: string }) {
  const online = useOnline();
  const pending = usePendingCount();
  const initialPull = useInitialPullPending();
  const auth = useAuth();
  const [manualSyncing, setManualSyncing] = useState(false);

  if (auth.sandbox) {
    return (
      <span className={cn('u-label text-text-faint', className)} title="Local sandbox — no sync">
        sandbox
      </span>
    );
  }

  const handleManualSync = async () => {
    if (!auth.userId || manualSyncing) return;
    setManualSyncing(true);
    try {
      await flushAllDurableState(auth.userId);
      await reconcileAll(auth.userId);
      await reloadAccountState(auth.userId);
    } finally {
      setManualSyncing(false);
    }
  };

  if (online && pending === 0 && !initialPull && !manualSyncing) return null;

  return (
    <button
      type="button"
      onClick={() => void handleManualSync()}
      disabled={manualSyncing}
      className={cn(
        'u-label cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-0 p-0',
        online ? 'text-text-muted' : 'text-warn',
        className
      )}
      title={
        online
          ? manualSyncing
            ? 'Syncing with cloud...'
            : initialPull
              ? 'Downloading latest data'
              : 'Sync in progress — click to force sync'
          : 'Offline — writes are saved locally'
      }
    >
      {manualSyncing
        ? 'syncing...'
        : online
          ? initialPull
            ? 'syncing...'
            : `syncing ${pending}`
          : `offline${pending > 0 ? ` · ${pending} queued` : ''}`}
    </button>
  );
}
