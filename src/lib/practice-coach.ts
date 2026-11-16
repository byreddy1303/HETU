import { apiRequest } from '@/lib/fastapi-client';

export function practiceApi<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  return apiRequest<T>(`/v1/practice-coach${path}`, {
    method,
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
export interface DrillProblem {
  prompt: string;
  choices: string[];
  kind: string;
  answer?: number;
  explanation?: string;
  result?: {
    choice: number;
    correct: boolean;
    assistance: string;
    fresh_in_workspace: boolean;
    delayed: boolean;
  };
}
export interface DrillPack {
  id: string;
  version: number;
  group_id: string;
  title: string;
  subject: string;
  topic: string;
  family: string | null;
  round: number;
  questions: DrillProblem[];
  selections: Record<string, number>;
  done: boolean;
  due_date: string;
  due: boolean;
  completed_rounds: number;
  provenance: string;
  principle: string | null;
  conditions: string | null;
  counterexample: string | null;
  source_url: string | null;
  transfer_id: string | null;
  source_count: number;
}
export interface PracticeTrap {
  version: number;
  principle: string;
  conditions: string;
  counterexample: string;
  confirmed: boolean;
}
export interface MistakeGroup {
  id: string;
  title: string;
  subject: string;
  topic: string;
  family: string | null;
  basis: string;
  source_ids: string[];
  attempt_ids: string[];
  notes: string[];
  trap: PracticeTrap | null;
}
export interface PracticeOverview {
  groups: MistakeGroup[];
  packs: DrillPack[];
  complete: boolean;
  group_progress: {
    group_id: string;
    title: string;
    observations: number;
    recent_count: number;
    recent_correct: number;
    previous_count: number;
    previous_correct: number;
    timed_count: number;
    median_seconds: number | null;
  }[];
  evidence: {
    answers: number;
    correct: number;
    fresh: number;
    fresh_correct: number;
    delayed: number;
    delayed_correct: number;
    conditions_unknown: number;
  };
  batches: {
    id: string;
    source: string;
    subject: string;
    topic: string;
    studied_on: string;
    has_attachment: boolean;
    items: { number: string; outcome: string; flagged: boolean; note: string }[];
  }[];
  recent_sessions: { id: string; title: string }[];
}
export interface PracticeReview {
  session_id: string;
  saved_count: number;
  complete: boolean;
  candidates: {
    attempt_id: string;
    title: string;
    topic: string;
    prompt: string;
    correct: boolean | null;
    reason: string;
    decision: { state: string; request?: { cause: string; note: string } } | null;
  }[];
}
export interface PracticePlan {
  id: string;
  version: number;
  date: string;
  budget: number;
  completed: Record<string, boolean>;
  fresh_count: number;
  complete_history: boolean;
  steps: { id: string; title: string; minutes: number; href: string; reason: string }[];
}
export const practiceError = (error: unknown) =>
  error instanceof Error ? error.message : 'This could not be saved. Please retry.';
