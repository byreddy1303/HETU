import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { backendConfig } from '@/lib/backend-config';
import { practiceApi, practiceError, type PracticeReview } from '@/lib/practice-coach';

function ReviewMoment({
  item,
  sessionId,
  onSaved
}: {
  item: PracticeReview['candidates'][number];
  sessionId: string;
  onSaved: (view: PracticeReview) => void;
}) {
  const [cause, setCause] = useState(item.decision?.request?.cause ?? 'uncertain');
  const [note, setNote] = useState(item.decision?.request?.note ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(later: boolean) {
    setBusy(true);
    setError('');
    try {
      onSaved(
        await practiceApi<PracticeReview>(`/sessions/${sessionId}/review`, 'POST', {
          attempt_id: item.attempt_id,
          cause,
          note,
          later
        })
      );
      setEditing(false);
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-lg border border-border p-4">
      <p className="text-sm font-semibold">{item.title}</p>
      <p className="mt-1 text-xs text-text-muted">{item.reason}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-accent">Recall the question</summary>
        <p className="mt-2 whitespace-pre-wrap text-text-muted">{item.prompt}</p>
      </details>
      {item.decision && !editing ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-success">
            {item.decision.state === 'later'
              ? 'Left for later. Your answer remains saved.'
              : 'Your assessment is saved.'}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {item.decision.state === 'later' ? 'Review now' : 'Edit observation'}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="grid gap-1 text-xs">
            What deserves attention?
            <select
              value={cause}
              onChange={(e) => setCause(e.target.value)}
              className="rounded border border-border bg-bg-raised p-2 text-sm"
            >
              {Object.entries({
                uncertain: 'Not sure yet',
                reading: 'Reading a condition',
                recall: 'Recalling the idea',
                recognition: 'Recognising the method',
                method: 'Choosing the steps',
                execution: 'Calculation or execution',
                verification: 'Checking the result',
                time: 'Time allocation',
                none: 'No difficulty noticed'
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            One useful observation <span className="text-text-faint">Optional</span>
            <textarea
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="rounded border border-border bg-bg-raised p-2 text-sm"
              placeholder="The condition I missed, or the step I want to check…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || (cause === 'uncertain' && !note.trim())}
              onClick={() => void save(false)}
            >
              Save observation
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(true)}>
              Later
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}

export default function PracticeWrapUp({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<PracticeReview | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!backendConfig.isLocal) return;
    const abort = new AbortController();
    setView(null);
    setError('');
    void practiceApi<PracticeReview>(
      `/sessions/${sessionId}/review`,
      'GET',
      undefined,
      abort.signal
    )
      .then(setView)
      .catch((e) => {
        if (!abort.signal.aborted) setError(practiceError(e));
      });
    return () => abort.abort();
  }, [sessionId, retry]);
  if (!backendConfig.isLocal) return null;
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-bg-raised p-5"
      aria-label="Short practice review"
    >
      <div>
        <h2 className="font-display text-xl font-semibold">A moment to close the loop</h2>
        <p className="mt-1 text-sm text-text-muted">
          {view ? `${view.saved_count} answers saved. ` : ''}Review up to three moments, or continue
          with your day.
        </p>
      </div>
      {error && (
        <div role="alert" className="text-sm text-danger">
          {error}{' '}
          <Button size="sm" onClick={() => setRetry((x) => x + 1)}>
            Retry
          </Button>
        </div>
      )}
      {!view && !error && (
        <p role="status" className="text-sm text-text-muted">
          Choosing useful review moments…
        </p>
      )}
      {view?.candidates.map((item) => (
        <ReviewMoment key={item.attempt_id} item={item} sessionId={sessionId} onSaved={setView} />
      ))}
      {view && !view.candidates.length && (
        <p className="text-sm text-text-muted">
          No additional reflection is needed here. You can inspect any attempt in the detailed
          report.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="text-accent underline" to="/practice-lab">
          Open mistake repairs
        </Link>
        <Link className="text-text-muted underline" to={`/session/${sessionId}/review`}>
          Full thinking review
        </Link>
      </div>
    </section>
  );
}
