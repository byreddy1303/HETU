import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { table, SYNCED_TABLES } from '@/lib/db';
import { initSync, stopSync, isInitialPullActive, subscribeInitialPull } from '@/lib/sync';
import { useAuth } from '@/hooks/useAuth';

/** Boot the sync engine for the signed-in user. Mount once (Shell). */
export function useSyncBootstrap(): void {
  const { status, userId, sandbox } = useAuth();
  useEffect(() => {
    if (status === 'signed_in' && userId && !sandbox) {
      initSync(userId);
      return () => stopSync();
    }
  }, [status, userId, sandbox]);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Count of rows still waiting to reach the server. */
export function usePendingCount(): number {
  return (
    useLiveQuery(async () => {
      const counts = await Promise.all(
        SYNCED_TABLES.map((name) =>
          table(name).where('sync_status').anyOf('pending', 'error').count()
        )
      );
      return counts.reduce((total, count) => total + count, 0);
    }, []) ?? 0
  );
}

export function useInitialPullPending(): boolean {
  const [pending, setPending] = useState(isInitialPullActive);
  useEffect(() => {
    const unsubscribe = subscribeInitialPull(() => setPending(isInitialPullActive()));
    return () => { unsubscribe(); };
  }, []);
  return pending;
}
