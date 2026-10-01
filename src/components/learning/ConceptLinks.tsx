import { useState } from 'react';
import { Link2, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '@/lib/fastapi-client';

type ConceptSummary = {
  id: string;
  subject: string;
  topic: string;
  concept: string;
  summary: string;
};

export type ConceptLink = {
  id: string;
  version: number;
  source_concept_id: string;
  target_concept_id: string;
  relation: 'prerequisite_for' | 'related' | 'contrasts_with' | 'extends';
  direction: 'incoming' | 'outgoing';
  rationale: string;
  active: boolean;
  other_concept: ConceptSummary | null;
};

type SearchResult = { items: ConceptSummary[]; total_matches: number; complete: boolean };

const RELATIONS: Array<{ value: ConceptLink['relation']; label: string }> = [
  { value: 'related', label: 'Related idea' },
  { value: 'prerequisite_for', label: 'This concept is prerequisite for the linked concept' },
  { value: 'contrasts_with', label: 'Contrasts with' },
  { value: 'extends', label: 'This concept builds on the linked concept' }
];

function relationLabel(link: ConceptLink): string {
  if (link.relation === 'prerequisite_for') {
    return link.direction === 'incoming'
      ? 'Prerequisite for this concept'
      : 'This concept is prerequisite for the linked concept';
  }
  if (link.relation === 'extends') {
    return link.direction === 'incoming' ? 'Builds on this concept' : 'This concept builds on the linked concept';
  }
  return link.relation === 'contrasts_with' ? 'Contrasts with' : 'Related idea';
}

export default function ConceptLinks({
  conceptId,
  links,
  onChanged
}: {
  conceptId: string;
  links: ConceptLink[];
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [relation, setRelation] = useState<ConceptLink['relation']>('related');
  const [rationale, setRationale] = useState('');
  const [candidates, setCandidates] = useState<ConceptSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await apiRequest<SearchResult>(
        `/v1/learning/search?q=${encodeURIComponent(query)}&limit=20&offset=0`
      );
      const found = result.items.filter((item) => item.id !== conceptId);
      setCandidates(found);
      setSelectedId(found[0]?.id ?? '');
      if (!result.complete) setError('Some concepts may be outside the safe search window. Refine the title or subject.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Concepts could not be searched.');
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !rationale.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const existing = links.find((item) =>
        item.other_concept?.id === selectedId && item.relation === relation
      );
      await apiRequest('/v1/learning/links', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          source_concept_id: existing?.source_concept_id ?? conceptId,
          target_concept_id: existing?.target_concept_id ?? selectedId,
          relation,
          rationale: rationale.trim(),
          expected_version: existing?.version,
          active: true
        })
      });
      setRationale('');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The concept link could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(link: ConceptLink) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/v1/learning/links', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          source_concept_id: link.source_concept_id,
          target_concept_id: link.target_concept_id,
          relation: link.relation,
          rationale: link.rationale,
          expected_version: link.version,
          active: false
        })
      });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The concept link could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="library-concept-links" aria-labelledby="concept-links-heading">
      <h3 id="concept-links-heading">Concept connections</h3>
      {links.some((item) => item.active) ? (
        <ul className="mt-2 grid gap-2">
          {links.filter((item) => item.active).map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-md border border-border bg-bg-overlay/20 p-3">
              <Link2 size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {item.other_concept ? (
                  <Link to={`/learning-library/${item.other_concept.id}`} className="font-semibold text-accent hover:underline">
                    {item.other_concept.subject} / {item.other_concept.topic} / {item.other_concept.concept}
                  </Link>
                ) : <span className="text-text-muted">Linked concept is unavailable</span>}
                <p className="mt-0.5 text-[11px] text-text-faint">{relationLabel(item)}</p>
                <p className="mt-1 text-[12px] text-text-muted">{item.rationale}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void deactivate(item)} className="rounded p-1 text-text-faint hover:text-text" aria-label="Remove concept link">
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[12px] text-text-muted">No concepts linked yet. Connect prerequisites, contrasts, and ideas that build on each other.</p>}

      <div className="mt-3 grid gap-2 rounded-md border border-border bg-bg-overlay/15 p-3">
        <form onSubmit={(event) => void search(event)}>
          <label className="text-[11px] font-medium text-text-muted">Find a saved concept
            <span className="mt-1 flex gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={300} placeholder="Search by name or subject" className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text" />
              <button type="submit" className="library-text-button" aria-label="Search concepts"><Search size={14} aria-hidden="true" /></button>
            </span>
          </label>
        </form>
        {candidates.length > 0 && <form onSubmit={(event) => void save(event)} className="grid gap-2">
          <label className="text-[11px] font-medium text-text-muted">Connect to
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text">
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.subject} / {item.topic} / {item.concept}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-muted">Relationship
            <select value={relation} onChange={(event) => setRelation(event.target.value as ConceptLink['relation'])} className="mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text">
              {RELATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-muted">Why these concepts connect
            <textarea required rows={2} maxLength={2000} value={rationale} onChange={(event) => setRationale(event.target.value)} className="mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text" placeholder="For example, conditional probability is needed before applying Bayes' rule." />
          </label>
          <button type="submit" disabled={busy || !selectedId || !rationale.trim()} className="library-primary-button w-fit"><Link2 size={14} aria-hidden="true" />{busy ? 'Saving…' : 'Save connection'}</button>
        </form>}
        {error && <p role="alert" className="library-error">{error}</p>}
      </div>
    </section>
  );
}
