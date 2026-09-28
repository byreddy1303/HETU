import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';

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
  version: number;
  concept_id: string;
  kind: 'recall' | 'transfer';
  question_origin: string;
  prompt: string;
  evaluation_guidance: string | null;
  due_on: string;
  attempts: Attempt[];
  last_evidence?: { assistance: string; evaluation: string; evaluated_by: string };
};

export default function ConceptReview() {
  const { reviewId } = useParams();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<'correct' | 'partial' | 'incorrect' | 'ungraded'>('ungraded');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingResponse = useRef<{ content: string; key: string } | null>(null);

  const load = useCallback(async () => {
    if (!backendConfig.fastapi) return;
    setReviews(await apiRequest<Review[]>('/v1/concept-reviews?limit=50'));
    setReview(reviewId ? await apiRequest<Review>(`/v1/concept-reviews/${encodeURIComponent(reviewId)}`) : null);
  }, [reviewId]);

  useEffect(() => { void load().catch((cause) => setError(
    cause instanceof Error ? cause.message : 'Reviews could not load.'
  )); }, [load]);

  async function saveResponse() {
    if (!review || !answer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const content = JSON.stringify({
        expected_version: review.version,
        answer,
        assistance: revealed ? 'solution' : 'none',
        evaluation,
        evaluated_by: 'self',
        duration_source: 'unknown'
      });
      if (pendingResponse.current?.content !== content) {
        pendingResponse.current = { content, key: crypto.randomUUID() };
      }
      await apiRequest(`/v1/concept-reviews/${encodeURIComponent(review.id)}/responses`, {
        method: 'POST',
        body: JSON.stringify({
          ...JSON.parse(content),
          attempt_id: pendingResponse.current.key
        })
      });
      pendingResponse.current = null;
      setAnswer('');
      setRevealed(false);
      setEvaluation('ungraded');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The response could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-col gap-4">
    <PageHeader title="Concept review" description="Answer from memory first. Hints and shown guidance stay attached to the attempt." />
    {!backendConfig.fastapi ? <p className="rounded-xl border border-border bg-bg-raised p-5 text-text-muted">Concept review opens after your account is connected to the Python service.</p> : <>
      {error && <p role="alert" className="rounded-lg bg-danger-faint p-3 text-danger">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <nav aria-label="Concept questions" className="rounded-xl border border-border bg-bg-raised p-3">
          {reviews.length ? reviews.map((item) => <Link key={item.id} to={`/concept-review/${item.id}`}
            className={`block rounded-lg p-3 hover:bg-accent-faint ${reviewId === item.id ? 'bg-accent-faint' : ''}`}>
            <strong className="block text-sm">{item.prompt}</strong>
            <small className="text-text-muted">{item.kind} · due {item.due_on}</small>
          </Link>) : <p className="p-3 text-sm text-text-muted">No concept questions yet. Open a saved insight and add a recall question.</p>}
        </nav>
        <main className="rounded-xl border border-border bg-bg-raised p-5">
          {review ? <div className="max-w-[72ch] space-y-5">
            <div><span className="text-xs text-text-muted">{review.kind} · {review.question_origin}</span><h2 className="mt-2 text-xl font-bold">{review.prompt}</h2><Link to={`/learning-library/${review.concept_id}`} className="mt-2 inline-block text-sm font-semibold text-accent">Open concept</Link></div>
            <label className="grid gap-2 text-sm font-semibold">Your answer<textarea className="min-h-32 rounded-lg border border-border bg-bg p-3 font-normal leading-relaxed" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write your answer before checking guidance." /></label>
            {review.evaluation_guidance && <div><button className="font-semibold text-accent" onClick={() => setRevealed(true)} disabled={revealed}>Show evaluation guidance</button>{revealed && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-accent-faint p-3 text-sm leading-relaxed">{review.evaluation_guidance}</p>}</div>}
            <label className="grid gap-2 text-sm font-semibold">How did your answer hold up?
              <select className="rounded-lg border border-border bg-bg p-2 font-normal" value={evaluation} onChange={(event) => setEvaluation(event.target.value as typeof evaluation)}>
                <option value="ungraded">Not graded</option><option value="correct">Correct</option><option value="partial">Partly correct</option><option value="incorrect">Incorrect</option>
              </select>
            </label>
            <p className="text-xs text-text-muted">This is saved as your own assessment. Seeing guidance marks the attempt as assisted. Neither action automatically marks the concept mastered.</p>
            <button disabled={!answer.trim() || saving} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast disabled:opacity-50" onClick={() => void saveResponse()}>{saving ? 'Saving…' : 'Record response'}</button>
            {review.attempts.length > 0 && <section className="border-t border-border pt-4"><h3 className="mb-3 font-bold">Earlier responses</h3><ul className="space-y-3">{review.attempts.slice().reverse().map((attempt) => <li key={attempt.attempt_id} className="rounded-lg border border-border p-3 text-sm"><p className="whitespace-pre-wrap">{attempt.answer}</p><small className="mt-2 block text-text-muted">{attempt.evaluation} · {attempt.evaluated_by} · {attempt.assistance === 'none' ? 'unaided' : attempt.assistance} · {new Date(attempt.recorded_at).toLocaleString()}</small></li>)}</ul></section>}
          </div> : <p className="text-text-muted">Choose a question to begin.</p>}
        </main>
      </div>
    </>}
  </div>;
}
