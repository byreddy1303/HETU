import { useEffect } from 'react';
import {
  retryAccountStateSync,
  startAccountStateSync,
  stopAccountStateSync
} from '@/lib/account-state';
import { supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { flushAllDurableState } from '@/lib/durability';
import { awaitInitialPull } from '@/lib/sync';
import { backfillLocalLearningEvidence } from '@/lib/learning-recovery';

/**
 * Bind durable account-state hydration and retry handling to the active login.
 * Sandbox mode deliberately keeps its existing device-local behaviour.
 */
export function useAccountState(): void {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const timeZone = useAuthStore((state) => state.profile?.timezone ?? 'Asia/Kolkata');
  const sandbox = useAuthStore((state) => state.sandbox);
  const canSync = status === 'signed_in' && !sandbox && supabaseConfigured && !!userId;
  const recoveryOwnerId = userId ?? profileId;

  useEffect(() => {
    if (!canSync || !userId) return;
    void startAccountStateSync(userId).catch((error) => {
      console.error(
        '[air] Account state could not be loaded; the local cache remains active.',
        error
      );
    });
    return () => stopAccountStateSync(userId);
  }, [canSync, userId]);

  useEffect(() => {
    if (status !== 'signed_in' || !recoveryOwnerId) return;
    let cancelled = false;
    const backfill = async () => {
      if (canSync) await awaitInitialPull(recoveryOwnerId);
      if (cancelled) return;
      await backfillLocalLearningEvidence(recoveryOwnerId, timeZone);
    };
    void backfill().catch((error) => {
      console.error('[air] Recovery evidence migration is waiting to retry.', error);
    });
    return () => {
      cancelled = true;
    };
  }, [canSync, recoveryOwnerId, status, timeZone]);

  useEffect(() => {
    if (!canSync || !userId) return;
    // Migrate every legacy device cache at login, even if its owning page is
    // never opened before the user signs out or clears browser storage.
    void flushAllDurableState(userId).then((result) => {
      if (!result.ok) console.error('[air] Some account data is waiting to sync.', result.error);
    });
  }, [canSync, userId]);

  useEffect(() => {
    if (!canSync || !userId) return;
    const retry = () => {
      void retryAccountStateSync(userId).catch((error) => {
        console.error('[air] Account state is still waiting to sync.', error);
      });
      void flushAllDurableState(userId).then((result) => {
        if (!result.ok)
          console.error('[air] Some account data is still waiting to sync.', result.error);
      });
    };

    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
    };
  }, [canSync, userId]);
}
