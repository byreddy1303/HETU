import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  discoverLocalModels,
  getLocalLearningActions,
  getLocalLearningConfig,
  getLocalLearningStatus,
  localModelDefaultUrl,
  prepareLocalLearningActivity,
  LEARNING_UPDATED_EVENT,
  runLocalLearningEngine,
  saveLocalLearningConfig,
  type LocalLearningActions,
  type LocalLearningEngineConfig,
  type LocalLearningEngineStatus,
  type LocalModelDiscovery,
  type LocalModelProvider
} from '@/lib/local-learning-engine';
import { getMemoryRepairData, memoryString, type StudyMemoryEntry } from '@/lib/study-memory';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import { todayISOInTimeZone } from '@/lib/utils';

const field = 'w-full min-w-0 rounded border border-border bg-bg-raised px-3 py-2 text-sm';
const emptyActions: LocalLearningActions = { items: [], latest_results: [] };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The local learning engine could not respond.';
}

function dateLabel(
  value: string | null | undefined,
  timeZone: string,
  includeTime = false
): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
    timeZone
  }).format(date);
}

function ActionRow({
  entry,
  today,
  timeZone
}: {
  entry: StudyMemoryEntry;
  today: string;
  timeZone: string;
}) {
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function prepare() {
    if (preparing) return;
    setPreparing(true);
    setStartError('');
    try {
      const current = await prepareLocalLearningActivity(entry.id);
      if (alive.current) navigate(memoryRepairHref(current));
    } catch (cause) {
      if (alive.current) setStartError(errorMessage(cause));
    } finally {
      if (alive.current) setPreparing(false);
    }
  }
  const repair = getMemoryRepairData(entry);
  const waiting = repair.due_date && repair.due_date > today;
  const sessionId = entry.session_id || memoryString(entry.data, 'source_session_id');
  const attemptId = entry.attempt_id || repair.source_attempt_ids[0];
  const sourceEntryId = repair.source_entry_ids[0];
  const sourceHref = sessionId
    ? `/session/${encodeURIComponent(sessionId)}/review${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ''}`
    : sourceEntryId
      ? `/memory/${encodeURIComponent(sourceEntryId)}`
      : null;
  const resultId = memoryString(entry.data, 'result_entry_id');
  const nextId = memoryString(entry.data, 'next_review_entry_id');
  const activeSessionId = memoryString(entry.data, 'active_session_id');

  return (
    <li className="grid min-w-0 gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-semibold">
            {memoryString(entry.data, 'display_title') || entry.title}
          </h3>
          <span className="text-xs text-text-muted">
            {entry.state === 'completed'
              ? 'Activity completed'
              : activeSessionId
                ? 'Practice started'
                : waiting
                  ? `Review on ${dateLabel(repair.due_date, timeZone)}`
                  : 'Ready to practise'}
          </span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed">{repair.reason}</p>
        {repair.success_criteria && (
          <p className="max-w-prose text-sm text-text-muted">
            <span className="font-medium">What this checks: </span>
            {repair.success_criteria}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>{repair.duration_min} minutes</span>
          {entry.subject && (
            <span>
              {entry.subject}
              {entry.topic ? `: ${entry.topic}` : ''}
            </span>
          )}
          {repair.source_attempt_ids.length > 0 && (
            <span>
              Based on {repair.source_attempt_ids.length} saved{' '}
              {repair.source_attempt_ids.length === 1 ? 'attempt' : 'attempts'}
            </span>
          )}
          {entry.evidence_kind === 'model' && (
            <span>Local model suggestion · needs a practice check</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {sourceHref && (
            <Link className="text-accent underline" to={sourceHref}>
              See original evidence
            </Link>
          )}
          <Link className="text-accent underline" to={`/memory/${entry.id}`}>
            Activity details
          </Link>
          {resultId && (
            <Link className="text-accent underline" to={`/memory/${encodeURIComponent(resultId)}`}>
              Practice result
            </Link>
          )}
          {nextId && (
            <Link className="text-accent underline" to={`/memory/${encodeURIComponent(nextId)}`}>
              Next review
            </Link>
          )}
        </div>
      </div>
      <div className="self-start">
        {startError && (
          <p role="alert" className="mb-2 max-w-xs text-sm text-danger">
            {startError}
          </p>
        )}
        {entry.state !== 'completed' && (
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to={
              activeSessionId
                ? `/pyq?resumeSession=${encodeURIComponent(activeSessionId)}`
                : memoryRepairHref(entry)
            }
            aria-disabled={preparing}
            onClick={(event) => {
              if (activeSessionId || event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              void prepare();
            }}
          >
            {preparing
              ? 'Checking questions…'
              : activeSessionId
                ? 'Resume practice'
                : repair.question_uids.length
                  ? 'Start practice'
                  : 'Open activity'}
          </Link>
        )}
      </div>
    </li>
  );
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
  const [discovery, setDiscovery] = useState<LocalModelDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [pollExpired, setPollExpired] = useState(false);
  const mounted = useRef(true);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setActions(emptyActions);
    void Promise.all([
      getLocalLearningConfig(),
      getLocalLearningStatus(),
      getLocalLearningActions()
    ])
      .then(([saved, nextStatus, nextActions]) => {
        if (!active) return;
        setConfig(saved);
        setStatus(nextStatus);
        setActions(nextActions);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, revision, retry]);

  const refreshStatus = useCallback(async () => {
    const [nextStatus, nextActions] = await Promise.all([
      getLocalLearningStatus(),
      getLocalLearningActions()
    ]);
    if (!mounted.current) return;
    setStatus(nextStatus);
    setActions(nextActions);
    setPollExpired(false);
  }, []);

  const running = status?.state === 'running';
  useEffect(() => {
    const update = () => {
      void refreshStatus().catch((cause: unknown) => {
        if (mounted.current) setError(errorMessage(cause));
      });
    };
    window.addEventListener(LEARNING_UPDATED_EVENT, update);
    return () => window.removeEventListener(LEARNING_UPDATED_EVENT, update);
  }, [refreshStatus]);
  useEffect(() => {
    if (!running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const poll = async () => {
      try {
        const next = await getLocalLearningStatus();
        if (!active) return;
        setStatus(next);
        if (next.state !== 'running') {
          const nextActions = await getLocalLearningActions();
          if (!active) return;
          setActions(nextActions);
          changed.current?.();
          return;
        }
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
    setNotice('');
    setSettingsError('');
    setError('');
    try {
      await task();
    } catch (cause) {
      if (mounted.current) setSettingsError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy('');
    }
  }

  function updateProvider(provider: LocalModelProvider) {
    if (!config) return;
    setConfig({ ...config, provider, base_url: localModelDefaultUrl(provider), model: '' });
    setDiscovery(null);
    setSettingsError('');
    setNotice('');
  }

  const ready = actions.items.slice(0, 3);
  const today = todayISOInTimeZone(timeZone);
  useEffect(() => {
    onActionCountChange?.(actions.items.length);
  }, [actions.items.length, onActionCountChange]);
  const selectedMissing =
    discovery && config?.model && !discovery.models.some((model) => model.id === config.model);

  if (compact && !loading && !error && !config?.enabled && !ready.length) return null;

  return (
    <section
      aria-label="Automatic learning follow-ups"
      className="rounded-lg border border-border bg-bg-raised p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose space-y-2">
          <h2 className="font-display text-2xl font-semibold">Your next study actions</h2>
          <p className="text-sm leading-relaxed text-text-muted">
            HETU uses your saved answers and explanations to prepare focused practice, record its
            result, and arrange the next check.
          </p>
        </div>
        {config && (
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${running ? 'bg-accent-faint text-accent' : 'bg-bg-overlay text-text-muted'}`}
          >
            {running
              ? 'Analysing saved learning…'
              : config.enabled
                ? 'Automatic follow-ups on'
                : 'Automatic follow-ups paused'}
          </span>
        )}
      </div>

      {loading && (
        <p role="status" className="mt-4 text-sm text-text-muted">
          Loading your study actions…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger"
        >
          {error}{' '}
          <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
            Retry learning engine
          </Button>
        </p>
      )}
      {!loading && !error && ready.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {ready.map((entry) => (
            <ActionRow key={entry.id} entry={entry} today={today} timeZone={timeZone} />
          ))}
        </ul>
      )}
      {!loading && !error && !ready.length && (
        <p className="mt-5 max-w-prose text-sm leading-relaxed text-text-muted">
          {running
            ? 'The local model is checking your saved work. Prepared activities will appear here when the analysis finishes.'
            : !config?.model
              ? 'Connect an installed local model below. HETU can then turn saved learning into practice activities.'
              : 'No study activity is ready yet. Process saved learning to check for unresolved mistakes and follow-ups.'}
        </p>
      )}

      {actions.latest_results.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Recent practice results</h3>
          <ul className="mt-2 space-y-3">
            {actions.latest_results.slice(0, 3).map((result) => {
              const nextId = memoryString(result.data, 'next_review_entry_id');
              return (
                <li key={result.id} className="text-sm">
                  <Link className="font-medium text-accent underline" to={`/memory/${result.id}`}>
                    {result.title}
                  </Link>
                  <p className="mt-1 max-w-prose text-text-muted">{result.content}</p>
                  {nextId && (
                    <Link
                      className="mt-1 inline-block text-accent underline"
                      to={`/memory/${encodeURIComponent(nextId)}`}
                    >
                      Open the next review
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {status && (
        <div
          className="mt-4 space-y-1 border-t border-border pt-4 text-xs text-text-muted"
          aria-live="polite"
        >
          <p>
            {status.message ||
              (status.state === 'disabled'
                ? 'Connect a local model to enable automatic processing.'
                : 'The learning engine is ready.')}
          </p>
          {status.last_run_at && (
            <p>
              Last check: {dateLabel(status.last_run_at, timeZone, true)}.
              {status.model ? ` Selected model: ${status.model}.` : ''}
            </p>
          )}
          {status.state === 'error' && (
            <p role="alert" className="text-danger">
              {status.last_error ||
                'The local model did not complete the check. Open the connection settings and test it again.'}
            </p>
          )}
          {pollExpired && <p>The analysis is still running. Use Refresh status to check again.</p>}
        </div>
      )}

      {compact && (
        <Link className="mt-4 inline-block text-sm font-medium text-accent underline" to="/memory">
          Open Learning Memory and local model connection
        </Link>
      )}
      {config && !compact && (
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-accent">
            Local model connection
          </summary>
          <div className="mt-4 max-w-2xl space-y-4">
            <p className="text-sm leading-relaxed text-text-muted">
              Run Ollama or LM Studio on this computer, then connect an installed model. Saved study
              evidence is sent to that local server. HETU does not switch to a paid cloud model if
              it is unavailable.
            </p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Local model app</span>
                <select
                  className={field}
                  value={config.provider}
                  onChange={(event) => updateProvider(event.target.value as LocalModelProvider)}
                  disabled={Boolean(busy)}
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai_compatible">
                    LM Studio / OpenAI-compatible local server
                  </option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Local server address</span>
                <input
                  className={field}
                  type="url"
                  value={config.base_url}
                  onChange={(event) => {
                    setConfig({ ...config, base_url: event.target.value });
                    setDiscovery(null);
                  }}
                  disabled={Boolean(busy)}
                  spellCheck={false}
                  placeholder={localModelDefaultUrl(config.provider)}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={Boolean(busy)}
                onClick={() =>
                  void perform('discover', async () => {
                    const found = await discoverLocalModels(config);
                    if (!mounted.current) return;
                    setDiscovery(found);
                    if (!found.reachable) {
                      setSettingsError(
                        found.message ||
                          'The local server is offline. Start it and test the connection again.'
                      );
                      return;
                    }
                    setNotice(
                      found.models.length
                        ? `Connected. Found ${found.models.length} installed ${found.models.length === 1 ? 'model' : 'models'}.`
                        : 'The server is running, but no installed models were found. Install a model in Ollama or LM Studio, then test again.'
                    );
                  })
                }
              >
                {busy === 'discover' ? 'Testing local connection…' : 'Test local connection'}
              </Button>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="block font-medium">Installed model</span>
              <select
                className={field}
                aria-label="Installed model"
                aria-describedby="local-model-help"
                value={config.model}
                disabled={Boolean(busy) || !discovery?.reachable}
                onChange={(event) => setConfig({ ...config, model: event.target.value })}
              >
                <option value="">Choose an installed model</option>
                {config.model && (!discovery || selectedMissing) && (
                  <option value={config.model}>
                    {config.model}
                    {selectedMissing ? ' (not found on this server)' : ' (saved model)'}
                  </option>
                )}
                {discovery?.models.map((model) => (
                  <option value={model.id} key={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
              <span id="local-model-help" className="block text-xs text-text-muted">
                Test the connection to refresh the installed model list. HETU uses only the model
                you select.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1 accent-accent"
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
                disabled={Boolean(busy)}
              />
              <span>
                <span className="block font-medium">Enable automatic study follow-ups</span>
                <span className="block text-xs leading-relaxed text-text-muted">
                  Check new saved work while HETU is open. Practice results stay linked to their
                  source, and future checks are prepared automatically.
                </span>
              </span>
            </label>
            {settingsError && (
              <p
                role="alert"
                className="rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger"
              >
                {settingsError}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-text-muted">
                {notice}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={Boolean(busy) || !config.model.trim() || Boolean(selectedMissing)}
                onClick={() =>
                  void perform('save', async () => {
                    const saved = await saveLocalLearningConfig({ ...config, time_zone: timeZone });
                    if (!mounted.current) return;
                    setConfig(saved);
                    await refreshStatus();
                    setNotice(
                      saved.enabled
                        ? 'Connection saved. Automatic study follow-ups are enabled.'
                        : 'Connection saved. Automatic study follow-ups are paused.'
                    );
                  })
                }
              >
                {busy === 'save' ? 'Saving connection…' : 'Save connection'}
              </Button>
              <Button
                disabled={Boolean(busy) || running || !config.model.trim() || !config.enabled}
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
                {busy === 'run' ? 'Starting analysis…' : 'Process saved learning'}
              </Button>
              {config.enabled && (
                <Button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void perform('pause', async () => {
                      const saved = await saveLocalLearningConfig({ ...config, enabled: false });
                      if (!mounted.current) return;
                      setConfig(saved);
                      await refreshStatus();
                      setNotice(
                        'Automatic processing is paused. Any analysis in progress will be discarded.'
                      );
                    })
                  }
                >
                  Pause automatic processing
                </Button>
              )}
              <Button
                disabled={Boolean(busy)}
                onClick={() => void perform('refresh', refreshStatus)}
              >
                Refresh status
              </Button>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
