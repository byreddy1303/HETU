// Per-device wipe used on sign-out and by the "Wipe local" Settings button.
// A partial wipe would leak state between accounts on shared devices, which
// is a real concern for a multi-user tool that hands out invites. This util
// exists so both the auth store and the Settings UI share exactly one
// implementation of "fully forget everything about the previous session".
import { clearLocalData } from '@/lib/db';
import { DEFAULT_PREFERENCES, usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';
import { useLogStore } from '@/stores/log';
import { useTopicProgressStore } from '@/stores/topic-progress';

const KNOWN_LOCALSTORAGE_KEYS = ['air.prefs', 'air.session', 'air.log'];

/**
 * Fully wipe every scrap of user-scoped state on this device:
 *   • all Dexie tables (including meta)
 *   • zustand stores that persist to localStorage (prefs / session / log)
 *   • any residual `air.*` keys in localStorage
 *   • any remaining in-memory user data
 *
 * Each step is wrapped in try/catch so a partial failure never blocks the
 * others — the invariant is "after this returns, the account is unknown."
 */
export async function wipeLocalState(): Promise<void> {
  // Reset in-memory zustand first so subsequent persist writes don't race.
  try {
    usePrefsStore.setState({ ...DEFAULT_PREFERENCES });
  } catch {
    // ignore
  }
  try {
    useSessionStore.getState().end();
  } catch {
    // ignore
  }
  try {
    useLogStore.getState().end();
  } catch {
    // ignore
  }
  try {
    useTopicProgressStore.setState({ byUser: {} });
  } catch {
    // ignore
  }
  try {
    for (const key of KNOWN_LOCALSTORAGE_KEYS) localStorage.removeItem(key);
    // Sweep any other `air.*` keys via the Storage index API rather than
    // Object.keys (Storage is not a plain object in every runtime, and
    // Object.keys can miss stored entries in jsdom / server envs).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('air.')) localStorage.removeItem(key);
    }
  } catch {
    // storage may be unavailable in private-mode browsers
  }
  try {
    await clearLocalData();
  } catch {
    // Dexie in an odd state — nothing more we can do, still return.
  }
}
