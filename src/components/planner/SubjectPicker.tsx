import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/native';

interface Props {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

/**
 * A WebView-safe subject control. Android's native select dialog is unreliable
 * inside an animated, scrollable bottom sheet, so the picker is portalled to
 * the document body and owns its own touch surface and scroll area.
 */
export default function SubjectPicker({ value, options, onChange }: Props) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.toLocaleLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 80);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option: string) {
    onChange(option);
    haptic('selection');
    close();
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="subject-picker-trigger u-control flex min-h-10 w-full items-center justify-between gap-3 rounded border border-border bg-bg-raised px-3 text-left text-sm text-text shadow-sm transition-[border-color,box-shadow] hover:border-border-hover focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none"
      >
        <span className="min-w-0 flex-1 truncate">{value || 'Choose a subject'}</span>
        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-text-faint" />
      </button>

      {open &&
        createPortal(
          <div
            className="subject-picker-overlay fixed inset-0 z-[70] flex items-end justify-center bg-scrim/45 px-[var(--safe-left)] pt-[var(--safe-top)] backdrop-blur-[2px] sm:items-center sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="subject-picker-panel flex max-h-[min(720px,calc(100dvh-var(--safe-top)-12px))] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border border-border bg-bg-raised shadow-lift sm:rounded-lg"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3.5">
                <div>
                  <p className="u-label">Study session</p>
                  <h3
                    id={titleId}
                    className="mt-1 font-display text-[18px] font-semibold text-text"
                  >
                    Choose subject
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-text-faint hover:bg-bg-overlay hover:text-text"
                  aria-label="Close subject picker"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </header>

              <div className="shrink-0 border-b border-border/70 p-3">
                <label className="relative block">
                  <Search
                    size={16}
                    strokeWidth={1.75}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search GATE subjects"
                    aria-label="Search subjects"
                    className="u-control h-11 w-full rounded border border-border bg-bg !pl-10 !pr-3 text-[16px] text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)]"
                  />
                </label>
              </div>

              <div className="subject-picker-list min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(1rem+var(--safe-bottom))]">
                {visibleOptions.length === 0 ? (
                  <p className="px-2 py-8 text-center text-[13px] text-text-muted">
                    No matching subject. Choose “Custom…” to name it yourself.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibleOptions.map((option) => {
                      const selected = option === value;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => pick(option)}
                          className={cn(
                            'flex min-h-12 items-center justify-between gap-3 rounded border px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors',
                            selected
                              ? 'border-accent bg-accent-faint text-accent'
                              : 'border-border/80 bg-bg text-text hover:border-border-hover hover:bg-bg-overlay/60'
                          )}
                        >
                          <span>{option}</span>
                          {selected && <Check size={16} strokeWidth={2} className="shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body
        )}
    </>
  );
}
