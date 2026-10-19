import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Clock3,
  GitBranch,
  RefreshCw
} from 'lucide-react';
import LocalLearningActionCard from '@/components/memory/LocalLearningActionCard';
import { dateLabel } from '@/lib/local-learning-display';
import { Button } from '@/components/ui/Button';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';
import {
  getLocalLearningActions,
  getLocalLearningStatus,
  LEARNING_UPDATED_EVENT,
  type LocalLearningActions,
  type LocalLearningEngineStatus
} from '@/lib/local-learning-engine';
import {
  partitionLearningActions,
  pendingConcepts,
  type OverviewBrief,
  type OverviewConceptQueue
} from '@/lib/learning-overview';
import { memoryString } from '@/lib/study-memory';
import { formatDate } from '@/lib/utils';
import type { PyqSessionRow } from '@/types';

interface Props {
  userId: string | null | undefined;
  name?: string | null;
  today: string;
  timeZone: string;
  coreOnly: boolean;
  showCountdown: boolean;
  daysLeft: number;
  resumeSession: PyqSessionRow | null;
}

type Snapshot = {
  ownerId: string;
  actions: LocalLearningActions | null;
  status: LocalLearningEngineStatus | null;
  concepts: OverviewConceptQueue | null;
  briefs: OverviewBrief[] | null;
  errors: { learning?: string; concepts?: string; briefs?: string };
};

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'The saved information could not load.';
}

function OverviewData({
  userId,
  today,
  timeZone,
  resumeSession
}: Omit<Props, 'name' | 'coreOnly' | 'showCountdown' | 'daysLeft'> & { userId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const current = useRef(0);
  const state = snapshot?.ownerId === userId ? snapshot : null;

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setTimeout>;
    let polls = 0;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = ++current.current;
      setLoading(true);
      const [learning, concepts, briefs] = await Promise.allSettled([
        backendConfig.isLocal
          ? Promise.all([getLocalLearningActions(), getLocalLearningStatus()])
          : Promise.resolve(null),
        apiRequest<OverviewConceptQueue>('/v1/learning/concept-bridge/queue', {
          signal: controller.signal
        }),
        apiRequest<OverviewBrief[]>('/v1/workflows?limit=50', { signal: controller.signal })
      ]);
      if (!active || request !== current.current) return;
      const next: Snapshot = {
        ownerId: userId,
        actions: learning.status === 'fulfilled' ? (learning.value?.[0] ?? null) : null,
        status: learning.status === 'fulfilled' ? (learning.value?.[1] ?? null) : null,
        concepts: concepts.status === 'fulfilled' ? concepts.value : null,
        briefs: briefs.status === 'fulfilled' ? briefs.value : null,
        errors: {
          ...(learning.status === 'rejected' ? { learning: message(learning.reason) } : {}),
          ...(concepts.status === 'rejected' ? { concepts: message(concepts.reason) } : {}),
          ...(briefs.status === 'rejected' ? { briefs: message(briefs.reason) } : {})
        }
      };
      setSnapshot(next);
      setLoading(false);
      clearTimeout(poll);
      if (next.status?.state === 'running' && polls++ < 100)
        poll = setTimeout(() => void load(), 3000);
    };
    const refresh = () => {
      polls = 0;
      clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 150);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    void load();
    window.addEventListener(LEARNING_UPDATED_EVENT, refresh);
    window.addEventListener('hetu:memory-saved', refresh);
    window.addEventListener('hetu:concept-reviews-updated', refresh);
    window.addEventListener('hetu:workflows-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(debounce);
      clearTimeout(poll);
      window.removeEventListener(LEARNING_UPDATED_EVENT, refresh);
      window.removeEventListener('hetu:memory-saved', refresh);
      window.removeEventListener('hetu:concept-reviews-updated', refresh);
      window.removeEventListener('hetu:workflows-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId, retry]);

  const actions = partitionLearningActions(
    state?.actions?.items.filter((entry) => entry.user_id === userId) ?? [],
    today
  );
  const concepts = state?.concepts ? pendingConcepts(state.concepts) : null;
  const openBriefs = state?.briefs?.filter(
    (brief) => brief.status === 'active' || brief.status === 'waiting'
  );
  const firstConcept = concepts?.due[0];
  const errors = state ? Object.values(state.errors) : [];
  const local = backendConfig.isLocal;
  const working = state?.status?.state === 'running';

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)]">
      <section
        className="min-w-0 rounded-lg border border-border bg-bg-raised px-4 py-4 sm:px-6"
        aria-labelledby="dashboard-prepared-heading"
        aria-busy={loading}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dashboard-prepared-heading" className="font-display text-xl font-semibold">
            Pick up the next step
          </h2>
          <Link
            to="/workflows"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            Workflows <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
        {resumeSession && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/20 bg-accent-faint/40 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {resumeSession.status === 'paused' ? 'Paused' : 'Unfinished'}{' '}
                {resumeSession.config.mode === 'exam' ? 'exam' : 'practice'} set
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {resumeSession.completed_count} of {resumeSession.question_uids.length} questions
                submitted. The remaining questions are unfinished.
              </p>
            </div>
            <Link
              to={`/pyq?resumeSession=${encodeURIComponent(resumeSession.id)}`}
              className="rounded bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast"
            >
              Resume set
            </Link>
          </div>
        )}
        {loading && !state && (
          <p role="status" className="py-7 text-sm text-text-muted">
            Loading your next steps…
          </p>
        )}
        {state?.errors.learning && (
          <p role="alert" className="mt-4 text-sm text-danger">
            Study activities could not load. {state.errors.learning}
          </p>
        )}
        {local && state?.actions && (
          <>
            <p className="mt-4 text-xs text-text-muted">
              {working
                ? 'Checking your saved work…'
                : state.status?.state === 'disabled'
                  ? 'Automatic follow-ups are paused.'
                  : state.status?.state === 'error'
                    ? 'The last analysis needs attention.'
                    : 'Practice prepared from your saved evidence.'}
            </p>
            {state.status?.state === 'error' && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {state.status.message}{' '}
                <Link to="/memory" className="underline">
                  Check the local model connection
                </Link>
              </p>
            )}
            {actions.ready[0] ? (
              <ul className="min-w-0">
                <LocalLearningActionCard
                  entry={actions.ready[0]}
                  today={today}
                  timeZone={timeZone}
                />
              </ul>
            ) : (
              <div className="py-5">
                <h3 className="font-display text-lg font-semibold">
                  {working
                    ? 'Your next activity is being prepared.'
                    : actions.upcoming.length
                      ? 'Your next check has a date.'
                      : 'Build the next step from your work.'}
                </h3>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-muted">
                  {working
                    ? 'HETU will add an activity after it checks the saved answers and explanations.'
                    : actions.upcoming.length
                      ? 'Scheduled checks stay below until their review date. You can continue other practice today.'
                      : 'Complete a practice set, review a concept, or open Learning Memory to connect a local model.'}
                </p>
              </div>
            )}
            {actions.ready.length > 1 && (
              <div className="border-t border-border py-3 text-sm">
                <p className="font-semibold">Also ready</p>
                <ul className="mt-2 space-y-2">
                  {actions.ready.slice(1, 3).map((entry) => (
                    <li key={entry.id}>
                      <Link
                        to={`/memory/${encodeURIComponent(entry.id)}`}
                        className="text-accent underline"
                      >
                        {memoryString(entry.data, 'display_title') || entry.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                {actions.ready.length > 3 && (
                  <Link to="/workflows" className="mt-2 inline-block text-accent underline">
                    See all {actions.ready.length} ready activities
                  </Link>
                )}
              </div>
            )}
            {actions.upcoming.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3 size={15} className="text-text-muted" aria-hidden /> Scheduled for later
                </h3>
                <ul className="mt-3 space-y-3">
                  {actions.upcoming.slice(0, 2).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm"
                    >
                      <Link
                        to={`/memory/${encodeURIComponent(entry.id)}`}
                        className="min-w-0 text-accent underline"
                      >
                        {memoryString(entry.data, 'display_title') || entry.title}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {dateLabel(memoryString(entry.data, 'due_date'), timeZone)}
                      </span>
                    </li>
                  ))}
                </ul>
                {actions.upcoming.length > 2 && (
                  <Link to="/workflows" className="mt-3 inline-block text-sm text-accent underline">
                    All {actions.upcoming.length} scheduled checks
                  </Link>
                )}
              </div>
            )}
          </>
        )}
        {!local && (
          <p className="mt-5 max-w-prose text-sm leading-relaxed text-text-muted">
            Your workflows retain the goal and completed steps. Concept reviews below help you check
            what you can recall.
          </p>
        )}
        {state?.actions?.latest_results.length ? (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Latest practice evidence</h3>
            {state.actions.latest_results
              .filter((entry) => entry.user_id === userId)
              .slice(0, 1)
              .map((result) => (
                <div key={result.id} className="mt-2">
                  <Link
                    to={`/memory/${encodeURIComponent(result.id)}`}
                    className="text-sm font-medium text-accent underline"
                  >
                    {result.title}
                  </Link>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{result.content}</p>
                  <p className="mt-2 text-xs text-text-faint">
                    A recorded result helps choose the next check; it does not establish mastery.
                  </p>
                </div>
              ))}
          </div>
        ) : null}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <section
          className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-5"
          aria-labelledby="dashboard-concepts-heading"
          aria-busy={loading}
        >
          <div className="flex items-start gap-3">
            <BookOpenCheck size={21} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <div>
              <h2 id="dashboard-concepts-heading" className="font-display text-xl font-semibold">
                Recall before review
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Check the idea from memory before seeing the explanation.
              </p>
            </div>
          </div>
          {state?.errors.concepts ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              Concept reviews could not load. {state.errors.concepts}
            </p>
          ) : concepts ? (
            <>
              <p className="mt-4 text-sm">
                <strong className="font-display text-2xl text-text">
                  {state?.concepts?.complete ? '' : 'At least '}
                  {concepts.due.length}
                </strong>{' '}
                due now <span className="mx-1 text-text-faint">/</span> {concepts.upcoming.length}{' '}
                scheduled later
              </p>
              {!state?.concepts?.complete && (
                <p className="mt-1 text-xs text-text-faint">
                  Counts cover the returned review queue.
                </p>
              )}
              {state?.concepts?.held_for_exam && (
                <p className="mt-2 text-xs text-text-muted">
                  Some reviews are held while an exam is in progress.
                </p>
              )}
              {firstConcept ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs text-text-muted">Next concept question</p>
                  <Link
                    to={`/concept-review/${encodeURIComponent(firstConcept.id)}`}
                    className="mt-1 block text-sm font-semibold leading-relaxed text-accent"
                  >
                    {firstConcept.prompt}
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-text-muted">
                  {concepts.upcoming.length
                    ? 'Your upcoming recall checks will appear here when due.'
                    : 'Add a recall question from a saved insight, or prepare one from a study activity.'}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-text-muted">Loading concept reviews…</p>
          )}
          <Link
            to="/concept-review"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            Open concept reviews <ArrowRight size={14} aria-hidden />
          </Link>
        </section>

        <section
          className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-5"
          aria-labelledby="dashboard-workflow-heading"
          aria-busy={loading}
        >
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-accent" aria-hidden />
            <h2 id="dashboard-workflow-heading" className="font-display text-xl font-semibold">
              Keep the whole thread
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Workflows keep the goal, evidence, work done, and next check together.
          </p>
          {state?.actions && (
            <p className="mt-3 text-sm">
              <strong>{actions.ready.length}</strong> ready study{' '}
              {actions.ready.length === 1 ? 'activity' : 'activities'}{' '}
              <span className="mx-1 text-text-faint">/</span>{' '}
              <strong>{actions.upcoming.length}</strong> scheduled checks
            </p>
          )}
          {state?.errors.briefs ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              Saved task briefs could not load. {state.errors.briefs}
            </p>
          ) : openBriefs ? (
            <p className="mt-2 text-xs text-text-muted">
              {state?.briefs?.length === 50 ? 'At least ' : ''}
              {openBriefs.length} open saved assistant task{' '}
              {openBriefs.length === 1 ? 'brief' : 'briefs'}
              {state?.briefs?.length === 50 ? ' in the latest 50 records' : ''}.
            </p>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Loading saved task briefs…</p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
            <Link to="/workflows" className="text-accent underline">
              Open workflows
            </Link>
            <Link to="/memory" className="text-accent underline">
              Learning Memory
            </Link>
          </div>
        </section>
        {errors.length > 0 && (
          <Button
            size="sm"
            className="self-start"
            disabled={loading}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={14} aria-hidden />
            {loading ? 'Refreshing overview…' : 'Retry overview'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function LearningOverview(props: Props) {
  const { name, today, coreOnly, showCountdown, daysLeft, userId } = props;
  const firstName = (name ?? '').trim().split(/\s+/)[0];
  return (
    <section className="min-w-0 space-y-4" aria-labelledby="dashboard-next-move">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-lg border border-border bg-bg-raised p-4 sm:p-6">
        <div className="min-w-0 max-w-[60ch]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <CalendarDays size={14} aria-hidden />
            <time dateTime={today}>{formatDate(today, 'EEEE, dd MMM')}</time>
            {showCountdown && (
              <span className="border-l border-border pl-2">
                {daysLeft > 0
                  ? `${daysLeft} days to exam`
                  : daysLeft === 0
                    ? 'Exam day'
                    : 'Exam date passed'}
              </span>
            )}
          </p>
          <h1
            id="dashboard-next-move"
            className="mt-3 font-display text-[clamp(1.65rem,3vw,2.4rem)] font-semibold leading-tight tracking-[-0.025em] text-text"
          >
            Your learning, ready to use.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {firstName ? `${firstName}, ` : ''}
            {coreOnly
              ? 'continue your practice and build evidence one question at a time.'
              : 'start with the next useful action, then check what changed.'}
          </p>
        </div>
        <Link
          to="/today"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast"
        >
          Open Do now <ArrowRight size={15} aria-hidden />
        </Link>
      </header>
      {!coreOnly && userId && backendConfig.fastapi && (
        <OverviewData
          key={userId}
          userId={userId}
          today={today}
          timeZone={props.timeZone}
          resumeSession={props.resumeSession}
        />
      )}
    </section>
  );
}
