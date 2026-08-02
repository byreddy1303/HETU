// Dexie (IndexedDB) — PRIMARY read/write source for the UI (BUILD.md §4, §5.5).
// Mirrors Postgres 1:1 plus `sync_status`. IDs are client-generated UUIDs that
// become the canonical Postgres PKs, so no local-id remapping is ever needed.
import Dexie, { type Table } from 'dexie';
import type {
  Local,
  SessionRow,
  QuestionRow,
  PatternRow,
  ReattemptRow,
  FormulaRow,
  TriggerPhraseRow,
  WeeklyReviewRow,
  InterruptionLogRow,
  PyqAttemptRow
} from '@/types';

export type LocalSession = Local<SessionRow>;
export type LocalQuestion = Local<QuestionRow>;
export type LocalPattern = Local<PatternRow>;
export type LocalReattempt = Local<ReattemptRow>;
export type LocalFormula = Local<FormulaRow>;
export type LocalTriggerPhrase = Local<TriggerPhraseRow>;
export type LocalWeeklyReview = Local<WeeklyReviewRow>;
export type LocalInterruptionLog = Local<InterruptionLogRow>;
export type LocalPyqAttempt = Local<PyqAttemptRow>;

interface MetaRow {
  key: string;
  value: unknown;
}

class AirDB extends Dexie {
  sessions!: Table<LocalSession, string>;
  questions!: Table<LocalQuestion, string>;
  patterns!: Table<LocalPattern, string>;
  reattempts!: Table<LocalReattempt, string>;
  formulas!: Table<LocalFormula, string>;
  trigger_phrases!: Table<LocalTriggerPhrase, string>;
  weekly_reviews!: Table<LocalWeeklyReview, string>;
  interruption_logs!: Table<LocalInterruptionLog, string>;
  pyq_attempts!: Table<LocalPyqAttempt, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('air-journal');
    this.version(1).stores({
      sessions: 'id, user_id, date, created_at, sync_status',
      questions: 'id, user_id, session_id, subject, outcome, pattern_name, created_at, sync_status',
      patterns: 'id, user_id, name, subject, count, sync_status, [user_id+name]',
      reattempts: 'id, user_id, question_id, scheduled_date, stage, sync_status',
      formulas: 'id, user_id, next_review, sync_status',
      trigger_phrases: 'id, user_id, sync_status',
      weekly_reviews: 'id, user_id, week_start, sync_status, [user_id+week_start]',
      interruption_logs: 'id, user_id, session_id, sync_status',
      doubt_sessions: 'id, user_id, created_at, sync_status',
      variations: 'id, user_id, parent_question_id, sync_status',
      triangulate_logs: 'id, user_id, created_at, sync_status',
      meta: 'key'
    });
    // Compound indexes keep the common user-scoped date and pattern lookups
    // on an IndexedDB key range instead of scanning a learner's full history.
    this.version(2).stores({
      sessions: 'id, user_id, date, created_at, sync_status, [user_id+date], [user_id+created_at]',
      questions:
        'id, user_id, session_id, subject, outcome, pattern_name, created_at, sync_status, [user_id+created_at], [user_id+pattern_name]',
      patterns: 'id, user_id, name, subject, count, sync_status, [user_id+name]',
      reattempts:
        'id, user_id, question_id, scheduled_date, stage, sync_status, [user_id+scheduled_date]',
      formulas: 'id, user_id, next_review, sync_status, [user_id+next_review]',
      trigger_phrases: 'id, user_id, sync_status',
      weekly_reviews: 'id, user_id, week_start, sync_status, [user_id+week_start]',
      interruption_logs: 'id, user_id, session_id, sync_status',
      doubt_sessions: 'id, user_id, created_at, sync_status',
      variations: 'id, user_id, parent_question_id, sync_status',
      triangulate_logs: 'id, user_id, created_at, sync_status',
      meta: 'key'
    });
    this.version(3).stores({
      sessions: 'id, user_id, date, created_at, sync_status, [user_id+date], [user_id+created_at]',
      questions:
        'id, user_id, session_id, subject, outcome, pattern_name, created_at, sync_status, [user_id+created_at], [user_id+pattern_name]',
      patterns: 'id, user_id, name, subject, count, sync_status, [user_id+name]',
      reattempts:
        'id, user_id, question_id, scheduled_date, stage, sync_status, [user_id+scheduled_date]',
      formulas: 'id, user_id, next_review, sync_status, [user_id+next_review]',
      trigger_phrases: 'id, user_id, sync_status',
      weekly_reviews: 'id, user_id, week_start, sync_status, [user_id+week_start]',
      interruption_logs: 'id, user_id, session_id, sync_status',
      pyq_attempts:
        'id, user_id, question_uid, subject, year, attempted_at, sync_status, [user_id+question_uid], [user_id+subject], [user_id+attempted_at]',
      doubt_sessions: 'id, user_id, created_at, sync_status',
      variations: 'id, user_id, parent_question_id, sync_status',
      triangulate_logs: 'id, user_id, created_at, sync_status',
      meta: 'key'
    });
  }
}

export const db = new AirDB();

/** Tables that participate in Supabase sync, in FK-safe push order. */
export const SYNCED_TABLES = [
  'sessions',
  'questions',
  'patterns',
  'reattempts',
  'formulas',
  'trigger_phrases',
  'weekly_reviews',
  'interruption_logs',
  'pyq_attempts'
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

export function table(name: SyncedTableName): Table<Local<{ id: string }>, string> {
  return db.table(name);
}

/** Full local wipe — used on sign-out (BUILD.md F1.1). */
export async function clearLocalData(): Promise<void> {
  await db.delete();
  await db.open();
}
