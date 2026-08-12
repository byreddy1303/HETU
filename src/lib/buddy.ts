import type { BuddyMessageRow, QuestionRow, SharedQuestionRef } from '@/types';

export interface BuddyMessageCluster {
  id: string;
  senderId: string;
  rows: BuddyMessageRow[];
}

export interface BuddyMessageDay {
  day: string;
  clusters: BuddyMessageCluster[];
}

const MESSAGE_CLUSTER_GAP_MS = 5 * 60 * 1000;

/** All clients in one accepted Buddy pair share this Presence topic. */
export function buddyPresenceTopic(buddyId: string): string {
  return `buddy-presence:${buddyId}`;
}

/** The open-chat channel carries typing events and database-change bindings. */
export function buddyRealtimeTopic(buddyId: string): string {
  return `buddy:${buddyId}`;
}

/** Return only keys that currently have at least one connected Presence client. */
export function buddyPresenceUserIds(state: Record<string, unknown[]>): string[] {
  return Object.entries(state)
    .filter(([, presences]) => presences.length > 0)
    .map(([userId]) => userId);
}

/** Strip a journal row to the only fields that may cross into Buddy. */
export function safeQuestionRef(question: QuestionRow): SharedQuestionRef {
  return {
    subject: question.subject,
    subtopic: question.subtopic,
    question_text: question.question_text,
    image_url: question.image_url,
    source_ref: question.source_ref,
    source_year: question.source_year,
    target_time_sec: question.target_time_sec,
    origin_question_id: question.id
  };
}

/** Merge optimistic and realtime rows without duplicates, in display order. */
export function mergeBuddyMessages(
  previous: BuddyMessageRow[],
  incoming: BuddyMessageRow[]
): BuddyMessageRow[] {
  if (incoming.length === 0) return previous;
  const byId = new Map<string, BuddyMessageRow>();
  for (const message of previous) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Group nearby text messages so the conversation reads as turns, not tiles. */
export function groupBuddyMessages(rows: BuddyMessageRow[]): BuddyMessageDay[] {
  const days: BuddyMessageDay[] = [];
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    let dayGroup = days.at(-1);
    if (!dayGroup || dayGroup.day !== day) {
      dayGroup = { day, clusters: [] };
      days.push(dayGroup);
    }

    const previousCluster = dayGroup.clusters.at(-1);
    const previousRow = previousCluster?.rows.at(-1);
    const gap = previousRow
      ? new Date(row.created_at).getTime() - new Date(previousRow.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    const staysInCluster =
      previousCluster?.senderId === row.sender_id &&
      previousRow?.kind === 'text' &&
      row.kind === 'text' &&
      gap >= 0 &&
      gap <= MESSAGE_CLUSTER_GAP_MS;

    if (staysInCluster && previousCluster) previousCluster.rows.push(row);
    else {
      dayGroup.clusters.push({ id: row.id, senderId: row.sender_id, rows: [row] });
    }
  }
  return days;
}

/** Compact chat-list time with stable calendar labels and a useful just-now state. */
export function shortBuddyTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'now';
  if (then.toDateString() === now.toDateString()) {
    return then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diffMs >= 0 && diffMs < 7 * 86_400_000) {
    return then.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return then.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function isSharedQuestionRef(value: unknown): value is SharedQuestionRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Partial<SharedQuestionRef>;
  return typeof ref.subject === 'string' && typeof ref.target_time_sec === 'number';
}
