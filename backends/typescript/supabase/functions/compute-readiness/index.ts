// Weekly readiness snapshot computation. The browser computes the same
// evidence-adjusted score immediately; this service-role cron makes weekly
// history independent of whether the learner opens the Readiness page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { jwtRoleClaim } from '../_shared/cron-auth.ts';
import {
  computeReadinessScoreResult,
  READINESS_CALCULATION_VERSION
} from '../_shared/readiness-score.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface UserRow {
  id: string;
  exam_date: string | null;
  timezone: string | null;
}

interface QuestionRow {
  id: string;
  user_id: string;
  source_pyq_attempt_id: string | null;
  mark_decision: string | null;
  mark_correct: boolean | null;
  outcome: string;
  source_ref: string | null;
  created_at: string;
  subject: string;
  subject_id: string | null;
  source_year: number | null;
  session_id: string | null;
  time_spent_sec: number;
}

interface AttemptRow {
  id: string;
  user_id: string;
  mark_decision: string | null;
  mark_correct: boolean | null;
  capture_version: number;
  attempted_at: string;
  subject: string;
  subject_id: string | null;
  year: number;
  pyq_session_id: string | null;
  time_spent_sec: number;
}

interface PatternRow {
  id: string;
  user_id: string;
}

interface ReattemptRow {
  id: string;
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

const PAGE_SIZE = 1_000;
// Keep null-profile behavior identical to the browser readiness page. The
// database column predates a NOT NULL constraint, so one legacy profile must
// not turn the whole weekly upsert into a null days_to_exam failure.
const EXAM_DATE_DEFAULT = '2027-02-06';

/** Fixed global limits silently drop evidence for mature accounts. Use an ID
 * cursor instead of live OFFSET pages, which can skip/duplicate rows when a
 * concurrent delete shifts the table between requests. Every projection passed
 * here includes the UUID primary key used as the cursor. */
async function loadAll<T extends { id: string }>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let afterId: string | null = null;
  for (;;) {
    let query = admin.from(table).select(columns).order('id', { ascending: true }).limit(PAGE_SIZE);
    if (afterId) query = query.gt('id', afterId);
    const result = await query;
    if (result.error) throw result.error;
    const page = (result.data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    const nextAfterId = page.at(-1)?.id;
    if (!nextAfterId || nextAfterId === afterId) {
      throw new Error(`Readiness pagination did not advance for ${table}.`);
    }
    afterId = nextAfterId;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isServiceCall = Boolean(
    token && (token === SERVICE || jwtRoleClaim(token) === 'service_role')
  );
  if (!isServiceCall) return json({ ok: false, error: 'cron authorization required' }, 403);

  let users: UserRow[];
  let questions: QuestionRow[];
  let attempts: AttemptRow[];
  let patterns: PatternRow[];
  let reattempts: ReattemptRow[];
  try {
    [users, questions, attempts, patterns, reattempts] = await Promise.all([
      loadAll<UserRow>('users', 'id, exam_date, timezone'),
      loadAll<QuestionRow>(
        'questions',
        'id, user_id, source_pyq_attempt_id, mark_decision, mark_correct, outcome, source_ref, created_at, subject, subject_id, source_year, session_id, time_spent_sec'
      ),
      loadAll<AttemptRow>(
        'pyq_attempts',
        'id, user_id, mark_decision, mark_correct, capture_version, attempted_at, subject, subject_id, year, pyq_session_id, time_spent_sec'
      ),
      loadAll<PatternRow>('patterns', 'id, user_id'),
      loadAll<ReattemptRow>('reattempts', 'id, user_id, stage, scheduled_date, history')
    ]);
  } catch (error) {
    console.error(
      'Readiness input load failed:',
      error instanceof Error ? error.message : String(error)
    );
    return json({ ok: false, error: 'could not load readiness inputs' }, 500);
  }

  const now = new Date();
  const questionsByUser = new Map<string, QuestionRow[]>();
  const attemptsByUser = new Map<string, AttemptRow[]>();
  const patternCountByUser = new Map<string, number>();
  const reattemptsByUser = new Map<string, ReattemptRow[]>();
  for (const row of questions) {
    const list = questionsByUser.get(row.user_id) ?? [];
    list.push(row);
    questionsByUser.set(row.user_id, list);
  }
  for (const row of attempts) {
    const list = attemptsByUser.get(row.user_id) ?? [];
    list.push(row);
    attemptsByUser.set(row.user_id, list);
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
    const userAttempts = attemptsByUser.get(user.id) ?? [];
    const patternCount = patternCountByUser.get(user.id) ?? 0;
    const userReattempts = reattemptsByUser.get(user.id) ?? [];
    const result = computeReadinessScoreResult(
      userAttempts,
      userQuestions,
      patternCount,
      userReattempts,
      today
    );
    return {
      user_id: user.id,
      on_date: weekStart(today),
      score: result.score,
      days_to_exam: daysBetween(today, user.exam_date ?? EXAM_DATE_DEFAULT),
      calculation_version: READINESS_CALCULATION_VERSION,
      evidence_counts: result.counts,
      components: result.components
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
