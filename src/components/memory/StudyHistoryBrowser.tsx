import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import {
  HISTORY_COLLECTIONS,
  getStudyHistoryEvent,
  listStudyHistory,
  studyHistoryLabel,
  type StudyHistoryDetail,
  type StudyHistoryEvent,
  type StudyHistoryFilters,
  type StudyHistoryPage
} from '@/lib/study-history';

const field = 'min-w-0 rounded border border-border bg-bg-raised px-3 py-2 text-sm';
const empty: StudyHistoryPage = { items: [], total: 0, offset: 0, limit: 25, has_more: false };
function displayDate(value: string | null, timeZone: string): string {
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone
      }).format(date)
    : 'Date not recorded';
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function StudyHistoryBrowser({ revision = 0 }: { revision?: number }) {
  const { userId, profile } = useAuth();
  const [filters, setFilters] = useState<StudyHistoryFilters>({});
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<StudyHistoryEvent | null>(null);
  const [detail, setDetail] = useState<StudyHistoryDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [retry, setRetry] = useState(0);
  const timeZone = profile?.timezone || 'Asia/Kolkata';
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listStudyHistory({ ...filters, limit: 25 })
      .then((value) => {
        if (active) setPage(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Study history could not load.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, userId, revision, retry]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError('');
    void getStudyHistoryEvent(selected.collection, selected.record_id)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setDetailError(cause instanceof Error ? cause.message : 'The source could not load.');
      });
    return () => {
      active = false;
    };
  }, [selected, userId, retry]);
  const evidence = detail?.evidence ?? {};
  const snapshot =
    evidence.question_snapshot && typeof evidence.question_snapshot === 'object'
      ? (evidence.question_snapshot as Record<string, unknown>)
      : {};
  const contextActive = Boolean(filters.question_uid || filters.session_id);

  return (
    <section className="space-y-4" aria-label="Connected study history">
      <div className="max-w-prose space-y-1">
        <h2 className="font-display text-xl font-semibold">Your study, connected</h2>
        <p className="text-sm text-text-muted">
          Browse attempts, notes, concepts, and follow-ups in their original records. Open a
          question or session to follow its history.
        </p>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((old) => ({ ...old, q: search, subject, topic, offset: 0 }));
        }}
      >
        <input
          className={field}
          aria-label="Search connected study history"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search saved reasoning, questions, formulas, and concepts"
        />
        <Button type="submit">Search history</Button>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
          <select
            aria-label="Study history source"
            className={field}
            value={filters.collection || ''}
            onChange={(event) =>
              setFilters((old) => ({ ...old, collection: event.target.value, offset: 0 }))
            }
          >
            <option value="">All sources</option>
            {HISTORY_COLLECTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            className={field}
            aria-label="Study history subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject (optional)"
          />
          <input
            className={field}
            aria-label="Study history topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Topic (optional)"
          />
        </div>
      </form>
      {contextActive && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-accent/30 bg-accent-faint p-3 text-sm">
          <p>
            {filters.question_uid
              ? 'Showing records connected to this question.'
              : 'Showing records connected to this session.'}
          </p>
          <Button
            size="sm"
            onClick={() => {
              setFilters({});
              setSearch('');
              setSubject('');
              setTopic('');
            }}
          >
            Show all history
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}{' '}
          <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
            Retry history
          </Button>
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="min-w-0">
          <p role="status" className="mb-2 text-xs text-text-muted">
            {loading ? 'Loading saved study history…' : `${page.total} source records`}
          </p>
          <ol className="divide-y divide-border border-y border-border">
            {page.items.map((item) => (
              <li key={item.id}>
                <button
                  className={`w-full rounded p-3 text-left ${selected?.id === item.id ? 'bg-accent-faint' : 'hover:bg-bg-overlay'}`}
                  onClick={() => setSelected(item)}
                  aria-pressed={selected?.id === item.id}
                >
                  <span className="block text-xs text-text-muted">
                    {studyHistoryLabel(item.collection)} · {displayDate(item.occurred_at, timeZone)}
                  </span>
                  <span className="mt-1 block font-semibold">{item.title}</span>
                  {item.subject && (
                    <span className="mt-1 block text-xs text-text-muted">
                      {item.subject}
                      {item.topic ? ` · ${item.topic}` : ''}
                    </span>
                  )}
                  {item.excerpt && (
                    <span className="mt-2 block line-clamp-3 text-sm text-text-muted">
                      {item.excerpt}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          {!loading && !page.items.length && !error && (
            <p className="py-6 text-sm text-text-muted">
              No records match these filters. Try a broader search or start a question set.
            </p>
          )}
          <div className="mt-3 flex justify-between">
            <Button
              size="sm"
              disabled={loading || !(filters.offset || 0)}
              onClick={() =>
                setFilters((old) => ({ ...old, offset: Math.max(0, (old.offset || 0) - 25) }))
              }
            >
              Previous history
            </Button>
            <Button
              size="sm"
              disabled={loading || !page.has_more}
              onClick={() => setFilters((old) => ({ ...old, offset: (old.offset || 0) + 25 }))}
            >
              Next history
            </Button>
          </div>
        </div>
        <article
          aria-label="Selected history record"
          className="min-w-0 space-y-4 rounded-lg border border-border bg-bg-raised p-4 sm:p-5"
        >
          {!selected ? (
            <p className="max-w-prose py-6 text-sm leading-relaxed text-text-muted">
              Select a record to inspect its source and connected memory. A saved note or completed
              activity does not by itself establish mastery.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs text-text-muted">{studyHistoryLabel(selected.collection)}</p>
                <h3 className="mt-1 font-display text-xl font-semibold">{selected.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.href && (
                  <Link className="text-sm font-medium text-accent underline" to={selected.href}>
                    Open original record
                  </Link>
                )}
                {selected.question_uid && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilters({ question_uid: selected.question_uid!, offset: 0 });
                      setSearch('');
                      setSubject('');
                      setTopic('');
                    }}
                  >
                    Follow this question
                  </Button>
                )}
                {selected.session_id && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilters({ session_id: selected.session_id!, offset: 0 });
                      setSearch('');
                      setSubject('');
                      setTopic('');
                    }}
                  >
                    Follow this session
                  </Button>
                )}
              </div>
              {detailError ? (
                <p role="alert" className="text-sm text-danger">
                  {detailError}
                  <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
                    Retry source
                  </Button>
                </p>
              ) : !detail ? (
                <p role="status" className="text-sm text-text-muted">
                  Loading original evidence…
                </p>
              ) : (
                <>
                  {text(snapshot.html) && <PyqQuestionContent html={text(snapshot.html)} />}
                  {(text(evidence.content) ||
                    text(evidence.full_explanation) ||
                    text(evidence.capture_note)) && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {text(evidence.content) ||
                        text(evidence.full_explanation) ||
                        text(evidence.capture_note)}
                    </p>
                  )}
                  {detail.event.excerpt && !text(snapshot.html) && !text(evidence.content) && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {detail.event.excerpt}
                    </p>
                  )}
                  {detail.linked_memory.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold">Connected learning memory</h4>
                      <ul className="mt-2 space-y-2">
                        {detail.linked_memory.map((item) => (
                          <li key={item.id}>
                            {item.href ? (
                              <Link className="text-sm text-accent underline" to={item.href}>
                                {item.title}
                              </Link>
                            ) : (
                              <span className="text-sm">{item.title}</span>
                            )}
                            <p className="text-xs text-text-muted">
                              {item.state || 'Recorded'}
                              {item.excerpt ? ` · ${item.excerpt}` : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.sources.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold">Source evidence</h4>
                      <ul className="mt-2 space-y-2">
                        {detail.sources.map((item) => (
                          <li key={item.id}>
                            <button
                              className="text-left text-sm text-accent underline"
                              onClick={() => setSelected(item)}
                            >
                              {item.title}
                            </button>
                            <p className="text-xs text-text-muted">
                              {studyHistoryLabel(item.collection)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(detail.related_truncated || detail.evidence_truncated) && (
                    <p className="text-xs text-text-muted">
                      This preview is bounded. Open the original record or follow its
                      question/session for more evidence.
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm text-text-muted">
                      Inspect recorded evidence
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-3 text-xs">
                      {JSON.stringify(detail.evidence, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
