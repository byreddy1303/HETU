import { useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronDown,
  Layers3,
  MoreHorizontal,
  Pause
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PyqBookManifest, PyqManifest } from '@/lib/pyq';
import { pyqExamRemainingSeconds } from '@/lib/pyq-exam';
import type { PyqSessionRow } from '@/types';
import { secondsToClock, todayISOInTimeZone } from '@/lib/utils';
import { FRESH_PRACTICE_DAYS, isFreshPractice } from '@/lib/today-actions';

export type PyqLibraryTab = 'pyqs' | 'series' | 'history';

export function PyqLibraryTabs({
  value,
  onChange
}: {
  value: PyqLibraryTab;
  onChange: (value: PyqLibraryTab) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const items = [
    { value: 'pyqs', label: 'PYQs', icon: BookOpen },
    { value: 'series', label: 'Test Series', icon: Layers3 },
    { value: 'history', label: 'History', icon: Bookmark }
  ] as const;
  return (
    <div className="practice-library-tabs" role="tablist" aria-label="Practice library">
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          id={`practice-tab-${item.value}`}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={`practice-panel-${item.value}`}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % items.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else return;
            event.preventDefault();
            buttons.current[next]?.focus();
            onChange(items[next].value);
          }}
        >
          <item.icon size={16} aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function practiceElapsed(session: PyqSessionRow) {
  const drafts = { ...session.config.practiceDrafts };
  if (session.config.practiceDraft)
    drafts[session.config.practiceDraft.question_uid] = session.config.practiceDraft;
  return (
    session.elapsed_sec +
    Math.ceil(
      Object.values(drafts).reduce((sum, draft) => sum + Math.max(0, draft.elapsed_ms), 0) / 1000
    )
  );
}

export function PyqSessionShelf({
  manifest,
  activeSession,
  savedSessions,
  loading,
  onResume,
  onSave,
  onEndAndSave,
  onEndStale,
  onDiscard
}: {
  manifest: PyqManifest;
  activeSession: PyqSessionRow | null;
  savedSessions: PyqSessionRow[];
  loading: boolean;
  onResume: (session: PyqSessionRow) => void;
  onSave: (session: PyqSessionRow) => void;
  onEndAndSave: (session: PyqSessionRow) => void;
  onEndStale?: (sessions: PyqSessionRow[]) => void;
  onDiscard: (session: PyqSessionRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const sessions = activeSession
    ? [activeSession, ...savedSessions.filter((session) => session.id !== activeSession.id)]
    : savedSessions;
  if (!sessions.length) return null;
  const today = todayISOInTimeZone();
  const stale = savedSessions.filter(
    (session) =>
      session.status === 'paused' &&
      session.config.mode !== 'exam' &&
      session.id !== activeSession?.id &&
      !isFreshPractice(session, today)
  );
  return (
    <section className="practice-continue" aria-label="Saved sessions">
      <div className="practice-continue__heading">
        <span>{activeSession ? 'Session in progress' : 'Paused sessions'}</span>
        {sessions.length > 1 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : `${savedSessions.length} paused`}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {stale.length > 0 && onEndStale ? (
        <p className="mb-2 text-[12px] leading-relaxed text-text-muted">
          {stale.length} paused {stale.length === 1 ? 'set is' : 'sets are'} more than{' '}
          {FRESH_PRACTICE_DAYS} days old, so Today shows your due re-attempts first.{' '}
          <button
            type="button"
            disabled={loading}
            onClick={() => onEndStale(stale)}
            className="font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
          >
            End and save {stale.length === 1 ? 'it' : `all ${stale.length}`}
          </button>
          . Answers you submitted are kept.
        </p>
      ) : null}
      <div id={listId}>
        {(expanded ? sessions : sessions.slice(0, 1)).map((session) => {
          const isActive = session.id === activeSession?.id;
          const isExam = session.config.mode === 'exam';
          const book = manifest.books.find((item) => item.slug === session.config.bookSlug);
          const subject =
            book?.sourceClass === 'user-import'
              ? book.label
              : session.config.subjectSlug === 'all'
                ? session.config.subjectSlugs
                    ?.map(
                      (slug) => manifest.subjects.find((item) => item.slug === slug)?.label ?? slug
                    )
                    .join(' + ') || 'Mixed subjects'
                : (manifest.subjects.find((item) => item.slug === session.config.subjectSlug)
                    ?.label ?? session.config.subjectSlug);
          return (
            <div key={session.id} className="practice-continue__row">
              <span className="practice-library-icon" data-tone={isExam ? 'rose' : 'violet'}>
                <Bookmark size={18} aria-hidden="true" />
              </span>
              <div className="practice-continue__copy">
                <h2>{subject}</h2>
                <p>
                  {session.completed_count} / {session.question_uids.length}{' '}
                  {isExam ? 'answered' : 'done'} ·{' '}
                  {isExam && session.config.examState
                    ? `${secondsToClock(pyqExamRemainingSeconds(session))} left`
                    : `${secondsToClock(practiceElapsed(session))} active work saved`}
                </p>
              </div>
              <Button onClick={() => onResume(session)} disabled={loading} size="sm">
                {isExam ? 'Resume exam' : 'Resume practice'}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
              <details
                className="practice-session-actions"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    event.currentTarget.open = false;
                }}
              >
                <summary aria-label={`Session actions for ${subject}`}>
                  <MoreHorizontal size={18} aria-hidden="true" />
                </summary>
                <div>
                  {isActive ? (
                    <Button size="sm" onClick={() => onSave(session)} disabled={loading}>
                      <Pause size={14} />
                      {isExam ? 'Pause exam' : 'Pause practice'}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onEndAndSave(session)} disabled={loading}>
                      End and save
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onDiscard(session)}
                    disabled={loading}
                  >
                    Discard session
                  </Button>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function bookTitle(book: PyqBookManifest) {
  // Remove only an exact redundant subject prefix; preserve distinct test names.
  const subject = book.subjects.length === 1 ? book.subjects[0].label : '';
  return subject && book.label.startsWith(`${subject} → `)
    ? book.label.slice(subject.length + 3)
    : book.label;
}

export function PyqTestSeriesLibrary({
  books,
  loading,
  onStart
}: {
  books: PyqBookManifest[];
  loading: boolean;
  onStart: (slug: string) => void;
}) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = books.find((book) => book.slug === selectedSlug);
  const openers = useRef(new Map<string, HTMLButtonElement>());
  const groups = new Map<string, PyqBookManifest[]>();
  for (const book of books) {
    const subject = book.subjects.map((item) => item.label).join(' + ') || 'Other sets';
    groups.set(subject, [...(groups.get(subject) ?? []), book]);
  }
  if (selected)
    return (
      <div className="practice-series-detail">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedSlug(null);
            requestAnimationFrame(() => openers.current.get(selected.slug)?.focus());
          }}
        >
          <ArrowLeft size={15} />
          All test sets
        </Button>
        <section
          className="practice-library-surface practice-series-detail__card"
          aria-labelledby="practice-series-title"
        >
          <span className="practice-library-icon" data-tone="teal">
            <Layers3 size={22} aria-hidden="true" />
          </span>
          <p className="practice-library-eyebrow">
            {selected.subjects.map((subject) => subject.label).join(' + ')}
          </p>
          <h2 id="practice-series-title" ref={heading} tabIndex={-1}>
            {bookTitle(selected)}
          </h2>
          <p className="practice-library-muted">
            {selected.count} questions · Feedback after each answer
          </p>
          <p className="practice-library-muted text-[12px]">
            Answer keys stay hidden until you commit a response.
          </p>
          <div className="practice-library-launch">
            <span className="practice-library-muted text-[12px]">Source-provided answer key</span>
            <Button
              variant="primary"
              disabled={loading}
              onClick={() => onStart(selected.slug)}
              aria-label={`Practice ${selected.label}`}
            >
              {loading ? 'Opening test set…' : 'Start practice'}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </section>
      </div>
    );
  return (
    <div className="practice-series-library">
      {Array.from(groups, ([subject, sets]) => (
        <section key={subject} aria-label={subject} className="practice-series-group">
          <div className="practice-library-section-title">
            <h2>{subject}</h2>
            <span>
              {sets.length} {sets.length === 1 ? 'set' : 'sets'} ·{' '}
              {sets.reduce((sum, book) => sum + book.count, 0)} questions
            </span>
          </div>
          <div className="practice-library-surface">
            {sets.map((book, index) => (
              <div
                className="practice-series-row"
                data-tone={index % 2 ? 'rose' : 'teal'}
                key={book.slug}
              >
                <span className="practice-library-icon" data-tone={index % 2 ? 'rose' : 'teal'}>
                  <Layers3 size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3>{bookTitle(book)}</h3>
                  <p>{book.count} questions</p>
                </div>
                <Button
                  size="sm"
                  disabled={loading}
                  ref={(element) => {
                    if (element) openers.current.set(book.slug, element);
                    else openers.current.delete(book.slug);
                  }}
                  aria-label={`Open ${book.label}`}
                  onClick={() => {
                    setSelectedSlug(book.slug);
                    requestAnimationFrame(() => heading.current?.focus());
                  }}
                >
                  Open set
                  <ArrowRight size={14} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!books.length && (
        <div className="practice-library-empty">
          <Layers3 size={26} aria-hidden="true" />
          <h2>Your test sets will appear here</h2>
          <p>Imported question sets are grouped by subject and topic.</p>
        </div>
      )}
      {books.length > 0 && (
        <p className="practice-library-muted text-[12px]">
          Local question sets · Source-provided answer keys
        </p>
      )}
    </div>
  );
}
