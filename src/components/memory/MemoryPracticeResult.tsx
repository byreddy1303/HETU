import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { getMemoryEntry, type StudyMemoryEntry } from '@/lib/study-memory';
import { completeMemoryRepair } from '@/lib/study-memory-practice';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function MemoryPracticeResult({ session, attempts }: { session: PyqSessionRow; attempts: PyqAttemptRow[] }) {
  const { profile } = useAuth();
  const repairId = 'memoryRepairId' in session.config && typeof session.config.memoryRepairId === 'string' ? session.config.memoryRepairId : null;
  const [entry, setEntry] = useState<StudyMemoryEntry | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!repairId) return;
    let active = true;
    void getMemoryEntry(repairId).then((result) => { if (active) setEntry(result.entry); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Repair could not load.'); });
    return () => { active = false; };
  }, [repairId]);
  if (!repairId) return null;
  async function record() {
    if (!entry) return;
    setBusy(true); setError('');
    try { setEntry(await completeMemoryRepair(entry, attempts, session.id, profile?.timezone || 'Asia/Kolkata')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The result could not be linked.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded border border-border bg-bg-raised p-4" aria-label="Linked repair result">
    <h2 className="font-display text-lg font-semibold">{entry?.title || 'Linked learning activity'}</h2>
    <p className="text-sm text-text-muted">These immutable attempts can be linked to the repair that launched this set. Accuracy and pace remain separate evidence; completing a set does not establish mastery.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={!entry || busy || entry.state === 'completed'} onClick={() => void record()}>{entry?.state === 'completed' ? 'Results linked' : 'Record activity results'}</Button><Link className="text-sm text-accent underline" to={`/memory/${repairId}`}>Open repair and next check</Link></div>
  </section>;
}
