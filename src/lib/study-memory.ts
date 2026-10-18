import { apiRequest } from '@/lib/fastapi-client';
import { targetTimeSecForMarks } from '@/lib/constants';
import { uuidFromString } from '@/lib/utils';
import type { PyqAttemptRow } from '@/types';

export const MEMORY_KINDS = ['reflection', 'exam_review', 'finding', 'repair', 'concept', 'verification', 'profile'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemoryState = 'draft' | 'open' | 'completed' | 'deferred' | 'superseded';
export type MemoryEvidenceKind = 'learner' | 'observed' | 'rule' | 'model';

export interface StudyMemoryEntry {
  id: string;
  user_id: string;
  kind: MemoryKind;
  title: string;
  subject: string | null;
  topic: string | null;
  session_id: string | null;
  attempt_id: string | null;
  question_uid: string | null;
  concept_id: string | null;
  pattern_slug: string | null;
  repair_id: string | null;
  content: string;
  data: Record<string, unknown>;
  state: MemoryState;
  evidence_kind: MemoryEvidenceKind;
  /** Zero is a new record. Each acknowledged write advances this version. */
  version: number;
  created_at: string;
  updated_at: string;
}
export type MemoryEntry = StudyMemoryEntry;
export type MemoryEntryDraft = StudyMemoryEntry;

export const FAILURE_STAGES = [
  { id: 'uncertain', label: 'Not assessed yet' },
  { id: 'reading', label: 'Reading the question' },
  { id: 'recall', label: 'Recalling the idea' },
  { id: 'recognition', label: 'Recognising when it applies' },
  { id: 'method', label: 'Choosing a method' },
  { id: 'execution', label: 'Executing the steps' },
  { id: 'verification', label: 'Checking the result' },
  { id: 'time', label: 'Allocating time' }
] as const;
export type FailureStage = typeof FAILURE_STAGES[number]['id'];

export const MEMORY_ACTIVITIES = [
  { id: 'concept-repair', label: 'Concept repair' },
  { id: 'recall', label: 'Closed-book recall' },
  { id: 'recognition', label: 'Recognise the method' },
  { id: 'execution', label: 'Execution practice' },
  { id: 'retry', label: 'Retry the original question' },
  { id: 'transfer', label: 'Fresh application check' },
  { id: 'speed', label: 'Accuracy and speed practice' },
  { id: 'mixed', label: 'Mixed practice' }
] as const;
export type MemoryActivity = typeof MEMORY_ACTIVITIES[number]['id'];

export interface MemoryRepairData {
  activity: MemoryActivity;
  target: string;
  reason: string;
  success_criteria: string;
  due_date: string | null;
  duration_min: number;
  question_uids: string[];
  requested_count: number;
  /** Explicitly permits familiar questions for a retry; transfer always stays fresh. */
  allow_seen: boolean;
  source_attempt_ids: string[];
  source_entry_ids: string[];
}

export function memoryString(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? data[key] : '';
}
export function memoryStrings(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))] : [];
}

export function getMemoryRepairData(entry: Pick<StudyMemoryEntry, 'data' | 'title' | 'content'>): MemoryRepairData {
  const activity = memoryString(entry.data, 'activity');
  const duration = entry.data.duration_min;
  const count = entry.data.requested_count;
  return {
    activity: MEMORY_ACTIVITIES.some((item) => item.id === activity) ? activity as MemoryActivity : 'concept-repair',
    target: memoryString(entry.data, 'target') || entry.title,
    reason: memoryString(entry.data, 'reason') || entry.content,
    success_criteria: memoryString(entry.data, 'success_criteria'),
    due_date: memoryString(entry.data, 'due_date') || null,
    duration_min: typeof duration === 'number' && Number.isFinite(duration) ? Math.max(5, Math.min(120, Math.round(duration))) : 20,
    question_uids: memoryStrings(entry.data, 'question_uids'),
    requested_count: typeof count === 'number' && Number.isFinite(count) ? Math.max(1, Math.min(50, Math.round(count))) : 3,
    allow_seen: entry.data.allow_seen === true,
    source_attempt_ids: memoryStrings(entry.data, 'source_attempt_ids'),
    source_entry_ids: memoryStrings(entry.data, 'source_entry_ids')
  };
}

export function memoryEntryId(kind: MemoryKind, sourceIdentity: string): string {
  return uuidFromString(`study-memory:${kind}:${sourceIdentity}`);
}

export function newMemoryEntry(
  kind: MemoryKind,
  id: string,
  title: string,
  defaults: Partial<StudyMemoryEntry> = {}
): StudyMemoryEntry {
  return {
    user_id: '', subject: null, topic: null, session_id: null, attempt_id: null,
    question_uid: null, concept_id: null, pattern_slug: null, repair_id: null,
    content: '', data: {}, state: 'draft', evidence_kind: 'learner', version: 0,
    created_at: '', updated_at: '', ...defaults, kind, id, title
  };
}

export interface ListMemoryEntriesInput {
  q?: string;
  kind?: MemoryKind;
  subject?: string;
  state?: MemoryState;
  session_id?: string;
  attempt_id?: string;
  repair_id?: string;
  limit?: number;
  offset?: number;
}
export interface MemoryEntriesPage { items: StudyMemoryEntry[]; total: number; has_more: boolean }
export interface MemoryEntryDetail { entry: StudyMemoryEntry; history?: StudyMemoryEntry[] }

export async function listMemoryEntries(input: ListMemoryEntriesInput = {}): Promise<MemoryEntriesPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return apiRequest<MemoryEntriesPage>(`/v1/study-memory/entries${params.size ? `?${params}` : ''}`);
}

export function getMemoryEntry(id: string): Promise<MemoryEntryDetail> {
  return apiRequest<MemoryEntryDetail>(`/v1/study-memory/entries/${encodeURIComponent(id)}`);
}

/** Explicit allowlist prevents accidentally sending server ownership fields. */
export function memoryWritePayload(entry: StudyMemoryEntry): Record<string, unknown> {
  if (!entry.id || !entry.title.trim()) throw new Error('Memory entries need an identity and title.');
  if (!Number.isInteger(entry.version) || entry.version < 0) throw new Error('Invalid memory version. Reload before saving.');
  if (!MEMORY_KINDS.includes(entry.kind)) throw new Error('Invalid memory kind.');
  return {
    kind: entry.kind, title: entry.title, subject: entry.subject, topic: entry.topic,
    session_id: entry.session_id, attempt_id: entry.attempt_id, question_uid: entry.question_uid,
    concept_id: entry.concept_id, pattern_slug: entry.pattern_slug, repair_id: entry.repair_id,
    content: entry.content, data: entry.data, state: entry.state, evidence_kind: entry.evidence_kind,
    expected_version: entry.version
  };
}

export async function saveMemoryEntry(entry: StudyMemoryEntry): Promise<StudyMemoryEntry> {
  const saved = await apiRequest<StudyMemoryEntry>(`/v1/study-memory/entries/${encodeURIComponent(entry.id)}`, {
    method: 'PUT', body: JSON.stringify(memoryWritePayload(entry))
  });
  window.dispatchEvent(new Event('hetu:memory-saved'));
  return saved;
}

const saveChains = new Map<string, Promise<StudyMemoryEntry>>();
/** Serialises local drafts, carrying acknowledged versions forward. Conflicts remain visible. */
export function queueMemorySave(entry: StudyMemoryEntry): Promise<StudyMemoryEntry> {
  const key = `${entry.user_id}:${entry.id}`;
  const previous = saveChains.get(key);
  // Snapshot now: edits made while a request is pending must not alter that request.
  const snapshot = structuredClone(entry);
  const next = previous
    ? previous.then((saved) => saveMemoryEntry({ ...snapshot, version: Math.max(saved.version, snapshot.version) }))
    : saveMemoryEntry(snapshot);
  saveChains.set(key, next);
  void next.finally(() => { if (saveChains.get(key) === next) saveChains.delete(key); }).catch(() => { /* caller receives the original failure */ });
  return next;
}

/** Full account export; unlike a UI page it never silently truncates at the first 100 records. */
export async function exportMemory(input: Omit<ListMemoryEntriesInput, 'limit' | 'offset'> = {}): Promise<StudyMemoryEntry[]> {
  const byId = new Map<string, StudyMemoryEntry>();
  let offset = 0;
  for (;;) {
    const page = await listMemoryEntries({ ...input, limit: 100, offset });
    for (const item of page.items) byId.set(item.id, item);
    if (!page.has_more) return [...byId.values()];
    if (page.items.length === 0) throw new Error('Memory export could not advance. Retry after refreshing.');
    offset += page.items.length;
  }
}

export type ExamReviewCategory = 'high-confidence-wrong' | 'wrong' | 'skipped' | 'guessed' | 'slow' | 'secure';
export interface ExamReviewQueueItem {
  attempt: PyqAttemptRow;
  questionUid: string;
  category: ExamReviewCategory;
  priority: number;
  reasons: string[];
}

/** Observation-only triage. Priority never diagnoses the cause of an error. */
export function buildExamReviewQueue(attempts: readonly PyqAttemptRow[]): ExamReviewQueueItem[] {
  const unique = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  return [...unique.values()].map((attempt): ExamReviewQueueItem => {
    const skipped = attempt.mark_decision === 'SKIP' || attempt.selected_answer === null;
    if (!skipped && attempt.mark_correct === false && attempt.confidence === 'high') {
      return { attempt, questionUid: attempt.question_uid, category: 'high-confidence-wrong', priority: 0, reasons: ['Incorrect recorded answer with high reported confidence; investigate the reasoning.'] };
    }
    if (!skipped && attempt.mark_correct === false) {
      return { attempt, questionUid: attempt.question_uid, category: 'wrong', priority: 1, reasons: ['Incorrect recorded answer; the cause has not been assessed.'] };
    }
    if (skipped) return { attempt, questionUid: attempt.question_uid, category: 'skipped', priority: 2, reasons: ['Skipped or unanswered; review whether and why progress stopped.'] };
    if (attempt.mark_correct === true && (attempt.mark_decision === 'FIFTY_FIFTY' || attempt.confidence === 'low' || attempt.confidence === 'medium')) {
      return { attempt, questionUid: attempt.question_uid, category: 'guessed', priority: 3, reasons: ['Correct answer with reported uncertainty; independent understanding is unverified.'] };
    }
    const marks = attempt.question_marks ?? attempt.question_snapshot?.marks;
    if (attempt.mark_correct === true && marks != null && attempt.duration_source !== 'unknown' && attempt.time_spent_sec > targetTimeSecForMarks(marks)) {
      return { attempt, questionUid: attempt.question_uid, category: 'slow', priority: 4, reasons: ['Correct answer exceeded the marks-based time target; investigate before choosing speed practice.'] };
    }
    return { attempt, questionUid: attempt.question_uid, category: 'secure', priority: 5, reasons: [attempt.mark_correct === true ? 'Correct recorded answer; reasoning and delayed retention are not yet assessed.' : 'No reliable correctness result; inspect the question and key before assessing ability.'] };
  }).sort((a, b) => a.priority - b.priority || a.attempt.attempted_at.localeCompare(b.attempt.attempted_at) || a.attempt.id.localeCompare(b.attempt.id));
}

export interface MemoryAttemptEvidence { hint_used?: boolean; solution_seen?: boolean; prior_exposure?: boolean }
export interface MemoryPerformanceStats {
  total: number;
  correct: number;
  independentFresh: { attempted: number; correct: number };
  repeated: { attempted: number; correct: number };
  assisted: { attempted: number; correct: number };
  unknownConditions: number;
}

export function memoryPerformanceStats(
  attempts: readonly PyqAttemptRow[],
  evidenceByAttemptId: Readonly<Record<string, MemoryAttemptEvidence>> = {}
): MemoryPerformanceStats {
  const stats: MemoryPerformanceStats = { total: 0, correct: 0, independentFresh: { attempted: 0, correct: 0 }, repeated: { attempted: 0, correct: 0 }, assisted: { attempted: 0, correct: 0 }, unknownConditions: 0 };
  for (const attempt of new Map(attempts.map((row) => [row.id, row])).values()) {
    if (attempt.selected_answer === null || attempt.mark_decision === 'SKIP' || attempt.mark_correct === null) continue;
    const evidence = evidenceByAttemptId[attempt.id];
    stats.total++;
    stats.correct += Number(attempt.mark_correct);
    const repeated = attempt.attempt_number > 1 || evidence?.prior_exposure === true;
    if (repeated) { stats.repeated.attempted++; stats.repeated.correct += Number(attempt.mark_correct); }
    const assisted = evidence?.hint_used === true || evidence?.solution_seen === true;
    if (assisted) { stats.assisted.attempted++; stats.assisted.correct += Number(attempt.mark_correct); }
    if (!repeated && evidence?.prior_exposure === false && evidence.hint_used === false && evidence.solution_seen === false) {
      stats.independentFresh.attempted++;
      stats.independentFresh.correct += Number(attempt.mark_correct);
    } else if (!repeated && !assisted) stats.unknownConditions++;
  }
  return stats;
}
