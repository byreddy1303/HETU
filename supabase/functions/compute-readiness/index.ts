// Weekly readiness snapshot computation. The browser computes the same
// evidence-adjusted score immediately; this service-role cron makes weekly
// history independent of whether the learner opens the Readiness page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { jwtRoleClaim } from '../_shared/cron-auth.ts';
import { computeReadinessScore } from '../_shared/readiness-score.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface UserRow {
  id: string;
  exam_date: string;
  timezone: string | null;
}

interface QuestionRow {
  id: string;
  user_id: string;
  mark_decision: string | null;
  mark_correct: boolean | null;
}

interface PatternRow {
  user_id: string;
}

interface ReattemptRow {
  user_id: string;
  stage: 'D3' | 'D10' | 'D30' | 'MASTERED';
  scheduled_date: string;
  history: unknown[] | null;
}

function localDate(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000));
}

function weekStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - mondayOffset);
  return value.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isServiceCall = Boolean(
    token && (token === SERVICE || jwtRoleClaim(token) === 'service_role')
  );
  if (!isServiceCall) return json({ ok: false, error: 'cron authorization required' }, 403);

  const [usersResult, questionsResult, patternsResult, reattemptsResult] = await Promise.all([
    admin.from('users').select('id, exam_date, timezone').limit(10_000),
    admin.from('questions').select('id, user_id, mark_decision, mark_correct').limit(100_000),
    admin.from('patterns').select('user_id').limit(100_000),
    admin
      .from('reattempts')
      .select('user_id, stage, scheduled_date, history')
      .limit(100_000)
  ]);

  const firstError =
    usersResult.error ?? questionsResult.error ?? patternsResult.error ?? reattemptsResult.error;
  if (firstError) {
    console.error('Readiness input load failed:', firstError.message);
    return json({ ok: false, error: 'could not load readiness inputs' }, 500);
  }

  const users = (usersResult.data as UserRow[]) ?? [];
  const questions = (questionsResult.data as QuestionRow[]) ?? [];
  const patterns = (patternsResult.data as PatternRow[]) ?? [];
  const reattempts = (reattemptsResult.data as ReattemptRow[]) ?? [];
  const now = new Date();
  const questionsByUser = new Map<string, QuestionRow[]>();
  const patternCountByUser = new Map<string, number>();
  const reattemptsByUser = new Map<string, ReattemptRow[]>();
  for (const row of questions) {
    const list = questionsByUser.get(row.user_id) ?? [];
    list.push(row);
    questionsByUser.set(row.user_id, list);
  }
  for (const row of patterns) {
    patternCountByUser.set(row.user_id, (patternCountByUser.get(row.user_id) ?? 0) + 1);
  }
  for (const row of reattempts) {
    const list = reattemptsByUser.get(row.user_id) ?? [];
    list.push(row);
    reattemptsByUser.set(row.user_id, list);
  }

  const snapshots = users.map((user) => {
    const today = localDate(now, user.timezone || 'Asia/Kolkata');
    const userQuestions = questionsByUser.get(user.id) ?? [];
    const patternCount = patternCountByUser.get(user.id) ?? 0;
    const userReattempts = reattemptsByUser.get(user.id) ?? [];
    return {
      user_id: user.id,
      on_date: weekStart(today),
      score: computeReadinessScore(userQuestions, patternCount, userReattempts, today),
      days_to_exam: daysBetween(today, user.exam_date)
    };
  });

  if (snapshots.length > 0) {
    const { error } = await admin
      .from('readiness_snapshots')
      .upsert(snapshots, { onConflict: 'user_id,on_date' });
    if (error) {
      console.error('Readiness snapshot write failed:', error.message);
      return json({ ok: false, error: 'could not save readiness snapshots' }, 500);
    }
  }

  return json({ ok: true, users: snapshots.length });
});
