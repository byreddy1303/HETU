// Runtime state of the active session. Durable facts (session row, tagged
// questions) live in Dexie; this holds the resumable in-progress state:
// planned question count (intentionally not stored in the schema), the current
// question's start timestamp so in-app navigation never resets the timer,
// and which mode (solve vs tag) plus the elapsed time captured when the user
// opened the tag flow so mid-session navigation returns to the same screen.
//
// localStorage remains the immediate/offline cache. Authenticated accounts are
// also mirrored through the account-state runtime, so a hard reload or a new
// device resumes where the user left off (including the original timer).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SessionMode = 'solve' | 'tag';

export interface ActiveSessionSnapshot {
  sessionId: string | null;
  plannedCount: number;
  questionStartedAt: number | null;
  mode: SessionMode;
  /** Frozen elapsed seconds captured when the user opened the tag flow. */
  pendingTimeSpent: number | null;
}

export const EMPTY_ACTIVE_SESSION: ActiveSessionSnapshot = {
  sessionId: null,
  plannedCount: 0,
  questionStartedAt: null,
  mode: 'solve',
  pendingTimeSpent: null
};

interface SessionRunState extends ActiveSessionSnapshot {
  begin: (sessionId: string, plannedCount: number) => void;
  startQuestion: () => void;
  enterTag: (timeSpent: number) => void;
  cancelTag: () => void;
  end: () => void;
}

export const useSessionStore = create<SessionRunState>()(
  persist(
    (set) => ({
      ...EMPTY_ACTIVE_SESSION,
      begin: (sessionId, plannedCount) =>
        set({
          sessionId,
          plannedCount,
          questionStartedAt: Date.now(),
          mode: 'solve',
          pendingTimeSpent: null
        }),
      startQuestion: () =>
        set({ questionStartedAt: Date.now(), mode: 'solve', pendingTimeSpent: null }),
      enterTag: (timeSpent) => set({ mode: 'tag', pendingTimeSpent: timeSpent }),
      cancelTag: () => set({ mode: 'solve', pendingTimeSpent: null }),
      end: () => set({ ...EMPTY_ACTIVE_SESSION })
    }),
    {
      name: 'air.session',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sessionId: s.sessionId,
        plannedCount: s.plannedCount,
        questionStartedAt: s.questionStartedAt,
        mode: s.mode,
        pendingTimeSpent: s.pendingTimeSpent
      })
    }
  )
);
