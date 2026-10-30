import MathText from '@/components/shared/MathText';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/fastapi-client';
import {
  getMemoryEntry,
  getMemoryRepairData,
  MEMORY_ACTIVITIES,
  listMemoryEntries,
  MEMORY_KINDS,
  newMemoryEntry,
  type MemoryKind,
  type StudyMemoryEntry
} from '@/lib/study-memory';
import { todayISOInTimeZone, uuid } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import MemoryEntryEditor from '@/components/memory/MemoryEntryEditor';
import StudyHistoryBrowser from '@/components/memory/StudyHistoryBrowser';
import LocalLearningEngine from '@/components/memory/LocalLearningEngine';
import { backendConfig } from '@/lib/backend-config';

type MemoryView = 'history' | 'followups' | 'records';
const memoryView = (value: string | null): MemoryView =>
  value === 'records' || value === 'followups' ? value : 'history';

export default function LearningMemory() {
  const { entryId } = useParams();
  const [searchParams] = useSearchParams();
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
  const [view, setView] = useState<MemoryView>(
    entryId ? 'records' : memoryView(searchParams.get('view'))
  );
  useEffect(() => {
    if (!entryId) setView(memoryView(searchParams.get('view')));
  }, [entryId, searchParams]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (view !== 'records') return;
    let active = true;
    setLoading(true);
    setError('');
    void listMemoryEntries({
      q: search,
      kind: kind || undefined,
      state: state ? (state as StudyMemoryEntry['state']) : undefined,
      limit: 25,
      offset
    })
      .then((page) => {
        if (active) {
          setItems(page.items);
          setTotal(page.total);
          setMore(page.has_more);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Memory could not load.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, kind, state, offset, revision, userId, view]);

  useEffect(() => {
    if (!entryId) return;
    setView('records');
    let active = true;
    setSelected(null);
    void getMemoryEntry(entryId)
      .then((result) => {
        if (active) setSelected(result.entry);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Record could not load.');
      });
    return () => {
      active = false;
    };
  }, [entryId, userId]);

  function create(nextKind: MemoryKind) {
    setView('records');
    const id = uuid();
    setSelected(
      newMemoryEntry(
        nextKind,
        id,
        nextKind === 'concept'
          ? 'New concept'
          : nextKind === 'repair'
            ? 'Focused repair'
            : nextKind === 'profile'
              ? 'My learning context'
              : 'Open learning question',
        {
          user_id: userId || '',
          state: 'open',
          data:
            nextKind === 'repair'
              ? {
                  activity: 'concept-repair',
                  due_date: todayISOInTimeZone(profile?.timezone),
                  duration_min: 20,
                  requested_count: 3,
                  question_uids: []
                }
              : {}
        }
      )
    );
    navigate('/memory?view=records');
  }

  async function download() {
    try {
      const value = await apiRequest<unknown>('/v1/study-memory/export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `hetu-learning-memory-${todayISOInTimeZone(profile?.timezone)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export could not finish.');
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        compact={backendConfig.isLocal}
        title="Learning Memory"
        description="Find your past work, continue a follow-up, or open a saved record."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <nav aria-label="Memory views" className="flex min-w-0 flex-wrap gap-1">
          {(
            [
              ['history', 'Study history'],
              ...(backendConfig.isLocal ? [['followups', 'Practice follow-ups']] : []),
              ['records', 'Saved records']
            ] as [MemoryView, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                navigate(value === 'history' ? '/memory' : `/memory?view=${value}`);
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-sm ${view === value ? 'bg-accent-faint font-semibold text-accent' : 'text-text-muted hover:bg-bg-overlay'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <details className="relative">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2 text-sm font-medium">
            <Plus size={15} aria-hidden /> Add record <ChevronDown size={14} aria-hidden />
          </summary>
          <div className="absolute right-0 z-20 mt-2 grid w-64 gap-1 rounded-lg border border-border bg-bg-raised p-2 shadow-lg">
            {(
              [
                ['concept', 'Add concept'],
                ['finding', 'Record finding or open question'],
                ['repair', 'Create repair'],
                ['profile', 'Record learning context']
              ] as [MemoryKind, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="rounded px-3 py-2 text-left text-sm hover:bg-bg-overlay"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  create(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger"
        >
          {error}{' '}
          <Button size="sm" onClick={refresh}>
            Retry
          </Button>
        </p>
      )}
      {view === 'followups' ? (
        <LocalLearningEngine onChanged={refresh} />
      ) : view === 'history' ? (
        <StudyHistoryBrowser revision={revision} />
      ) : (
        <div
          className={`grid gap-5 ${checkingConcept ? '' : 'lg:grid-cols-[minmax(250px,340px)_minmax(0,1fr)]'}`}
        >
          <aside
            hidden={checkingConcept}
            className="min-w-0 space-y-3 rounded-lg border border-border bg-bg-raised p-4"
          >
            <h2 className="font-display text-lg font-semibold">Saved records</h2>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setOffset(0);
                setSearch(query);
              }}
            >
              <input
                aria-label="Search all learning memory"
                className="min-w-0 flex-1 rounded border border-border bg-bg-raised px-3 py-2 text-sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reasoning, concepts, or notes"
              />
              <Button type="submit" size="sm">
                Search
              </Button>
            </form>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Memory record type"
                className="rounded border border-border bg-bg-raised p-2 text-sm"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as MemoryKind | '');
                  setOffset(0);
                }}
              >
                <option value="">All records</option>
                {MEMORY_KINDS.map((value) => (
                  <option value={value} key={value}>
                    {value.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <select
                aria-label="Memory record status"
                className="rounded border border-border bg-bg-raised p-2 text-sm"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="deferred">Deferred</option>
                <option value="completed">Completed activity</option>
                <option value="superseded">Superseded</option>
              </select>
            </div>
            <p role="status" className="text-xs text-text-muted">
              {loading ? 'Searching saved records…' : `${total} matching records`}
            </p>
            <ul className="divide-y divide-border border-y border-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    className={`block rounded px-3 py-3 ${selected?.id === item.id ? 'bg-accent-faint' : 'hover:bg-bg-overlay'}`}
                    to={`/memory/${item.id}`}
                  >
                    <span className="block text-sm font-semibold">
                      <MathText>
                        {item.kind === 'repair' && item.state !== 'completed'
                          ? `${item.topic || item.subject || 'Focused practice'}: ${MEMORY_ACTIVITIES.find((activity) => activity.id === getMemoryRepairData(item).activity)?.label || 'Practice'}`
                          : item.title}
                      </MathText>
                    </span>
                    <span className="mt-1 block text-xs text-text-muted">
                      {item.kind.replace('_', ' ')} · {item.subject || 'General'} · {item.state}
                    </span>
                    <span className="mt-1 block truncate text-xs text-text-muted">
                      <MathText>
                        {item.kind === 'repair' && item.state !== 'completed'
                          ? `${getMemoryRepairData(item).duration_min} minutes · Open the activity before reviewing earlier answers.`
                          : item.content || 'No written reflection yet'}
                      </MathText>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!loading && !items.length && !error && (
              <p className="text-sm leading-relaxed text-text-muted">
                Saved thinking will appear here as you review questions. You can also add a concept
                or an open question now.
              </p>
            )}
            <div className="flex justify-between">
              <Button
                size="sm"
                disabled={!offset || loading}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                Previous
              </Button>
              <Button size="sm" disabled={!more || loading} onClick={() => setOffset(offset + 25)}>
                Next
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
              <Link className="text-accent underline" to="/learning-library">
                Knowledge &amp; sources
              </Link>
              <button
                type="button"
                className="text-accent underline"
                onClick={() => void download()}
              >
                Export memory and evidence
              </button>
            </div>
          </aside>
          <section
            aria-label="Selected memory"
            className="min-w-0 rounded-lg border border-border bg-bg-raised p-4 sm:p-6"
          >
            {selected ? (
              <MemoryEntryEditor
                key={selected.id}
                initial={selected}
                onChanged={refresh}
                onCheckStateChange={setCheckingConcept}
              />
            ) : (
              <div className="max-w-prose space-y-3 py-8">
                <h2 className="font-display text-2xl font-semibold">Follow the evidence</h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  Open a record to see the original thinking, its context, corrections, and next
                  action. Recorded events, your assessments, and interpretations retain their
                  sources.
                </p>
                <p className="text-sm text-text-muted">
                  A completed activity is evidence of work done. Independent accuracy, delayed
                  recall, fresh application, and speed need separate checks.
                </p>
                <Link className="inline-block text-sm font-medium text-accent underline" to="/pyq">
                  Start question practice
                </Link>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
