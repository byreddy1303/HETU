// Dexie (IndexedDB) is the primary read/write source for the UI.
// Mirrors Postgres 1:1 plus `sync_status`. IDs are client-generated UUIDs that
// become the canonical Postgres PKs, so no local-id remapping is ever needed.
import Dexie, { type Table } from 'dexie';
import { normalizeMockTestRow } from '@/lib/mocks';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import { scoreGateOutcome } from '@/lib/gate-scoring';
import { pyqJournalSourceMap } from '@/lib/pyq-session';
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
  PyqSessionRow,
  PyqAttemptRow,
  MockTestRow,
  TopicProgressRow
} from '@/types';

export type LocalSession = Local<SessionRow>;
export type LocalQuestion = Local<QuestionRow>;
export type LocalPattern = Local<PatternRow>;
export type LocalReattempt = Local<ReattemptRow>;
export type LocalFormula = Local<FormulaRow>;
export type LocalTriggerPhrase = Local<TriggerPhraseRow>;
export type LocalWeeklyReview = Local<WeeklyReviewRow>;
export type LocalInterruptionLog = Local<InterruptionLogRow>;
export type LocalPyqSession = Local<PyqSessionRow>;
export type LocalPyqAttempt = Local<PyqAttemptRow>;
export type LocalMockTest = Local<MockTestRow>;
export type LocalTopicProgress = Local<TopicProgressRow>;

interface MetaRow {
  key: string;
  value: unknown;
}

function canonicalizeLocalSubjectRow(
  row: { subject: string; subject_id?: string | null; sync_status: string }
): void {
  const identity = normalizeSubjectIdentity(row.subject, row.subject_id);
  if (!identity.label) return;
  if (row.subject !== identity.label || row.subject_id !== identity.id) {
    row.subject = identity.label;
    row.subject_id = identity.id;
    row.sync_status = 'pending';
  }
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
  pyq_sessions!: Table<LocalPyqSession, string>;
  pyq_attempts!: Table<LocalPyqAttempt, string>;
  mock_tests!: Table<LocalMockTest, string>;
  topic_progress!: Table<LocalTopicProgress, string>;
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
    this.version(4).stores({
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
      pyq_sessions:
        'id, user_id, status, updated_at, sync_status, [user_id+status], [user_id+updated_at]',
      pyq_attempts:
        'id, user_id, pyq_session_id, question_uid, subject, year, attempted_at, sync_status, [user_id+question_uid], [user_id+subject], [user_id+attempted_at], [pyq_session_id+question_uid]',
      doubt_sessions: 'id, user_id, created_at, sync_status',
      variations: 'id, user_id, parent_question_id, sync_status',
      triangulate_logs: 'id, user_id, created_at, sync_status',
      meta: 'key'
    });
    this.version(5).stores({
      sessions:
        'id, user_id, date, created_at, sync_status, planner_date, planner_block_id, [user_id+date], [user_id+created_at], [user_id+planner_date]',
      questions:
        'id, user_id, session_id, subject, outcome, pattern_name, created_at, sync_status, [user_id+created_at], [user_id+pattern_name]',
      patterns: 'id, user_id, name, subject, count, sync_status, [user_id+name]',
      reattempts:
        'id, user_id, question_id, scheduled_date, stage, sync_status, [user_id+scheduled_date]',
      formulas: 'id, user_id, next_review, sync_status, [user_id+next_review]',
      trigger_phrases: 'id, user_id, sync_status',
      weekly_reviews: 'id, user_id, week_start, sync_status, [user_id+week_start]',
      interruption_logs: 'id, user_id, session_id, sync_status',
      pyq_sessions:
        'id, user_id, status, updated_at, sync_status, [user_id+status], [user_id+updated_at]',
      pyq_attempts:
        'id, user_id, pyq_session_id, question_uid, subject, year, attempted_at, sync_status, [user_id+question_uid], [user_id+subject], [user_id+attempted_at], [pyq_session_id+question_uid]',
      mock_tests: 'id, user_id, test_date, updated_at, sync_status, [user_id+test_date]',
      topic_progress:
        'id, user_id, subject, topic, updated_at, sync_status, [user_id+subject], [user_id+subject+topic]',
      doubt_sessions: 'id, user_id, created_at, sync_status',
      variations: 'id, user_id, parent_question_id, sync_status',
      triangulate_logs: 'id, user_id, created_at, sync_status',
      meta: 'key'
    });
    this.version(6)
      .stores({
        sessions:
          'id, user_id, date, created_at, sync_status, planner_date, planner_block_id, [user_id+date], [user_id+created_at], [user_id+planner_date]',
        questions:
          'id, user_id, session_id, subject, outcome, pattern_name, source_pyq_attempt_id, created_at, sync_status, [user_id+created_at], [user_id+pattern_name], [user_id+source_pyq_attempt_id]',
        patterns: 'id, user_id, name, subject, count, sync_status, [user_id+name]',
        reattempts:
          'id, user_id, question_id, scheduled_date, stage, sync_status, [user_id+scheduled_date]',
        formulas: 'id, user_id, next_review, sync_status, [user_id+next_review]',
        trigger_phrases: 'id, user_id, sync_status',
        weekly_reviews: 'id, user_id, week_start, sync_status, [user_id+week_start]',
        interruption_logs: 'id, user_id, session_id, sync_status',
        pyq_sessions:
          'id, user_id, status, updated_at, sync_status, [user_id+status], [user_id+updated_at]',
        pyq_attempts:
          'id, user_id, pyq_session_id, question_uid, subject, year, attempted_at, reattempt_id, sync_status, [user_id+question_uid], [user_id+subject], [user_id+attempted_at], [pyq_session_id+question_uid], [reattempt_id+reattempt_round+round_attempt_number]',
        mock_tests: 'id, user_id, test_date, updated_at, sync_status, [user_id+test_date]',
        topic_progress:
          'id, user_id, subject, topic, updated_at, sync_status, [user_id+subject], [user_id+subject+topic]',
        doubt_sessions: 'id, user_id, created_at, sync_status',
        variations: 'id, user_id, parent_question_id, sync_status',
        triangulate_logs: 'id, user_id, created_at, sync_status',
        meta: 'key'
      })
      .upgrade(async (transaction) => {
        for (const tableName of ['sessions', 'patterns', 'formulas'] as const) {
          await transaction
            .table(tableName)
            .toCollection()
            .modify((value) =>
              canonicalizeLocalSubjectRow(
                value as { subject: string; subject_id?: string | null; sync_status: string }
              )
            );
        }

        const topicRows = (await transaction.table('topic_progress').toArray()) as LocalTopicProgress[];
        const topicGroups = new Map<string, LocalTopicProgress[]>();
        for (const row of topicRows) {
          const identity = normalizeSubjectIdentity(row.subject, row.subject_id);
          const key = `${row.user_id}\u0000${identity.id ?? identity.label}\u0000${row.topic.trim().toLocaleLowerCase()}`;
          const group = topicGroups.get(key) ?? [];
          group.push(row);
          topicGroups.set(key, group);
        }
        for (const rows of topicGroups.values()) {
          rows.sort(
            (left, right) =>
              right.completed_at.localeCompare(left.completed_at) ||
              right.updated_at.localeCompare(left.updated_at) ||
              left.id.localeCompare(right.id)
          );
          const [keeper, ...duplicates] = rows;
          canonicalizeLocalSubjectRow(keeper);
          keeper.topic = keeper.topic.trim();
          if (duplicates.length > 0) {
            keeper.completed_at = rows.reduce(
              (latest, row) => (row.completed_at > latest ? row.completed_at : latest),
              keeper.completed_at
            );
            keeper.updated_at = rows.reduce(
              (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
              keeper.updated_at
            );
            keeper.sync_status = 'pending';
            await transaction.table('topic_progress').bulkDelete(duplicates.map((row) => row.id));
          }
          await transaction.table('topic_progress').put(keeper);
        }

        await transaction.table('mock_tests').toCollection().modify((value) => {
          const row = value as LocalMockTest;
          const merged = new Map<string, { subject: string; subject_id: string | null; marks: number }>();
          for (const score of row.subject_scores ?? []) {
            const identity = normalizeSubjectIdentity(score.subject, score.subject_id);
            if (!identity.label) continue;
            const key = identity.id ? `id:${identity.id}` : `label:${identity.label}`;
            const previous = merged.get(key);
            merged.set(key, {
              subject: identity.label,
              subject_id: identity.id,
              marks: (previous?.marks ?? 0) + score.marks
            });
          }
          const normalized = [...merged.values()];
          if (JSON.stringify(normalized) !== JSON.stringify(row.subject_scores)) {
            row.subject_scores = normalized;
            row.sync_status = 'pending';
          }
        });

        const attempts = (await transaction.table('pyq_attempts').toArray()) as LocalPyqAttempt[];
        await transaction.table('pyq_attempts').toCollection().modify((attempt) => {
          const row = attempt as LocalPyqAttempt;
          const canonicalSubject = normalizeSubjectIdentity(row.subject, row.subject_id);
          if (
            canonicalSubject.label &&
            (row.subject !== canonicalSubject.label || row.subject_id !== canonicalSubject.id)
          ) {
            row.subject = canonicalSubject.label;
            row.subject_id = canonicalSubject.id;
            row.sync_status = 'pending';
          } else if (row.subject_id === undefined) {
            row.subject_id = canonicalSubject.id;
          }
          // Frozen question metadata is safe to recover from the already
          // immutable v2 snapshot; a missing value remains honestly null.
          if (row.question_type === undefined) {
            row.question_type = row.question_snapshot?.type ?? null;
          }
          if (row.question_marks === undefined) {
            const snapshotMarks = row.question_snapshot?.marks;
            row.question_marks = snapshotMarks === 1 || snapshotMarks === 2 ? snapshotMarks : null;
          }
          if (row.capture_version === 2 && row.scoring_version == null) {
            const scored = scoreGateOutcome({
              questionType: row.question_snapshot?.type ?? null,
              marks: row.question_snapshot?.marks ?? null,
              answerStatus: row.answer_status,
              decision: row.mark_decision,
              correctness: row.mark_correct
            });
            row.score_thirds = scored.scoreThirds;
            row.scoring_status = scored.status;
            row.scoring_version = scored.scoringVersion;
          } else {
            if (row.score_thirds === undefined) row.score_thirds = null;
            if (row.scoring_status === undefined) row.scoring_status = null;
            if (row.scoring_version === undefined) row.scoring_version = null;
          }
          if (row.reattempt_id === undefined) row.reattempt_id = null;
          if (row.reattempt_round === undefined) row.reattempt_round = null;
          if (row.round_attempt_number === undefined) row.round_attempt_number = null;
        });

        const questionRows = (await transaction.table('questions').toArray()) as LocalQuestion[];
        const safeSourceByQuestionId = pyqJournalSourceMap(questionRows, attempts);
        await transaction.table('questions').toCollection().modify((question) => {
          const row = question as LocalQuestion;
          canonicalizeLocalSubjectRow(row);
          if (row.source_pyq_attempt_id) return;
          const source = safeSourceByQuestionId.get(row.id) ?? null;
          if (source && source.user_id === row.user_id) {
            row.source_pyq_attempt_id = source.id;
            row.sync_status = 'pending';
          } else if (row.source_pyq_attempt_id === undefined) {
            row.source_pyq_attempt_id = null;
          }
        });
      });
    this.version(7)
      .stores({
        mock_tests:
          'id, user_id, test_date, updated_at, source_kind, source_pyq_session_id, paper_scope, freshness, evidence_status, sync_status, [user_id+test_date], [user_id+evidence_status], [user_id+source_pyq_session_id]'
      })
      .upgrade((transaction) =>
        transaction
          .table('mock_tests')
          .toCollection()
          .modify((value) => {
            const row = value as LocalMockTest;
            Object.assign(row, normalizeMockTestRow(row));
          })
      );
  }
}

export const db = new AirDB();

/** Tables that participate in Supabase sync, in FK-safe push order. */
export const SYNCED_TABLES = [
  'sessions',
  'pyq_sessions',
  'pyq_attempts',
  'questions',
  'patterns',
  'reattempts',
  'formulas',
  'trigger_phrases',
  'weekly_reviews',
  'interruption_logs',
  'mock_tests',
  'topic_progress'
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

export function table(name: SyncedTableName): Table<Local<{ id: string }>, string> {
  return db.table(name);
}

/** Full local wipe used on sign-out. */
export async function clearLocalData(): Promise<void> {
  await db.delete();
  await db.open();
}
