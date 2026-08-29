// Row types mirror supabase/migrations/20260717000001_initial_schema.sql exactly.
// Nullable Postgres columns are `| null` (Supabase returns null, never undefined).

export type Outcome = 'R' | 'RBS' | 'RBG' | 'W-C' | 'W-E' | 'W-R';
export type RootCause = 'concept' | 'formula' | 'reading' | 'computation' | 'strategy';
export type MarkDecision = 'MARK' | 'SKIP' | 'FIFTY_FIFTY';
export type ReattemptStage = 'D3' | 'D10' | 'D30' | 'MASTERED';
export type ReattemptResult = 'clean' | 'fail';
export type BuddyStatus = 'pending' | 'active' | 'paused';
export type ShareStatus = 'sent' | 'solved' | 'discussed';
export type InterruptionKind = 'tab_switch' | 'idle' | 'exit';
export type SyncStatus = 'synced' | 'pending' | 'error';
export type PyqSessionStatus = 'active' | 'completed' | 'abandoned' | 'paused';
export type PyqSessionMode = 'practice' | 'exam';
export type PyqExamSubmissionReason = 'manual' | 'time-expired';
export type PyqExamKind = 'timed-set' | 'full-paper';
export type PyqExamConfidence = 'high' | 'medium' | 'low';
export type PyqExamValidityStatus = 'qualified' | 'supporting';
export type PyqExamValidityReason =
  | 'not-full-paper'
  | 'prior-exposure'
  | 'paused'
  | 'closed-book-unconfirmed'
  | 'incomplete-visit-coverage'
  | 'low-active-time'
  | 'incomplete-scoring'
  | 'nonstandard-paper';
export type SessionKind = 'focused' | 'log' | 'pyq';
export type PyqAttemptAnswerStatus = 'available' | 'ambiguous' | 'marks-to-all' | 'unsupported';
export type PyqAttemptScoringStatus = 'scored' | 'bonus' | 'unscorable';
export type PyqHistoryFilter =
  'all' | 'unseen' | 'incorrect' | 'guessed' | 'slow' | 'skipped' | 'unanalyzed' | 'repeated';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string;
  exam_date: string;
  target_rank: number;
  sadhana_practice: boolean;
  timezone: string;
  created_at: string;
  welcome_seen_at: string | null;
  phone_e164: string | null;
  digest_email_enabled: boolean;
  digest_whatsapp_enabled: boolean;
  digest_hour_local: number;
  digest_minute_local: number;
  wa_opted_in_at: string | null;
  last_digest_sent_on: string | null;
  buddy_notification_preview_enabled: boolean;
  study_notifications_enabled: boolean;
}

export interface TelegramSubscriptionRow {
  user_id: string;
  chat_id: number | string | null;
  chat_username: string | null;
  enabled: boolean;
  connect_token: string | null;
  connect_token_expires_at: string | null;
  connected_at: string | null;
  last_digest_sent_on: string | null;
  updated_at: string;
}

export type PlanRRuleKind = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface PlanItemRow {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  subject_id?: string | null;
  notes: string | null;
  due_date: string;
  rrule_kind: PlanRRuleKind;
  ends_on: string | null;
  target_min: number | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanItemCompletionRow {
  item_id: string;
  user_id: string;
  on_date: string;
  completed_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  /** Missing only on rows created before session kinds were introduced. */
  kind?: SessionKind;
  date: string;
  subject: string;
  subject_id?: string | null;
  target_duration_min: number;
  actual_duration_min: number | null;
  insight: string | null;
  sadhana_done: boolean;
  interruptions_count: number;
  /** Planner linkage is absent on sessions created outside a planned block. */
  planner_date?: string | null;
  planner_block_id?: string | null;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  user_id: string;
  session_id: string | null;
  subject: string;
  subject_id?: string | null;
  subtopic: string | null;
  source_year: number | null;
  source_ref: string | null;
  question_text: string | null;
  answer_text: string | null;
  /** One-sentence reflection used by the mobile quick-capture flow. */
  capture_note?: string | null;
  image_url: string | null;
  time_spent_sec: number;
  target_time_sec: number;
  outcome: Outcome;
  pattern_name: string | null;
  trigger_sentence: string | null;
  root_cause: RootCause | null;
  mark_decision: MarkDecision | null;
  mark_correct: boolean | null;
  /**
   * Immutable receipt that this Journal analysis annotates. Null/absent means
   * that the row is independent manual or legacy evidence.
   */
  source_pyq_attempt_id?: string | null;
  created_at: string;
}

export interface PatternRow {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  subject_id?: string | null;
  count: number;
  is_reflexed: boolean;
  mastery_level: number;
  first_seen_at: string;
}

export interface ReattemptHistoryEntry {
  date: string;
  result: ReattemptResult;
  timeSpent?: number;
  /** Present for answer-capable re-attempts; absent on historical timer-only rows. */
  selectedAnswer?: PyqSelectedAnswer;
  /** Saved answer/key at the time of this attempt, so later edits do not rewrite history. */
  correctAnswer?: PyqSelectedAnswer;
  markDecision?: MarkDecision;
}

export interface ReattemptRow {
  id: string;
  user_id: string;
  question_id: string;
  scheduled_date: string;
  stage: ReattemptStage;
  history: ReattemptHistoryEntry[];
  created_at: string;
}

export interface FormulaRow {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  subject_id?: string | null;
  expression: string;
  forgot_count: number;
  last_reviewed: string | null;
  next_review: string;
  created_at: string;
}

export interface TriggerPhraseRow {
  id: string;
  user_id: string;
  phrase: string;
  concept: string;
  reflex_time_ms: number | null;
  question_ids: string[];
  created_at: string;
}

export interface WeeklyReviewRow {
  id: string;
  user_id: string;
  week_start: string;
  root_cause_summary: string | null;
  weakest_concept: string | null;
  this_weeks_fix: string | null;
  created_at: string;
}

export interface InterruptionLogRow {
  id: string;
  user_id: string;
  session_id: string;
  ts: string;
  kind: InterruptionKind;
}

export type PyqSelectedAnswer = string | string[] | number | null;

/** Auditable facts used to qualify a finalized full-paper benchmark. */
export interface PyqExamValidityMetrics {
  question_count: number;
  total_marks: number;
  scorable_question_count: number;
  scorable_marks: number;
  visited_question_count: number;
  active_time_sec: number;
  prior_exposure_count: number | null;
  pause_count: number | null;
  closed_book_confirmed: boolean;
}

/** Mutable response ledger kept on a timed session until final submission. */
export interface PyqExamState {
  duration_sec: number;
  deadline_at: string | null;
  paused_remaining_sec: number | null;
  responses: Record<string, PyqSelectedAnswer>;
  visited_question_uids: string[];
  marked_for_review_question_uids: string[];
  time_by_question_ms: Record<string, number>;
  submission_reason: PyqExamSubmissionReason | null;
  /** Missing on legacy exams, which are treated as ordinary timed sets. */
  prior_exposure_question_uids?: string[];
  /** Learner confidence is intentionally captured without revealing the answer. */
  confidence_by_question?: Record<string, PyqExamConfidence>;
  /** Missing on legacy exams, where pause history was not recorded. */
  pause_count?: number;
  /** Explicit user confirmation; absence never qualifies as closed-book evidence. */
  closed_book_confirmed?: boolean;
  /** Finalized evidence classification. Absent while active and on legacy receipts. */
  validity_status?: PyqExamValidityStatus;
  validity_reasons?: PyqExamValidityReason[];
  validity_metrics?: PyqExamValidityMetrics;
}

/** Mutable response/timing checkpoint kept while guided practice is paused. */
export interface PyqPracticeDraft {
  question_uid: string;
  selected_answer: PyqSelectedAnswer;
  mark_decision: MarkDecision | null;
  confidence?: PyqExamConfidence | null;
  /** Sum of active work segments only; time spent paused is excluded. */
  elapsed_ms: number;
  /** Original start of the question, retained across every pause/resume cycle. */
  first_started_at: string;
}

/** Immutable question-bank facts captured with a submitted attempt. */
export interface PyqQuestionSnapshot {
  question_uid: string;
  /** Missing on receipts created before source-book sessions shipped. */
  book_slug?: string;
  year: number;
  set: number | null;
  number: string;
  paper_label: string;
  subject: string;
  subject_slug: string;
  topic: string;
  topic_slug: string;
  subtopics: string[];
  marks: number | null;
  type: string;
  /** Missing on receipts created before variable option sets shipped. */
  choices?: string[];
  tolerance: { abs?: number } | null;
  answer_status: PyqAttemptAnswerStatus;
  answer_source: unknown;
  html: string;
  source_url: string;
}

export interface PyqSessionConfig {
  /** Missing on legacy sets created before source-book sessions shipped. */
  bookSlug?: string;
  subjectSlug: string;
  /** Missing only on legacy sets created before topic-wise practice shipped. */
  topicSlug?: string;
  fromYear: number;
  toYear: number;
  type: 'all' | 'MCQ' | 'MSQ' | 'NAT';
  order: 'unseen' | 'random' | 'newest' | 'oldest';
  count: '5' | '10' | '15' | '25' | '50' | 'all';
  /** Missing on practice sets saved before history filters shipped. */
  history?: PyqHistoryFilter;
  /** Missing on legacy sets, which always use the original guided-practice flow. */
  mode?: PyqSessionMode;
  /** Missing on legacy exams, which use timed-set semantics. */
  examKind?: PyqExamKind;
  /** Stable id into the versioned benchmark-paper catalog. */
  benchmarkPaperId?: string;
  /** Present only for exam mode; lives in JSONB so draft answers remain editable. */
  examState?: PyqExamState;
  /** Present only while a guided-practice question has a resumable checkpoint. */
  practiceDraft?: PyqPracticeDraft;
}

export interface MockSubjectScore {
  subject: string;
  subject_id?: string | null;
  marks: number;
}

export type MockSourceKind = 'manual' | 'pyq_exam';
export type MockPaperScope = 'full_length' | 'sectional' | 'topic' | 'unknown';
export type MockFreshness = 'unseen' | 'partially_seen' | 'repeated' | 'unknown';
export type MockEvidenceStatus = 'qualified' | 'supporting' | 'excluded';

export interface MockTestRow {
  id: string;
  user_id: string;
  name: string;
  test_date: string;
  total_marks: number;
  max_marks: number;
  total_questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  duration_min: number;
  subject_scores: MockSubjectScore[];
  mistakes: string[];
  planner_date: string | null;
  planner_block_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Optional only for compatibility with rows/backups written before qualified
   * mock evidence shipped. Storage boundaries materialize the full shape.
   */
  source_kind?: MockSourceKind;
  source_pyq_session_id?: string | null;
  paper_scope?: MockPaperScope;
  freshness?: MockFreshness;
  timed?: boolean | null;
  closed_book?: boolean | null;
  single_sitting?: boolean | null;
  evidence_status?: MockEvidenceStatus;
  evidence_reasons?: string[];
  scoring_coverage_pct?: number | null;
}

export interface TopicProgressRow {
  id: string;
  user_id: string;
  subject: string;
  subject_id?: string | null;
  topic: string;
  completed_at: string;
  updated_at: string;
}

/** A durable PYQ practice set. `current_index` points at the next unsolved row. */
export interface PyqSessionRow {
  id: string;
  user_id: string;
  bank_version: string;
  config: PyqSessionConfig;
  question_uids: string[];
  completed_question_uids: string[];
  current_index: number;
  completed_count: number;
  elapsed_sec: number;
  status: PyqSessionStatus;
  current_question_uid: string | null;
  current_question_started_at: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * An immutable submitted bank attempt. Capture version 2 stores the exact
 * learner response, official key, question snapshot, and millisecond timing.
 * Capture version 3 additionally freezes the official scoring inputs/result.
 * Versions 0/1 are retained only for honest legacy-data handling.
 */
export interface PyqAttemptRow {
  id: string;
  user_id: string;
  pyq_session_id: string | null;
  question_uid: string;
  subject: string;
  subject_id?: string | null;
  year: number;
  attempt_number: number;
  selected_answer: PyqSelectedAnswer;
  correct_answer: PyqSelectedAnswer;
  capture_version: 0 | 1 | 2 | 3;
  question_snapshot: PyqQuestionSnapshot | null;
  answer_status: PyqAttemptAnswerStatus;
  screenshot_url: string | null;
  mark_decision: MarkDecision;
  mark_correct: boolean | null;
  confidence?: PyqExamConfidence | null;
  question_started_at: string | null;
  time_spent_ms: number | null;
  time_spent_sec: number;
  bank_version: string;
  attempted_at: string;
  /** Frozen GATE scoring facts. Nullable/absent only on pre-v3 receipts. */
  question_type?: string | null;
  question_marks?: 1 | 2 | null;
  score_thirds?: number | null;
  scoring_status?: PyqAttemptScoringStatus | null;
  scoring_version?: number | null;
  /**
   * Explicit spaced-review origin. A review round may contain several
   * receipts (for example, skip then answer) without overwriting either.
   */
  reattempt_id?: string | null;
  reattempt_round?: number | null;
  round_attempt_number?: number | null;
}

export interface BuddyRow {
  id: string;
  user_a: string;
  user_b: string;
  status: BuddyStatus;
  created_at: string;
}

/** Payload used for kind='question' messages.
 * Deliberately excludes the saved answer, outcome, pattern, notes and
 * root_cause — anything that reveals the sender's analysis. Only the raw
 * question metadata + optional image. */
export interface SharedQuestionRef {
  subject: string;
  subtopic: string | null;
  question_text: string | null;
  image_url: string | null;
  source_ref: string | null;
  source_year: number | null;
  target_time_sec: number;
  /** Optional sender's original question row id — for click-through if the
   *  recipient wants to reply with their own version. Never used to fetch
   *  analysis. */
  origin_question_id: string | null;
}

export interface BuddyMessageRow {
  id: string;
  buddy_id: string;
  sender_id: string;
  kind: 'text' | 'question';
  body: string | null;
  question_ref: SharedQuestionRef | null;
  created_at: string;
  read_at: string | null;
}

export interface SharedInsightRow {
  id: string;
  user_id: string;
  week_start: string;
  insight: string;
  created_at: string;
}

export interface QuestionShareRow {
  id: string;
  from_user: string;
  to_user: string;
  question_id: string;
  note: string | null;
  status: ShareStatus;
  created_at: string;
}

export interface StudyRoomRow {
  id: string;
  name: string;
  subject: string;
  subject_id?: string | null;
  start_time: string;
  duration_min: number;
  participants: string[];
  created_by: string;
  created_at: string;
}

export interface StudyRoomPresenceRow {
  room_id: string;
  user_id: string;
  joined_at: string;
}

export interface InviteRow {
  id: string;
  token: string;
  issued_by: string;
  used_by: string | null;
  expires_at: string;
  created_at: string;
}

export type AccountRequestStatus = 'pending' | 'approved' | 'declined';

export interface AccountRequestRow {
  id: string;
  name: string;
  email: string;
  purpose: string;
  status: AccountRequestStatus;
  notes: string | null;
  invite_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  ip_hash: string | null;
  user_agent: string | null;
}

/** Local (Dexie) shape: server row + sync bookkeeping. */
export type Local<T> = T & { sync_status: SyncStatus };
