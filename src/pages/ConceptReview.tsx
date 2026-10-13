import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';
import { cacheRecoveryResponse, recoveryKey } from '@/lib/recovery-api';
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
  pending_assistance?: 'hint' | 'solution' | null;
  recovery_item_id?: string;
  recovery_evidence?: { item: LearningItemRow; session: RecoverySessionRow | null; events: LearningEventRow[]; explanation: string };
};

export default function ConceptReview() {
  const { reviewId } = useParams();
  const [searchParams] = useSearchParams();
  const recoverySessionId = searchParams.get('recoverySession');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<'correct' | 'partial' | 'incorrect' | 'ungraded'>('ungraded');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoverySession, setRecoverySession] = useState<RecoverySessionRow | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const pendingResponse = useRef<{ content: string; key: string } | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!backendConfig.fastapi) return;
    const [items, selected, session] = await Promise.all([
      apiRequest<Review[]>('/v1/concept-reviews?limit=50', { signal }),
      reviewId ? apiRequest<Review>(`/v1/concept-reviews/${encodeURIComponent(reviewId)}`, { signal }) : null,
      recoverySessionId ? apiRequest<{ session: RecoverySessionRow }>(`/v1/recovery/sessions/${encodeURIComponent(recoverySessionId)}`, { signal }) : null
    ]);
    if (signal.aborted) return;
    setReviews(items);
    setReview(selected);
    setRevealed(!!selected?.pending_assistance);
    setRecoverySession(session?.session ?? null);
  }, [reviewId, recoverySessionId]);

  const loadPage = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted) return;
    setLoading(true);
    setLoadError(null);
    try {
      await load(signal);
      if (!signal.aborted) setError(null);
    } catch (cause) {
      if (!signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Reviews could not load.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    activeLoad.current = controller;
    setReview(null);
    setAnswer('');
    setEvaluation('ungraded');
    setRevealed(false);
    setSaving(false);
    setError(null);
    pendingResponse.current = null;
    void loadPage(controller.signal);
    return () => controller.abort();
  }, [loadPage]);

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
      const result = await apiRequest<{ review: Review; item: LearningItemRow; events: LearningEventRow[] }>(
        `/v1/concept-reviews/${encodeURIComponent(review.id)}/help`, {
          method: 'POST', signal,
          body: JSON.stringify({ idempotency_key: recoveryKey('concept-guidance', [review.id, review.attempts.length]),
            expected_version: review.version, assistance: 'solution' })
        }
      );
      if (signal?.aborted) return;
      setReview(result.review);
      setRevealed(true);
      cacheRecoveryResponse(result.review.user_id, result);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Guidance could not be recorded.');
    } finally { if (!signal?.aborted) setSaving(false); }
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
        ...(recoverySession ? { recovery_session_id: recoverySession.id,
          expected_session_version: recoverySession.version, expected_session_index: recoverySession.current_index } : {})
      });
      if (pendingResponse.current?.content !== content) {
        pendingResponse.current = { content, key: crypto.randomUUID() };
      }
      const saved = await apiRequest<Review>(`/v1/concept-reviews/${encodeURIComponent(review.id)}/responses`, {
        method: 'POST',
        signal,
        body: JSON.stringify({
          ...JSON.parse(content),
          attempt_id: pendingResponse.current.key
        })
      });
      if (signal?.aborted) return;
      if (saved.recovery_evidence) cacheRecoveryResponse(saved.user_id, saved.recovery_evidence);
      pendingResponse.current = null;
      setAnswer('');
      setRevealed(false);
      setEvaluation('ungraded');
      await loadPage(signal);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'The response could not be saved.');
    } finally {
      if (!signal?.aborted) setSaving(false);
    }
  }

  return <div className="flex flex-col gap-4">
    <PageHeader title="Concept review" description="Answer from memory first. Hints and shown guidance stay attached to the attempt." />
    {!backendConfig.fastapi ? <p className="rounded-xl border border-border bg-bg-raised p-5 text-text-muted">Concept review opens after your account is connected to the Python service.</p> : <>
      {(loadError || error) && <div role="alert" className="rounded-lg bg-danger-faint p-3 text-danger">
        <p>{loadError || error}</p>
        {loadError && <button className="mt-2 font-semibold underline disabled:opacity-50" disabled={loading || saving} onClick={retryLoad}>Retry load</button>}
      </div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <nav aria-label="Concept questions" aria-busy={loading} className="rounded-xl border border-border bg-bg-raised p-3">
          {reviews.length ? reviews.map((item) => <Link key={item.id} to={`/concept-review/${item.id}`}
            className={`block rounded-lg p-3 hover:bg-accent-faint ${reviewId === item.id ? 'bg-accent-faint' : ''}`}>
            <strong className="block text-sm">{item.prompt}</strong>
            <small className="text-text-muted">{item.kind} · due {item.due_on}</small>
          </Link>) : <p className="p-3 text-sm text-text-muted">{loading ? 'Loading concept questions…' : loadError ? 'Your concept questions could not load. Retry to see them.' : 'No concept questions yet. Open a saved insight and add a recall question.'}</p>}
        </nav>
        <main aria-busy={loading} className="rounded-xl border border-border bg-bg-raised p-5">
          {review ? <div className="max-w-[72ch] space-y-5">
            <div><span className="text-xs text-text-muted">{review.kind} · {review.question_origin}</span><h2 className="mt-2 text-xl font-bold">{review.prompt}</h2><Link to={`/learning-library/${review.concept_id}`} className="mt-2 inline-block text-sm font-semibold text-accent">Open concept</Link></div>
            <label className="grid gap-2 text-sm font-semibold">Your answer<textarea className="min-h-32 rounded-lg border border-border bg-bg p-3 font-normal leading-relaxed" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write your answer before checking guidance." /></label>
            {review.evaluation_guidance && <div><button className="font-semibold text-accent" onClick={() => void showGuidance()} disabled={revealed || saving || loading || !!loadError}>Show evaluation guidance</button>{revealed && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-accent-faint p-3 text-sm leading-relaxed">{review.evaluation_guidance}</p>}</div>}
            <label className="grid gap-2 text-sm font-semibold">How did your answer hold up?
              <select className="rounded-lg border border-border bg-bg p-2 font-normal" value={evaluation} onChange={(event) => setEvaluation(event.target.value as typeof evaluation)}>
                <option value="ungraded">Not graded</option><option value="correct">Correct</option><option value="partial">Partly correct</option><option value="incorrect">Incorrect</option>
              </select>
            </label>
            <p className="text-xs text-text-muted">This is saved as your own assessment. Seeing guidance marks the attempt as assisted. Neither action automatically marks the concept mastered.</p>
            <button disabled={!answer.trim() || saving || loading || !!loadError || (!!recoverySession && (recoverySession.status !== 'active' || (!!review.recovery_item_id && recoverySession.item_ids[recoverySession.current_index] !== review.recovery_item_id)))} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast disabled:opacity-50" onClick={() => void saveResponse()}>{saving ? 'Saving…' : 'Record response'}</button>
            {review.recovery_evidence && <p className="text-sm text-text-muted">{review.recovery_evidence.explanation} Next due: {review.due_on}.</p>}
            {recoverySessionId && <Link className="block font-semibold text-accent" to={`/reattempts?recoverySession=${encodeURIComponent(recoverySessionId)}`}>Continue recovery sprint</Link>}
            {review.attempts.length > 0 && <section className="border-t border-border pt-4"><h3 className="mb-3 font-bold">Earlier responses</h3><ul className="space-y-3">{review.attempts.slice().reverse().map((attempt) => <li key={attempt.attempt_id} className="rounded-lg border border-border p-3 text-sm"><p className="whitespace-pre-wrap">{attempt.answer}</p><small className="mt-2 block text-text-muted">{attempt.evaluation} · {attempt.evaluated_by} · {attempt.assistance === 'none' ? 'unaided' : attempt.assistance} · {new Date(attempt.recorded_at).toLocaleString()}</small></li>)}</ul></section>}
          </div> : <p className="text-text-muted">{loading ? (reviewId ? 'Loading question…' : 'Loading recall practice…') : loadError ? 'Concept review is unavailable. Retry loading to continue.' : 'Choose a question to begin.'}</p>}
        </main>
      </div>
    </>}
  </div>;
}
