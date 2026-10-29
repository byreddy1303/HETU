import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { backendConfig } from '@/lib/backend-config';
import {
  getLocalLearningActions,
  getLocalLearningStatus,
  LEARNING_UPDATED_EVENT,
  prepareLocalLearningActivity,
  type LocalLearningActions,
  type LocalLearningEngineStatus
} from '@/lib/local-learning-engine';
import {
  getMemoryRepairData,
  MEMORY_ACTIVITIES,
  memoryString,
  type StudyMemoryEntry
} from '@/lib/study-memory';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import { todayISOInTimeZone } from '@/lib/utils';

const linkClass =
  'font-medium text-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const empty: LocalLearningActions = { items: [], latest_results: [] };

function dateLabel(value: string, timeZone: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone }).format(date)
    : value;
}

function count(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function ResultFacts({ result }: { result: StudyMemoryEntry }) {
  const correct = count(result.data, 'reliable_correct');
  const judged = count(result.data, 'reliable_judged');
  const submitted = count(result.data, 'submitted');
  const planned = count(result.data, 'planned');
  const skips = count(result.data, 'explicit_skips');
  return (
    <div className="space-y-1 text-sm">
      <p>
        {correct !== null && judged !== null
          ? `${correct}/${judged} reliably judged answers correct`
          : 'Practice result saved'}
      </p>
      {submitted !== null && planned !== null && (
        <p className="text-xs text-text-muted">
          {submitted}/{planned} selected questions submitted
          {skips ? `; ${skips} explicitly skipped` : ''}.
        </p>
      )}
    </div>
  );
}

function PracticeButton({ entry }: { entry: StudyMemoryEntry }) {
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const resumeId = memoryString(entry.data, 'active_session_id');
  async function start() {
    if (preparing) return;
    setPreparing(true);
    setError('');
    try {
      const prepared = await prepareLocalLearningActivity(entry.id);
      if (active.current) navigate(memoryRepairHref(prepared));
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Practice could not open. Retry from the activity details.'
        );
    } finally {
      if (active.current) setPreparing(false);
    }
  }
  return (
    <div className="space-y-2">
      {resumeId ? (
        <Link
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
          to={`/pyq?resumeSession=${encodeURIComponent(resumeId)}`}
        >
          Resume practice <ArrowRight size={15} aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 disabled:opacity-50"
          disabled={preparing}
          onClick={() => void start()}
        >
          {preparing ? 'Checking questions…' : 'Start practice'}{' '}
          <ArrowRight size={15} aria-hidden />
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-prose text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function StudyWorkflow({
  entry,
  previousResult,
  today,
  timeZone
}: {
  entry: StudyMemoryEntry;
  previousResult?: StudyMemoryEntry;
  today: string;
  timeZone: string;
}) {
  const repair = getMemoryRepairData(entry);
  const upcoming = !!repair.due_date && repair.due_date > today;
  const sourceSession = entry.session_id || memoryString(entry.data, 'source_session_id');
  const attemptId = entry.attempt_id || repair.source_attempt_ids[0];
  const sourceHref = sourceSession
    ? `/session/${encodeURIComponent(sourceSession)}/review${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ''}`
    : repair.source_entry_ids[0]
      ? `/memory/${encodeURIComponent(repair.source_entry_ids[0])}`
      : null;
  const activityLabel = MEMORY_ACTIVITIES.find((item) => item.id === repair.activity)!.label;
  const title = entry.subject ? `${activityLabel} in ${entry.subject}` : activityLabel;
  const resume = !!memoryString(entry.data, 'active_session_id');
  return (
    <li className="min-w-0 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${!upcoming ? 'text-accent' : ''}`}
            >
              {upcoming ? <CalendarDays size={13} aria-hidden /> : <Clock3 size={13} aria-hidden />}
              {resume
                ? 'In progress'
                : upcoming
                  ? 'Scheduled'
                  : repair.due_date && repair.due_date < today
                    ? 'Overdue'
                    : 'Ready today'}
            </span>
            {repair.due_date && (
              <time dateTime={repair.due_date}>{dateLabel(repair.due_date, timeZone)}</time>
            )}
            <span>{repair.duration_min} min</span>
          </div>
          <h3 className="font-display text-lg font-semibold leading-snug text-text">{title}</h3>
          {entry.topic && <p className="mt-1 text-sm text-text-muted">{entry.topic}</p>}
        </div>
        {!upcoming ? (
          <PracticeButton entry={entry} />
        ) : (
          <Link
            className={`shrink-0 text-sm ${linkClass}`}
            to={`/memory/${encodeURIComponent(entry.id)}`}
          >
            View activity
          </Link>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded text-xs font-medium text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">
          History and evidence
        </summary>
        <ol
          aria-label={`Learning steps for ${title}`}
          className="mt-4 space-y-4 border-l border-border pl-4"
        >
          <li className="space-y-1">
            <p className="font-semibold text-text">Saved evidence</p>
            <p className="text-xs text-text-muted">
              {repair.source_attempt_ids.length
                ? `${repair.source_attempt_ids.length} saved ${repair.source_attempt_ids.length === 1 ? 'attempt' : 'attempts'} linked to this activity.`
                : 'This activity is linked to your saved study evidence.'}
            </p>
            {sourceHref && (
              <Link className={`inline-block text-xs ${linkClass}`} to={sourceHref}>
                Review source evidence
              </Link>
            )}
          </li>
          <li className="space-y-1">
            <p className="font-semibold text-text">Focused activity</p>
            <p className="text-xs text-text-muted">
              {activityLabel}. Questions are checked for eligibility when practice starts.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <Link className={linkClass} to={`/memory/${encodeURIComponent(entry.id)}`}>
                Activity details
              </Link>
              {memoryString(entry.data, 'concept_review_id') && (
                <Link
                  className={linkClass}
                  to={`/concept-review/${encodeURIComponent(memoryString(entry.data, 'concept_review_id'))}`}
                >
                  Recall check
                </Link>
              )}
            </div>
          </li>
          <li className="space-y-1">
            <p className="font-semibold text-text">Practice result</p>
            {previousResult ? (
              <>
                <ResultFacts result={previousResult} />
                <Link
                  className={`inline-block text-xs ${linkClass}`}
                  to={`/memory/${encodeURIComponent(previousResult.id)}`}
                >
                  Previous practice result
                </Link>
              </>
            ) : (
              <p className="text-xs text-text-muted">
                Results appear after linked practice is saved.
              </p>
            )}
          </li>
          <li className="space-y-1">
            <p className="font-semibold text-text">Next check</p>
            <p className="text-xs text-text-muted">
              {previousResult && repair.due_date
                ? `Scheduled for ${dateLabel(repair.due_date, timeZone)} from the previous practice result.`
                : 'Your practice result determines the next review date.'}
            </p>
            {entry.data.needs_local_review === true && (
              <p className="text-xs text-text-muted">
                This follow-up is waiting for local model review.
              </p>
            )}
          </li>
        </ol>
        {entry.evidence_kind === 'model' && (
          <p className="mt-4 text-xs text-text-muted">
            Local model suggestion. Its explanation still needs a practice check.
          </p>
        )}
      </details>
    </li>
  );
}

export default function LearningWorkflows() {
  const { userId, profile } = useAuth();
  const timeZone = profile?.timezone || 'Asia/Kolkata';
  const [actions, setActions] = useState<LocalLearningActions>(empty);
  const [status, setStatus] = useState<LocalLearningEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'due' | 'upcoming'>('due');
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let request = 0;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setActions(empty);
    setStatus(null);
    setError('');
    setFilter('due');
    setLoading(backendConfig.isLocal && !!userId);
    if (!backendConfig.isLocal || !userId) return;
    const load = async (background = false) => {
      const current = ++request;
      clearTimeout(timer);
      if (!background) setLoading(true);
      try {
        const [nextActions, nextStatus] = await Promise.all([
          getLocalLearningActions(),
          getLocalLearningStatus()
        ]);
        if (!active || current !== request) return;
        setActions({
          items: nextActions.items.filter((entry) => entry.user_id === userId),
          latest_results: nextActions.latest_results.filter((entry) => entry.user_id === userId)
        });
        setStatus(nextStatus);
        setError('');
        if (nextStatus.state === 'running' && polls++ < 100)
          timer = setTimeout(() => void load(true), 3000);
      } catch (cause) {
        if (active && current === request)
          setError(cause instanceof Error ? cause.message : 'Your study workflows could not load.');
      } finally {
        if (active && current === request) setLoading(false);
      }
    };
    refresh.current = () => {
      polls = 0;
      void load();
    };
    const changed = () => {
      polls = 0;
      void load(true);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    window.addEventListener(LEARNING_UPDATED_EVENT, changed);
    window.addEventListener('hetu:memory-saved', changed);
    window.addEventListener('hetu:workspace-changed', changed);
    document.addEventListener('visibilitychange', visible);
    void load();
    return () => {
      active = false;
      request++;
      clearTimeout(timer);
      refresh.current = () => {};
      window.removeEventListener(LEARNING_UPDATED_EVENT, changed);
      window.removeEventListener('hetu:memory-saved', changed);
      window.removeEventListener('hetu:workspace-changed', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId]);

  if (!backendConfig.isLocal) return null;
  const today = todayISOInTimeZone(timeZone);
  const due = actions.items.filter(
    (entry) => !getMemoryRepairData(entry).due_date || getMemoryRepairData(entry).due_date! <= today
  );
  const upcoming = actions.items.filter(
    (entry) => !!getMemoryRepairData(entry).due_date && getMemoryRepairData(entry).due_date! > today
  );
  const visible = filter === 'due' ? due : upcoming;

  return (
    <section
      aria-labelledby="study-workflows-title"
      className="min-w-0 rounded-xl border border-border bg-bg-raised p-4 sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose space-y-2">
          <h2 id="study-workflows-title" className="font-display text-2xl font-semibold">
            Your learning workflows
          </h2>
          <p className="text-sm leading-relaxed text-text-muted">
            Practice that is ready now, with its evidence and next check kept together.
          </p>
        </div>
        <Link to="/memory" className={`text-sm ${linkClass}`}>
          Open Learning Memory
        </Link>
      </div>
      {!userId ? (
        <p className="text-sm text-text-muted">
          Open your local account to see its learning workflows.
        </p>
      ) : (
        <>
          {loading && (
            <p role="status" className="mb-4 text-sm text-text-muted">
              Loading learning workflows…
            </p>
          )}
          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-danger-faint p-3 text-sm text-danger">
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-2 font-semibold underline disabled:opacity-50"
                onClick={() => refresh.current()}
                disabled={loading}
              >
                <RefreshCw size={14} aria-hidden /> Retry study workflows
              </button>
            </div>
          )}
          {status?.state === 'error' && !error && (
            <p role="alert" className="mb-4 rounded-lg bg-danger-faint p-3 text-sm text-danger">
              {status.message} Open{' '}
              <Link className={linkClass} to="/settings">
                Settings
              </Link>{' '}
              to check the local model connection.
            </p>
          )}
          {status && ['running', 'disabled'].includes(status.state) && (
            <p className="mb-4 text-xs text-text-muted">
              {status.state === 'running'
                ? 'HETU is reviewing saved learning and updating follow-ups.'
                : status.state === 'disabled'
                  ? 'Automatic analysis is paused. Saved activities and results remain available.'
                  : 'Activities follow recorded performance; retention and independent mastery remain unverified.'}
            </p>
          )}
          <div
            role="group"
            aria-label="Study workflow schedule"
            className="mb-5 flex flex-wrap gap-2"
          >
            {(
              [
                { id: 'due', label: `Ready or due (${due.length})` },
                { id: 'upcoming', label: `Upcoming checks (${upcoming.length})` }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium ${filter === item.id ? 'border-accent bg-accent-faint text-accent' : 'border-border text-text-muted'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {visible.length ? (
            <ul className="min-w-0">
              {visible.map((entry) => (
                <StudyWorkflow
                  key={`${userId}:${entry.id}`}
                  entry={entry}
                  today={today}
                  timeZone={timeZone}
                  previousResult={actions.latest_results.find(
                    (result) => memoryString(result.data, 'next_review_entry_id') === entry.id
                  )}
                />
              ))}
            </ul>
          ) : (
            !loading &&
            !error && (
              <div className="max-w-prose rounded-lg bg-bg p-4 text-sm leading-relaxed text-text-muted">
                {filter === 'upcoming'
                  ? 'No dated checks are waiting yet. HETU adds the next check after completed linked practice.'
                  : actions.items.length
                    ? 'No study activities are due today. Upcoming checks have their own dates; you can review those above.'
                    : 'No prepared study activities yet. Complete practice and save your reasoning so HETU can prepare focused follow-ups.'}{' '}
                <Link to={filter === 'upcoming' ? '/today' : '/pyq'} className={linkClass}>
                  {filter === 'upcoming' ? 'Open Do now' : 'Open practice'}
                </Link>
              </div>
            )
          )}
          {actions.latest_results.length > 0 && (
            <details className="mt-6 border-t border-border pt-4">
              <summary className="cursor-pointer rounded text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 size={16} aria-hidden /> Completed practice checks{' '}
                  <span className="font-normal text-text-muted">
                    ({actions.latest_results.length})
                  </span>
                </span>
              </summary>
              <p className="my-3 text-xs text-text-muted">
                These are recorded practice results, not a claim that the concept is mastered.
                Showing the latest {actions.latest_results.length} results.
              </p>
              <ul className="divide-y divide-border">
                {actions.latest_results.map((result) => {
                  const next = memoryString(result.data, 'next_review_entry_id');
                  const nextEntry = actions.items.find((entry) => entry.id === next);
                  const dueDate = nextEntry ? getMemoryRepairData(nextEntry).due_date : null;
                  return (
                    <li
                      key={result.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 max-w-prose space-y-1">
                        <Link
                          className={`text-sm ${linkClass}`}
                          to={`/memory/${encodeURIComponent(result.id)}`}
                        >
                          {result.subject ? `${result.subject} practice result` : 'Practice result'}
                        </Link>
                        <ResultFacts result={result} />
                        {dueDate && (
                          <p className="text-xs text-text-muted">
                            Next check: {dateLabel(dueDate, timeZone)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {result.session_id && (
                          <Link
                            className={linkClass}
                            to={`/session/${encodeURIComponent(result.session_id)}/review`}
                          >
                            Review submissions
                          </Link>
                        )}
                        {next && (
                          <Link className={linkClass} to={`/memory/${encodeURIComponent(next)}`}>
                            Next review
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
