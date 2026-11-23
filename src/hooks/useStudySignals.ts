import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { db, type SyncedTableName } from '@/lib/db';
import { useLiveQuery } from '@/lib/db-hooks';
import { loadPyqManifest, loadPyqQuestions } from '@/lib/pyq';
import {
  activityByDay,
  buildBankStats,
  dailyPlan,
  EMPTY_BANK_STATS,
  mockPlan,
  reattemptPipeline,
  reattemptProgress,
  studyPhase,
  studyStreak,
  subjectSignals,
  syllabusBySubject,
  type BankStats
} from '@/lib/study-signals';
import { todayISOInTimeZone } from '@/lib/utils';
import { usePrefsStore } from '@/stores/prefs';
import {
  EMPTY_TOPIC_COMPLETIONS,
  syncTopicProgressFromDb,
  topicProgressId,
  useTopicProgressStore
} from '@/stores/topic-progress';

const SIGNAL_TABLES: readonly SyncedTableName[] = [
  'pyq_attempts',
  'learning_items',
  'learning_events',
  'pyq_sessions',
  'mock_tests'
];

let bankStatsRequest: Promise<BankStats> | null = null;

/** GATE CSE subjects only; payloads are shared with Practice through the bank cache. */
function loadBankStats(): Promise<BankStats> {
  if (!bankStatsRequest) {
    bankStatsRequest = (async () => {
      const manifest = await loadPyqManifest();
      const book = manifest.books.find((candidate) => candidate.slug === 'gate-cse');
      const slugs = new Set((book?.subjects ?? manifest.subjects).map((subject) => subject.slug));
      const questions = await loadPyqQuestions(
        manifest.subjects.filter((subject) => slugs.has(subject.slug)),
        manifest.bankVersion
      );
      // Papers sealed for the final mocks never count towards daily coverage.
      const reserved = new Set(manifest.benchmarkPapers.flatMap((paper) => paper.questionUids));
      return buildBankStats(questions, reserved);
    })().catch((error: unknown) => {
      bankStatsRequest = null;
      throw error;
    });
  }
  return bankStatsRequest;
}

/** Live phase, targets, coverage and pipeline for Today and Progress. */
export function useStudySignals() {
  const { userId, profile } = useAuth();
  const timeZone = profile?.timezone || 'Asia/Kolkata';
  const examDate = profile?.exam_date || EXAM_DATE_DEFAULT;
  const today = todayISOInTimeZone(timeZone);
  const savedGoal = usePrefsStore((state) => state.dailyQuestionTarget);
  const completions = useTopicProgressStore(
    (state) => (userId && state.byUser[userId]) || EMPTY_TOPIC_COMPLETIONS
  );
  const [bank, setBank] = useState<BankStats>(EMPTY_BANK_STATS);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankRetry, setBankRetry] = useState(0);

  useEffect(() => {
    let active = true;
    loadBankStats()
      .then((stats) => {
        if (!active) return;
        setBank(stats);
        setBankError(null);
      })
      .catch((error: unknown) => {
        if (active)
          setBankError(
            error instanceof Error ? error.message : 'The question bank could not load.'
          );
      });
    return () => {
      active = false;
    };
  }, [bankRetry]);

  useEffect(() => {
    if (userId) void syncTopicProgressFromDb(userId).catch(() => undefined);
  }, [userId]);

  const rows = useLiveQuery(
    async () =>
      userId
        ? {
            attempts: await db.pyq_attempts.where('user_id').equals(userId).toArray(),
            items: await db.learning_items.where('user_id').equals(userId).toArray(),
            events: await db.learning_events.where('user_id').equals(userId).toArray(),
            sessions: await db.pyq_sessions.where('user_id').equals(userId).toArray(),
            mocks: await db.mock_tests.where('user_id').equals(userId).toArray()
          }
        : null,
    [userId],
    undefined,
    SIGNAL_TABLES
  );

  const signals = useMemo(() => {
    if (!rows) return null;
    const phase = studyPhase(today, examDate);
    const syllabus = syllabusBySubject((subject, topic) =>
      Boolean(completions[topicProgressId(subject, topic)])
    );
    const activity = activityByDay(rows.attempts, rows.events, today, timeZone);
    return {
      phase,
      subjects: subjectSignals(bank, rows.attempts, rows.items, today, syllabus),
      plan: dailyPlan(bank, rows.attempts, today, timeZone, phase, savedGoal),
      reattempts: reattemptProgress(rows.items, rows.events, today),
      pipeline: reattemptPipeline(rows.items),
      mock: mockPlan(phase, today, timeZone, rows.sessions, rows.mocks),
      activity,
      streak: studyStreak(activity),
      attemptCount: rows.attempts.length
    };
  }, [rows, bank, completions, today, examDate, timeZone, savedGoal]);

  return {
    signals,
    bank,
    bankError,
    retryBank: () => setBankRetry((value) => value + 1),
    today
  };
}

export type StudySignals = NonNullable<ReturnType<typeof useStudySignals>['signals']>;
