import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';

type Brief = {
  id: string;
  goal: string;
  status: 'active' | 'waiting' | 'complete' | 'cancelled';
  version: number;
  constraints: string[];
  assumptions: string[];
  corrections: string[];
  references: string[];
  pending_steps: string[];
  completed_steps: string[];
  success_criteria: string[];
  receipts: Array<{ operation_id: string; recorded_at: string; result: unknown }>;
  updated_at: string;
};

export default function Workflows() {
  const { workflowId } = useParams();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selected, setSelected] = useState<Brief | null>(null);
  const [correction, setCorrection] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingChange = useRef<{ content: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!backendConfig.fastapi) return;
    const recent = await apiRequest<Brief[]>('/v1/workflows?limit=50');
    setBriefs(recent);
    if (workflowId) {
      setSelected(await apiRequest<Brief>(`/v1/workflows/${encodeURIComponent(workflowId)}`));
    } else {
      setSelected(null);
    }
  }, [workflowId]);

  useEffect(() => {
    void refresh().catch((cause) => setError(
      cause instanceof Error ? cause.message : 'Workflows could not load.'
    ));
  }, [refresh]);

  async function saveChange(values: Record<string, unknown>) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const content = JSON.stringify({ expected_version: selected.version, ...values });
      if (pendingChange.current?.content !== content) {
        pendingChange.current = { content, key: crypto.randomUUID() };
      }
      await apiRequest(`/v1/workflows/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...JSON.parse(content),
          operation_id: pendingChange.current.key
        })
      });
      pendingChange.current = null;
      setCorrection('');
      setPending('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The update could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-col gap-4">
    <PageHeader title="Workflows" description="See the goal, corrections, completed steps, and work still open in each HETU task." />
    {!backendConfig.fastapi ? <p className="rounded-xl border border-border bg-bg-raised p-5 text-text-muted">Workflows open after your account is connected to the Python service.</p> : <>
      {error && <p role="alert" className="rounded-xl bg-danger-faint p-3 text-danger">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,310px)_minmax(0,1fr)]">
        <nav aria-label="Recent workflows" className="rounded-xl border border-border bg-bg-raised p-3">
          {briefs.length ? briefs.map((brief) => <Link key={brief.id} to={`/workflows/${brief.id}`}
            className={`block rounded-lg p-3 hover:bg-accent-faint ${brief.id === workflowId ? 'bg-accent-faint' : ''}`}>
            <strong className="block text-sm text-text">{brief.goal}</strong>
            <small className="text-text-muted">{brief.status} · {brief.pending_steps.length} pending</small>
          </Link>) : <p className="p-3 text-sm text-text-muted">No saved task briefs yet. ChatGPT will create one when a multi-step HETU workflow begins.</p>}
        </nav>
        <main className="rounded-xl border border-border bg-bg-raised p-5">
          {selected ? <div className="max-w-[72ch] space-y-5">
            <div><span className="text-xs text-text-muted">{selected.status} · version {selected.version}</span><h2 className="mt-1 text-2xl font-bold text-text">{selected.goal}</h2></div>
            <BriefList title="Success means" values={selected.success_criteria} />
            <BriefList title="Constraints" values={selected.constraints} />
            <BriefList title="Corrections" values={selected.corrections} />
            <BriefList title="Pending" values={selected.pending_steps} />
            <BriefList title="Completed" values={selected.completed_steps} />
            <BriefList title="Assumptions" values={selected.assumptions} />
            <BriefList title="References" values={selected.references} />
            {selected.receipts.length > 0 && <section><h3 className="mb-2 font-bold">Receipts</h3><ul className="space-y-2 text-sm">{selected.receipts.map((receipt) => <li key={receipt.operation_id} className="rounded-lg border border-border p-3"><span className="text-text-muted">{new Date(receipt.recorded_at).toLocaleString()}</span><pre className="mt-1 overflow-auto whitespace-pre-wrap">{JSON.stringify(receipt.result, null, 2)}</pre></li>)}</ul></section>}
            <div className="grid gap-3 border-t border-border pt-5">
              <label className="grid gap-1 text-sm font-semibold">Add a correction<input className="rounded-lg border border-border bg-bg p-2 font-normal" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="What should this task focus on now?" /></label>
              <button disabled={!correction.trim() || saving} className="justify-self-start font-semibold text-accent disabled:opacity-50" onClick={() => void saveChange({ correction })}>Save correction</button>
              <label className="grid gap-1 text-sm font-semibold">Add a pending step<input className="rounded-lg border border-border bg-bg p-2 font-normal" value={pending} onChange={(event) => setPending(event.target.value)} placeholder="What remains to be done?" /></label>
              <button disabled={!pending.trim() || saving} className="justify-self-start font-semibold text-accent disabled:opacity-50" onClick={() => void saveChange({ pending_step: pending })}>Add step</button>
            </div>
          </div> : <p className="text-text-muted">Choose a workflow to see its current state.</p>}
        </main>
      </div>
    </>}
  </div>;
}

function BriefList({ title, values }: { title: string; values: string[] }) {
  return values.length ? <section><h3 className="mb-2 font-bold">{title}</h3><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{values.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul></section> : null;
}
