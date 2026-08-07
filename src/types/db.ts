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
export type PyqSessionStatus = 'active' | 'completed' | 'abandoned';
export type PyqAttemptAnswerStatus = 'available' | 'ambiguous' | 'marks-to-all' | 'unsupported';

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
  wa_opted_in_at: string | null;
  last_digest_sent_on: string | null;
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
  date: string;
  subject: string;
  target_duration_min: number;
  actual_duration_min: number | null;
  insight: string | null;
  sadhana_done: boolean;
  interruptions_count: number;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  user_id: string;
  session_id: string | null;
  subject: string;
  subtopic: string | null;
  source_year: number | null;
  source_ref: string | null;
  question_text: string | null;
  answer_text: string | null;
  image_url: string | null;
  time_spent_sec: number;
  target_time_sec: number;
  outcome: Outcome;
  pattern_name: string | null;
  trigger_sentence: string | null;
  root_cause: RootCause | null;
  mark_decision: MarkDecision | null;
  mark_correct: boolean | null;
  created_at: string;
}

export interface PatternRow {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  count: number;
  is_reflexed: boolean;
  mastery_level: number;
  first_seen_at: string;
}

export interface ReattemptHistoryEntry {
  date: string;
  result: ReattemptResult;
  timeSpent?: number;
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

export interface PyqSessionConfig {
  subjectSlug: string;
  fromYear: number;
  toYear: number;
  type: 'all' | 'MCQ' | 'MSQ' | 'NAT';
  order: 'unseen' | 'random' | 'newest' | 'oldest';
  count: '5' | '10' | '25' | '50' | 'all';
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
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A submitted bank attempt. The official answer is stored, not the learner response. */
export interface PyqAttemptRow {
  id: string;
  user_id: string;
  pyq_session_id: string | null;
  question_uid: string;
  subject: string;
  year: number;
  attempt_number: number;
  selected_answer: PyqSelectedAnswer;
  correct_answer: PyqSelectedAnswer;
  answer_status: PyqAttemptAnswerStatus;
  screenshot_url: string | null;
  mark_decision: MarkDecision;
  mark_correct: boolean | null;
  time_spent_sec: number;
  bank_version: string;
  attempted_at: string;
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
