import type { StudyMemoryEntry } from '@/lib/study-memory';
import { memoryString } from '@/lib/study-memory';
import type { PyqSessionRow } from '@/types';

export interface OverviewConcept {
  id: string;
  prompt: string;
  kind: string;
  due_on: string;
  attempts?: unknown[];
}

export interface OverviewConceptQueue {
  items: OverviewConcept[];
  today: string;
  complete: boolean;
  held_for_exam?: boolean;
}

export interface OverviewBrief {
  id: string;
  goal: string;
  status: 'active' | 'waiting' | 'complete' | 'cancelled';
  pending_steps?: string[];
  updated_at: string;
}

export function partitionLearningActions(items: StudyMemoryEntry[], today: string) {
  const active = items.filter((entry) => entry.state === 'open' || entry.state === 'deferred');
  const sorted = [...active].sort((a, b) => {
    const aDate = memoryString(a.data, 'due_date') || today;
    const bDate = memoryString(b.data, 'due_date') || today;
    return aDate.localeCompare(bDate) || a.created_at.localeCompare(b.created_at);
  });
  return {
    ready: sorted.filter((entry) => (memoryString(entry.data, 'due_date') || today) <= today),
    upcoming: sorted.filter((entry) => memoryString(entry.data, 'due_date') > today)
  };
}

export function latestUnfinishedPractice(sessions: PyqSessionRow[], userId: string) {
  return (
    sessions
      .filter(
        (session) => session.user_id === userId && ['active', 'paused'].includes(session.status)
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  );
}

export function pendingConcepts(queue: OverviewConceptQueue) {
  const items = [...queue.items].sort((a, b) => a.due_on.localeCompare(b.due_on));
  return {
    due: items.filter((item) => item.due_on <= queue.today),
    upcoming: items.filter((item) => item.due_on > queue.today)
  };
}
