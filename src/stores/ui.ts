import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface UiState {
  navCollapsed: boolean;
  toasts: Toast[];
  setNavCollapsed: (v: boolean) => void;
  toggleNavCollapsed: () => void;
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
const TOAST_TTL_MS = 3200;

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      navCollapsed: false,
      toasts: [],

      setNavCollapsed: (v) => set({ navCollapsed: v }),
      toggleNavCollapsed: () => set((s) => ({ navCollapsed: !s.navCollapsed })),

      pushToast: (message, tone = 'neutral') => {
        const id = ++toastSeq;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
        setTimeout(() => get().dismissToast(id), TOAST_TTL_MS);
      },

      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }),
    {
      name: 'air.ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ navCollapsed: state.navCollapsed })
    }
  )
);

export function toast(message: string, tone: ToastTone = 'neutral') {
  useUiStore.getState().pushToast(message, tone);
}
