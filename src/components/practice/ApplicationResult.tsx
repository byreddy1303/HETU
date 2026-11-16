import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError } from '@/lib/practice-coach';

type Conditions = { version: number; assistance: string; pack_id: string };
export default function ApplicationResult({
  sessionId,
  repairId
}: {
  sessionId: string;
  repairId: string;
}) {
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [assistance, setAssistance] = useState('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void practiceApi<Conditions>(
      `/applications/${sessionId}/conditions`,
      'GET',
      undefined,
      controller.signal
    )
      .then((value) => {
        setConditions(value);
        setAssistance(value.assistance);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(practiceError(cause));
      });
    return () => controller.abort();
  }, [sessionId, retry]);
  async function save() {
    if (!conditions || busy) return;
    setBusy(true);
    setError('');
    try {
      setConditions(
        await practiceApi<Conditions>(`/applications/${sessionId}/conditions`, 'PUT', {
          expected_version: conditions.version,
          assistance
        })
      );
    } catch (cause) {
      setError(practiceError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Repair application result"
      className="space-y-3 rounded-xl border border-accent/30 bg-bg-raised p-5"
    >
      <h2 className="font-display text-lg font-semibold">Your application answers are saved</h2>
      {conditions?.version ? (
        <p role="status" className="text-sm text-text-muted">
          {conditions.assistance === 'without-help'
            ? 'You reported answering without help. The result and next check are linked.'
            : 'This remains helped or unqualified practice. The next check will revisit the questions before extending the interval.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-text-muted">
            Report the conditions once to schedule the next check. Only fresh, independently
            answered questions qualify as fresh application evidence.
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Application conditions
            <select
              className="rounded border border-border bg-bg-raised p-2"
              disabled={!conditions || busy}
              value={assistance}
              onChange={(e) => setAssistance(e.target.value)}
            >
              <option value="unknown">Not reported</option>
              <option value="without-help">Answered without help</option>
              <option value="with-help">Used notes or help</option>
            </select>
          </label>
          <Button disabled={!conditions || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save conditions and next check'}
          </Button>
          <p className="text-xs text-text-muted">
            The saved report stays with this completed session.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-4 text-sm text-accent underline">
        <Link to={`/memory/${encodeURIComponent(repairId)}`}>Open result and next check</Link>
        <Link to="/practice-lab?tab=progress">Inspect repair evidence</Link>
        <Link to="/practice-lab">Return to repair focus</Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}{' '}
          <Button size="sm" onClick={() => setRetry((n) => n + 1)}>
            Reload saved report
          </Button>
        </p>
      )}
    </section>
  );
}
