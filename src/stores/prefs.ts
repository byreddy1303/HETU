// User preferences — everything users can tune to change day-to-day behaviour.
// Persisted to localStorage so the values survive reloads and outlive Dexie
// wipes. Not synced to Supabase yet; export/import via /settings picks them up
// because backup.ts includes the whole store.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ThemeMode } from '@/lib/theme';

export type FontScale = 'small' | 'normal' | 'large';
export type DurationMin = 30 | 60 | 90 | 120;

export interface Preferences {
  // Study plan
  dailyQuestionTarget: number;
  weeklySessionTarget: number;
  weeklyReviewDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun

  // Session defaults
  defaultSubject: string | null;
  defaultDurationMin: DurationMin;
  defaultQuestionCount: number;

  // Focus & density
  colorTheme: ThemeMode;
  compactRows: boolean;
  showCountdown: boolean;
  fontScale: FontScale;
  hapticsEnabled: boolean;
  immersiveSoundEnabled: boolean;

  // Backup nudge
  backupReminderDays: 0 | 7 | 30;
  lastBackupAt: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  dailyQuestionTarget: 15,
  weeklySessionTarget: 6,
  weeklyReviewDay: 1, // Monday
  defaultSubject: null, // "pick each time" until user picks a default
  defaultDurationMin: 60,
  defaultQuestionCount: 10,
  colorTheme: 'system',
  compactRows: false,
  showCountdown: true,
  fontScale: 'normal',
  hapticsEnabled: true,
  immersiveSoundEnabled: false,
  backupReminderDays: 30,
  lastBackupAt: null
};

interface PrefsState extends Preferences {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  patch: (p: Partial<Preferences>) => void;
  reset: () => void;
  markBackupNow: () => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      set: (key, value) => set({ [key]: value } as Partial<PrefsState>),
      patch: (p) => set(p as Partial<PrefsState>),
      reset: () => set({ ...DEFAULT_PREFERENCES }),
      markBackupNow: () => set({ lastBackupAt: new Date().toISOString() })
    }),
    {
      name: 'air.prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage)
    }
  )
);

/** Days since last backup, or null if never. */
export function daysSinceBackup(lastAt: string | null, now: Date = new Date()): number | null {
  if (!lastAt) return null;
  const then = new Date(lastAt).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** True when the user configured a cadence and it's been exceeded. */
export function needsBackupReminder(prefs: Preferences, now: Date = new Date()): boolean {
  if (prefs.backupReminderDays === 0) return false;
  const days = daysSinceBackup(prefs.lastBackupAt, now);
  if (days === null) return true;
  return days >= prefs.backupReminderDays;
}

export const WEEKDAYS: { value: Preferences['weeklyReviewDay']; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];
