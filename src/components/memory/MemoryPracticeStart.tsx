import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMemoryEntry, getMemoryRepairData, type StudyMemoryEntry } from '@/lib/study-memory';
import { Button } from '@/components/ui/Button';

export default function MemoryPracticeStart({ repairId, loading, error, onStart }: {
  repairId: string; loading: boolean; error: string | null; onStart: () => void;
}) {
  const [entry, setEntry] = useState<StudyMemoryEntry | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    void getMemoryEntry(repairId).then((result) => {
      if (!active) return;
      if (result.entry.kind !== 'repair') setLoadError('This record is not a repair activity.');
      else setEntry(result.entry);
    }).catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'The repair could not load.'); });
    return () => { active = false; };
  }, [repairId]);
  const repair = entry ? getMemoryRepairData(entry) : null;
  return <section className="mx-auto w-full max-w-3xl space-y-5 rounded-lg border border-border bg-bg-raised p-5 sm:p-8">
    <Link to={`/memory/${repairId}`} className="text-sm font-medium text-accent underline">Back to the repair and its evidence</Link>
    <div><h1 className="font-display text-2xl font-semibold">{entry?.title || 'Opening learning activity…'}</h1><p className="mt-2 text-sm text-text-muted">{entry?.subject}{entry?.topic ? ` · ${entry.topic}` : ''}</p></div>
    {repair && <dl className="grid gap-4 text-sm sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="font-medium">Target skill</dt><dd>{repair.target}</dd><dt className="font-medium">Why this work</dt><dd>{repair.reason}</dd><dt className="font-medium">Success check</dt><dd>{repair.success_criteria || 'Inspect the submitted reasoning, accuracy, and pace.'}</dd><dt className="font-medium">Scope</dt><dd>{repair.question_uids.length} selected questions · {repair.duration_min} minute budget · {repair.activity}</dd></dl>}
    <p className="text-sm text-text-muted">Question eligibility and prior exposure are checked again when you start. Sealed papers remain protected. A familiar-question retry is recorded as practice, without a claim of fresh transfer.</p>
    {(error || loadError) && <p role="alert" className="rounded border border-danger/30 p-3 text-sm text-danger">{error || loadError}</p>}
    <Button variant="primary" disabled={!repair?.question_uids.length || loading || !!loadError} onClick={onStart}>{loading ? 'Preparing selected practice…' : 'Start selected practice'}</Button>
  </section>;
}
