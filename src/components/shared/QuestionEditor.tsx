// A single form that edits every field on a QuestionRow. Used in three places:
//   - Journal row → Edit (existing row, session_id preserved)
//   - Session Review → per-question edit (existing row, still in-session)
//   - /log standalone entry (new row, session_id = null, date chosen by user)
// Kept intentionally dense so the whole thing fits a phone screen without scroll
// when the accordion sections stay collapsed.
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Trash2, UploadCloud, X } from 'lucide-react';
import {
  MARK_DECISIONS,
  OUTCOMES,
  PYQ_TWO_SETS_FROM,
  QUESTION_FORMATS,
  ROOT_CAUSES,
  SOURCE_KINDS,
  SOURCE_KIND_BY_VALUE,
  SUBJECTS,
  examYears,
  type SourceKind
} from '@/lib/constants';
import { subtopicsFor } from '@/lib/subtopics';
import { compressToDataUrl, ImageTooLargeError } from '@/lib/image';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import type { EditorDraft } from '@/components/shared/questionDraft';

interface ChipProps<T> {
  value: T;
  active: boolean;
  onClick: () => void;
  label: string;
}

function Chip<T>({ active, onClick, label }: ChipProps<T>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded border px-3 text-[12px] transition-all duration-150 active:scale-95',
        active
          ? 'border-accent bg-accent-faint font-semibold text-accent shadow-sm'
          : 'border-border bg-bg-raised text-text-muted hover:border-border-hover hover:text-text'
      )}
    >
      {label}
    </button>
  );
}

export interface QuestionEditorProps {
  draft: EditorDraft;
  onChange: (next: EditorDraft) => void;
  /** Show the created-date field (Log & Journal-edit) — hidden in Session Review. */
  showCreatedDate?: boolean;
  /** Show the time-spent field. Off by default; toggled in Log for retroactive entries. */
  showTimeSpent?: boolean;
}

export default function QuestionEditor({
  draft,
  onChange,
  showCreatedDate = true,
  showTimeSpent = true
}: QuestionEditorProps) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const spec = SOURCE_KIND_BY_VALUE[draft.sourceKind];
  const isPyq = draft.sourceKind === 'pyq';
  const isYearBased = !!spec.hasYear;
  const yearHasSets = isPyq && draft.sourceYear != null && draft.sourceYear >= PYQ_TWO_SETS_FROM;
  const yearOptions = examYears(spec);
  const subtopics = subtopicsFor(draft.subject);

  // When subject changes, clear a subtopic that no longer applies.
  useEffect(() => {
    if (draft.subtopic && !subtopics.some((s) => s.value === draft.subtopic)) {
      onChange({ ...draft, subtopic: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.subject]);

  function set<K extends keyof EditorDraft>(k: K, v: EditorDraft[K]) {
    onChange({ ...draft, [k]: v });
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    setUploading(true);
    try {
      const c = await compressToDataUrl(file);
      set('imageDataUrl', c.dataUrl);
    } catch (err) {
      if (err instanceof ImageTooLargeError) setImageError(err.message);
      else setImageError('Could not read that image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Subject + subtopic row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Subject">
          <Select value={draft.subject} onChange={(e) => set('subject', e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subtopic (optional)">
          <Select
            value={draft.subtopic ?? ''}
            onChange={(e) => set('subtopic', e.target.value || null)}
          >
            <option value="">— pick a subtopic</option>
            {subtopics.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Source kind */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Source">
          <Select
            value={draft.sourceKind}
            onChange={(e) => set('sourceKind', e.target.value as SourceKind)}
          >
            {SOURCE_KINDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Question # (optional)">
          <Input
            value={draft.questionNumber ?? ''}
            onChange={(e) => set('questionNumber', e.target.value)}
            placeholder="e.g. Q23"
          />
        </Field>
      </div>

      {/* Year block (year-based exams only) */}
      {isYearBased && (
        <div className="flex flex-wrap items-end gap-3 rounded border border-border/70 bg-bg-overlay/40 px-3 py-3">
          <Field label={`${spec.label} year`} className="min-w-[160px]">
            <Select
              value={draft.sourceYear ?? ''}
              onChange={(e) => set('sourceYear', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Don't remember</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          {isPyq && yearHasSets && (
            <Field label="Set">
              <div className="flex items-center gap-1.5">
                <Chip
                  label="Set 1"
                  active={draft.sourceSet === 1}
                  onClick={() => set('sourceSet', 1)}
                  value={1}
                />
                <Chip
                  label="Set 2"
                  active={draft.sourceSet === 2}
                  onClick={() => set('sourceSet', 2)}
                  value={2}
                />
              </div>
            </Field>
          )}
          {isPyq && draft.sourceYear != null && !yearHasSets && (
            <p className="text-[11px] text-text-faint">
              GATE {draft.sourceYear} was single-set (sets from {PYQ_TWO_SETS_FROM}).
            </p>
          )}
        </div>
      )}

      {/* Photo — available for every source, always. */}
      <Field label="Question text (recommended)">
        <Textarea
          rows={4}
          value={draft.questionText ?? ''}
          onChange={(event) => set('questionText', event.target.value || null)}
          placeholder="Paste the prompt so it is available during re-attempts."
        />
        <p className="text-[11px] leading-relaxed text-text-faint">
          Saved with the question and shown on its timed re-attempt card.
        </p>
      </Field>

      <div className="rounded border border-ink-teal/15 bg-ink-teal/5 px-3 py-3">
        <Field label="Answer / solution (recommended)">
          <Textarea
            rows={3}
            value={draft.answerText ?? ''}
            onChange={(event) => set('answerText', event.target.value || null)}
            placeholder="Final answer, key steps, or the method you want to verify later."
          />
          <p className="text-[11px] leading-relaxed text-text-faint">
            Saved privately. Review screens keep it concealed until you press Show answer.
          </p>
        </Field>
      </div>

      {/* Photo — available for every source, always. */}
      <Field label="Question photo (optional)">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void pickImage(e.target.files?.[0])}
          className="hidden"
        />
        {draft.imageDataUrl ? (
          <div className="flex items-start gap-3 rounded border border-border bg-bg-raised p-2 shadow-sm">
            <img src={draft.imageDataUrl} alt="scan" className="h-20 w-20 rounded object-cover" />
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-text-muted">Attached.</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set('imageDataUrl', null)}
                  className="text-danger hover:text-danger"
                >
                  <Trash2 size={12} strokeWidth={1.75} className="mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={cn(
              'flex w-full items-center gap-3 rounded border border-dashed border-border bg-bg-overlay/40 px-3 py-3 text-left',
              'hover:border-border-hover hover:bg-bg-overlay/70 disabled:opacity-60'
            )}
          >
            <UploadCloud size={16} strokeWidth={1.75} className="text-accent" />
            <span className="text-[12px] text-text-muted">
              {uploading ? 'Compressing…' : 'Upload / snap photo'}
            </span>
          </button>
        )}
        {imageError && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
            <AlertCircle size={11} strokeWidth={2} /> {imageError}
          </p>
        )}
      </Field>

      {/* Format + Marks */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Format">
          <div className="flex items-center gap-1.5">
            {QUESTION_FORMATS.map((qf) => (
              <Chip
                key={qf.value}
                label={qf.value}
                active={draft.format === qf.value}
                onClick={() => set('format', draft.format === qf.value ? null : qf.value)}
                value={qf.value}
              />
            ))}
          </div>
        </Field>
        <Field label="Marks">
          <div className="flex items-center gap-1.5">
            <Chip
              label="1m"
              active={draft.marks === 1}
              onClick={() => set('marks', draft.marks === 1 ? null : 1)}
              value={1}
            />
            <Chip
              label="2m"
              active={draft.marks === 2}
              onClick={() => set('marks', draft.marks === 2 ? null : 2)}
              value={2}
            />
            {draft.marks != null && draft.marks !== 1 && draft.marks !== 2 && (
              <span className="u-num text-[11px] font-semibold text-text-muted">
                {draft.marks}m legacy
              </span>
            )}
          </div>
        </Field>
      </div>

      <hr className="border-border" />

      {/* Outcome */}
      <Field label="Outcome">
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <Chip
              key={o.code}
              label={o.code}
              active={draft.outcome === o.code}
              onClick={() => set('outcome', o.code)}
              value={o.code}
            />
          ))}
        </div>
      </Field>

      {/* Pattern + trigger */}
      <div className="grid grid-cols-1 gap-3">
        <Field label="Pattern name (optional)">
          <Input
            value={draft.patternName ?? ''}
            onChange={(e) => set('patternName', e.target.value || null)}
            placeholder="e.g. pigeonhole on remainders"
          />
        </Field>
        <Field label="Trigger sentence (optional)">
          <Textarea
            rows={2}
            value={draft.triggerSentence ?? ''}
            onChange={(e) => set('triggerSentence', e.target.value || null)}
            placeholder="The exact words that should have fired the method."
          />
        </Field>
      </div>

      {/* Root cause */}
      {draft.outcome !== 'R' && (
        <Field label="Root cause">
          <div className="flex flex-wrap gap-1.5">
            {ROOT_CAUSES.map((rc) => (
              <Chip
                key={rc.value}
                label={rc.label}
                active={draft.rootCause === rc.value}
                onClick={() => set('rootCause', draft.rootCause === rc.value ? null : rc.value)}
                value={rc.value}
              />
            ))}
          </div>
        </Field>
      )}

      {/* Mark decision */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mark decision">
          <div className="flex flex-wrap gap-1.5">
            {MARK_DECISIONS.map((m) => (
              <Chip
                key={m.value}
                label={m.label}
                active={draft.markDecision === m.value}
                onClick={() => set('markDecision', draft.markDecision === m.value ? null : m.value)}
                value={m.value}
              />
            ))}
          </div>
        </Field>
        {draft.markDecision && draft.markDecision !== 'SKIP' && (
          <Field label="Did it pay off?">
            <div className="flex items-center gap-1.5">
              <Chip
                label="Paid off"
                active={draft.markCorrect === true}
                onClick={() => set('markCorrect', true)}
                value={true}
              />
              <Chip
                label="Did not"
                active={draft.markCorrect === false}
                onClick={() => set('markCorrect', false)}
                value={false}
              />
              <Chip
                label="Unknown"
                active={draft.markCorrect === null}
                onClick={() => set('markCorrect', null)}
                value={null}
              />
            </div>
          </Field>
        )}
      </div>

      {/* Optional: date + time-spent */}
      {(showCreatedDate || showTimeSpent) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {showCreatedDate && (
            <Field label="Date">
              <Input
                type="date"
                value={draft.createdDate}
                onChange={(e) => set('createdDate', e.target.value)}
                mono
              />
            </Field>
          )}
          {showTimeSpent && (
            <Field label="Time spent (seconds)">
              <Input
                type="number"
                min={0}
                value={draft.timeSpentSec}
                onChange={(e) => set('timeSpentSec', Math.max(0, Number(e.target.value) || 0))}
                mono
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="u-label">{label}</span>
      {children}
    </div>
  );
}

/** Convenience: an inline "delete this row" bar. Callers wire the actual delete. */
export function DeleteBar({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-danger/25 pt-3">
      <span className="text-[12px] text-text-faint">Permanent — no undo.</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-danger hover:text-danger"
      >
        <X size={14} strokeWidth={2} className="mr-1" />
        Delete question
      </Button>
    </div>
  );
}
