import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';
import { cacheRecoveryResponse, recoveryKey } from '@/lib/recovery-api';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, todayISOInTimeZone } from '@/lib/utils';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { LEARNING_UPDATED_EVENT } from '@/lib/local-learning-engine';
import type { LearningEventRow, LearningItemRow, RecoverySessionRow } from '@/types';

type Attempt = {
  attempt_id: string;
  answer: string;
  assistance: 'none' | 'hint' | 'solution';
  evaluation: 'correct' | 'partial' | 'incorrect' | 'ungraded';
  evaluated_by: string;
  independent_transfer: boolean;
  recorded_at: string;
};
type Review = {
  id: string;
  user_id: string;
  version: number;
  concept_id: string;
  kind: 'recall' | 'transfer';
  question_origin: string;
  prompt: string;
  evaluation_guidance: string | null;
  due_on: string;
  attempts: Attempt[];
  last_evidence?: { assistance: string; evaluation: string; evaluated_by: string };
  has_guidance?: boolean;
  concept?: { id: string; title: string; subject: string; topic: string };
  source?: { href: string; title: string; guidance_status: string; snapshot_changed: boolean };
  pending_assistance?: 'hint' | 'solution' | null;
  recovery_item_id?: string;
  recovery_evidence?: {
    item: LearningItemRow;
    session: RecoverySessionRow | null;
    events: LearningEventRow[];
    explanation: string;
  };
};

function queueLabel(item: Review): string {
  return (
    item.concept?.topic ||
    (item.concept?.subject
      ? `${item.concept.subject} concept`
      : item.kind === 'transfer'
        ? 'Application check'
        : 'Recall check')
  );
}

export default function ConceptReview() {
  const { reviewId } = useParams();
  const { userId, profile } = useAuth();
  const [queueMeta, setQueueMeta] = useState({
    today: todayISOInTimeZone(profile?.timezone || 'Asia/Kolkata'),
    complete: true,
    held_for_exam: false,
    held_sources: 0
  });
  const [schedule, setSchedule] = useState<'due' | 'upcoming'>('due');
  const [notice, setNotice] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [searchParams] = useSearchParams();
  const recoverySessionId = searchParams.get('recoverySession');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<'correct' | 'partial' | 'incorrect' | 'ungraded'>(
    'ungraded'
  );
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoverySession, setRecoverySession] = useState<RecoverySessionRow | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const pendingResponse = useRef<{ content: string; key: string } | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!backendConfig.fastapi) return;
      const [items, selected, session] = await Promise.all([
        apiRequest<{
          items: Review[];
          today: string;
          complete: boolean;
          held_for_exam: boolean;
          held_sources?: number;
        }>('/v1/learning/concept-bridge/queue?limit=100', { signal }),
        reviewId
          ? apiRequest<Review>(
              `/v1/learning/concept-bridge/reviews/${encodeURIComponent(reviewId)}`,
              { signal }
            )
          : null,
        recoverySessionId
          ? apiRequest<{ session: RecoverySessionRow }>(
              `/v1/recovery/sessions/${encodeURIComponent(recoverySessionId)}`,
              { signal }
            )
          : null
      ]);
      if (signal.aborted) return;
      setReviews(items.items);
      setQueueMeta({
        today: items.today,
        complete: items.complete,
        held_for_exam: items.held_for_exam,
        held_sources: items.held_sources || 0
      });
      setReview(selected);
      setRevealed(!!selected?.pending_assistance);
      setRecoverySession(session?.session ?? null);
    },
    [reviewId, recoverySessionId]
  );

  const loadPage = useCallback(
    async (signal: AbortSignal) => {
      if (signal.aborted) return;
      setLoading(true);
      setLoadError(null);
      try {
        await load(signal);
        if (!signal.aborted) setError(null);
      } catch (cause) {
        if (!signal.aborted)
          setLoadError(cause instanceof Error ? cause.message : 'Reviews could not load.');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    const controller = new AbortController();
    activeLoad.current = controller;
    setReview(null);
    setReviews([]);
    setNotice('');
    setAnswer('');
    setEvaluation('ungraded');
    setRevealed(false);
    setSaving(false);
    setPreparing(false);
    setError(null);
    pendingResponse.current = null;
    void loadPage(controller.signal);
    return () => controller.abort();
  }, [loadPage, userId]);

  function retryLoad() {
    const signal = activeLoad.current?.signal;
    if (signal && !loading && !saving) void loadPage(signal);
  }

  async function showGuidance() {
    if (!review || saving || revealed || loading || loadError) return;
    const signal = activeLoad.current?.signal;
    if (!signal || signal.aborted) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest<{
        review: Review;
        item: LearningItemRow;
        events: LearningEventRow[];
      }>(`/v1/concept-reviews/${encodeURIComponent(review.id)}/help`, {
        method: 'POST',
        signal,
        body: JSON.stringify({
          idempotency_key: recoveryKey('concept-guidance', [review.id, review.attempts.length]),
          expected_version: review.version,
          assistance: 'solution'
        })
      });
      if (signal?.aborted) return;
      setReview({ ...review, ...result.review });
      setRevealed(true);
      cacheRecoveryResponse(result.review.user_id, result);
    } catch (cause) {
      if (!signal?.aborted)
        setError(cause instanceof Error ? cause.message : 'Guidance could not be recorded.');
    } finally {
      if (!signal?.aborted) setSaving(false);
    }
  }

  async function saveResponse() {
    if (!review || !answer.trim() || saving || loading || loadError) return;
    const signal = activeLoad.current?.signal;
    if (!signal || signal.aborted) return;
    setSaving(true);
    setError(null);
    try {
      const content = JSON.stringify({
        expected_version: review.version,
        answer,
        assistance: revealed ? 'solution' : 'none',
        evaluation,
        evaluated_by: 'self',
        duration_source: 'unknown',
        ...(recoverySession
          ? {
              recovery_session_id: recoverySession.id,
              expected_session_version: recoverySession.version,
              expected_session_index: recoverySession.current_index
            }
          : {})
      });
      if (pendingResponse.current?.content !== content) {
        pendingResponse.current = { content, key: crypto.randomUUID() };
      }
      const saved = await apiRequest<Review>(
        `/v1/concept-reviews/${encodeURIComponent(review.id)}/responses`,
        {
          method: 'POST',
          signal,
          body: JSON.stringify({
            ...JSON.parse(content),
            attempt_id: pendingResponse.current.key
          })
        }
      );
      if (signal?.aborted) return;
      if (saved.recovery_evidence) cacheRecoveryResponse(saved.user_id, saved.recovery_evidence);
      pendingResponse.current = null;
      setNotice(
        `Response saved as your own assessment. Next review: ${saved.due_on || review.due_on}.`
      );
      window.dispatchEvent(new Event('hetu:concept-reviews-updated'));
      setAnswer('');
      setRevealed(false);
      setEvaluation('ungraded');
      await loadPage(signal);
    } catch (cause) {
      if (!signal?.aborted)
        setError(cause instanceof Error ? cause.message : 'The response could not be saved.');
    } finally {
      if (!signal?.aborted) setSaving(false);
    }
  }

  async function prepareRecall() {
    if (preparing) return;
    const signal = activeLoad.current?.signal;
    if (!signal || signal.aborted) return;
    setPreparing(true);
    setError(null);
    try {
      const result = await apiRequest<{ created: number; reused: number; held_for_exam: boolean }>(
        '/v1/learning/concept-bridge/sync',
        { method: 'POST', signal, body: '{}' }
      );
      if (signal.aborted) return;
      setNotice(
        result.held_for_exam
          ? 'Recall preparation waits until your exam is finished.'
          : result.created
            ? `Prepared ${result.created} source-linked recall checks.`
            : result.reused
              ? 'Your prepared activities are already connected to recall checks.'
              : 'No supported study activity needs a new recall check. Complete practice or add a question from a saved insight.'
      );
      await loadPage(signal);
      window.dispatchEvent(new Event('hetu:concept-reviews-updated'));
      window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT));
    } catch (cause) {
      if (!signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Recall checks could not be prepared.');
    } finally {
      if (!signal.aborted) setPreparing(false);
    }
  }
  const due = reviews.filter((item) => item.due_on <= queueMeta.today);
  const upcoming = reviews.filter((item) => item.due_on > queueMeta.today);
  const visibleReviews = schedule === 'due' ? due : upcoming;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Concept review" description="Recall the idea, then check your answer." />
      {backendConfig.fastapi && (queueMeta.held_for_exam || queueMeta.held_sources > 0) && (
        <div className="space-y-1 rounded border border-border px-4 py-3 text-sm text-text-muted">
          {queueMeta.held_for_exam && (
            <p>Concept review waits until your active or paused exam is finished.</p>
          )}
          {queueMeta.held_sources > 0 && (
            <p>
              {queueMeta.held_sources} reviews have changed or unavailable sources. Check their
              evidence in Learning Memory.
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-success-faint p-3 text-sm text-text">
          {notice}
        </p>
      )}
      {!backendConfig.fastapi ? (
        <p className="rounded-xl border border-border bg-bg-raised p-5 text-text-muted">
          Concept review opens after your account is connected to the Python service.
        </p>
      ) : (
        <>
          {(loadError || error) && (
            <div role="alert" className="rounded-lg bg-danger-faint p-3 text-danger">
              <p>{loadError || error}</p>
              {loadError && (
                <button
                  className="mt-2 font-semibold underline disabled:opacity-50"
                  disabled={loading || saving}
                  onClick={retryLoad}
                >
                  Retry load
                </button>
              )}
            </div>
          )}
          <div
            className={
              reviewId
                ? 'grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]'
                : 'min-w-0'
            }
          >
            <nav
              aria-label="Concept questions"
              aria-busy={loading}
              className="min-w-0 self-start rounded-lg border border-border bg-bg-raised p-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Recall queue</h2>
                {!reviewId && !loading && !loadError && visibleReviews[0] && (
                  <Link
                    className="inline-flex min-h-10 items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
                    to={`/concept-review/${encodeURIComponent(visibleReviews[0].id)}`}
                  >
                    {schedule === 'due' ? 'Start recall' : 'Open scheduled check'}
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
              </div>
              <div
                role="group"
                aria-label="Concept schedule"
                className="mb-2 flex flex-wrap gap-2 border-b border-border pb-3"
              >
                {(['due', 'upcoming'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={schedule === value}
                    className={`min-h-10 rounded border px-3 text-sm ${schedule === value ? 'border-accent bg-accent-faint text-accent' : 'border-border text-text-muted'}`}
                    onClick={() => setSchedule(value)}
                  >
                    {value === 'due' ? 'Due now' : 'Upcoming'}{' '}
                    <span className="ml-1 text-xs">
                      (
                      {loading
                        ? '…'
                        : loadError
                          ? '?'
                          : `${!queueMeta.complete ? 'at least ' : ''}${value === 'due' ? due.length : upcoming.length}`}
                      )
                    </span>
                  </button>
                ))}
              </div>
              {visibleReviews.length ? (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {visibleReviews.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={`/concept-review/${encodeURIComponent(item.id)}`}
                        aria-current={reviewId === item.id ? 'page' : undefined}
                        className={`flex min-h-16 items-center justify-between gap-3 rounded px-2 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] hover:bg-bg-overlay ${reviewId === item.id ? 'bg-accent-faint' : ''}`}
                      >
                        <span className="min-w-0">
                          <strong className="block text-sm font-semibold">
                            {queueLabel(item)}
                          </strong>{' '}
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                            {item.concept?.subject && item.concept.topic && (
                              <span>{item.concept.subject}</span>
                            )}{' '}
                            <span>{item.kind === 'transfer' ? 'Application' : 'Recall'}</span>{' '}
                            <time dateTime={item.due_on}>Due {formatDate(item.due_on)}</time>
                          </span>
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-text-faint" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-sm text-text-muted">
                  {loading
                    ? 'Loading concept questions…'
                    : loadError
                      ? 'Your concept questions could not load. Retry to see them.'
                      : queueMeta.held_for_exam
                        ? 'Reviews are held while your exam is unfinished.'
                        : reviews.length
                          ? schedule === 'due'
                            ? 'No concepts are due today. Upcoming checks have their own dates.'
                            : 'No upcoming recall checks yet.'
                          : 'No concept questions yet. Prepare one from a study activity or add a recall question to a saved insight.'}
                </p>
              )}
              <details className="mt-3 border-t border-border pt-3 text-sm">
                <summary className="w-fit cursor-pointer rounded font-medium text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">
                  Manage recall questions
                </summary>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {backendConfig.isLocal && (
                    <button
                      className="rounded border border-border px-3 py-2 font-medium text-text disabled:opacity-50"
                      disabled={preparing || loading || saving}
                      onClick={() => void prepareRecall()}
                    >
                      {preparing ? 'Preparing recall…' : 'Prepare recall from activities'}
                    </button>
                  )}
                  <Link className="text-accent underline" to="/memory">
                    Learning Memory
                  </Link>
                  <Link className="text-accent underline" to="/workflows">
                    Workflows
                  </Link>
                </div>
                {!queueMeta.complete && (
                  <p className="mt-2 text-xs text-text-muted">
                    Counts cover the returned queue. More reviews may be available.
                  </p>
                )}
              </details>
            </nav>
            {reviewId && (
              <main
                aria-busy={loading}
                className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-5"
              >
                {review ? (
                  <div className="max-w-[72ch] space-y-5">
                    <div>
                      <span className="text-xs text-text-muted">
                        {review.kind} ·{' '}
                        {review.source ? 'Prepared from study evidence' : review.question_origin}
                      </span>
                      <h2 className="mt-2 text-xl font-bold">{review.prompt}</h2>
                      <Link
                        to={`/learning-library/${review.concept_id}`}
                        className="mt-2 inline-block text-sm font-semibold text-accent"
                      >
                        Open concept
                      </Link>
                    </div>
                    {review.source && (
                      <div className="rounded-lg border border-border p-3 text-sm leading-relaxed">
                        <p>
                          This recall cue comes from a local model's study target. The suggested
                          method remains unverified.
                        </p>
                        <Link
                          to={review.source.href}
                          className="mt-2 inline-block font-semibold text-accent underline"
                        >
                          Original study activity
                        </Link>
                        {review.source.snapshot_changed && (
                          <p className="mt-2 text-xs text-text-muted">
                            The activity has changed since this recall question was prepared. Your
                            earlier recall responses are preserved.
                          </p>
                        )}
                      </div>
                    )}
                    <label className="grid gap-2 text-sm font-semibold">
                      Your answer
                      <textarea
                        className="min-h-32 rounded-lg border border-border bg-bg p-3 font-normal leading-relaxed"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="Write your answer before checking guidance."
                      />
                    </label>
                    {(review.has_guidance || review.evaluation_guidance) && (
                      <div>
                        <button
                          className="font-semibold text-accent"
                          onClick={() => void showGuidance()}
                          disabled={revealed || saving || loading || !!loadError}
                        >
                          Show evaluation guidance
                        </button>
                        {revealed && (
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-accent-faint p-3 text-sm leading-relaxed">
                            {review.evaluation_guidance}
                          </p>
                        )}
                      </div>
                    )}
                    <label className="grid gap-2 text-sm font-semibold">
                      How did your answer hold up?
                      <select
                        className="rounded-lg border border-border bg-bg p-2 font-normal"
                        value={evaluation}
                        onChange={(event) => setEvaluation(event.target.value as typeof evaluation)}
                      >
                        <option value="ungraded">Not graded</option>
                        <option value="correct">Correct</option>
                        <option value="partial">Partly correct</option>
                        <option value="incorrect">Incorrect</option>
                      </select>
                    </label>
                    <p className="text-xs text-text-muted">
                      This is saved as your own assessment. Seeing guidance marks the attempt as
                      assisted. Neither action automatically marks the concept mastered.
                    </p>
                    <button
                      disabled={
                        !answer.trim() ||
                        saving ||
                        loading ||
                        !!loadError ||
                        (!!recoverySession &&
                          (recoverySession.status !== 'active' ||
                            (!!review.recovery_item_id &&
                              recoverySession.item_ids[recoverySession.current_index] !==
                                review.recovery_item_id)))
                      }
                      className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast disabled:opacity-50"
                      onClick={() => void saveResponse()}
                    >
                      {saving ? 'Saving…' : 'Record response'}
                    </button>
                    {review.recovery_evidence && (
                      <p className="text-sm text-text-muted">
                        {review.recovery_evidence.explanation} Next due: {review.due_on}.
                      </p>
                    )}
                    {recoverySessionId && (
                      <Link
                        className="block font-semibold text-accent"
                        to={`/reattempts?recoverySession=${encodeURIComponent(recoverySessionId)}`}
                      >
                        Continue recovery sprint
                      </Link>
                    )}
                    {review.attempts.length > 0 && (
                      <section className="border-t border-border pt-4">
                        <h3 className="mb-3 font-bold">Earlier responses</h3>
                        <ul className="space-y-3">
                          {review.attempts
                            .slice()
                            .reverse()
                            .map((attempt) => (
                              <li
                                key={attempt.attempt_id}
                                className="rounded-lg border border-border p-3 text-sm"
                              >
                                <p className="whitespace-pre-wrap">{attempt.answer}</p>
                                <small className="mt-2 block text-text-muted">
                                  {attempt.evaluation} · {attempt.evaluated_by} ·{' '}
                                  {attempt.assistance === 'none' ? 'unaided' : attempt.assistance} ·{' '}
                                  {new Date(attempt.recorded_at).toLocaleString()}
                                </small>
                              </li>
                            ))}
                        </ul>
                      </section>
                    )}
                  </div>
                ) : (
                  <p className="text-text-muted">
                    {loading
                      ? reviewId
                        ? 'Loading question…'
                        : 'Loading recall practice…'
                      : loadError
                        ? 'Concept review is unavailable. Retry loading to continue.'
                        : 'Choose a question to begin.'}
                  </p>
                )}
              </main>
            )}
          </div>
        </>
      )}
    </div>
  );
}
