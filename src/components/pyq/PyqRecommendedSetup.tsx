import { useState } from 'react';
import { BookmarkPlus, Check, RefreshCw, Trash2 } from 'lucide-react';
import {
  PYQ_RECOMMENDATION_PRESETS,
  type RecommendedPyqSelection
} from '@/lib/pyq-recommended-selection';
import type { PyqPresetPreference, PyqSavedPrescription } from '@/stores/pyq-preferences';
import { cn, plural } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function PyqRecommendedSetup({
  preset,
  selection,
  loading,
  error,
  seed,
  savedPrescriptions,
  onPreset,
  onSeed,
  onRegenerate,
  onSavePrescription,
  onLoadPrescription,
  onDeletePrescription
}: {
  preset: PyqPresetPreference;
  selection: RecommendedPyqSelection | null;
  loading: boolean;
  error: string | null;
  seed: string;
  savedPrescriptions: PyqSavedPrescription[];
  onPreset: (preset: PyqPresetPreference) => void;
  onSeed: (seed: string) => void;
  onRegenerate: () => void;
  onSavePrescription: (name: string) => void;
  onLoadPrescription: (prescription: PyqSavedPrescription) => void;
  onDeletePrescription: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const presets = Object.values(PYQ_RECOMMENDATION_PRESETS);
  const preflight = selection?.preflight ?? null;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSavePrescription(trimmed);
    setName('');
  }

  return (
    <section aria-labelledby="recommended-pyq-heading" className="border-b border-border">
      <div className="bg-bg-overlay/25 px-4 py-4 sm:px-5">
        <p id="recommended-pyq-heading" className="u-label text-accent">
          Recommended set
        </p>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-text-muted">
          Choose the learning job first. Hetu resolves a reproducible exact set, explains why each
          cohort is present, and keeps untouched benchmark papers sealed.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((definition) => {
          const active = preset === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPreset(definition.id)}
              className={cn(
                'relative min-h-[112px] bg-bg-raised p-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint',
                active ? 'bg-accent-faint' : 'hover:bg-bg-overlay/60'
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-display text-[15px] font-semibold text-text">
                  {definition.label}
                </span>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-border-hover text-transparent'
                  )}
                >
                  <Check size={12} aria-hidden="true" />
                </span>
              </span>
              <span className="mt-2 block text-[11.5px] leading-relaxed text-text-muted">
                {definition.description}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={preset === 'custom'}
          onClick={() => onPreset('custom')}
          className={cn(
            'relative min-h-[112px] bg-bg-raised p-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint',
            preset === 'custom' ? 'bg-accent-faint' : 'hover:bg-bg-overlay/60'
          )}
        >
          <span className="font-display text-[15px] font-semibold text-text">Custom</span>
          <span className="mt-2 block text-[11.5px] leading-relaxed text-text-muted">
            Use the subject, history, year, type, count, and order controls below directly.
          </span>
        </button>
      </div>

      {preset !== 'custom' && preset !== 'full-paper' ? (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
              {[
                ['Matched', preflight?.exactMatchCount ?? '—'],
                ['Selectable', preflight?.selectableCount ?? '—'],
                ['Selected', preflight?.selectedCount ?? '—'],
                ['Unseen', preflight?.matchedHistory.unseen ?? '—'],
                ['Seen', preflight?.matchedHistory.seen ?? '—'],
                ['Time', preflight ? `${preflight.estimatedMinutes}m` : '—'],
                ['Marks', preflight ? preflight.estimatedMarks : '—'],
                ['Protected', preflight?.reserve.excludedCount ?? '—']
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded border border-border bg-bg-overlay/20 px-3 py-2.5"
                >
                  <p className="u-label">{label}</p>
                  <p className="u-num mt-1 text-[16px] font-semibold text-text">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preflight?.reasonChips.map((reason) => (
                <Badge key={reason.code} tone={reason.code === 'shortfall' ? 'warn' : 'neutral'}>
                  {reason.label}
                  {reason.selectedCount != null ? ` · ${reason.selectedCount}` : ''}
                </Badge>
              ))}
              {loading ? <Badge>Calculating exact set…</Badge> : null}
            </div>
            {preflight?.shortfall ? (
              <p className="mt-3 text-[12px] text-warn">
                Requested set is {preflight.shortfall} {plural(preflight.shortfall, 'question')}{' '}
                short. Widen scope or choose another job; Hetu will not silently consume a sealed
                paper.
              </p>
            ) : null}
            {preflight && selection ? (
              <div className="mt-3 rounded border border-border bg-bg-overlay/20 p-3">
                <p className="u-label">Selected distribution</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(preflight.distribution.subject).map(([subject, count]) => (
                    <Badge key={`subject:${subject}`}>
                      {subject} · {count}
                    </Badge>
                  ))}
                  {Object.entries(preflight.distribution.year).map(([year, count]) => (
                    <Badge key={`year:${year}`}>
                      {year} · {count}
                    </Badge>
                  ))}
                  {Object.entries(preflight.distribution.marks).map(([marks, count]) => (
                    <Badge key={`marks:${marks}`}>
                      {marks} mark · {count}
                    </Badge>
                  ))}
                </div>
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-[11.5px] font-semibold text-text-muted">
                    Why these {selection.questionUids.length} exact UIDs
                  </summary>
                  <ol className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                    {selection.questionUids.map((questionUid, index) => {
                      const cohortReasons = selection.reasonsByQuestionUid[questionUid] ?? [];
                      const priorityReasons =
                        selection.priorityReasonsByQuestionUid[questionUid] ?? [];
                      return (
                        <li
                          key={questionUid}
                          className="rounded border border-border bg-bg-raised px-2.5 py-2"
                        >
                          <p className="truncate font-mono text-[10.5px] text-text">
                            {String(index + 1).padStart(2, '0')} · {questionUid}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {cohortReasons.map((reason) => (
                              <Badge key={`${questionUid}:${reason}`}>
                                {reason.replaceAll('-', ' ')}
                              </Badge>
                            ))}
                            {priorityReasons.map((reason) => (
                              <Badge key={`${questionUid}:priority:${reason}`} tone="accent">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </details>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-[12px] text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <div className="rounded border border-border bg-bg-overlay/20 p-3">
            <label className="text-[11.5px] font-medium text-text-muted">
              Reproducibility seed
              <Input
                className="mt-1 font-mono"
                value={seed}
                onChange={(event) => onSeed(event.target.value)}
                aria-describedby="pyq-seed-help"
              />
            </label>
            <p id="pyq-seed-help" className="mt-1 text-[10.5px] leading-relaxed text-text-faint">
              Same bank, evidence, scope, and seed produce the same UID order.
            </p>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onRegenerate}>
              <RefreshCw size={13} /> New deterministic seed
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 border-t border-border p-4 sm:p-5 lg:grid-cols-2">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this prescription"
            maxLength={80}
          />
          <Button variant="ghost" onClick={save} disabled={!name.trim()}>
            <BookmarkPlus size={14} /> Save
          </Button>
        </div>
        {savedPrescriptions.length > 0 ? (
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            {savedPrescriptions.slice(0, 6).map((prescription) => (
              <span
                key={prescription.id}
                className="inline-flex overflow-hidden rounded border border-border"
              >
                <button
                  type="button"
                  onClick={() => onLoadPrescription(prescription)}
                  className="bg-bg-raised px-2.5 py-1.5 text-[11.5px] font-medium text-text hover:bg-bg-overlay"
                >
                  {prescription.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePrescription(prescription.id)}
                  className="border-l border-border bg-bg-raised px-2 text-text-faint hover:bg-danger-faint hover:text-danger"
                  aria-label={`Delete ${prescription.name} prescription`}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="self-center text-[11px] text-text-faint lg:text-right">
            Saved prescriptions sync with your account and can be reopened on another device.
          </p>
        )}
      </div>
    </section>
  );
}
