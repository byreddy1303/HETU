import { supabase } from '@/lib/supabase';

export const STUDY_NOTIFICATION_CATEGORIES = [
  { id: 'dashboard', label: 'Daily overview', route: '/', action: 'View today' },
  { id: 'planner', label: 'Planner', route: '/planner', action: 'Open plan' },
  { id: 'reattempts', label: 'Re-attempts', route: '/reattempts', action: 'Start queue' },
  { id: 'pyq', label: 'PYQ practice', route: '/pyq', action: 'Solve PYQs' },
  { id: 'sessions', label: 'Focused session', route: '/session/new', action: 'Start session' },
  { id: 'log', label: 'Question log', route: '/log', action: 'Log a question' },
  { id: 'formulas', label: 'Formula review', route: '/formulas', action: 'Review formulas' },
  { id: 'syllabus', label: 'Syllabus tracker', route: '/syllabus', action: 'Update coverage' },
  { id: 'patterns', label: 'Pattern library', route: '/patterns', action: 'Review patterns' },
  { id: 'trigger_drill', label: 'Trigger drill', route: '/trigger-drill', action: 'Run drill' },
  { id: 'calibration', label: 'Calibration', route: '/calibration', action: 'Check decisions' },
  { id: 'readiness', label: 'Exam readiness', route: '/readiness', action: 'View next move' },
  { id: 'heatmap', label: 'Study heatmap', route: '/heatmap', action: 'View consistency' },
  { id: 'journal', label: 'Journal', route: '/journal', action: 'Write reflection' },
  { id: 'weekly_review', label: 'Weekly review', route: '/weekly-review', action: 'Review week' }
] as const;

export type StudyNotificationCategory = (typeof STUDY_NOTIFICATION_CATEGORIES)[number]['id'];

export interface StudyNotificationPreference {
  user_id: string;
  category: StudyNotificationCategory;
  enabled: boolean;
  hour_local: number;
  minute_local: number;
  last_sent_on: string | null;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

export function notificationTime(preference: StudyNotificationPreference): string {
  return `${String(preference.hour_local).padStart(2, '0')}:${String(preference.minute_local).padStart(2, '0')}`;
}

export function parseNotificationTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export async function ensureStudyNotificationPreferences(): Promise<StudyNotificationPreference[]> {
  const { data, error } = await supabase.rpc('ensure_study_notification_preferences');
  if (error) throw new Error(error.message);
  return (data as StudyNotificationPreference[] | null) ?? [];
}

export async function updateStudyNotificationPreference(
  userId: string,
  category: StudyNotificationCategory,
  patch: Partial<Pick<StudyNotificationPreference, 'enabled' | 'hour_local' | 'minute_local'>>
): Promise<void> {
  const { error } = await supabase
    .from('study_notification_preferences')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('category', category);
  if (error) throw new Error(error.message);
}

export async function sendStudyNotificationTest(
  userId: string,
  category: StudyNotificationCategory
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('study-notifications', {
    body: { user_id: userId, category, force: true, test: true }
  });
  if (error) throw new Error(error.message);
  if (!data?.ok || data.sent < 1) {
    throw new Error(data?.error ?? 'No enabled push device received the test.');
  }
}
