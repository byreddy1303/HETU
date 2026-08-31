// Resumable state for the /log flow. localStorage is the immediate/offline
// cache; authenticated accounts are also mirrored by the account-state runtime
// so an in-progress entry survives cache clears and device changes. Two modes:
//   'single'   — a one-shot entry; committed and cleared on save.
//   'multi'    — a batch: the user picks a subject / source once, then logs
//                as many questions as they want. Each save writes a row but
//                keeps the sticky context on screen; End session closes the
//                batch and (optionally) navigates to a summary.
//
// Multi-mode also creates a real SessionRow so the grouping appears in the
// Recent-sessions strip on Journal. The session's target_duration_min is 0 —
// a signal that this was a log batch, not a timed session. Duration is set
// on End (mins since startedAt).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EditorDraft } from '@/components/shared/questionDraft';

export type LogMode = 'idle' | 'single' | 'multi';

export interface LogDraftSnapshot {
  mode: LogMode;
  /** Only set in 'multi' mode: the SessionRow id these logs belong to. */
  sessionId: string | null;
  /** Only set in 'multi' mode: wall-clock ms when the batch was started. */
  startedAt: number | null;
  /** How many rows the user has committed in the current batch. */
  loggedCount: number;
  /** Persisted in-progress draft so nav-away doesn't lose typing. */
  draft: EditorDraft | null;
}

export const EMPTY_LOG_DRAFT: LogDraftSnapshot = {
  mode: 'idle',
  sessionId: null,
  startedAt: null,
  loggedCount: 0,
  draft: null
};

interface LogState extends LogDraftSnapshot {
  beginSingle: () => void;
  beginMulti: (sessionId: string) => void;
  bumpLogged: () => void;
  setDraft: (d: EditorDraft | null) => void;
  end: () => void;
}

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
      ...EMPTY_LOG_DRAFT,
      beginSingle: () =>
        set({ mode: 'single', sessionId: null, startedAt: null, loggedCount: 0, draft: null }),
      beginMulti: (sessionId) =>
        set({
          mode: 'multi',
          sessionId,
          startedAt: Date.now(),
          loggedCount: 0,
          draft: null
        }),
      bumpLogged: () => set((s) => ({ loggedCount: s.loggedCount + 1 })),
      setDraft: (draft) => set({ draft }),
      end: () => set({ ...EMPTY_LOG_DRAFT })
    }),
    {
      name: 'air.log',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
