// Per-device wipe used on sign-out and by the "Wipe local" Settings button.
// A partial wipe would leak state between accounts on shared devices, which
// is a real concern for a multi-user tool that hands out invites. This util
// exists so both the auth store and the Settings UI share exactly one
// implementation of "fully forget everything about the previous session".
import { clearLocalData } from '@/lib/db';
import { DEFAULT_PREFERENCES, usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';
import { useLogStore } from '@/stores/log';
import { resetTopicProgressMemory } from '@/stores/topic-progress';

const KNOWN_LOCALSTORAGE_KEYS = ['air.prefs', 'air.session', 'air.log'];

/**
 * Fully wipe every scrap of user-scoped state on this device:
 *   • all Dexie tables (including meta)
 *   • zustand stores that persist to localStorage (prefs / session / log)
 *   • any residual `air.*` / `air-journal:*` keys in localStorage
 *   • any remaining in-memory user data
 *
 * Each step is wrapped so a partial failure never blocks the remaining
 * cleanup attempts. The function rejects after all attempts if any step
 * failed; callers must not report a successful cache clear in that case.
 */
export async function wipeLocalState(): Promise<void> {
  const failures: string[] = [];
  // Reset in-memory zustand first so subsequent persist writes don't race.
  try {
    usePrefsStore.setState({ ...DEFAULT_PREFERENCES });
  } catch {
    failures.push('preferences memory');
  }
  try {
    useSessionStore.getState().end();
  } catch {
    failures.push('session memory');
  }
  try {
    useLogStore.getState().end();
  } catch {
    failures.push('log draft memory');
  }
  try {
    resetTopicProgressMemory();
  } catch {
    failures.push('syllabus memory');
  }
  try {
    for (const key of KNOWN_LOCALSTORAGE_KEYS) localStorage.removeItem(key);
    // Sweep any other app-owned keys via the Storage index API rather than
    // Object.keys (Storage is not a plain object in every runtime, and
    // Object.keys can miss stored entries in jsdom / server envs).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('air.') || key.startsWith('air-journal:'))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    failures.push('browser storage');
  }
  try {
    await clearLocalData();
  } catch {
    failures.push('offline database');
  }

  if (failures.length > 0) {
    throw new Error(`Local cache cleanup was incomplete: ${failures.join(', ')}.`);
  }
}
