import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/fastapi-client';
import { getMemoryEntry, listMemoryEntries, MEMORY_KINDS, newMemoryEntry, type MemoryKind, type StudyMemoryEntry } from '@/lib/study-memory';
import { todayISOInTimeZone, uuid } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import MemoryEntryEditor from '@/components/memory/MemoryEntryEditor';
import StudyHistoryBrowser from '@/components/memory/StudyHistoryBrowser';
import LocalLearningEngine from '@/components/memory/LocalLearningEngine';
import { backendConfig } from '@/lib/backend-config';

const views: { label: string; kind?: MemoryKind; href?: string }[] = [
  { label: 'Memory records' }, { label: 'Exam reviews', kind: 'exam_review' }, { label: 'Concepts & skills', kind: 'concept' },
  { label: 'Patterns & repairs', kind: 'repair' }, { label: 'Knowledge & sources', href: '/learning-library' }, { label: 'Learning profile', kind: 'profile' }
];

export default function LearningMemory() {
  const { entryId } = useParams();
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<StudyMemoryEntry[]>([]);
  const [selected, setSelected] = useState<StudyMemoryEntry | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<MemoryKind | ''>('');
  const [state, setState] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [checkingConcept, setCheckingConcept] = useState(false);
  const [showHistory, setShowHistory] = useState(!entryId);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void listMemoryEntries({ q: search, kind: kind || undefined, state: state ? state as StudyMemoryEntry['state'] : undefined, limit: 25, offset })
      .then((page) => { if (active) { setItems(page.items); setTotal(page.total); setMore(page.has_more); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Memory could not load.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, kind, state, offset, revision, userId]);

  useEffect(() => {
    if (!entryId) return;
    setShowHistory(false);
    let active = true; setSelected(null);
    void getMemoryEntry(entryId).then((result) => { if (active) setSelected(result.entry); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Record could not load.'); });
    return () => { active = false; };
  }, [entryId, userId]);

  function create(nextKind: MemoryKind) {
    setShowHistory(false);
    const id = uuid();
    setSelected(newMemoryEntry(nextKind, id, nextKind === 'concept' ? 'New concept' : nextKind === 'repair' ? 'Focused repair' : nextKind === 'profile' ? 'My learning context' : 'Open learning question', {
      user_id: userId || '', state: 'open', data: nextKind === 'repair' ? { activity: 'concept-repair', due_date: todayISOInTimeZone(profile?.timezone), duration_min: 20, requested_count: 3, question_uids: [] } : {}
    }));
    navigate('/memory');
  }

  async function download() {
    try {
      const value = await apiRequest<unknown>('/v1/study-memory/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `hetu-learning-memory-${todayISOInTimeZone(profile?.timezone)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export could not finish.'); }
  }

  return <div className="space-y-5">
    <PageHeader title="Learning Memory" description="Your attempts, thinking, concepts, and follow-ups, with the evidence kept in view." />
    {backendConfig.isLocal && <LocalLearningEngine onChanged={refresh} />}
    <nav aria-label="Memory views" className="flex flex-wrap gap-1 border-b border-border pb-3"><button aria-pressed={showHistory} onClick={() => setShowHistory(true)} className={`rounded px-3 py-2 text-sm ${showHistory ? 'bg-accent-faint font-semibold text-accent' : 'text-text-muted hover:bg-bg-overlay'}`}>All study history</button>{views.map((view) => view.href ? <Link key={view.label} className="rounded px-3 py-2 text-sm text-accent underline" to={view.href}>{view.label}</Link> : <button key={view.label} onClick={() => { setShowHistory(false); setKind(view.kind || ''); setOffset(0); }} aria-pressed={!showHistory && kind === (view.kind || '')} className={`rounded px-3 py-2 text-sm ${!showHistory && kind === (view.kind || '') ? 'bg-accent-faint font-semibold text-accent' : 'text-text-muted hover:bg-bg-overlay'}`}>{view.label}</button>)}</nav>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => create('concept')}>Add concept</Button><Button size="sm" onClick={() => create('finding')}>Record finding or open question</Button><Button size="sm" onClick={() => create('repair')}>Create repair</Button><Button size="sm" onClick={() => create('profile')}>Record learning context</Button><Button size="sm" onClick={() => void download()}>Export memory and evidence</Button><Link className="self-center px-2 text-sm text-accent underline" to="/concept-review">Open scheduled concept reviews</Link></div>
    {error && <p role="alert" className="rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger">{error} <Button size="sm" onClick={refresh}>Retry</Button></p>}
    {showHistory ? <StudyHistoryBrowser revision={revision} /> : <div className={`grid gap-5 ${checkingConcept ? '' : 'lg:grid-cols-[minmax(250px,340px)_minmax(0,1fr)]'}`}>
      <aside hidden={checkingConcept} className="min-w-0 space-y-3">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setOffset(0); setSearch(query); }}><input aria-label="Search all learning memory" className="min-w-0 flex-1 rounded border border-border bg-bg-raised px-3 py-2 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reasoning, concepts, or notes" /><Button type="submit" size="sm">Search</Button></form>
        <div className="grid grid-cols-2 gap-2"><select aria-label="Memory record type" className="rounded border border-border bg-bg-raised p-2 text-sm" value={kind} onChange={(event) => { setKind(event.target.value as MemoryKind | ''); setOffset(0); }}><option value="">All records</option>{MEMORY_KINDS.map((value) => <option value={value} key={value}>{value.replace('_', ' ')}</option>)}</select><select aria-label="Memory record status" className="rounded border border-border bg-bg-raised p-2 text-sm" value={state} onChange={(event) => { setState(event.target.value); setOffset(0); }}><option value="">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="deferred">Deferred</option><option value="completed">Completed activity</option><option value="superseded">Superseded</option></select></div>
        <p role="status" className="text-xs text-text-muted">{loading ? 'Searching saved records…' : `${total} matching records`}</p>
        <ul className="divide-y divide-border border-y border-border">{items.map((item) => <li key={item.id}><Link className={`block rounded px-3 py-3 ${selected?.id === item.id ? 'bg-accent-faint' : 'hover:bg-bg-overlay'}`} to={`/memory/${item.id}`}><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-text-muted">{item.kind.replace('_', ' ')} · {item.subject || 'General'} · {item.state}</span><span className="mt-1 block truncate text-xs text-text-muted">{item.content || 'No written reflection yet'}</span></Link></li>)}</ul>
        {!loading && !items.length && !error && <p className="text-sm leading-relaxed text-text-muted">Saved thinking will appear here as you review questions. You can also add a concept or an open question now.</p>}
        <div className="flex justify-between"><Button size="sm" disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button size="sm" disabled={!more || loading} onClick={() => setOffset(offset + 25)}>Next</Button></div>
      </aside>
      <section aria-label="Selected memory" className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-6">{selected ? <MemoryEntryEditor key={selected.id} initial={selected} onChanged={refresh} onCheckStateChange={setCheckingConcept} /> : <div className="max-w-prose space-y-3 py-8"><h2 className="font-display text-2xl font-semibold">Follow the evidence</h2><p className="text-sm leading-relaxed text-text-muted">Open a record to see the original thinking, its context, corrections, and next action. Recorded events, your assessments, and interpretations retain their sources.</p><p className="text-sm text-text-muted">A completed activity is evidence of work done. Independent accuracy, delayed recall, fresh application, and speed need separate checks.</p><Link className="inline-block text-sm font-medium text-accent underline" to="/pyq">Start question practice</Link></div>}</section>
    </div>}
  </div>;
}
