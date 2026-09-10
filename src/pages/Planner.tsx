// /planner — calendar-based study planner.
//
// Complete DayPlans are durable in Supabase. user-scoped localStorage is the
// responsive cache used by the calendar and offline UI.
//
// Structure:
//   - calendar grid (full-width) with click-to-open day modal
//   - planner insights derived from saved study sessions
//   - modal edits persist immediately on every field change
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '@/components/layout/PageHeader';
import Calendar from '@/components/planner/Calendar';
import DayPlanModal from '@/components/planner/DayPlanModal';
import PlannerInsights from '@/components/planner/PlannerInsights';
import {
  flushPlannerCloudWrites,
  loadCloudDayPlan,
  loadCloudDayPlans,
  queuePlannerCloudDelete,
  queuePlannerCloudWrite
} from '@/lib/planner-cloud';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import {
  cacheDayPlanForUser,
  cachePlannerDayTombstone,
  deleteDayPlan,
  emptyDayPlan,
  loadDayPlan,
  loadPlannerDaySyncState,
  loadPlannerDayTombstones,
  loadPlanIndexForMonth,
  plannerDateFromSearch,
  saveDayPlan,
  summarize,
  type DayCellSummary,
  type DayPlan
} from '@/lib/planner-storage';
import { PLANNER_MIN_MONTH_INDEX, PLANNER_MIN_YEAR } from '@/lib/planner-constants';
import { loadAllDayPlans } from '@/lib/planner-insights';
import {
  createPlannerPyqRepairBlocks,
  markPlannerBlockComplete,
  reconcilePlannerExecutions,
  startPlannerBlock
} from '@/lib/planner-execution';
import type { StudySession } from '@/lib/planner-storage';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import { db } from '@/lib/db';
import { buildPlannerEvidenceCandidates } from '@/lib/planner-evidence-candidates';
import { forecastReviewLoadWindows } from '@/lib/planner-review-load';
import { loadDebt, loadSnapshots } from '@/lib/readiness-snapshots';
import { SUBJECTS } from '@/lib/constants';
import { SUBTOPICS_BY_SUBJECT } from '@/lib/subtopics';
import { topicProgressId } from '@/stores/topic-progress';
import { weekStartISO } from '@/lib/utils';
import { plannerSessionFromApprovedAction } from '@/lib/planner-approval';
import type { PlannerWorkCandidate } from '@/lib/planner-compiler';

const EMPTY_PLANNER_EVIDENCE = {
  learningItems: [],
  reattempts: [],
  pyqAttempts: [],
  formulas: [],
  weeklyReviews: [],
  questions: [],
  topicProgress: []
};

function todayLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function updatedAtMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localPlanWinsRevision(
  local: DayPlan,
  localRevision: number,
  remoteRevision: number,
  remoteUpdatedAt: string
): boolean {
  if (localRevision !== remoteRevision) return localRevision > remoteRevision;
  return updatedAtMs(local.updatedAt) > updatedAtMs(remoteUpdatedAt);
}

export default function Planner() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayISO = todayLocalISO(today);
  const deepLinkedDate = useMemo(() => plannerDateFromSearch(window.location.search), []);
  const pushToast = useUiStore((s) => s.pushToast);
  const authStatus = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => (s.sandbox ? s.profile?.id : s.user?.id) ?? null);
  const sandbox = useAuthStore((s) => s.sandbox);
  const repairRequest = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('addPyqRepair') !== '1') return null;
    const questionUids = [
      ...new Set(
        (params.get('questionUids') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ];
    const requestedDuration = Number(params.get('duration'));
    return {
      date: plannerDateFromSearch(window.location.search),
      questionUids,
      durationMin: Number.isFinite(requestedDuration) ? requestedDuration : 30
    };
  }, []);

  const deepLinkedDateValue = deepLinkedDate ? new Date(`${deepLinkedDate}T12:00:00Z`) : null;
  const initialY = deepLinkedDateValue
    ? deepLinkedDateValue.getUTCFullYear()
    : Math.max(today.getFullYear(), PLANNER_MIN_YEAR);
  const initialM = deepLinkedDateValue
    ? deepLinkedDateValue.getUTCMonth()
    : today.getFullYear() === PLANNER_MIN_YEAR
      ? Math.max(today.getMonth(), PLANNER_MIN_MONTH_INDEX)
      : today.getMonth();

  const [year, setYear] = useState(initialY);
  const [monthIndex, setMonthIndex] = useState(initialM);
  const [selectedDate, setSelectedDate] = useState<string | null>(deepLinkedDate);
  const [openPlan, setOpenPlan] = useState<DayPlan | null>(() =>
    deepLinkedDate ? (loadDayPlan(deepLinkedDate) ?? emptyDayPlan(deepLinkedDate)) : null
  );
  // bumping `revision` after saves/deletes forces the summary memo to refetch
  // localStorage without diving into React refs.
  const [revision, setRevision] = useState(0);
  const [cloudRefreshRevision, setCloudRefreshRevision] = useState(0);
  const syncErrorShownRef = useRef(false);
  const cloudLoadTokenRef = useRef(0);
  const cloudHydrationTokenRef = useRef(0);
  const repairHandledRef = useRef(false);

  const evidence = useLiveQuery(
    async () => {
      if (!userId) return EMPTY_PLANNER_EVIDENCE;
      const [
        learningItems,
        reattempts,
        pyqAttempts,
        formulas,
        weeklyReviews,
        questions,
        topicProgress
      ] = await Promise.all([
        db.learning_items.where('user_id').equals(userId).toArray(),
        db.reattempts.where('user_id').equals(userId).toArray(),
        db.pyq_attempts.where('user_id').equals(userId).toArray(),
        db.formulas.where('user_id').equals(userId).toArray(),
        db.weekly_reviews.where('user_id').equals(userId).toArray(),
        db.questions.where('user_id').equals(userId).toArray(),
        db.topic_progress.where('user_id').equals(userId).toArray()
      ]);
      return {
        learningItems,
        reattempts,
        pyqAttempts,
        formulas,
        weeklyReviews,
        questions,
        topicProgress
      };
    },
    [userId],
    EMPTY_PLANNER_EVIDENCE
  );

  const plannerEvidence = useMemo(() => {
    const date = selectedDate ?? todayISO;
    const completedTopics = new Set(
      evidence.topicProgress.map((row) => topicProgressId(row.subject, row.topic))
    );
    const incompleteSyllabusTopics = SUBJECTS.flatMap((subject) =>
      (SUBTOPICS_BY_SUBJECT[subject] ?? []).flatMap((topic) =>
        completedTopics.has(topicProgressId(subject, topic.value))
          ? []
          : [
              {
                id: topicProgressId(subject, topic.value),
                subject,
                topic: topic.value,
                estimatedMin: 45,
                href: `/syllabus?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic.value)}`
              }
            ]
      )
    );
    const analyzedAttemptIds = evidence.questions.flatMap((question) =>
      question.source_pyq_attempt_id ? [question.source_pyq_attempt_id] : []
    );
    const weeklyReview =
      evidence.weeklyReviews
        .filter((row) => row.week_start <= weekStartISO(date))
        .sort((left, right) => right.week_start.localeCompare(left.week_start))[0] ?? null;
    const candidates = buildPlannerEvidenceCandidates({
      asOfDate: date,
      learningItems: evidence.learningItems,
      reattempts: evidence.reattempts,
      pyqAttempts: evidence.pyqAttempts,
      analyzedAttemptIds,
      formulas: evidence.formulas,
      currentWeeklyReview: weeklyReview,
      incompleteSyllabusTopics,
      readinessDebt: userId ? loadDebt(userId) : [],
      readinessSnapshots: userId ? loadSnapshots(userId) : [],
      existingSessions: openPlan?.date === date ? openPlan.sessions : []
    });
    const canonicalIds = new Set(evidence.learningItems.map((item) => item.id));
    const reviewRows = [
      ...evidence.learningItems.flatMap((item) =>
        item.scheduled_date &&
        item.stage !== 'MASTERED' &&
        item.recovery_state !== 'mastered' &&
        item.recovery_state !== 'paused'
          ? [
              {
                id: item.id,
                scheduled_date: item.scheduled_date,
                stage: item.stage === 'TRANSFER' ? ('D30' as const) : item.stage,
                estimatedMin: Math.min(20, 5 + item.lapse_count * 2)
              }
            ]
          : []
      ),
      ...evidence.reattempts.flatMap((row) =>
        row.learning_item_id && canonicalIds.has(row.learning_item_id)
          ? []
          : [
              {
                id: row.id,
                scheduled_date: row.scheduled_date,
                stage: row.stage,
                estimatedMin: 5
              }
            ]
      )
    ];
    const capturedAttemptIds = new Set(
      evidence.learningItems.flatMap((item) =>
        item.origin_pyq_attempt_id ? [item.origin_pyq_attempt_id] : []
      )
    );
    return {
      candidates,
      reviewForecast: forecastReviewLoadWindows(reviewRows, { asOfDate: date }),
      historicalRecoveryCapture:
        evidence.pyqAttempts.length > 0
          ? {
              capturedCount: capturedAttemptIds.size,
              attemptedCount: evidence.pyqAttempts.length
            }
          : undefined
    };
  }, [evidence, openPlan, selectedDate, todayISO, userId]);

  const reportCloudWriteResult = useCallback(
    (error: string | null) => {
      if (error && !syncErrorShownRef.current) {
        syncErrorShownRef.current = true;
        pushToast('Plan is cached here; database sync will retry when online.', 'neutral');
      } else if (!error) {
        syncErrorShownRef.current = false;
      }
    },
    [pushToast]
  );

  const queuePlanSync = useCallback(
    (plan: DayPlan) => {
      if (!userId || sandbox) return;
      void queuePlannerCloudWrite(userId, plan).then(reportCloudWriteResult);
    },
    [reportCloudWriteResult, sandbox, userId]
  );

  useEffect(() => {
    if (
      repairHandledRef.current ||
      !repairRequest ||
      !repairRequest.date ||
      repairRequest.questionUids.length === 0 ||
      authStatus !== 'signed_in' ||
      !userId
    ) {
      return;
    }
    repairHandledRef.current = true;
    let active = true;

    void (async () => {
      const requested = new Set(repairRequest.questionUids);
      const userAttempts = await db.pyq_attempts.where('user_id').equals(userId).toArray();
      const latestByQuestion = new Map<string, (typeof userAttempts)[number]>();
      for (const attempt of userAttempts) {
        if (!requested.has(attempt.question_uid)) continue;
        const current = latestByQuestion.get(attempt.question_uid);
        if (!current || attempt.attempted_at > current.attempted_at) {
          latestByQuestion.set(attempt.question_uid, attempt);
        }
      }
      if (!active) return;
      const identities = [
        ...new Map(
          [...latestByQuestion.values()].map((attempt) => {
            const identity = normalizeSubjectIdentity(attempt.subject, attempt.subject_id);
            return [`${identity.id ?? 'custom'}\u0000${identity.label}`, identity] as const;
          })
        ).values()
      ];
      const singleSubject = identities.length === 1 ? identities[0] : null;
      const blocks = createPlannerPyqRepairBlocks({
        date: repairRequest.date!,
        questionUids: repairRequest.questionUids,
        durationMin: repairRequest.durationMin,
        subjectLabel: singleSubject?.label ?? 'Mixed GATE repair',
        subjectId: singleSubject?.id ?? null
      });
      if (blocks.length === 0) return;
      const currentPlan = loadDayPlan(repairRequest.date!) ?? emptyDayPlan(repairRequest.date!);
      const existingIds = new Set(currentPlan.sessions.map((session) => session.id));
      const newBlocks = blocks.filter((block) => !existingIds.has(block.id));
      const saved =
        newBlocks.length === 0
          ? currentPlan
          : saveDayPlan({ ...currentPlan, sessions: [...currentPlan.sessions, ...newBlocks] });
      if (newBlocks.length > 0) queuePlanSync(saved);
      setYear(Number(repairRequest.date!.slice(0, 4)));
      setMonthIndex(Number(repairRequest.date!.slice(5, 7)) - 1);
      setSelectedDate(repairRequest.date);
      setOpenPlan(saved);
      setRevision((value) => value + 1);
      pushToast(
        newBlocks.length === 0
          ? 'That exact PYQ repair block is already in this day.'
          : `${repairRequest.questionUids.length} exact PYQs added in ${newBlocks.length} bounded block${newBlocks.length === 1 ? '' : 's'} for approval.`,
        'neutral'
      );
      const cleaned = new URLSearchParams(window.location.search);
      cleaned.delete('addPyqRepair');
      cleaned.delete('questionUids');
      cleaned.delete('duration');
      navigate(`/planner?${cleaned.toString()}`, { replace: true });
    })().catch(() => {
      repairHandledRef.current = false;
      pushToast('The exact PYQ repair block could not be added. Try again.', 'neutral');
    });

    return () => {
      active = false;
    };
  }, [authStatus, navigate, pushToast, queuePlanSync, repairRequest, userId]);

  useEffect(() => {
    if (!userId) return;
    void reconcilePlannerExecutions(userId)
      .then((changed) => {
        if (changed > 0) {
          // Reconciliation can update more than the currently open date. Queue
          // every cached plan; the module queue coalesces unchanged dates.
          loadAllDayPlans().forEach(queuePlanSync);
          setRevision((value) => value + 1);
          setOpenPlan((current) => (current ? (loadDayPlan(current.date) ?? current) : current));
        }
      })
      .catch(() => undefined);
  }, [queuePlanSync, userId]);

  useEffect(() => {
    if (!userId || sandbox) return;
    const retry = () => {
      void flushPlannerCloudWrites(userId).then(reportCloudWriteResult);
      setCloudRefreshRevision((value) => value + 1);
    };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      void flushPlannerCloudWrites(userId).then(reportCloudWriteResult);
    };
  }, [reportCloudWriteResult, sandbox, userId]);

  useEffect(() => {
    if (!userId || sandbox) return;
    let active = true;
    const loadToken = ++cloudHydrationTokenRef.current;
    const localPlans = loadAllDayPlans();
    const localTombstones = loadPlannerDayTombstones(userId);

    void loadCloudDayPlans(userId).then(({ plans: remotePlans, tombstones = [], error }) => {
      if (!active || loadToken !== cloudHydrationTokenRef.current) return;
      if (error) {
        reportCloudWriteResult(error);
        return;
      }
      const localByDate = new Map(localPlans.map((plan) => [plan.date, plan]));
      const localTombstoneByDate = new Map(localTombstones.map((state) => [state.date, state]));
      const remoteByDate = new Map(remotePlans.map((plan) => [plan.date, plan]));
      const remoteTombstoneByDate = new Map(tombstones.map((state) => [state.date, state]));
      const dates = new Set([
        ...localByDate.keys(),
        ...localTombstoneByDate.keys(),
        ...remoteByDate.keys(),
        ...remoteTombstoneByDate.keys()
      ]);
      let cacheChanged = false;

      for (const date of dates) {
        const local = loadDayPlan(date);
        const localState = loadPlannerDaySyncState(userId, date);
        const remote = remoteByDate.get(date) ?? null;
        const remoteTombstone = remoteTombstoneByDate.get(date) ?? null;

        if (remoteTombstone) {
          const localRevision = Math.max(local?.syncRevision ?? 0, localState?.revision ?? 0);
          if (
            local &&
            !localState?.deletedAt &&
            localPlanWinsRevision(
              local,
              localRevision,
              remoteTombstone.revision,
              remoteTombstone.updatedAt
            )
          ) {
            queuePlanSync(local);
          } else if ((localState?.revision ?? 0) > remoteTombstone.revision) {
            void queuePlannerCloudDelete(userId, date).then(reportCloudWriteResult);
          } else {
            cachePlannerDayTombstone(userId, remoteTombstone);
            cacheChanged = true;
          }
          continue;
        }

        // A local tombstone is an intentional offline delete. Never hydrate an
        // older live row over it; send the versioned delete instead.
        if (localState?.deletedAt) {
          void queuePlannerCloudDelete(userId, date).then(reportCloudWriteResult);
          continue;
        }

        if (!local) {
          if (remote) {
            cacheDayPlanForUser(userId, remote);
            cacheChanged = true;
          }
          continue;
        }

        if (
          !remote ||
          localPlanWinsRevision(
            local,
            Math.max(local.syncRevision ?? 0, localState?.revision ?? 0),
            remote.syncRevision ?? 0,
            remote.updatedAt
          )
        ) {
          queuePlanSync(local);
          continue;
        }
        cacheDayPlanForUser(userId, remote);
        cacheChanged = true;
      }

      if (cacheChanged) {
        setRevision((value) => value + 1);
        setOpenPlan((current) =>
          current ? (loadDayPlan(current.date) ?? emptyDayPlan(current.date)) : current
        );
      }
      if (deepLinkedDate) {
        const hydrated = loadDayPlan(deepLinkedDate);
        if (hydrated) {
          setOpenPlan((current) => (current?.date === deepLinkedDate ? hydrated : current));
        }
      }
    });

    return () => {
      active = false;
    };
  }, [
    cloudRefreshRevision,
    deepLinkedDate,
    queuePlanSync,
    reportCloudWriteResult,
    sandbox,
    userId
  ]);

  const { planIndex, summaries } = useMemo(() => {
    void revision;
    const idx = loadPlanIndexForMonth(year, monthIndex);
    const map = new Map<string, DayCellSummary>();
    idx.forEach((d) => {
      const plan = loadDayPlan(d);
      map.set(d, summarize(plan));
    });
    return { planIndex: idx, summaries: map };
  }, [year, monthIndex, revision]);

  const goPrev = useCallback(() => {
    setMonthIndex((m) => {
      if (year === PLANNER_MIN_YEAR && m === PLANNER_MIN_MONTH_INDEX) return m;
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, [year]);

  const goNext = useCallback(() => {
    setMonthIndex((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  function openDate(iso: string) {
    const existing = loadDayPlan(iso);
    const loadToken = ++cloudLoadTokenRef.current;
    setSelectedDate(iso);
    setOpenPlan(existing ?? emptyDayPlan(iso));

    if (!userId || sandbox) return;
    void loadCloudDayPlan(userId, iso).then(({ plan: remote, tombstone, error }) => {
      if (loadToken !== cloudLoadTokenRef.current) return;
      if (error) return;
      const latestLocal = loadDayPlan(iso);
      const localState = loadPlannerDaySyncState(userId, iso);

      if (tombstone) {
        const localRevision = Math.max(latestLocal?.syncRevision ?? 0, localState?.revision ?? 0);
        if (
          latestLocal &&
          !localState?.deletedAt &&
          localPlanWinsRevision(
            latestLocal,
            localRevision,
            tombstone.revision,
            tombstone.updatedAt
          )
        ) {
          queuePlanSync(latestLocal);
          return;
        }
        if ((localState?.revision ?? 0) > tombstone.revision) {
          void queuePlannerCloudDelete(userId, iso).then(reportCloudWriteResult);
          return;
        }
        cachePlannerDayTombstone(userId, tombstone);
        setOpenPlan((current) => (current?.date === iso ? emptyDayPlan(iso) : current));
        setRevision((value) => value + 1);
        return;
      }

      if (localState?.deletedAt) {
        void queuePlannerCloudDelete(userId, iso).then(reportCloudWriteResult);
        return;
      }
      if (!remote) {
        if (latestLocal) queuePlanSync(latestLocal);
        return;
      }

      if (
        latestLocal &&
        localPlanWinsRevision(
          latestLocal,
          Math.max(latestLocal.syncRevision ?? 0, localState?.revision ?? 0),
          remote.syncRevision ?? 0,
          remote.updatedAt
        )
      ) {
        queuePlanSync(latestLocal);
        return;
      }

      cacheDayPlanForUser(userId, remote);
      setOpenPlan((current) => (current?.date === iso ? remote : current));
      setRevision((value) => value + 1);
    });
  }

  function closeModal() {
    cloudLoadTokenRef.current += 1;
    setSelectedDate(null);
    setOpenPlan(null);
  }

  function onChangePlan(next: DayPlan) {
    const saved = saveDayPlan(next);
    setOpenPlan(saved);
    queuePlanSync(saved);
    setRevision((n) => n + 1);
  }

  function persistOperationPlans(plans: DayPlan[], message: string) {
    let selectedPlan: DayPlan | null = null;
    for (const candidate of plans) {
      const saved = saveDayPlan(candidate);
      queuePlanSync(saved);
      if (saved.date === selectedDate) selectedPlan = saved;
    }
    if (selectedPlan) setOpenPlan(selectedPlan);
    setRevision((value) => value + 1);
    pushToast(message, 'neutral');
  }

  function onDeletePlan() {
    if (!selectedDate) return;
    cloudLoadTokenRef.current += 1;
    cloudHydrationTokenRef.current += 1;
    deleteDayPlan(selectedDate);
    if (userId && !sandbox) {
      void queuePlannerCloudDelete(userId, selectedDate).then(reportCloudWriteResult);
    }
    setRevision((n) => n + 1);
    closeModal();
    pushToast('Day plan cleared.', 'neutral');
  }

  function startBlock(block: StudySession) {
    if (!selectedDate) return;
    const started = startPlannerBlock(selectedDate, block.id);
    if (!started) return;
    setOpenPlan(started.plan);
    queuePlanSync(started.plan);
    setRevision((value) => value + 1);
    closeModal();
    navigate(started.href);
  }

  function completeBlock(block: StudySession) {
    if (!selectedDate) return;
    const saved = markPlannerBlockComplete(selectedDate, block.id, block.durationMin);
    if (saved) {
      setOpenPlan(saved);
      queuePlanSync(saved);
      setRevision((value) => value + 1);
    }
  }

  function createEvidenceBlock(candidate: PlannerWorkCandidate) {
    const plan = loadDayPlan(todayISO) ?? emptyDayPlan(todayISO);
    const block = plannerSessionFromApprovedAction(todayISO, {
      id: `insight:${candidate.id}`,
      sourceId: null,
      kind: candidate.kind,
      title: candidate.title,
      detail: candidate.detail ?? null,
      subject: candidate.subject ?? null,
      durationMin: Math.max(5, Math.min(180, Math.round(candidate.estimatedMin))),
      sourceEstimatedMin: candidate.estimatedMin,
      remainingSourceMin: 0,
      priority: candidate.priority ?? 'P2 High',
      energy: candidate.energy ?? 'any',
      required: candidate.required ?? false,
      href: candidate.href ?? null,
      windowId: null,
      windowLabel: null,
      startsAt: null,
      endsAt: null,
      explanation: candidate.reason ?? 'Added from current Planner evidence.'
    });
    if (plan.sessions.some((session) => session.id === block.id)) {
      pushToast('That evidence block is already on today’s agenda.', 'neutral');
      return;
    }
    const saved = saveDayPlan({ ...plan, sessions: [...plan.sessions, block] });
    queuePlanSync(saved);
    setYear(Number(todayISO.slice(0, 4)));
    setMonthIndex(Number(todayISO.slice(5, 7)) - 1);
    setSelectedDate(todayISO);
    setOpenPlan(saved);
    setRevision((value) => value + 1);
    pushToast('Evidence block added to today for review and approval.', 'neutral');
  }

  function createNeglectedSubjectBlock(subject: string) {
    createEvidenceBlock({
      id: `neglected:${subject}`,
      kind: 'study',
      title: `Restore ${subject} coverage`,
      detail: 'Neglected-subject insight from the last 30 days',
      subject,
      estimatedMin: 45,
      priority: 'P2 High',
      energy: 'medium',
      href: `/syllabus?subject=${encodeURIComponent(subject)}`,
      reason: `${subject} received less than 60 planned minutes in the last 30 days`
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planner"
        description="Plan a day. Review a day. Every field saves as you edit."
      />

      <Calendar
        year={year}
        monthIndex={monthIndex}
        today={today}
        planIndex={planIndex}
        summaries={summaries}
        onPrevMonth={goPrev}
        onNextMonth={goNext}
        onPickDate={openDate}
      />

      <PlannerInsights
        revision={revision}
        evidenceCandidates={plannerEvidence.candidates}
        onCreateEvidenceBlock={createEvidenceBlock}
        onCreateNeglectedBlock={createNeglectedSubjectBlock}
      />

      <AnimatePresence>
        {selectedDate && openPlan && (
          <DayPlanModal
            date={selectedDate}
            plan={openPlan}
            onChange={onChangePlan}
            onClose={closeModal}
            onDelete={onDeletePlan}
            onStartBlock={startBlock}
            onCompleteBlock={completeBlock}
            evidenceCandidates={plannerEvidence.candidates}
            reviewForecast={plannerEvidence.reviewForecast}
            historicalRecoveryCapture={plannerEvidence.historicalRecoveryCapture}
            onPersistPlans={persistOperationPlans}
          />
        )}
      </AnimatePresence>

      <p className="text-[11px] text-text-faint">
        Today: <span className="u-num text-text">{todayISO}</span>.{' '}
        {sandbox
          ? 'Plans are stored on this device.'
          : 'Complete plans are saved privately to your account database; this device keeps a fast cache.'}
      </p>
    </div>
  );
}
