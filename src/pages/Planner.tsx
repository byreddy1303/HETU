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
  cacheDayPlan,
  deleteDayPlan,
  emptyDayPlan,
  loadDayPlan,
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
  markPlannerBlockComplete,
  markPlannerBlockStarted,
  plannerBlockHref,
  reconcilePlannerExecutions
} from '@/lib/planner-execution';
import type { StudySession } from '@/lib/planner-storage';

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

export default function Planner() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayISO = todayLocalISO(today);
  const deepLinkedDate = useMemo(() => plannerDateFromSearch(window.location.search), []);
  const pushToast = useUiStore((s) => s.pushToast);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sandbox = useAuthStore((s) => s.sandbox);

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

    void loadCloudDayPlans(userId).then(({ plans: remotePlans, error }) => {
      if (!active || loadToken !== cloudHydrationTokenRef.current) return;
      if (error) {
        reportCloudWriteResult(error);
        return;
      }
      const localByDate = new Map(localPlans.map((plan) => [plan.date, plan]));
      const remoteByDate = new Map(remotePlans.map((plan) => [plan.date, plan]));
      const dates = new Set([...localByDate.keys(), ...remoteByDate.keys()]);
      let cacheChanged = false;

      for (const date of dates) {
        const local = loadDayPlan(date);
        const remote = remoteByDate.get(date) ?? null;
        if (!local) {
          if (remote) {
            cacheDayPlan(remote);
            cacheChanged = true;
          }
          continue;
        }

        if (!remote || updatedAtMs(local.updatedAt) >= updatedAtMs(remote.updatedAt)) {
          queuePlanSync(local);
          continue;
        }
        cacheDayPlan(remote);
        cacheChanged = true;
      }

      if (cacheChanged) setRevision((value) => value + 1);
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
    void loadCloudDayPlan(userId, iso).then(({ plan: remote, error }) => {
      if (loadToken !== cloudLoadTokenRef.current) return;
      if (error) return;
      const latestLocal = loadDayPlan(iso);
      if (!remote) {
        if (latestLocal) queuePlanSync(latestLocal);
        return;
      }

      const localUpdated = latestLocal ? updatedAtMs(latestLocal.updatedAt) : 0;
      const remoteUpdated = updatedAtMs(remote.updatedAt);
      if (latestLocal && localUpdated >= remoteUpdated) {
        queuePlanSync(latestLocal);
        return;
      }

      cacheDayPlan(remote);
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
    const saved = markPlannerBlockStarted(selectedDate, block.id);
    if (saved) {
      setOpenPlan(saved);
      queuePlanSync(saved);
      setRevision((value) => value + 1);
    }
    const href = plannerBlockHref(selectedDate, block);
    closeModal();
    navigate(href);
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

      <PlannerInsights revision={revision} />

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
