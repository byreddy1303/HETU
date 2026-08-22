// Narrow Supabase mirror for Planner study sessions. The rest of DayPlan stays
// local-only; this is the minimum server data required for Telegram delivery.
import { supabase } from '@/lib/supabase';
import { normalizeStudySession, type StudySession } from '@/lib/planner-storage';

export interface CloudDayPlan {
  date: string;
  sessions: StudySession[];
  updatedAt: string;
}

interface CloudDayPlanRow {
  plan_date: string;
  sessions: unknown;
  updated_at: string;
}

function isStudySession(value: unknown): value is StudySession {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.subject === 'string' &&
    typeof row.durationMin === 'number' &&
    typeof row.mode === 'string' &&
    typeof row.priority === 'string' &&
    typeof row.target === 'string'
  );
}

function toCloudDayPlan(row: CloudDayPlanRow): CloudDayPlan {
  const sessions = Array.isArray(row.sessions)
    ? row.sessions.filter(isStudySession).slice(0, 24).map(normalizeStudySession)
    : [];
  return { date: row.plan_date, sessions, updatedAt: row.updated_at };
}

export async function loadCloudDayPlan(
  userId: string,
  date: string
): Promise<{ plan: CloudDayPlan | null; error: string | null }> {
  const { data, error } = await supabase
    .from('planner_day_plans')
    .select('plan_date, sessions, updated_at')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .maybeSingle();

  if (error) return { plan: null, error: error.message };
  if (!data) return { plan: null, error: null };

  return { plan: toCloudDayPlan(data as CloudDayPlanRow), error: null };
}

/** Load a date range so cloud-only plans can enter the local calendar index. */
export async function loadCloudDayPlans(
  userId: string,
  fromDate: string,
  throughDate: string
): Promise<{ plans: CloudDayPlan[]; error: string | null }> {
  const { data, error } = await supabase
    .from('planner_day_plans')
    .select('plan_date, sessions, updated_at')
    .eq('user_id', userId)
    .gte('plan_date', fromDate)
    .lte('plan_date', throughDate)
    .order('plan_date', { ascending: true });

  if (error) return { plans: [], error: error.message };
  return {
    plans: ((data ?? []) as CloudDayPlanRow[]).map(toCloudDayPlan),
    error: null
  };
}

export async function saveCloudDayPlan(userId: string, plan: CloudDayPlan): Promise<string | null> {
  const sessions = plan.sessions.slice(0, 24).map(normalizeStudySession);
  const { error } = await supabase.from('planner_day_plans').upsert(
    {
      user_id: userId,
      plan_date: plan.date,
      sessions,
      updated_at: plan.updatedAt
    },
    { onConflict: 'user_id,plan_date' }
  );
  return error?.message ?? null;
}

export async function deleteCloudDayPlan(userId: string, date: string): Promise<string | null> {
  const { error } = await supabase
    .from('planner_day_plans')
    .delete()
    .eq('user_id', userId)
    .eq('plan_date', date);
  return error?.message ?? null;
}
