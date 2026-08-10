import { create } from 'zustand';

interface BuddyPresenceState {
  onlineUsersByBuddy: Record<string, string[]>;
  setOnlineUsers: (buddyId: string, userIds: string[]) => void;
  removeBuddy: (buddyId: string) => void;
  reset: () => void;
}

export const useBuddyPresenceStore = create<BuddyPresenceState>((set) => ({
  onlineUsersByBuddy: {},
  setOnlineUsers: (buddyId, userIds) =>
    set((state) => ({
      onlineUsersByBuddy: { ...state.onlineUsersByBuddy, [buddyId]: userIds }
    })),
  removeBuddy: (buddyId) =>
    set((state) => {
      const next = { ...state.onlineUsersByBuddy };
      delete next[buddyId];
      return { onlineUsersByBuddy: next };
    }),
  reset: () => set({ onlineUsersByBuddy: {} })
}));
