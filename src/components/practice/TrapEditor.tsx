import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  practiceApi,
  practiceError,
  type DrillPack,
  type MistakeGroup,
  type PracticeTrap
} from '@/lib/practice-coach';

export default function TrapEditor({ group, pack }: { group: MistakeGroup; pack?: DrillPack }) {
  const [saved, setSaved] = useState(group.trap);
  const [principle, setPrinciple] = useState(group.trap?.principle || pack?.principle || '');
  const [conditions, setConditions] = useState(group.trap?.conditions || pack?.conditions || '');
  const [counterexample, setCounterexample] = useState(
    group.trap?.counterexample || pack?.counterexample || ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      setSaved(
        await practiceApi<PracticeTrap>(`/traps/${group.id}`, 'PUT', {
          expected_version: saved?.version || 0,
          principle,
          conditions,
          counterexample,
          confirmed: true
        })
      );
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border border-border bg-bg-raised p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {group.title}{' '}
        <span className="font-normal text-text-muted">
          · {group.source_ids.length} linked observations
          {saved?.confirmed ? ' · confirmed by you' : ''}
        </span>
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs text-text-muted">
          {group.basis}. Keep only a principle you agree with; the original attempts stay unchanged.
        </p>
        {group.notes.length > 0 && (
          <blockquote className="border-l-2 border-accent pl-3 text-sm text-text-muted">
            {group.notes[0]}
          </blockquote>
        )}
        {[
          ['Principle', principle, setPrinciple],
          ['When it applies', conditions, setConditions],
          ['A boundary or counterexample', counterexample, setCounterexample]
        ].map(([label, value, setter]) => (
          <label key={String(label)} className="grid gap-1 text-xs">
            {String(label)}
            <textarea
              value={String(value)}
              maxLength={2000}
              rows={2}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              className="rounded border border-border bg-bg-raised p-2 text-sm"
            />
          </label>
        ))}
        <Button size="sm" disabled={busy || !principle.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Confirm and save principle'}
        </Button>
        {saved && (
          <p role="status" className="text-xs text-success">
            Your confirmed principle is saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
