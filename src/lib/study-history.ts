import { apiRequest } from '@/lib/fastapi-client';

export const HISTORY_COLLECTIONS = [
  ['study_memory', 'Learning memory'],
  ['pyq_attempts', 'Question attempts'],
  ['pyq_sessions', 'Practice and exams'],
  ['questions', 'Journal'],
  ['formulas', 'Formulas'],
  ['concept_pages', 'Concept library'],
  ['learning_insights', 'Saved insights'],
  ['concept_reviews', 'Concept checks'],
  ['learning_items', 'Recovery work'],
  ['mock_tests', 'Mock tests']
] as const;
export type HistoryCollection = (typeof HISTORY_COLLECTIONS)[number][0];
export interface StudyHistoryEvent {
  id: string;
  collection: string;
  record_id: string;
  title: string;
  excerpt: string;
  subject: string | null;
  topic: string | null;
  occurred_at: string | null;
  updated_at: string | null;
  state: string | null;
  session_id: string | null;
  attempt_id: string | null;
  question_uid: string | null;
  href: string | null;
}
export interface StudyHistoryFilters {
  q?: string;
  collection?: string;
  subject?: string;
  topic?: string;
  question_uid?: string;
  session_id?: string;
  limit?: number;
  offset?: number;
}
export interface StudyHistoryPage {
  items: StudyHistoryEvent[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface StudyHistoryDetail {
  event: StudyHistoryEvent;
  evidence: Record<string, unknown>;
  linked_memory: StudyHistoryEvent[];
  sources: StudyHistoryEvent[];
  related_truncated: boolean;
  evidence_truncated: boolean;
}
export function listStudyHistory(filters: StudyHistoryFilters): Promise<StudyHistoryPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return apiRequest(`/v1/study-memory/history?${query}`);
}
export function getStudyHistoryEvent(collection: string, id: string): Promise<StudyHistoryDetail> {
  return apiRequest(
    `/v1/study-memory/history/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`
  );
}
export function studyHistoryLabel(collection: string): string {
  return HISTORY_COLLECTIONS.find(([key]) => key === collection)?.[1] ?? 'Source record';
}
