import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '@/lib/fastapi-client';

type Evidence = {
  id: string; collection: string; title: string; section: string; section_path: string;
  subject?: string | null; topic?: string | null; version: number; updated_at: string;
};
export type EvidenceLink = {
  id: string; version: number; source_concept_id: string; target_collection: string;
  target_record_id: string; rationale: string; active: boolean; evidence: Evidence | null;
};
type SearchResult = { items: Evidence[]; complete: boolean; next_offset: number | null };
type Draft = Omit<EvidenceLink, 'id' | 'version' | 'evidence'> & { expected_version?: number };
const COLLECTIONS = [
  ['questions', 'Journal'], ['patterns', 'Patterns'], ['formulas', 'Formulas'],
  ['trigger_phrases', 'Trigger drill'], ['pyq_attempts', 'PYQ attempts'],
  ['mock_tests', 'Mocks'], ['reattempts', 'Re-attempts'],
  ['learning_items', 'Recovery'], ['concept_reviews', 'Concept review']
];
const inputClass = 'mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text';
const hiddenFields = new Set(['id', 'user_id', 'owner_id', 'deleted_at', 'version']);

function EvidenceValues({ value }: { value: unknown }) {
  if (value == null) return <span>Not recorded</span>;
  if (Array.isArray(value)) return <ul className="ml-4 list-disc">{value.map((item, index) => <li key={index}><EvidenceValues value={item} /></li>)}</ul>;
  if (typeof value === 'object') return <dl className="grid gap-2">{Object.entries(value).filter(([name]) => !hiddenFields.has(name)).map(([name, item]) => (
    <div key={name}><dt className="font-medium capitalize">{name.replaceAll('_', ' ')}</dt><dd className="whitespace-pre-wrap break-words text-text-muted"><EvidenceValues value={item} /></dd></div>
  ))}</dl>;
  return <span>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>;
}

export default function StudyEvidenceLinks({ conceptId, links, complete = true, onChanged }: {
  conceptId: string; links: EvidenceLink[]; complete?: boolean; onChanged: () => Promise<void>;
}) {
  const [collection, setCollection] = useState('questions');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ summary: Evidence; item: Record<string, unknown> } | null>(null);
  const pending = useRef<{ signature: string; body: string } | null>(null);
  const searchFilter = useRef({ collection, query });

  async function search(offset = 0) {
    setBusy(true); setError('');
    const filter = offset ? searchFilter.current : { collection, query };
    searchFilter.current = filter;
    try {
      const result = await apiRequest<SearchResult>(`/v1/learning/evidence?collection=${filter.collection}&q=${encodeURIComponent(filter.query)}&limit=20&offset=${offset}`);
      setResults((previous) => ({ ...result, items: offset ? [...(previous?.items ?? []), ...result.items] : result.items }));
      if (!offset) setSelected(result.items[0]?.id ?? '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Evidence could not be loaded.'); }
    finally { setBusy(false); }
  }

  async function save(draft: Draft) {
    setBusy(true); setError('');
    const signature = JSON.stringify(draft);
    if (pending.current?.signature !== signature) {
      pending.current = { signature, body: JSON.stringify({ ...draft, idempotency_key: crypto.randomUUID() }) };
    }
    try {
      await apiRequest('/v1/learning/evidence-links', { method: 'POST', body: pending.current.body });
      await onChanged();
      pending.current = null;
      setRationale('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The connection could not be saved. Retry to check the same operation.'); }
    finally { setBusy(false); }
  }

  async function inspect(evidence: Evidence) {
    setBusy(true); setError(''); setDetail(null);
    try {
      setDetail(await apiRequest(`/v1/learning/evidence/${evidence.collection}/${encodeURIComponent(evidence.id)}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This evidence is unavailable.'); }
    finally { setBusy(false); }
  }

  function connect() {
    const evidence = results?.items.find((item) => item.id === selected);
    if (!evidence) return;
    const existing = links.find((item) => item.target_collection === evidence.collection && item.target_record_id === selected);
    void save({ source_concept_id: conceptId, target_collection: evidence.collection,
      target_record_id: selected, rationale: rationale.trim(), active: true, expected_version: existing?.version });
  }

  return <section className="library-concept-links" aria-labelledby="study-evidence-heading">
    <h3 id="study-evidence-heading">Linked study evidence</h3>
    <p className="mt-1 text-[12px] text-text-muted">Connect this discussion to a mistake, formula, recognition cue, or actual practice response. A connection explains relevance; it does not establish mastery.</p>
    {!complete && <p role="status">Showing the latest 100 connections. More connections exist.</p>}
    <ul className="mt-3 grid gap-2">{links.filter((item) => item.active).map((item) => <li key={item.id} className="rounded-md border border-border p-3">
      <strong>{item.evidence?.title ?? 'Linked evidence is unavailable'}</strong>
      {item.evidence && <p className="text-[11px] text-text-faint">{item.evidence.section} · {item.evidence.subject} {item.evidence.topic}</p>}
      <p className="mt-1 text-[12px] text-text-muted">{item.rationale}</p>
      <div className="mt-2 flex gap-3">
        {item.evidence && <button className="library-text-button" disabled={busy} onClick={() => void inspect(item.evidence!)}>Read evidence</button>}
        <button className="library-text-button" disabled={busy} onClick={() => void save({ source_concept_id: conceptId, target_collection: item.target_collection, target_record_id: item.target_record_id, rationale: item.rationale, active: false, expected_version: item.version })}>Remove connection</button>
      </div>
    </li>)}</ul>
    {!links.some((item) => item.active) && <p className="mt-2 text-[12px] text-text-muted">No study evidence connected yet.</p>}
    <form className="mt-3 grid gap-2 rounded-md border border-border p-3" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <label className="text-[12px]">Study section<select disabled={busy} className={inputClass} value={collection} onChange={(event) => { setCollection(event.target.value); setResults(null); setSelected(''); }}>{COLLECTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="text-[12px]">Find study evidence<input disabled={busy} className={inputClass} maxLength={300} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search existing records" /></label>
      <button disabled={busy} type="submit" className="library-text-button w-fit">Search evidence</button>
    </form>
    {results && <div className="mt-2 grid gap-2">
      {!results.complete && <p role="status">Only the latest 2,000 records were searched. Older evidence may be missing.</p>}
      {!results.items.length && <p role="status">No matching records in this section.</p>}
      {results.items.length > 0 && <form onSubmit={(event) => { event.preventDefault(); connect(); }} className="grid gap-2">
        <label className="text-[12px]">Evidence to connect<select disabled={busy} className={inputClass} value={selected} onChange={(event) => setSelected(event.target.value)}>{results.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button type="button" className="library-text-button w-fit" disabled={busy || !selected} onClick={() => { const item = results.items.find((candidate) => candidate.id === selected); if (item) void inspect(item); }}>Preview selected evidence</button>
        <label className="text-[12px]">How this connects<textarea disabled={busy} required maxLength={2000} rows={2} className={inputClass} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain what this record shows about the saved idea." /></label>
        <button type="submit" disabled={busy || !selected || !rationale.trim()} className="library-primary-button w-fit">Save evidence connection</button>
      </form>}
      {results.next_offset !== null && <button disabled={busy} className="library-text-button w-fit" onClick={() => void search(results.next_offset!)}>Load more evidence</button>}
    </div>}
    {detail && <aside className="mt-3 rounded-md border border-border p-3" aria-label="Study evidence details">
      <h4>{detail.summary.title}</h4>
      <p className="text-[11px] text-text-faint">Version {detail.summary.version} · Updated {new Date(detail.summary.updated_at).toLocaleString()}</p>
      <div className="my-3 text-[12px]"><EvidenceValues value={detail.item} /></div>
      <Link className="library-text-button" to={detail.summary.section_path}>Open {detail.summary.section}</Link>
      <button className="library-text-button ml-3" onClick={() => setDetail(null)}>Close evidence</button>
    </aside>}
    {error && <p role="alert" className="library-error">{error}</p>}
  </section>;
}
