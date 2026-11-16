import { apiRequest } from '@/lib/fastapi-client';

export async function practiceApi<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal
) {
  const result = await apiRequest<T>(`/v1/practice-coach${path}`, {
    method,
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (method !== 'GET') window.dispatchEvent(new Event('hetu:memory-saved'));
  return result;
}
export type RepairDifficulty = 'uncertain' | 'understanding' | 'recognition' | 'execution' | 'time';
export const REPAIR_APPROACHES: Record<RepairDifficulty, { label: string; action: string }> = {
  uncertain: {
    label: 'Not sure yet',
    action: 'Try a fresh problem and notice the first step where you need help.'
  },
  understanding: {
    label: 'Understanding the idea',
    action:
      'Revisit the principle and its conditions below, then explain the distinction in your own words before the next independent check.'
  },
  recognition: {
    label: 'Choosing the method',
    action:
      'Compare when the rule applies and when it does not. Use Mix methods when you are ready to choose without the family label.'
  },
  execution: {
    label: 'Carrying out the steps',
    action:
      'Work through one calculation or trace slowly. Choose one checking habit to use on the next problem.'
  },
  time: {
    label: 'Using time well',
    action:
      'Establish independent accuracy first. Then try one time-allocation change in mixed practice or your next mock.'
  }
};
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
  assessment?: { difficulty: RepairDifficulty; next_action: string; basis: string } | null;
  round_outcome?: 'independent' | 'needs-independent-check' | 'needs-repair' | null;
  independent_rounds?: number;
  independent_delayed_rounds?: number;
  unsuccessful_rounds?: number;
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
  focus: { version: number; pack_ids: string[]; suggested: boolean };
  applications?: {
    complete: boolean;
    items: {
      pack_id: string;
      session_id: string;
      repair_id: string;
      next_review_id: string | null;
      assistance: string;
      submitted: number;
      planned: number;
      fresh_count: number;
      fresh_correct: number;
      delayed_count: number;
      delayed_correct: number;
    }[];
  };
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
    fresh_count: number;
    fresh_correct: number;
    delayed_count: number;
    delayed_correct: number;
  }[];
  evidence: {
    answers: number;
    correct: number;
    fresh: number;
    fresh_correct: number;
    delayed: number;
    delayed_correct: number;
    conditions_unknown: number;
    helped: number;
    fresh_delayed: number;
    fresh_delayed_correct: number;
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
