import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UserRow, PyqAttemptRow } from '@/types';
import Planner from '@/pages/Planner';
import { db } from '@/lib/db';
import { loadDayPlan } from '@/lib/planner-storage';
import { useAuthStore } from '@/stores/auth';

const USER_ID = '00000000-0000-4000-8000-00000000feed';
const DATE = '2026-09-02';

const PROFILE: UserRow = {
  id: USER_ID,
  name: 'Planner tester',
  email: 'planner@example.com',
  username: 'planner-tester',
  exam_date: '2027-02-07',
  target_rank: 100,
  sadhana_practice: false,
  timezone: 'Asia/Kolkata',
  created_at: '2026-01-01T00:00:00.000Z',
  welcome_seen_at: null,
  phone_e164: null,
  digest_email_enabled: false,
  digest_whatsapp_enabled: false,
  digest_hour_local: 6,
  digest_minute_local: 0,
  wa_opted_in_at: null,
  last_digest_sent_on: null,
  buddy_notification_preview_enabled: false,
  study_notifications_enabled: false
};

function attempt(index: number): PyqAttemptRow & { sync_status: 'synced' } {
  return {
    id: `attempt-${index}`,
    user_id: USER_ID,
    pyq_session_id: null,
    question_uid: `question-${String(index).padStart(2, '0')}`,
    subject: 'Operating Systems',
    subject_id: 'operating-systems',
    year: 2025,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    confidence: 'high',
    question_started_at: null,
    time_spent_ms: 90_000,
    time_spent_sec: 90,
    bank_version: 'test',
    attempted_at: `2026-09-01T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: -1,
    scoring_status: 'scored',
    scoring_version: 1,
    sync_status: 'synced'
  };
}

describe('Planner actionable PYQ repair deep link', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAuthStore.setState({
      status: 'signed_in',
      user: null,
      profile: PROFILE,
      sandbox: true
    });
    await Promise.all([
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.sessions.clear(),
      db.mock_tests.clear(),
      db.learning_items.clear(),
      db.reattempts.clear(),
      db.formulas.clear(),
      db.weekly_reviews.clear(),
      db.questions.clear(),
      db.topic_progress.clear()
    ]);
    await db.pyq_attempts.bulkPut(Array.from({ length: 65 }, (_, index) => attempt(index + 1)));
  });

  it('splits more than 50 exact UIDs without loss and is idempotent on reload', async () => {
    const uids = Array.from(
      { length: 65 },
      (_, index) => `question-${String(index + 1).padStart(2, '0')}`
    );
    const route = `/planner?date=${DATE}&addPyqRepair=1&duration=90&questionUids=${uids.join(',')}`;
    window.history.pushState({}, '', route);

    const first = render(
      <MemoryRouter initialEntries={[route]}>
        <Planner />
      </MemoryRouter>
    );

    await waitFor(() => expect(loadDayPlan(DATE)?.sessions).toHaveLength(2));
    const firstPlan = loadDayPlan(DATE)!;
    expect(firstPlan.sessions.every((block) => block.mode === 'PYQ Practice')).toBe(true);
    expect(firstPlan.sessions.flatMap((block) => block.launch?.resolvedQuestionUids ?? [])).toEqual(
      []
    );
    const prescribed = firstPlan.sessions.flatMap(
      (block) => block.launch?.prescription.exactQuestionUids ?? []
    );
    expect(prescribed).toEqual(uids);
    expect(new Set(prescribed).size).toBe(65);
    expect(
      firstPlan.sessions.every(
        (block) => (block.launch?.prescription.exactQuestionUids.length ?? 0) <= 50
      )
    ).toBe(true);

    first.unmount();
    window.history.pushState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <Planner />
      </MemoryRouter>
    );

    await waitFor(() => expect(loadDayPlan(DATE)?.sessions).toHaveLength(2));
    expect(loadDayPlan(DATE)?.sessions.map((block) => block.id)).toEqual(
      firstPlan.sessions.map((block) => block.id)
    );
  });
});
