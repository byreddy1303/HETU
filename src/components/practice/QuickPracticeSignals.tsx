import { useEffect, useState } from 'react';
import { backendConfig } from '@/lib/backend-config';
import { practiceApi, practiceError } from '@/lib/practice-coach';

interface Signal {
  version: number;
  flag: string;
  note: string;
}
export default function QuickPracticeSignals({ attemptId }: { attemptId: string }) {
  const [saved, setSaved] = useState<Signal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!backendConfig.isLocal) return;
    const abort = new AbortController();
    setSaved(null);
    setError('');
    void practiceApi<Signal>(`/signals/${attemptId}`, 'GET', undefined, abort.signal)
      .then(setSaved)
      .catch((e) => {
        if (!abort.signal.aborted) setError(practiceError(e));
      });
    return () => abort.abort();
  }, [attemptId]);
  if (!backendConfig.isLocal) return null;
  async function flag(value: string) {
    if (!saved || busy) return;
    setBusy(true);
    setError('');
    try {
      setSaved(
        await practiceApi<Signal>(`/signals/${attemptId}`, 'PUT', {
          expected_version: saved.version,
          flag: saved.flag === value ? 'none' : value,
          note: saved.note
        })
      );
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2" aria-label="Optional practice flags">
      <p className="text-xs text-text-muted">
        Answer saved. Anything worth revisiting? <span className="text-text-faint">Optional</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          ['stuck', 'Got stuck'],
          ['unsure', 'Was unsure'],
          ['useful', 'Useful question'],
          ['help', 'Used help']
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={!saved || busy}
            aria-pressed={saved?.flag === value}
            onClick={() => void flag(value)}
            className={`rounded-full border px-3 py-1.5 text-xs ${saved?.flag === value ? 'border-accent bg-accent-faint text-accent' : 'border-border text-text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
