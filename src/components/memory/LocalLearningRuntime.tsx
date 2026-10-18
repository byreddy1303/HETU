import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { backendConfig } from '@/lib/backend-config';
import { subscribeDb } from '@/lib/db';
import { LEARNING_UPDATED_EVENT, runLocalLearningEngine } from '@/lib/local-learning-engine';

/** A fast trigger; model generation runs asynchronously in the local backend. */
export default function LocalLearningRuntime() {
  const { userId } = useAuth();
  useEffect(() => {
    if (!userId || !backendConfig.isLocal) return;
    let active = true;
    let pending = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (!active || pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        await runLocalLearningEngine();
        if (active) window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT));
      } catch {
        // The visible learning panel reports failures without interrupting practice.
      } finally {
        pending = false;
      }
    };
    const changed = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void check();
      }, 2500);
    };
    const unsubscribe = subscribeDb(changed, ['pyq_attempts', 'pyq_sessions']);
    const interval = setInterval(() => {
      void check();
    }, 60_000);
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('hetu:memory-saved', changed);
    void check();
    return () => {
      active = false;
      unsubscribe();
      clearInterval(interval);
      clearTimeout(debounce);
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('hetu:memory-saved', changed);
    };
  }, [userId]);
  return null;
}
