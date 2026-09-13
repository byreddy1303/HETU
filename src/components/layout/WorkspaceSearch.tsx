import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useSessionStore } from '@/stores/session';

const SECTIONS = [
  { to: '/', label: 'Dashboard', group: 'Overview', keywords: 'home progress' },
  { to: '/today', label: 'Do now', group: 'Study', keywords: 'queue next due' },
  { to: '/pyq', label: 'PYQ practice', group: 'Study', keywords: 'questions previous year gate' },
  { to: '/session/new', label: 'Session', group: 'Study', keywords: 'start timer focus solve' },
  { to: '/log', label: 'Log', group: 'Study', keywords: 'record track practice' },
  { to: '/planner', label: 'Planner', group: 'Study', keywords: 'calendar schedule plan' },
  { to: '/capture', label: 'Quick capture', group: 'Study', keywords: 'camera scan question' },
  { to: '/mocks', label: 'Mock tests', group: 'Study', keywords: 'exam test practice' },
  { to: '/buddy', label: 'Buddy', group: 'Study', keywords: 'community friends study chat' },
  { to: '/journal', label: 'Journal', group: 'Reflect', keywords: 'history sessions notes' },
  { to: '/patterns', label: 'Patterns', group: 'Reflect', keywords: 'mistakes analysis' },
  {
    to: '/reattempts',
    label: 'Re-attempts',
    group: 'Reflect',
    keywords: 'review due revision spaced repeat'
  },
  {
    to: '/weekly-review',
    label: 'Weekly review',
    group: 'Reflect',
    keywords: 'weekly reflection progress'
  },
  { to: '/heatmap', label: 'Heatmap', group: 'Reflect', keywords: 'topics coverage weakness' },
  { to: '/calibration', label: 'Calibration', group: 'Reflect', keywords: 'confidence accuracy' },
  { to: '/readiness', label: 'Readiness', group: 'Reflect', keywords: 'exam prepare progress' },
  { to: '/topper-notes', label: 'Topper notes', group: 'Library', keywords: 'learn study notes' },
  {
    to: '/revision-pack',
    label: 'Revision pack',
    group: 'Library',
    keywords: 'revise mistakes review'
  },
  {
    to: '/syllabus',
    label: 'Syllabus tracker',
    group: 'Library',
    keywords: 'subjects topics coverage'
  },
  {
    to: '/trigger-drill',
    label: 'Trigger drill',
    group: 'Library',
    keywords: 'recall recognition practice'
  },
  { to: '/formulas', label: 'Formulas', group: 'Library', keywords: 'equations recall revision' },
  {
    to: '/settings',
    label: 'Settings',
    group: 'Workspace',
    keywords: 'profile account theme countdown preferences'
  }
];

export default function WorkspaceSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const storedSessionId = useSessionStore((s) => s.sessionId);
  const liveSessionId = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    return row && row.actual_duration_min === null ? storedSessionId : null;
  }, [storedSessionId]);
  const results = SECTIONS.map((section) =>
    section.to === '/session/new' && liveSessionId
      ? { ...section, to: `/session/${liveSessionId}/solve`, label: 'Resume session' }
      : section
  ).filter((section) =>
    `${section.label} ${section.group} ${section.keywords}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    setQuery('');
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  function go(to: string) {
    onClose();
    navigate(to);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const entries = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('[data-search-result]') ?? []
    );
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % entries.length
        : index <= 0
          ? entries.length - 1
          : index - 1;
    entries[next]?.focus();
  }
  return (
    <dialog
      ref={dialogRef}
      className="workspace-search-dialog"
      aria-labelledby="workspace-search-title"
      onCancel={onClose}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="workspace-search-panel">
        <div className="workspace-search-heading">
          <div>
            <h2 id="workspace-search-title">Find your next step</h2>
            <p>Search every section of your workspace.</p>
          </div>
          <button
            type="button"
            className="workspace-icon-button"
            onClick={onClose}
            aria-label="Close search"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <label className="workspace-search-field">
          <Search size={19} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “review”, “formulas”, or “planner”"
            aria-label="Search sections"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) {
                event.preventDefault();
                go(results[0].to);
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="workspace-search-results" aria-label="Search results">
          {results.length ? (
            results.map((section) => (
              <button
                type="button"
                data-search-result
                key={section.to}
                onClick={() => go(section.to)}
              >
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.group}</small>
                </span>
                <ArrowUpRight size={16} aria-hidden />
              </button>
            ))
          ) : (
            <p className="workspace-search-empty">
              No sections match “{query}”. Try a subject or another section name.
            </p>
          )}
        </div>
        <p className="workspace-search-help">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span aria-live="polite">{results.length} sections</span>
        </p>
      </div>
    </dialog>
  );
}
