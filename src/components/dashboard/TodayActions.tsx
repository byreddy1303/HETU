import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLiveQuery } from '@/lib/db-hooks';
import { db, subscribeDb } from '@/lib/db';
import { apiRequest } from '@/lib/fastapi-client';
import { isInitialPullActive, subscribeInitialPull } from '@/lib/sync';
import { loadDayPlan } from '@/lib/planner-storage';
import { reconcilePlannerExecutions, startPlannerBlock } from '@/lib/planner-execution';
import { queuePlannerCloudWrite } from '@/lib/planner-cloud';
import { prepareLocalLearningActivity, LEARNING_UPDATED_EVENT } from '@/lib/local-learning-engine';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import type { MemoryEntriesPage, StudyMemoryEntry } from '@/lib/study-memory';
import {
  buildTodayActions,
  type TodayAction,
  type TodayBudget,
  type TodayConceptQueue,
  type TodayRecoveryOverview
} from '@/lib/today-actions';
import { recoveryKey, startSessionApi } from '@/lib/recovery-api';
import { runtimeStorage } from '@/lib/runtime-storage';
import { useSyncStatusStore } from '@/stores/sync-status';

const actionLabels: Record<TodayAction['kind'], string> = {
  resume: 'In progress',
  planned: 'In your plan',
  recovery: 'Due reattempts',
  concept: 'Concept revision',
  repair: 'Focused practice',
  evidence: 'From your saved work'
};

interface Snapshot {
  ownerId: string;
  budget: TodayBudget;
  memory: StudyMemoryEntry[];
  concepts: TodayConceptQueue | null;
  recovery: TodayRecoveryOverview | null;
  errors: string[];
  partial: boolean;
}

/** Shared local daily entry point. Blind queue text never renders answers or diagnoses. */
export default function TodayActions({
  userId,
  today,
  compact = false
}: {
  userId: string;
  today: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const budgetKey = `air.today-budget.${userId}.${today}`;
  const [budget, setBudget] = useState<TodayBudget>(() => {
    const saved = Number(runtimeStorage.getItem(budgetKey));
    return saved === 20 || saved === 30 ? saved : 10;
  });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState('');
  const [startError, setStartError] = useState('');
  const [planRevision, setPlanRevision] = useState(0);
  const alive = useRef(true);
  const starting = useRef(false);
  const hydrating = useSyncExternalStore(subscribeInitialPull, isInitialPullActive, () => true);
  const syncError = useSyncStatusStore((state) => state.lastError);
  const rows = useLiveQuery(
    async () => ({
      learningItems: await db.learning_items.where('user_id').equals(userId).toArray(),
      reattempts: await db.reattempts.where('user_id').equals(userId).toArray(),
      pyqAttempts: await db.pyq_attempts.where('user_id').equals(userId).toArray(),
      formulas: await db.formulas.where('user_id').equals(userId).toArray(),
      questions: await db.questions.where('user_id').equals(userId).toArray(),
      practiceSessions: await db.pyq_sessions.where('user_id').equals(userId).toArray(),
      recoverySessions: await db.recovery_sessions.where('user_id').equals(userId).toArray()
    }),
    [userId]
  );

  useEffect(() => {
    alive.current = true;
    let active = true;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout>;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      const results = await Promise.allSettled([
        apiRequest<MemoryEntriesPage>('/v1/study-memory/entries?kind=repair&state=open&limit=100', {
          signal: request.signal
        }),
        apiRequest<MemoryEntriesPage>(
          '/v1/study-memory/entries?kind=repair&state=deferred&limit=100',
          { signal: request.signal }
        ),
        apiRequest<TodayConceptQueue>('/v1/learning/concept-bridge/queue?limit=100', {
          signal: request.signal
        }),
        apiRequest<TodayRecoveryOverview>(`/v1/recovery?mode=minutes-${budget}&days=1`, {
          signal: request.signal
        })
      ]);
      if (!active || request.signal.aborted) return;
      const [open, deferred, concepts, recovery] = results;
      const labels = [
        'Prepared practice',
        'Deferred practice',
        'Concept reviews',
        'Recovery sprint'
      ];
      const errors = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [
              `${labels[index]} could not load. ${result.reason instanceof Error ? result.reason.message : 'Try again.'}`
            ]
          : []
      );
      setSnapshot({
        ownerId: userId,
        budget,
        memory: [open, deferred].flatMap((result) =>
          result.status === 'fulfilled' ? result.value.items : []
        ),
        concepts: concepts.status === 'fulfilled' ? concepts.value : null,
        recovery: recovery.status === 'fulfilled' ? recovery.value : null,
        errors,
        partial:
          [open, deferred].some(
            (result) => result.status === 'fulfilled' && result.value.has_more
          ) ||
          (concepts.status === 'fulfilled' && !concepts.value.complete) ||
          (recovery.status === 'fulfilled' && !recovery.value.complete)
      });
      setLoading(false);
      try {
        await reconcilePlannerExecutions(userId);
      } catch {
        /* Existing commitments remain visible. */
      }
      if (active) setPlanRevision((value) => value + 1);
    };
    const refresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 250);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    void load();
    const unsubscribe = subscribeDb(refresh);
    const events = [
      LEARNING_UPDATED_EVENT,
      'hetu:memory-saved',
      'hetu:concept-reviews-updated',
      'hetu:workspace-changed',
      'focus'
    ];
    for (const event of events) window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      alive.current = false;
      controller?.abort();
      clearTimeout(debounce);
      unsubscribe();
      for (const event of events) window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId, budget, today, retry]);

  void planRevision;
  const plan = loadDayPlan(today);
  const state = snapshot?.ownerId === userId && snapshot.budget === budget ? snapshot : null;
  const analyzedAttemptIds = new Set(
    rows?.questions.flatMap((question) =>
      question.source_pyq_attempt_id ? [question.source_pyq_attempt_id] : []
    ) ?? []
  );
  const queue =
    rows && state
      ? buildTodayActions({
          ...rows,
          ownerId: userId,
          asOfDate: today,
          budget,
          plan,
          studyMemoryEntries: state.memory,
          concepts: state.concepts,
          recovery: state.recovery,
          analyzedAttemptIds
        })
      : null;
  const pending = loading || hydrating || !rows || !state;
  const first = queue?.fitting[0];
  const clear =
    !pending &&
    !syncError &&
    state?.errors.length === 0 &&
    !state.partial &&
    !queue?.heldForExam &&
    !state.concepts?.held_for_exam &&
    queue?.actions.length === 0;

  async function start(action: TodayAction) {
    if (starting.current) return;
    starting.current = true;
    setBusy(action.id);
    setStartError('');
    try {
      let href = action.href;
      if (action.recoveryItemIds) {
        const result = await startSessionApi({
          userId,
          mode: `minutes-${budget}`,
          itemIds: action.recoveryItemIds,
          key: recoveryKey('today-sprint', [
            userId,
            today,
            budget,
            action.recoveryItemIds,
            action.recoveryStartRevision
          ])
        });
        href = `/reattempts?recoverySession=${encodeURIComponent(result.session.id)}`;
      } else if (action.repairId) {
        href = memoryRepairHref(await prepareLocalLearningActivity(action.repairId));
      }
      if (action.plannerBlockId && plan) {
        const started = startPlannerBlock(plan.date, action.plannerBlockId);
        if (!started)
          throw new Error('This Planner block changed. Refresh the queue before starting.');
        const error = await queuePlannerCloudWrite(userId, started.plan);
        if (error) throw new Error(error);
        if (action.repairId) {
          const url = new URL(href, window.location.origin);
          url.searchParams.set('plannerDate', plan.date);
          url.searchParams.set('plannerBlock', action.plannerBlockId);
          href = `${url.pathname}${url.search}`;
        } else href = started.href;
      }
      if (alive.current) navigate(href);
    } catch (cause) {
      if (alive.current)
        setStartError(
          cause instanceof Error
            ? cause.message
            : 'The action could not start. Refresh and try again.'
        );
    } finally {
      starting.current = false;
      if (alive.current) setBusy('');
    }
  }

  return (
    <section
      aria-label="Today's study queue"
      aria-busy={pending}
      className="min-w-0 space-y-4 rounded-lg border border-border bg-bg-raised p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Your next study action</h2>
        <label className="flex items-center gap-2 text-sm">
          Time available
          <select
            aria-label="Time available"
            disabled={Boolean(busy)}
            value={budget}
            onChange={(event) => {
              const value = Number(event.target.value) as TodayBudget;
              runtimeStorage.setItem(budgetKey, String(value));
              setBudget(value);
            }}
            className="rounded border border-border bg-bg px-2 py-2 text-text"
          >
            {[10, 20, 30].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      {pending && (
        <p role="status" className="text-sm text-text-muted">
          Checking your saved work…
        </p>
      )}
      {state?.errors.map((error) => (
        <p key={error} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ))}
      {syncError && (
        <p role="alert" className="text-sm text-danger">
          Study records could not refresh. The visible queue may be out of date. {syncError}
        </p>
      )}
      {state?.partial && (
        <p className="text-sm text-text-muted">
          This is a partial queue. More saved work may be available in Memory or Recovery.
        </p>
      )}
      {(queue?.heldForExam || state?.concepts?.held_for_exam) && (
        <p className="text-sm text-text-muted">
          An exam is unfinished. Related coaching and recall remain held until it is safe to review.
        </p>
      )}
      {!pending && first && (
        <div className="grid gap-4 rounded-lg border border-accent/25 bg-accent-faint/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-accent">{actionLabels[first.kind]}</p>
            <h3 className="font-display text-xl font-semibold leading-snug">{first.title}</h3>
            <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">{first.reason}</p>
            {first.estimatedMin !== null && (
              <p className="text-xs text-text-muted">
                About {first.estimatedMin} minutes · estimate
              </p>
            )}
          </div>
          <Button
            variant="primary"
            className="justify-self-start sm:justify-self-end"
            disabled={Boolean(busy)}
            onClick={() => void start(first)}
          >
            {busy === first.id
              ? 'Checking saved action…'
              : first.kind === 'resume'
                ? 'Resume next action'
                : 'Start next action'}
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      )}
      {startError && (
        <p role="alert" className="text-sm text-danger">
          {startError}
        </p>
      )}
      {clear && (
        <p role="status" className="text-sm">
          The queue is clear. No due work or unfinished commitments were found in the checked
          sources.
        </p>
      )}
      {!pending && !first && Boolean(queue?.actions.length) && (
        <p className="text-sm text-text-muted">
          The available actions need more than {budget} minutes. Choose more time or inspect the
          work below.
        </p>
      )}
      {!pending &&
        queue &&
        queue.actions.length > 0 &&
        (compact ? (
          <div
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted"
            aria-label="Saved work in this queue"
          >
            {Object.entries(actionLabels).map(([kind, label]) => {
              const count = queue.actions.filter((action) => action.kind === kind).length;
              return count ? (
                <p key={kind}>
                  <strong className="font-semibold text-text">{count}</strong> {label.toLowerCase()}
                </p>
              ) : null;
            })}
          </div>
        ) : (
          queue.actions.some((action) => action.id !== first?.id) && (
            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                More saved work ({queue.actions.length - (first ? 1 : 0)})
              </summary>
              <div className="border-t border-border px-4">
                {Object.entries(actionLabels).map(([kind, label]) => {
                  const actions = queue.actions.filter(
                    (action) => action.id !== first?.id && action.kind === kind
                  );
                  return actions.length ? (
                    <section key={kind} className="py-3">
                      <h3 className="text-xs font-medium text-text-muted">{label}</h3>
                      <ul className="mt-1 divide-y divide-border">
                        {actions.map((action) => (
                          <li
                            key={action.id}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold">{action.title}</p>
                              <p className="mt-1 text-xs text-text-muted">
                                {action.estimatedMin !== null
                                  ? `About ${action.estimatedMin} min`
                                  : 'Continue where you stopped'}
                                {action.dueDate
                                  ? ` · ${action.dueDate <= today ? 'Due today or earlier' : action.dueDate}`
                                  : ''}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(busy)}
                              onClick={() => void start(action)}
                            >
                              Open action
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null;
                })}
              </div>
            </details>
          )
        ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || Boolean(busy)}
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw size={14} aria-hidden /> Refresh queue
        </Button>
        <Link
          to="/planner"
          className="text-text-muted underline decoration-border underline-offset-4 hover:text-accent"
        >
          Inspect today’s Planner
        </Link>
        <Link
          to="/workflows"
          className="text-text-muted underline decoration-border underline-offset-4 hover:text-accent"
        >
          All activities and future checks
        </Link>
      </div>
    </section>
  );
}
