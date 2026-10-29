import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LocalLearningActionCard from '@/components/memory/LocalLearningActionCard';
import { dateLabel } from '@/lib/local-learning-display';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  getLocalLearningActions,
  getLocalLearningConfig,
  getLocalLearningStatus,
  LEARNING_UPDATED_EVENT,
  runLocalLearningEngine,
  type LocalLearningActions,
  type LocalLearningEngineConfig,
  type LocalLearningEngineStatus
} from '@/lib/local-learning-engine';
import { todayISOInTimeZone } from '@/lib/utils';
import { getMemoryRepairData, memoryString } from '@/lib/study-memory';

const emptyActions: LocalLearningActions = { items: [], latest_results: [] };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The local learning engine could not respond.';
}

export default function LocalLearningEngine({
  revision = 0,
  onChanged,
  compact = false,
  onActionCountChange
}: {
  revision?: number;
  onChanged?: () => void;
  compact?: boolean;
  onActionCountChange?: (count: number) => void;
}) {
  const { userId, profile } = useAuth();
  const timeZone = profile?.timezone || 'Asia/Kolkata';
  const [config, setConfig] = useState<LocalLearningEngineConfig | null>(null);
  const [status, setStatus] = useState<LocalLearningEngineStatus | null>(null);
  const [actions, setActions] = useState(emptyActions);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [pollExpired, setPollExpired] = useState(false);
  const mounted = useRef(true);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const requestVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const request = ++requestVersion.current;
    const [nextConfig, nextStatus, nextActions] = await Promise.all([
      getLocalLearningConfig(),
      getLocalLearningStatus(),
      getLocalLearningActions()
    ]);
    if (!mounted.current || request !== requestVersion.current) return;
    setConfig(nextConfig);
    setStatus(nextStatus);
    setActions(nextActions);
    setError('');
    setLoading(false);
    setPollExpired(false);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setActions(emptyActions);
    void refreshStatus().catch((cause: unknown) => {
      if (active) {
        setError(errorMessage(cause));
        setLoading(false);
      }
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [userId, revision, retry, refreshStatus]);

  useEffect(() => {
    const update = () => {
      void refreshStatus().catch((cause: unknown) => {
        if (mounted.current) setError(errorMessage(cause));
      });
    };
    const events = [LEARNING_UPDATED_EVENT, 'hetu:memory-saved', 'hetu:workspace-changed', 'focus'];
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    for (const event of events) window.addEventListener(event, update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      for (const event of events) window.removeEventListener(event, update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refreshStatus]);

  const running = status?.state === 'running';
  useEffect(() => {
    if (!running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const poll = async () => {
      try {
        const next = await getLocalLearningStatus();
        if (!active) return;
        if (next.state !== 'running') {
          const nextActions = await getLocalLearningActions();
          if (!active) return;
          setStatus(next);
          setActions(nextActions);
          changed.current?.();
          return;
        }
        setStatus(next);
        if (++polls >= 100) {
          setPollExpired(true);
          return;
        }
        timer = setTimeout(() => {
          void poll();
        }, 3000);
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      }
    };
    timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [running, userId, retry]);

  async function perform(name: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError('');
    try {
      await task();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  const today = todayISOInTimeZone(timeZone);
  const scheduled = actions.items
    .filter(
      (entry) =>
        !memoryString(entry.data, 'active_session_id') &&
        (getMemoryRepairData(entry).due_date || today) > today
    )
    .sort(
      (a, b) =>
        getMemoryRepairData(a).due_date!.localeCompare(getMemoryRepairData(b).due_date!) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
    );
  const ready = actions.items
    .filter(
      (entry) =>
        memoryString(entry.data, 'active_session_id') ||
        (getMemoryRepairData(entry).due_date || today) <= today
    )
    .sort(
      (a, b) =>
        Number(Boolean(memoryString(b.data, 'active_session_id'))) -
          Number(Boolean(memoryString(a.data, 'active_session_id'))) ||
        (getMemoryRepairData(a).due_date || today).localeCompare(
          getMemoryRepairData(b).due_date || today
        ) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
    );
  const recommended = ready[0];
  const other = ready.slice(1);
  const problem =
    error ||
    (status?.state === 'error'
      ? status.last_error || 'The local model could not finish. Check the connection in Settings.'
      : '');
  useEffect(() => {
    onActionCountChange?.(actions.items.length);
  }, [actions.items.length, onActionCountChange]);
  if (compact && !loading && !problem && !config?.enabled && !actions.items.length) return null;

  return (
    <section
      aria-label="Automatic learning follow-ups"
      className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Prepared practice</h2>
        {!loading && !error && (
          <p className="text-xs text-text-muted">
            {ready.length} ready now{scheduled.length ? ` · ${scheduled.length} scheduled` : ''}
          </p>
        )}
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-text-muted">
          Loading prepared practice…
        </p>
      )}
      {problem && (
        <div
          role="alert"
          className="mt-4 rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger"
        >
          <p>{problem}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry learning engine
            </Button>
            <Link className="font-medium underline underline-offset-2" to="/settings">
              Open Settings
            </Link>
          </div>
        </div>
      )}
      {!loading && !error && recommended && (
        <ul className="mt-2" aria-label="Recommended practice">
          <LocalLearningActionCard
            key={recommended.id}
            entry={recommended}
            today={today}
            timeZone={timeZone}
          />
        </ul>
      )}
      {!loading && !error && !recommended && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-text-muted">
          {scheduled[0]
            ? `Your next check is scheduled for ${dateLabel(getMemoryRepairData(scheduled[0]).due_date, timeZone)}.`
            : running
              ? 'Your saved work is being checked. Activities will appear when ready.'
              : !config?.model
                ? 'Connect an installed local model in Settings to prepare practice.'
                : 'No prepared activity is waiting.'}
        </p>
      )}
      {!loading && !error && other.length > 0 && (
        <details className="mt-3 border-t border-border pt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Other activities ({other.length})
          </summary>
          <ul className="mt-2 divide-y divide-border" aria-label="Other prepared activities">
            {other.map((entry) => (
              <LocalLearningActionCard
                key={entry.id}
                entry={entry}
                today={today}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </details>
      )}
      {!loading && !error && scheduled.length > 0 && (
        <details className="mt-3 border-t border-border pt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Scheduled checks ({scheduled.length})
          </summary>
          <ul className="mt-2 divide-y divide-border" aria-label="Scheduled practice">
            {scheduled.map((entry) => (
              <LocalLearningActionCard
                key={entry.id}
                entry={entry}
                today={today}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </details>
      )}
      {actions.latest_results.length > 0 && (
        <details className="mt-4 border-t border-border pt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Recent results ({actions.latest_results.length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {actions.latest_results.map((result) => (
              <li
                key={result.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span className="min-w-0 break-words text-text-muted">
                  {result.topic || result.subject || 'Completed practice'}
                </span>
                <Link
                  className="shrink-0 text-accent underline underline-offset-2"
                  to={`/memory/${encodeURIComponent(result.id)}`}
                >
                  View result
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="mt-4 border-t border-border pt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded py-1 font-medium text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Automatic preparation
        </summary>
        {config && (
          <p className="mt-3 text-xs text-text-muted">
            {running
              ? 'Preparing activities…'
              : config.enabled
                ? 'Automatic follow-ups on'
                : 'Automatic follow-ups paused'}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={Boolean(busy) || running || !config?.model.trim() || !config.enabled}
            onClick={() =>
              void perform('run', async () => {
                const next = await runLocalLearningEngine();
                if (!mounted.current) return;
                setStatus(next);
                setPollExpired(false);
                if (next.state !== 'running') {
                  await refreshStatus();
                  changed.current?.();
                }
              })
            }
          >
            {busy === 'run' ? 'Starting…' : 'Process saved learning'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => void perform('refresh', refreshStatus)}
          >
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh status'}
          </Button>
          <Link
            className="ml-auto py-2 text-sm text-accent underline underline-offset-2"
            to="/settings"
          >
            Local model settings
          </Link>
        </div>
        {status && (
          <div
            className="mt-3 max-w-prose space-y-1 text-xs leading-relaxed text-text-muted"
            aria-live="polite"
          >
            <p>{status.message || 'The learning engine is ready.'}</p>
            {status.last_run_at && (
              <p>
                Last check: {dateLabel(status.last_run_at, timeZone, true)}.
                {status.model ? ` Selected model: ${status.model}.` : ''}
              </p>
            )}
          </div>
        )}
      </details>
      {pollExpired && (
        <p className="mt-2 text-sm text-text-muted">
          The check is still running. Refresh status to check again.
        </p>
      )}
    </section>
  );
}
