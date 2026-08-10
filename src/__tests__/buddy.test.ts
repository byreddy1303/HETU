import { describe, expect, it } from 'vitest';
import type { BuddyMessageRow, QuestionRow } from '@/types';
import {
  buddyPresenceTopic,
  buddyPresenceUserIds,
  buddyRealtimeTopic,
  isSharedQuestionRef,
  mergeBuddyMessages,
  safeQuestionRef
} from '@/lib/buddy';

const question: QuestionRow = {
  id: 'question-1',
  user_id: 'user-1',
  session_id: null,
  subject: 'Algorithms',
  subtopic: 'Dynamic programming',
  source_year: 2025,
  source_ref: 'GATE 2025 Q42',
  question_text: 'Find the recurrence.',
  answer_text: 'T(n) = T(n - 1) + n.',
  image_url: null,
  time_spent_sec: 180,
  target_time_sec: 120,
  outcome: 'W-C',
  pattern_name: 'state definition',
  trigger_sentence: 'Define the state first',
  root_cause: 'concept',
  mark_decision: null,
  mark_correct: null,
  created_at: '2026-07-21T08:00:00.000Z'
};

function message(id: string, createdAt: string, body = id): BuddyMessageRow {
  return {
    id,
    buddy_id: 'buddy-1',
    sender_id: 'user-1',
    kind: 'text',
    body,
    question_ref: null,
    created_at: createdAt,
    read_at: null
  };
}

describe('Buddy helpers', () => {
  it('shares question content without journal analysis', () => {
    const ref = safeQuestionRef(question);
    expect(ref).toEqual({
      subject: 'Algorithms',
      subtopic: 'Dynamic programming',
      question_text: 'Find the recurrence.',
      image_url: null,
      source_ref: 'GATE 2025 Q42',
      source_year: 2025,
      target_time_sec: 120,
      origin_question_id: 'question-1'
    });
    expect(ref).not.toHaveProperty('outcome');
    expect(ref).not.toHaveProperty('answer_text');
    expect(ref).not.toHaveProperty('pattern_name');
    expect(ref).not.toHaveProperty('root_cause');
  });

  it('deduplicates optimistic/realtime rows and keeps chronological order', () => {
    const old = message('one', '2026-07-21T08:00:00.000Z');
    const optimistic = message('two', '2026-07-21T08:01:00.000Z', 'pending');
    const confirmed = { ...optimistic, body: 'confirmed' };
    expect(mergeBuddyMessages([optimistic], [old, confirmed])).toEqual([old, confirmed]);
  });

  it('rejects malformed shared-question payloads before rendering', () => {
    expect(isSharedQuestionRef({ subject: 'OS', target_time_sec: 90 })).toBe(true);
    expect(isSharedQuestionRef({ subject: 'OS' })).toBe(false);
    expect(isSharedQuestionRef(null)).toBe(false);
  });

  it('uses a pair-scoped Presence topic and the expected peer id', () => {
    expect(buddyPresenceTopic('pair-1')).toBe('buddy-presence:pair-1');
    expect(buddyRealtimeTopic('pair-1')).toBe('buddy:pair-1');
    const state = {
      me: [{ user_id: 'me' }],
      peer: [{ user_id: 'peer' }]
    };
    expect(buddyPresenceUserIds(state)).toEqual(['me', 'peer']);
  });
});
