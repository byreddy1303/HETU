import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Browser as CapacitorBrowser } from '@capacitor/browser';
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Search,
  X
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  flushAccountDocumentWrites,
  loadAccountDocument,
  normalizeReferenceProgress,
  queueAccountDocumentWrite
} from '@/lib/account-documents';
import { isNativeApp } from '@/lib/native';
import { subjectInk } from '@/lib/subjectInk';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import notesManifest from '@/data/topper-notes.json';

interface TopperNote {
  id: string;
  subject: Subject;
  sequence: number;
  title: string;
  description: string;
  author: string;
  credential: string;
  pages: number;
  bytes: number;
  href: string;
}

interface NotesProgress {
  revisedIds: string[];
  lastOpenedId: string | null;
}

const SUBJECTS = ['Discrete Mathematics', 'Digital Logic', 'Engineering Mathematics'] as const;
type Subject = (typeof SUBJECTS)[number];
type SubjectFilter = 'All subjects' | Subject;

const notes = notesManifest as TopperNote[];
const NOTE_IDS = new Set(notes.map((note) => note.id));
const EMPTY_PROGRESS: NotesProgress = { revisedIds: [], lastOpenedId: null };
const configuredAppOrigin = import.meta.env.VITE_APP_URL as string | undefined;
const NOTES_ORIGIN = (
  configuredAppOrigin &&
  !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(configuredAppOrigin)
    ? configuredAppOrigin
    : 'https://hetu-app.vercel.app'
).replace(/\/$/, '');

const SUBJECT_COPY: Record<Subject, { short: string; hint: string }> = {
  'Discrete Mathematics': {
    short: 'DM',
    hint: 'Logic → functions → counting → graphs'
  },
  'Digital Logic': {
    short: 'DL',
    hint: 'Boolean foundations → circuits → state'
  },
  'Engineering Mathematics': {
    short: 'EM',
    hint: 'Reference pass → linear algebra sequence'
  }
};

function progressKey(userId: string | null): string {
  return `air.topper-notes.${userId ?? 'local'}`;
}

function readProgress(userId: string | null): NotesProgress {
  try {
    return normalizeReferenceProgress(
      JSON.parse(localStorage.getItem(progressKey(userId)) ?? 'null'),
      NOTE_IDS
    );
  } catch {
    return EMPTY_PROGRESS;
  }
}

function hasStoredProgress(userId: string): boolean {
  try {
    return localStorage.getItem(progressKey(userId)) !== null;
  } catch {
    return false;
  }
}

function cacheProgress(userId: string | null, progress: NotesProgress): void {
  try {
    localStorage.setItem(progressKey(userId), JSON.stringify(progress));
  } catch {
    // The visible React state and the durable writer still retain the edit.
  }
}

function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Topper Notes database sync failed.';
}

function assetHref(href: string): string {
  return isNativeApp ? `${NOTES_ORIGIN}${href}` : href;
}

function openHostedAsset(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!isNativeApp) return;
  event.preventDefault();
  const url = assetHref(href);
  void CapacitorBrowser.open({ url }).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default function TopperNotes() {
  const { userId, sandbox } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SubjectFilter>('All subjects');
  const [progress, setProgress] = useState<NotesProgress>(() => readProgress(userId));
  const progressRef = useRef(progress);
  const syncErrorShownRef = useRef(false);

  const reportSyncResult = useCallback(
    (error: string | null) => {
      if (error && !syncErrorShownRef.current) {
        syncErrorShownRef.current = true;
        pushToast('Topper Notes are cached here; database sync will retry when online.', 'neutral');
      } else if (!error) {
        syncErrorShownRef.current = false;
      }
    },
    [pushToast]
  );

  useEffect(() => {
    const localProgress = readProgress(userId);
    progressRef.current = localProgress;
    setProgress(localProgress);

    // The development sandbox intentionally stays device-local. Real accounts
    // hydrate from Supabase; the old key is supplied only as a one-time legacy
    // migration when the database has no document yet.
    if (!userId || sandbox) return;
    let active = true;
    const legacyData = hasStoredProgress(userId) ? localProgress : null;

    void loadAccountDocument(userId, 'topper_notes', {
      normalize: (value) => normalizeReferenceProgress(value, NOTE_IDS),
      legacyData
    })
      .then((result) => {
        if (!active) return;
        const next = result.data ?? EMPTY_PROGRESS;
        progressRef.current = next;
        setProgress(next);
        if (result.data) cacheProgress(userId, next);
        reportSyncResult(result.error);
      })
      .catch((error) => {
        if (active) reportSyncResult(syncErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, [reportSyncResult, sandbox, userId]);

  useEffect(() => {
    if (!userId || sandbox) return;
    const retry = () => {
      void flushAccountDocumentWrites(userId)
        .then(reportSyncResult)
        .catch((error) => reportSyncResult(syncErrorMessage(error)));
    };

    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
    };
  }, [reportSyncResult, sandbox, userId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleNotes = useMemo(
    () =>
      notes.filter((note) => {
        if (filter !== 'All subjects' && note.subject !== filter) return false;
        if (!normalizedQuery) return true;
        return [note.title, note.description, note.subject, note.author, note.credential].some(
          (value) => value.toLocaleLowerCase().includes(normalizedQuery)
        );
      }),
    [filter, normalizedQuery]
  );

  const visibleSubjects = SUBJECTS.map((subject) => ({
    subject,
    notes: visibleNotes.filter((note) => note.subject === subject)
  })).filter((group) => group.notes.length > 0);
  const totalPages = notes.reduce((sum, note) => sum + note.pages, 0);
  const revisedCount = progress.revisedIds.filter((id) =>
    notes.some((note) => note.id === id)
  ).length;
  const lastOpened = notes.find((note) => note.id === progress.lastOpenedId) ?? null;

  function saveProgress(update: (current: NotesProgress) => NotesProgress) {
    const next = normalizeReferenceProgress(update(progressRef.current), NOTE_IDS);
    progressRef.current = next;
    setProgress(next);
    cacheProgress(userId, next);

    if (!userId || sandbox) return;
    try {
      void queueAccountDocumentWrite(userId, 'topper_notes', next)
        .then(reportSyncResult)
        .catch((error) => reportSyncResult(syncErrorMessage(error)));
    } catch (error) {
      reportSyncResult(syncErrorMessage(error));
    }
  }

  function rememberOpened(noteId: string) {
    saveProgress((current) => ({ ...current, lastOpenedId: noteId }));
  }

  function toggleRevised(noteId: string) {
    saveProgress((current) => ({
      ...current,
      revisedIds: current.revisedIds.includes(noteId)
        ? current.revisedIds.filter((id) => id !== noteId)
        : [...current.revisedIds, noteId]
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GATE Topper Notes"
        description="Follow complete handwritten notes in their intended order, then mark each notebook when you have revised it."
      />

      <section className="topper-notes-hero relative grid overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <div className="relative z-10 px-5 py-6 sm:px-6 sm:py-8">
          <p className="u-label text-accent">The topper archive</p>
          <h2 className="mt-3 max-w-[680px] font-display text-[32px] font-bold leading-[1.04] tracking-[-0.035em] text-text sm:text-[42px]">
            Read the route.
            <span className="block text-accent">Revise the reasoning.</span>
          </h2>
          <p className="mt-4 max-w-[620px] text-[13.5px] leading-relaxed text-text-muted sm:text-[14.5px]">
            Real GATE notes from Karan Agrawal (AIR 102) and Mahek Garala (AIR 75), arranged as a
            clean subject-wise reading path with every source credited.
          </p>
          <dl className="mt-6 grid max-w-[560px] grid-cols-3 divide-x divide-border border-y border-border/80 py-3">
            <Stat value={notes.length} label="notebooks" />
            <Stat value={totalPages} label="pages" />
            <Stat value={SUBJECTS.length} label="subjects" />
          </dl>
        </div>

        <div className="relative z-10 border-t border-border bg-bg-overlay/45 px-5 py-5 lg:border-l lg:border-t-0 lg:px-6 lg:py-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="u-label">Your revision index</p>
              <p className="mt-1 text-[12px] text-text-faint">
                {sandbox ? 'Saved on this device (sandbox)' : 'Saved to your account database'}
              </p>
            </div>
            <span className="u-num text-[13px] font-semibold text-text">
              {revisedCount}/{notes.length}
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            {SUBJECTS.map((subject) => {
              const subjectNotes = notes.filter((note) => note.subject === subject);
              const subjectDone = subjectNotes.filter((note) =>
                progress.revisedIds.includes(note.id)
              ).length;
              const ink = subjectInk(subject);
              return (
                <button
                  key={subject}
                  type="button"
                  onClick={() => {
                    setFilter(subject);
                    setQuery('');
                  }}
                  className="topper-subject-tab group flex w-full items-center gap-3 rounded border border-border bg-bg-raised px-3 py-2.5 text-left shadow-sm transition-[transform,border-color] hover:translate-x-1 hover:border-border-hover"
                >
                  <span
                    className={cn(
                      'u-num flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold text-bg-raised',
                      ink.dot
                    )}
                  >
                    {SUBJECT_COPY[subject].short}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text">
                      {subject}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-bg-overlay">
                      <span
                        className={cn('block h-full rounded-full transition-[width]', ink.dot)}
                        style={{ width: `${(subjectDone / subjectNotes.length) * 100}%` }}
                      />
                    </span>
                  </span>
                  <span className="u-num text-[10px] text-text-faint">
                    {subjectDone}/{subjectNotes.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {lastOpened && (
        <a
          href={assetHref(lastOpened.href)}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            rememberOpened(lastOpened.id);
            openHostedAsset(event, lastOpened.href);
          }}
          className="group flex flex-wrap items-center gap-3 rounded border border-accent/20 bg-accent-faint px-4 py-3 text-[13px] transition-colors hover:border-accent/40"
        >
          <BookOpen size={17} className="shrink-0 text-accent" strokeWidth={1.8} />
          <span className="min-w-0 flex-1">
            <span className="u-label text-accent">Continue reading</span>
            <span className="ml-2 font-semibold text-text">{lastOpened.title}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-accent">
            Open again{' '}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </a>
      )}

      <section
        className="rounded-lg border border-border bg-bg-raised p-3 shadow-sm"
        aria-label="Find notes"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              size={16}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a topic, topper, or subject…"
              aria-label="Search topper notes"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-faint hover:bg-bg-overlay hover:text-text"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="flex gap-1 overflow-x-auto pb-0.5" aria-label="Filter subjects">
            {(['All subjects', ...SUBJECTS] as SubjectFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3 text-[11.5px] font-semibold transition-colors',
                  filter === item
                    ? 'bg-text text-bg-raised'
                    : 'bg-bg-overlay text-text-muted hover:text-text'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 px-0.5 text-[11px] text-text-faint">
          Showing {plural(visibleNotes.length, 'notebook')} ·{' '}
          {plural(
            visibleNotes.reduce((sum, note) => sum + note.pages, 0),
            'page'
          )}
        </p>
      </section>

      {visibleNotes.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-bg-raised px-5 py-12 text-center">
          <p className="font-display text-lg font-semibold text-text">
            No notes match that search.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('All subjects');
            }}
            className="mt-2 text-[13px] font-semibold text-accent hover:underline"
          >
            Show the full archive
          </button>
        </section>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleSubjects.map(({ subject, notes: subjectNotes }) => (
            <SubjectShelf
              key={subject}
              subject={subject}
              notes={subjectNotes}
              revisedIds={progress.revisedIds}
              showLab={subject === 'Engineering Mathematics' && !normalizedQuery}
              onOpen={rememberOpened}
              onToggleRevised={toggleRevised}
            />
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-text-faint">
        Notes are shared for personal study. Creator credits remain visible in every notebook. Large
        scans are delivery-optimised without changing their pages or content.
      </p>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-3 first:pl-0">
      <dt className="u-num text-[18px] font-bold text-text sm:text-[21px]">{value}</dt>
      <dd className="u-label mt-0.5">{label}</dd>
    </div>
  );
}

function SubjectShelf({
  subject,
  notes: subjectNotes,
  revisedIds,
  showLab,
  onOpen,
  onToggleRevised
}: {
  subject: Subject;
  notes: TopperNote[];
  revisedIds: string[];
  showLab: boolean;
  onOpen: (noteId: string) => void;
  onToggleRevised: (noteId: string) => void;
}) {
  const ink = subjectInk(subject);
  const revised = subjectNotes.filter((note) => revisedIds.includes(note.id)).length;

  return (
    <section aria-labelledby={`topper-notes-${SUBJECT_COPY[subject].short}`}>
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className={cn('h-8 w-1 rounded-full', ink.dot)} />
          <div>
            <h2
              id={`topper-notes-${SUBJECT_COPY[subject].short}`}
              className="font-display text-[18px] font-bold leading-tight text-text"
            >
              {subject}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-text-faint">{SUBJECT_COPY[subject].hint}</p>
          </div>
        </div>
        <span className="u-num text-[10px] text-text-faint">
          {revised}/{subjectNotes.length} revised
        </span>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-raised shadow-sm">
        {showLab && <LinearAlgebraLab />}
        <ol className="divide-y divide-border">
          {subjectNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              revised={revisedIds.includes(note.id)}
              onOpen={() => onOpen(note.id)}
              onToggleRevised={() => onToggleRevised(note.id)}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function LinearAlgebraLab() {
  return (
    <div className="grid gap-4 border-b border-border bg-ink-cobalt/10 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span className="flex h-10 w-10 items-center justify-center rounded bg-ink-cobalt text-bg-raised shadow-sm">
        <FlaskConical size={19} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-[15px] font-bold text-text">Linear Algebra Mastery Lab</p>
          <span className="rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-cobalt">
            interactive
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
          8 concept modules, 351 practice questions, a cheat sheet, mock test and theorems vault.
        </p>
      </div>
      <a
        href={assetHref('/gate-topper-notes/linear-algebra-lab/index.html')}
        target="_blank"
        rel="noreferrer"
        onClick={(event) =>
          openHostedAsset(event, '/gate-topper-notes/linear-algebra-lab/index.html')
        }
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-ink-cobalt px-3 text-[12px] font-semibold text-bg-raised shadow-sm transition-transform hover:-translate-y-px"
      >
        Launch lab <ExternalLink size={13} />
      </a>
    </div>
  );
}

function NoteRow({
  note,
  revised,
  onOpen,
  onToggleRevised
}: {
  note: TopperNote;
  revised: boolean;
  onOpen: () => void;
  onToggleRevised: () => void;
}) {
  const ink = subjectInk(note.subject);

  return (
    <li className="group grid gap-3 px-4 py-3 transition-colors hover:bg-bg-overlay/30 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
      <span
        className={cn(
          'u-num flex h-10 w-10 items-center justify-center rounded-sm border bg-bg text-[11px] font-bold',
          ink.selected
        )}
        aria-hidden="true"
      >
        {String(note.sequence).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-[14.5px] font-bold text-text">{note.title}</h3>
          {revised && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-faint px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-success">
              <Check size={10} strokeWidth={2.4} /> revised
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">{note.description}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-text-faint">
          <span className="inline-flex items-center gap-1">
            <FileText size={11} /> {plural(note.pages, 'page')} · {formatBytes(note.bytes)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {note.author} · {note.credential}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1.5 sm:justify-end">
        <button
          type="button"
          aria-pressed={revised}
          onClick={onToggleRevised}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[11.5px] font-semibold transition-colors',
            revised
              ? 'bg-success-faint text-success hover:bg-success-faint/70'
              : 'text-text-faint hover:bg-bg-overlay hover:text-text'
          )}
        >
          <Check size={13} strokeWidth={2} />
          <span className="sm:hidden lg:inline">{revised ? 'Revised' : 'Mark revised'}</span>
        </button>
        <a
          href={assetHref(note.href)}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            onOpen();
            openHostedAsset(event, note.href);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded bg-text px-3 text-[11.5px] font-semibold text-bg-raised transition-transform hover:-translate-y-px"
        >
          Open <ExternalLink size={12} />
        </a>
        <a
          href={assetHref(note.href)}
          download
          onClick={(event) => openHostedAsset(event, note.href)}
          aria-label={`Download ${note.title}`}
          title={`Download ${note.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-text-faint transition-colors hover:border-border-hover hover:text-text"
        >
          <Download size={13} />
        </a>
      </div>
    </li>
  );
}
