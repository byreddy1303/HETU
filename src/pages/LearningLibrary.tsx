import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenText, ChevronRight, Search, Save } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';
import './learning-library.css';

type Summary = {
  id: string;
  subject: string;
  topic: string;
  concept: string;
  summary: string;
  updated_at: string;
  version: number;
};
type SearchResult = {
  items: Summary[];
  next_offset: number | null;
  total_matches: number;
  complete: boolean;
};
type Insight = {
  id: string;
  version: number;
  core_idea: string;
  full_explanation: string;
  reasoning_origin: string;
  prior_reasoning?: string | null;
  reasoning_correction?: string | null;
  better_method?: string | null;
  intuition?: string | null;
  derivation?: string | null;
  conditions: string[];
  exceptions: string[];
  examples: string[];
  recognition_cues: string[];
  unresolved_questions: string[];
  retrieval_question?: string | null;
  evaluation_guidance?: string | null;
};
type Source = {
  id: string;
  sources: Array<{
    title: string;
    kind: string;
    url?: string | null;
    excerpt?: string | null;
    observed_at?: string | null;
  }>;
  captured_at: string;
};
type Detail = {
  page: Summary & { full_explanation?: string; aliases?: string[] };
  insights: Insight[];
  sources: Source[];
  complete: boolean;
  page_history?: Array<{ version: number; recorded_at?: string }>;
  insight_history?: Record<string, Array<{ version: number; revision_reason?: string; full_explanation?: string }>>;
};

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="library-error">{error}</p> : null;
}

function DetailList({ label, values }: { label: string; values?: string[] }) {
  return values?.length ? (
    <section className="library-detail-list">
      <h4>{label}</h4>
      <ul>{values.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul>
    </section>
  ) : null;
}

function safeSourceHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username ? url.href : null;
  } catch {
    return null;
  }
}

function LearningCapture({ onSaved }: { onSaved: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [concept, setConcept] = useState('');
  const [coreIdea, setCoreIdea] = useState('');
  const [fullExplanation, setFullExplanation] = useState('');
  const [sourceTitle, setSourceTitle] = useState('Personal note');
  const [sourceExcerpt, setSourceExcerpt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSave = useRef<{ content: string; key: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const content = JSON.stringify({
        sources: [{ kind: 'manual', title: sourceTitle, excerpt: sourceExcerpt || null }],
        insights: [{
          subject, topic, concept, core_idea: coreIdea,
          full_explanation: fullExplanation, reasoning_origin: 'none'
        }]
      });
      if (pendingSave.current?.content !== content) {
        pendingSave.current = { content, key: crypto.randomUUID() };
      }
      const result = await apiRequest<{ concept_ids: string[] }>('/v1/learning/captures', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: pendingSave.current.key,
          ...JSON.parse(content)
        })
      });
      pendingSave.current = null;
      setOpen(false);
      onSaved(result.concept_ids[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The note could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="library-capture">
      <button type="button" className="library-capture-toggle" onClick={() => setOpen(!open)}
        aria-expanded={open}>
        <BookOpenText size={18} aria-hidden />
        <span>Add an insight</span>
        <ChevronRight size={16} aria-hidden />
      </button>
      {open && <form onSubmit={(event) => void save(event)} className="library-capture-form">
        <div className="library-form-grid">
          <label>Subject<input required maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Probability" /></label>
          <label>Topic<input required maxLength={160} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Bayesian inference" /></label>
          <label>Concept<input required maxLength={160} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Posterior normalization" /></label>
        </div>
        <label>Quick recall<input required maxLength={3000} value={coreIdea} onChange={(e) => setCoreIdea(e.target.value)} placeholder="What should I remember?" /></label>
        <label>Full explanation<textarea required rows={6} maxLength={50000} value={fullExplanation} onChange={(e) => setFullExplanation(e.target.value)} placeholder="Explain the idea, conditions, derivation, and examples." /></label>
        <div className="library-form-grid library-form-grid--source">
          <label>Source name<input required maxLength={300} value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} /></label>
          <label>Source excerpt<input maxLength={30000} value={sourceExcerpt} onChange={(e) => setSourceExcerpt(e.target.value)} placeholder="Optional quote or context" /></label>
        </div>
        <ErrorLine error={error} />
        <button className="library-primary-button" disabled={saving} type="submit"><Save size={15} aria-hidden />{saving ? 'Saving…' : 'Save insight'}</button>
      </form>}
    </section>
  );
}

export default function LearningLibrary() {
  const { conceptId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<Summary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [complete, setComplete] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  async function createRecall(insight: Insight) {
    if (!detail) return;
    setError(null);
    try {
      const saved = await apiRequest<{ id: string }>('/v1/concept-reviews', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: `recall-${insight.id}`,
          concept_id: detail.page.id,
          insight_id: insight.id,
          kind: 'recall',
          prompt: insight.retrieval_question,
          evaluation_guidance: insight.evaluation_guidance,
          question_origin: 'saved_note'
        })
      });
      navigate(`/concept-review/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review could not be created.');
    }
  }

  const loadList = useCallback(async (q: string, offset = 0) => {
    const response = await apiRequest<SearchResult>(
      `/v1/learning/search?q=${encodeURIComponent(q)}&limit=25&offset=${offset}`
    );
    setResults((old) => offset ? [...old, ...response.items] : response.items);
    setNextOffset(response.next_offset);
    setComplete(response.complete);
  }, []);
  const loadDetail = useCallback(async (id: string, history = false) => {
    const response = await apiRequest<Detail>(
      `/v1/learning/concepts/${encodeURIComponent(id)}?include_history=${history}`
    );
    setDetail(response);
  }, []);

  useEffect(() => {
    if (!backendConfig.fastapi) return;
    setLoading(true);
    setError(null);
    Promise.all([
      loadList(submittedQuery),
      conceptId ? loadDetail(conceptId, showHistory) : Promise.resolve()
    ]).catch((cause) => setError(cause instanceof Error ? cause.message : 'Library could not load.'))
      .finally(() => setLoading(false));
  }, [conceptId, submittedQuery, showHistory, loadDetail, loadList]);

  async function saveRevision(insight: Insight) {
    setError(null);
    try {
      await apiRequest(`/v1/learning/insights/${encodeURIComponent(insight.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_version: insight.version,
          revision_reason: editReason,
          full_explanation: editText
        })
      });
      setEditing(null);
      setEditReason('');
      if (conceptId) await loadDetail(conceptId, showHistory);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revision could not be saved.');
    }
  }

  return <div className="learning-library">
    <PageHeader title="Saved discussions" description="Explore ideas, reasoning changes, examples, and sources from your ChatGPT conversations." />
    {!backendConfig.fastapi ? (
      <div className="library-empty">The Learning Library opens when your account is connected to the Python service. Existing study data stays in its current account until migration is verified.</div>
    ) : <>
      <LearningCapture onSaved={(id) => { void loadList(''); navigate(`/learning-library/${id}`); }} />
      <ErrorLine error={error} />
      <div className="library-layout">
        <aside className="library-index" aria-label="Saved concepts">
          <form className="library-search" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query); }}>
            <Search size={17} aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search concepts or cues" aria-label="Search library" />
            <button type="submit">Search</button>
          </form>
          {!complete && <p className="library-note">More records exist than this search could inspect. Narrow the query.</p>}
          {results.length ? <ul className="library-index-list">{results.map((item) => <li key={item.id}>
            <Link to={`/learning-library/${item.id}`} className={item.id === conceptId ? 'is-selected' : undefined}>
              <span>{item.subject} / {item.topic}</span><strong>{item.concept}</strong><small>{item.summary}</small>
            </Link>
          </li>)}</ul> : !loading && <p className="library-note">No saved concepts match. Add an insight or try another search.</p>}
          {nextOffset !== null && <button className="library-more" onClick={() => void loadList(submittedQuery, nextOffset)}>Load more</button>}
        </aside>
        <main className="library-reading-desk">
          {conceptId && detail ? <>
            <Link className="library-back" to="/learning-library"><ArrowLeft size={14} aria-hidden /> All concepts</Link>
            <div className="library-path">{detail.page.subject} <ChevronRight size={13} aria-hidden /> {detail.page.topic}</div>
            <h2>{detail.page.concept}</h2>
            <p className="library-recall">{detail.page.summary}</p>
            {!detail.complete && <p className="library-note">Some linked sources or insights could not be retrieved.</p>}
            {detail.insights.map((insight) => <article className="library-insight" key={insight.id}>
              <h3>{insight.core_idea}</h3>
              <p className="library-rich-text">{insight.full_explanation}</p>
              {insight.prior_reasoning && <section className="library-reasoning"><h4>Earlier reasoning</h4><p>{insight.prior_reasoning}</p><span>{insight.reasoning_origin === 'learner_stated' ? 'Stated by you' : insight.reasoning_origin === 'assistant_hypothesis' ? 'Possible explanation' : 'General pitfall'}</span></section>}
              {insight.reasoning_correction && <section className="library-reasoning"><h4>What changed</h4><p>{insight.reasoning_correction}</p></section>}
              {insight.better_method && <section className="library-reasoning"><h4>Better method</h4><p>{insight.better_method}</p></section>}
              {insight.intuition && <section className="library-reasoning"><h4>Intuition</h4><p>{insight.intuition}</p></section>}
              {insight.derivation && <section className="library-reasoning"><h4>Derivation</h4><p className="library-rich-text">{insight.derivation}</p></section>}
              <DetailList label="Conditions" values={insight.conditions} />
              <DetailList label="Exceptions" values={insight.exceptions} />
              <DetailList label="Examples" values={insight.examples} />
              <DetailList label="Recognition cues" values={insight.recognition_cues} />
              <DetailList label="Still open" values={insight.unresolved_questions} />
              {insight.retrieval_question && <div className="library-retrieval"><strong>Check your recall</strong><p>{insight.retrieval_question}</p><button className="library-text-button" onClick={() => void createRecall(insight)}>Practice and record an answer</button></div>}
              {editing === insight.id ? <div className="library-edit">
                <label>Full explanation<textarea rows={8} value={editText} onChange={(event) => setEditText(event.target.value)} /></label>
                <label>Reason for revision<input value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="What improved or changed?" /></label>
                <div><button disabled={!editText.trim() || !editReason.trim()} onClick={() => void saveRevision(insight)}>Save revision</button><button onClick={() => setEditing(null)}>Cancel</button></div>
              </div> : <button className="library-text-button" onClick={() => { setEditing(insight.id); setEditText(insight.full_explanation); }}>Improve explanation</button>}
            </article>)}
            <section className="library-provenance"><h3>Sources</h3>{detail.sources.map((capture) => capture.sources.map((source, index) => {
              const href = safeSourceHref(source.url);
              return <div key={`${capture.id}-${index}`} className="library-source"><strong>{source.title}</strong><span>{source.kind} / saved {new Date(capture.captured_at).toLocaleDateString()}</span>{href && <a href={href} target="_blank" rel="noreferrer">Open source</a>}{source.excerpt && <p>{source.excerpt}</p>}</div>;
            }))}</section>
            <button className="library-text-button" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide page history' : 'Show page history'}</button>
            {showHistory && <div className="library-history">
              <p>Topic page: {detail.page_history?.map((item) => `v${item.version}`).join(', ')}</p>
              {detail.insights.map((insight) => <details key={insight.id}>
                <summary>{insight.core_idea} — {detail.insight_history?.[insight.id]?.length ?? 0} versions</summary>
                {detail.insight_history?.[insight.id]?.map((item) => <div key={item.version}>
                  <strong>Version {item.version}</strong> {item.revision_reason && <span>{item.revision_reason}</span>}
                  <p>{item.full_explanation}</p>
                </div>)}
              </details>)}
            </div>}
          </> : <div className="library-empty"><BookOpenText size={27} aria-hidden /><h2>Choose a concept</h2><p>Open a saved idea to see the full explanation, its source, and how your understanding has changed.</p></div>}
        </main>
      </div>
    </>}
  </div>;
}
