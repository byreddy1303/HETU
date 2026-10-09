import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Clipboard, Printer, Save } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { apiRequest } from '@/lib/fastapi-client';
import type {
  LearningRevisionPack,
  PackConcept,
  RevisionPackList,
  SavedRevisionPack
} from '@/lib/learning-revision-pack';
import { formatDate } from '@/lib/utils';

const inputClass =
  'block w-full rounded border border-border bg-bg px-3 py-2 text-[13px] text-text';
const originLabels: Record<string, string> = {
  learner_stated: 'From your stated reasoning',
  assistant_hypothesis: 'Assistant hypothesis',
  general_pitfall: 'General pitfall',
  none: 'Saved explanation'
};

export default function LearningRevisionPackPage() {
  const { userId } = useAuth();
  return userId ? (
    <ConnectedRevisionPack key={userId} />
  ) : (
    <Empty
      title="Sign in to assemble your revision pack"
      hint="Your saved discussions and study evidence belong to your HETU account."
    />
  );
}

function ConnectedRevisionPack() {
  const [params, setParams] = useSearchParams();
  const savedId = params.get('pack');
  const pushToast = useUiStore((state) => state.pushToast);
  const [subject, setSubject] = useState('');
  const [asOf, setAsOf] = useState('');
  const [limit, setLimit] = useState(10);
  const [filters, setFilters] = useState({ subject: '', asOf: '', limit: 10 });
  const [refresh, setRefresh] = useState(0);
  const [pack, setPack] = useState<LearningRevisionPack | null>(null);
  const [snapshots, setSnapshots] = useState<RevisionPackList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [copied, setCopied] = useState(false);
  const pending = useRef<{ signature: string; body: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPack(null);
    setCopied(false);
    const query = new URLSearchParams({ limit: String(filters.limit) });
    if (filters.subject) query.set('subject', filters.subject);
    if (filters.asOf) query.set('as_of', filters.asOf);
    const load = savedId
      ? apiRequest<SavedRevisionPack>(
          `/v1/revision-pack/saved/${encodeURIComponent(savedId)}`
        ).then((result) => result.snapshot)
      : apiRequest<LearningRevisionPack>(`/v1/revision-pack?${query}`);
    void load
      .then((result) => {
        if (!cancelled) setPack(result);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Revision evidence could not be loaded. Try again.'
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [savedId, filters, refresh]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError('');
    void apiRequest<RevisionPackList>('/v1/revision-pack/saved?limit=25&offset=0')
      .then((result) => {
        if (!cancelled) setSnapshots(result);
      })
      .catch((cause) => {
        if (!cancelled)
          setListError(cause instanceof Error ? cause.message : 'Saved packs could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [savedId, refresh]);

  function buildCurrent() {
    setFilters({ subject: subject.trim(), asOf, limit });
    setParams({});
    pending.current = null;
    setRefresh((value) => value + 1);
  }

  async function save() {
    if (!pack) return;
    const options = {
      as_of: pack.as_of,
      subject: pack.subject,
      limit: pack.limit,
      expected_content_hash: pack.content_hash
    };
    const signature = JSON.stringify(options);
    if (pending.current?.signature !== signature) {
      pending.current = {
        signature,
        body: JSON.stringify({ ...options, idempotency_key: crypto.randomUUID() })
      };
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<SavedRevisionPack>('/v1/revision-pack/saved', {
        method: 'POST',
        body: pending.current.body
      });
      if (!alive.current) return;
      pending.current = null;
      setParams({ pack: result.id });
      pushToast('Revision pack saved with its sources.', 'success');
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'The save response was interrupted. Retry to check the same save.'
        );
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  async function loadMore() {
    if (snapshots?.next_offset == null) return;
    setListLoading(true);
    setListError('');
    try {
      const result = await apiRequest<RevisionPackList>(
        `/v1/revision-pack/saved?limit=25&offset=${snapshots.next_offset}`
      );
      if (alive.current)
        setSnapshots((previous) => ({
          ...result,
          items: [...(previous?.items ?? []), ...result.items]
        }));
    } catch (cause) {
      if (alive.current)
        setListError(cause instanceof Error ? cause.message : 'Older packs could not be loaded.');
    } finally {
      if (alive.current) setListLoading(false);
    }
  }

  async function copy() {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack.text);
      if (alive.current) setCopied(true);
    } catch {
      pushToast('Clipboard access is unavailable. Use Print / save PDF instead.', 'neutral');
    }
  }

  const sections = pack?.sections;
  const empty =
    !!sections &&
    !sections.weekly_focus?.this_weeks_fix &&
    Object.entries(sections).every(
      ([name, value]) => name === 'weekly_focus' || (Array.isArray(value) && value.length === 0)
    );

  return (
    <div className="revision-pack flex flex-col gap-4">
      <PageHeader
        title="Revision pack"
        description="Bring saved discussions, due recall, formulas, and mistake evidence into one sourced review sheet."
      />
      <form
        className="revision-pack-actions grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_1fr_110px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          buildCurrent();
        }}
      >
        <label className="text-[12px] text-text-muted">
          Subject
          <input
            className={inputClass}
            maxLength={160}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="All subjects"
            disabled={saving}
          />
        </label>
        <label className="text-[12px] text-text-muted">
          Review date
          <input
            className={inputClass}
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="text-[12px] text-text-muted">
          Per section
          <select
            className={inputClass}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            disabled={saving}
          >
            <option value={5}>5 items</option>
            <option value={10}>10 items</option>
            <option value={20}>20 items</option>
          </select>
        </label>
        <Button className="self-end" type="submit" disabled={saving}>
          Build current pack
        </Button>
      </form>
      <div className="revision-pack-actions flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={!pack || saving || loading || !!savedId || empty}
        >
          <Save size={15} />
          {saving ? 'Saving…' : 'Save pack'}
        </Button>
        <Button onClick={() => window.print()} disabled={!pack || empty}>
          <Printer size={15} />
          Print / save PDF
        </Button>
        <Button onClick={() => void copy()} disabled={!pack || empty}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? 'Copied' : 'Copy as text'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-[13px] text-text-muted">
          Loading your revision evidence…
        </p>
      )}
      {pack && (
        <>
          <p className="text-[12px] text-text-muted">
            {formatDate(pack.as_of, 'dd MMM yyyy')} · {pack.timezone} ·{' '}
            {pack.subject || 'All subjects'}
            {savedId ? ' · Saved snapshot' : ' · Current evidence'}
          </p>
          {savedId && (
            <p role="status" className="text-[12px] text-text-muted">
              This saved sheet keeps the evidence and source versions used when it was created.
              Build a current pack to include later changes.
            </p>
          )}
          {!pack.complete && (
            <p
              role="status"
              className="rounded border border-border p-3 text-[13px] text-text-muted"
            >
              Partial retrieval: older records may be missing. This sheet uses the retrieved
              evidence.
            </p>
          )}
          {Object.values(pack.has_more).some(Boolean) && (
            <p className="text-[12px] text-text-muted">
              This is a selection for revision. More records are available in the linked sections.
            </p>
          )}
          {empty && (
            <Empty
              title="Nothing to pack in the retrieved evidence"
              hint="Save a discussion, formula, recognition cue, or study response, then build a current pack."
            />
          )}
          {sections?.weekly_focus?.this_weeks_fix && (
            <Card className="revision-print-block">
              <CardHeader title="This week’s constraint" />
              <CardBody>
                <p className="font-display text-[20px] font-semibold">
                  {sections.weekly_focus.this_weeks_fix}
                </p>
                <a href={sections.weekly_focus.url} className="library-text-button">
                  Open weekly review
                </a>
              </CardBody>
            </Card>
          )}
          {!!sections?.saved_concepts.length && (
            <Card className="revision-print-block">
              <CardHeader title={`Saved discussions · ${sections.saved_concepts.length}`} />
              <CardBody>
                <div className="grid gap-6">
                  {sections.saved_concepts.map((concept) => (
                    <ConceptSheet key={concept.id} concept={concept} />
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
          {sections && !empty && (
            <div className="grid gap-4 lg:grid-cols-2">
              <PackList
                title={`Due recall and transfer · ${sections.due_reviews.length}`}
                rows={sections.due_reviews.map((row) => ({
                  id: row.id,
                  text: row.prompt || 'Recall prompt',
                  url: row.url,
                  label: 'Open review',
                  detail: `${row.kind} · Due ${row.due_on}`
                }))}
                empty="No due concept reviews in the retrieved evidence."
              />
              <PackList
                title={`Due formulas · ${sections.due_formulas.length}`}
                rows={sections.due_formulas.map((row) => ({
                  id: row.id,
                  text: `${row.subject}: ${row.name} — ${row.expression}`,
                  url: row.url,
                  label: 'Open formulas'
                }))}
                empty="No formulas due in the retrieved evidence."
              />
              <PackList
                title={`Recognition cues · ${sections.triggers.length}`}
                rows={sections.triggers.map((row) => ({
                  id: row.id,
                  text: `${row.phrase} → ${row.concept}`,
                  url: row.url,
                  label: 'Open trigger drill'
                }))}
                empty="No trigger phrases saved in the retrieved evidence."
              />
              <PackList
                title={`Repeated mistakes · ${sections.repeated_mistakes.length}`}
                rows={sections.repeated_mistakes.map((row) => ({
                  id: `${row.subject}-${row.name}`,
                  text: `${row.subject}: ${row.name} (${row.count} occurrences)`
                }))}
                empty="No repeated mistake pattern in the retrieved evidence."
              />
              <PackList
                title={`Priority questions · ${sections.priority_questions.length}`}
                rows={sections.priority_questions.map((row) => ({
                  id: row.id,
                  text: [row.subject, row.subtopic, row.source_ref, row.capture_note]
                    .filter(Boolean)
                    .join(' · '),
                  url: row.url,
                  label: 'Open Journal'
                }))}
                empty="No priority questions in the retrieved evidence."
              />
            </div>
          )}
        </>
      )}
      <section
        className="revision-pack-actions rounded-lg border border-border p-4"
        aria-labelledby="saved-packs-heading"
      >
        <h2 id="saved-packs-heading" className="font-display text-[16px] font-semibold">
          Saved revision packs
        </h2>
        {snapshots && !snapshots.items.length && (
          <p className="mt-2 text-[12px] text-text-muted">
            Save a sheet to revisit its original learning and sources later.
          </p>
        )}
        <ul className="mt-2 grid gap-2">
          {snapshots?.items.map((item) => (
            <li key={item.id}>
              <Link to={`/revision-pack?pack=${item.id}`} className="library-text-button">
                {item.as_of} · {item.subject || 'All subjects'}
              </Link>
            </li>
          ))}
        </ul>
        {snapshots?.next_offset != null && (
          <Button className="mt-3" disabled={listLoading} onClick={() => void loadMore()}>
            Load older packs
          </Button>
        )}
        {listLoading && (
          <p role="status" className="text-[12px] text-text-muted">
            Loading saved packs…
          </p>
        )}
        {listError && (
          <p role="alert" className="library-error">
            {listError}
          </p>
        )}
      </section>
    </div>
  );
}

function ConceptSheet({ concept }: { concept: PackConcept }) {
  return (
    <article className="border-b border-border pb-5 last:border-0 last:pb-0">
      <p className="text-[12px] text-text-faint">
        {concept.subject} / {concept.topic}
        {concept.due_review ? ' · Recall due' : ''}
      </p>
      <h3 className="mt-1 font-display text-[18px] font-semibold">{concept.concept}</h3>
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text">
        {concept.summary}
      </p>
      {concept.reasoning_correction && (
        <div className="mt-3 rounded-md bg-surface px-3 py-2">
          <p className="text-[11px] text-text-faint">
            {originLabels[concept.reasoning_origin] || 'Reasoning correction'}
          </p>
          <p className="whitespace-pre-wrap text-[13px] text-text-muted">
            {concept.reasoning_correction}
          </p>
        </div>
      )}
      {!!concept.recognition_cues.length && (
        <ul className="mt-3 list-inside list-disc text-[12px] text-text-muted">
          {concept.recognition_cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      )}
      {concept.recognition_cue_count > concept.recognition_cues.length && (
        <p className="text-[11px] text-text-faint">
          More recognition cues are in the full explanation.
        </p>
      )}
      {concept.retrieval_question && (
        <p className="mt-3 text-[13px] text-text-muted">
          <strong>Recall question: </strong>
          {concept.retrieval_question}
        </p>
      )}
      {!!concept.evidence_links.length && (
        <ul className="mt-3 grid gap-2 text-[12px] text-text-muted">
          {concept.evidence_links.map((link) => (
            <li key={link.link_id}>
              <strong>{link.record?.title || 'Linked evidence is unavailable'}</strong>
              <p>{link.rationale}</p>
              {link.record && (
                <Link to={link.record.section_path} className="library-text-button">
                  Open {link.record.section}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {!concept.evidence_links_complete && (
        <p className="text-[11px] text-text-faint">More evidence connections are in the Library.</p>
      )}
      <ul className="mt-3 text-[11px] text-text-faint">
        {concept.sources.flatMap((capture) =>
          capture.sources.map((source, index) => (
            <li key={`${capture.id}-${index}`}>
              Source:{' '}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                  {source.title}
                </a>
              ) : (
                source.title
              )}
              {capture.captured_at ? ` · ${formatDate(capture.captured_at, 'dd MMM yyyy')}` : ''}
            </li>
          ))
        )}
      </ul>
      {!concept.sources_complete && (
        <p className="text-[11px] text-text-faint">
          Additional sources are available in the Library.
        </p>
      )}
      <Link
        to={`/learning-library/${concept.id}`}
        className="library-text-button mt-3 inline-block"
      >
        Full explanation, sources and history
      </Link>
    </article>
  );
}

function PackList({
  title,
  rows,
  empty
}: {
  title: string;
  rows: { id: string; text: string; url?: string; label?: string; detail?: string }[];
  empty: string;
}) {
  return (
    <Card className="revision-print-block overflow-hidden">
      <CardHeader title={title} />
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3 text-[12px] leading-relaxed text-text-muted">
              <p className="whitespace-pre-wrap">{row.text}</p>
              {row.detail && <p className="text-[11px] text-text-faint">{row.detail}</p>}
              {row.url && (
                <a href={row.url} className="library-text-button mt-1 inline-block">
                  {row.label || 'Open evidence'}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <CardBody>
          <p className="text-[12px] text-text-faint">{empty}</p>
        </CardBody>
      )}
    </Card>
  );
}
