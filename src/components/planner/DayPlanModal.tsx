// Focused day plan modal — two sections rendered as collapsible cards.
//   1. Study sessions (subject × mode × priority × duration × goal)
//   2. Review         (fill after the day)
//
// Persistence: writes on every field change to localStorage via
// planner-storage; the modal itself carries no async state.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import SubjectPicker from '@/components/planner/SubjectPicker';
import { cn, formatDate, uuid } from '@/lib/utils';
import {
  DURATIONS,
  END_MOODS,
  PLANNER_SUBJECTS,
  PRIORITIES,
  STUDY_MODES
} from '@/lib/planner-constants';
import type { DayPlan, Priority, Replicate, StudyMode, StudySession } from '@/lib/planner-storage';
import { isNativeApp } from '@/lib/native';

interface Props {
  date: string;
  plan: DayPlan;
  onChange: (next: DayPlan) => void;
  onClose: () => void;
  onDelete: () => void;
}

/** A plan is considered "filled" once any user-authored field has content.
 *  We use this to pick the initial modal mode (view vs. edit). */
function planHasContent(plan: DayPlan): boolean {
  if (plan.sessions.length > 0) return true;
  if (plan.review.wentWell.trim().length > 0) return true;
  if (plan.review.missed.trim().length > 0) return true;
  if (plan.review.completionPct > 0) return true;
  return false;
}

export default function DayPlanModal({ date, plan, onChange, onClose, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Empty plan → open straight into edit mode. Filled plan → view first,
  // then Edit → Save round-trip. Since every edit is auto-persisted, Save
  // is really "done editing" — the round-trip is UX affordance, not I/O.
  const [mode, setMode] = useState<'view' | 'edit'>(() => (planHasContent(plan) ? 'view' : 'edit'));
  const native = isNativeApp;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function update<K extends keyof DayPlan>(key: K, value: DayPlan[K]) {
    onChange({ ...plan, [key]: value });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="planner-day-overlay fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-text/30 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 16, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-plan-title"
        className="planner-day-sheet my-4 w-full max-w-[860px] overflow-hidden rounded-lg border border-border bg-bg-raised shadow-lift"
      >
        <header className="planner-day-header flex flex-wrap items-center gap-3 border-b border-border bg-bg-overlay/30 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="u-label">Day plan</p>
            <h2 id="day-plan-title" className="font-display text-[18px] font-bold text-text">
              {formatDate(date, 'EEEE, dd MMM yyyy')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'view' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setMode('edit')}
                title="Edit this day's plan"
              >
                <Pencil size={11} strokeWidth={1.75} className="mr-1" />
                Edit
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // Auto-save is already happening on every field change; Save
                  // here just switches back to the readable view.
                  setMode(planHasContent(plan) ? 'view' : 'edit');
                }}
                title="Save (already saved as you type) and switch to the read-only view"
                disabled={!planHasContent(plan)}
              >
                <Check size={11} strokeWidth={2} className="mr-1" />
                {native ? 'Done' : 'Save'}
              </Button>
            )}
            {mode === 'edit' &&
              !native &&
              (!confirmDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  title="Clear this day's plan"
                >
                  <Trash2 size={11} strokeWidth={1.75} className="mr-1" />
                  Clear
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      onDelete();
                      setConfirmDelete(false);
                    }}
                  >
                    Confirm clear
                  </Button>
                </>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="planner-day-close rounded-full p-1 text-text-faint transition-colors hover:bg-bg-overlay hover:text-text"
              aria-label="Close"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="planner-day-body flex flex-col gap-3 p-4 sm:p-5">
          {mode === 'view' ? (
            <ViewMode plan={plan} />
          ) : (
            <>
              <Section
                title={native ? 'Study sessions' : '1 · Study sessions'}
                description={native ? 'Build a realistic sequence for this day.' : undefined}
                defaultOpen
              >
                <SessionsEditor
                  sessions={plan.sessions}
                  onChange={(sessions) => update('sessions', sessions)}
                />
              </Section>

              <Section
                title={native ? 'Review the day' : '2 · Review (fill after the day)'}
                description={
                  native ? 'Return after studying and record what actually happened.' : undefined
                }
              >
                <ReviewEditor
                  review={plan.review}
                  onChange={(review) => update('review', review)}
                />
              </Section>

              {native && (
                <div className="planner-clear-zone flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-medium text-text">Clear this day</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
                      Removes its sessions and review from this device.
                    </p>
                  </div>
                  {!confirmDelete ? (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                      Clear plan
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                        Keep it
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          onDelete();
                          setConfirmDelete(false);
                        }}
                      >
                        Confirm clear
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------- view mode ------------------------------- */

function ViewMode({ plan }: { plan: DayPlan }) {
  const totalMin = plan.sessions.reduce((s, x) => s + (x.durationMin || 0), 0);
  const endMoodLabel = plan.review.endMood
    ? END_MOODS.find((m) => m.value === plan.review.endMood)?.label
    : null;

  return (
    <div className="planner-view flex flex-col gap-4">
      {/* Sessions */}
      <div className="planner-view-block rounded border border-border bg-bg">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <p className="font-display text-[13.5px] font-semibold text-text">
            Study sessions ({plan.sessions.length})
          </p>
          <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
            <Clock size={11} strokeWidth={1.75} /> {formatHours(totalMin)} planned
          </span>
        </div>
        {plan.sessions.length === 0 ? (
          <p className="p-3 text-[12.5px] text-text-muted">No sessions logged.</p>
        ) : (
          <ul className="divide-y divide-border">
            {plan.sessions.map((s, i) => {
              const name =
                s.subject === 'Custom...' && s.customSubject ? s.customSubject : s.subject;
              return (
                <li key={s.id} className="planner-view-session px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="u-num text-[11px] text-text-faint">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[13.5px] font-semibold text-text">{name}</span>
                    <span className="rounded-full bg-accent-faint px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {formatHours(s.durationMin)}
                    </span>
                    <span className="text-[11.5px] text-text-muted">
                      {s.mode} · {s.priority}
                    </span>
                  </div>
                  {s.target && (
                    <p className="mt-1 text-[12.5px] text-text-muted">
                      <span className="u-label mr-1">Target</span>
                      {s.target}
                    </p>
                  )}
                  {s.resource && (
                    <p className="mt-0.5 text-[11.5px] text-text-faint">
                      <span className="u-label mr-1">Resource</span>
                      {s.resource}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Review — only shown if any field is filled */}
      {(plan.review.completionPct > 0 ||
        plan.review.wentWell ||
        plan.review.missed ||
        plan.review.endMood ||
        plan.review.replicate) && (
        <div className="planner-view-block rounded border border-border bg-bg">
          <div className="border-b border-border/70 px-3 py-2">
            <p className="font-display text-[13.5px] font-semibold text-text">End-of-day review</p>
          </div>
          <div className="p-3 text-[12.5px]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Completion" value={`${plan.review.completionPct}%`} />
              {endMoodLabel && <SummaryStat label="Mood" value={endMoodLabel} />}
              {plan.review.replicate && (
                <SummaryStat label="Replicate" value={plan.review.replicate} />
              )}
            </div>
            {plan.review.wentWell && (
              <div className="mt-3">
                <p className="u-label mb-1">Went well</p>
                <p className="whitespace-pre-wrap text-text">{plan.review.wentWell}</p>
              </div>
            )}
            {plan.review.missed && (
              <div className="mt-3">
                <p className="u-label mb-1">Missed / why</p>
                <p className="whitespace-pre-wrap text-text">{plan.review.missed}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="u-label">{label}</p>
      <p className="mt-0.5 text-text">{value}</p>
    </div>
  );
}

/* ------------------------------ section shell ---------------------------- */

function Section({
  title,
  description,
  defaultOpen = false,
  children
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const native = isNativeApp;
  if (native) {
    return (
      <section className="planner-section overflow-hidden rounded border border-border bg-bg">
        <div className="planner-section-heading">
          <h3 className="font-display text-[18px] font-semibold text-text">{title}</h3>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{description}</p>
          )}
        </div>
        <div className="planner-section-body border-t border-border/70">{children}</div>
      </section>
    );
  }
  return (
    <section className="overflow-hidden rounded border border-border bg-bg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-bg-overlay/50"
      >
        <span className="font-display text-[13.5px] font-semibold text-text">{title}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn('text-text-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="border-t border-border/70 p-3">{children}</div>}
    </section>
  );
}

/* ---------------------------- sessions editor ---------------------------- */

function SessionsEditor({
  sessions,
  onChange
}: {
  sessions: StudySession[];
  onChange: (next: StudySession[]) => void;
}) {
  function addSession() {
    const next: StudySession = {
      id: uuid(),
      subject: PLANNER_SUBJECTS[0],
      durationMin: 60,
      mode: 'Deep Study',
      priority: 'P2 High',
      target: ''
    };
    onChange([...sessions, next]);
  }
  function update(id: string, patch: Partial<StudySession>) {
    onChange(sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function remove(id: string) {
    onChange(sessions.filter((s) => s.id !== id));
  }

  const total = sessions.reduce((s, x) => s + (x.durationMin || 0), 0);

  return (
    <div className="planner-sessions-editor flex flex-col gap-3">
      {sessions.length === 0 ? (
        <p className="text-[12px] text-text-muted">
          No sessions yet. Add one to start planning the day.
        </p>
      ) : (
        <div className="planner-session-list flex flex-col gap-2">
          {sessions.map((s, i) => (
            <SessionRow
              key={s.id}
              index={i}
              session={s}
              onUpdate={(patch) => update(s.id, patch)}
              onRemove={() => remove(s.id)}
            />
          ))}
        </div>
      )}
      <div className="planner-session-footer flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={addSession}>
          <Plus size={11} strokeWidth={2} className="mr-1" />
          Add subject
        </Button>
        <span className="u-num text-[11.5px] text-text-muted">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · planned {formatHours(total)}
        </span>
      </div>
    </div>
  );
}

function SessionRow({
  index,
  session,
  onUpdate,
  onRemove
}: {
  index: number;
  session: StudySession;
  onUpdate: (patch: Partial<StudySession>) => void;
  onRemove: () => void;
}) {
  const isCustomSubject = session.subject === 'Custom...';

  return (
    <div className="planner-session-card rounded border border-border/70 bg-bg-raised px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="u-label">Session {index + 1}</p>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-text-faint transition-colors hover:bg-danger-faint hover:text-danger"
          aria-label="Remove session"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      </div>
      <div className="planner-session-fields grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Subject">
          <SubjectPicker
            value={session.subject}
            options={PLANNER_SUBJECTS}
            onChange={(subject) =>
              onUpdate({
                subject,
                ...(subject === 'Custom...' ? {} : { customSubject: undefined })
              })
            }
          />
          {isCustomSubject && (
            <Input
              className="mt-1.5"
              placeholder="Custom subject name"
              value={session.customSubject ?? ''}
              onChange={(e) => onUpdate({ customSubject: e.target.value })}
              maxLength={60}
            />
          )}
        </Field>
        <Field label="Duration (minutes)">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={720}
              value={session.durationMin}
              onChange={(e) =>
                onUpdate({
                  durationMin: Math.max(1, Math.min(720, Math.round(Number(e.target.value) || 0)))
                })
              }
              placeholder="Minutes"
              className="w-28"
            />
            <span className="text-[11.5px] text-text-faint">
              = {formatHours(session.durationMin)}
            </span>
          </div>
          <div className="planner-duration-options mt-1.5 flex flex-wrap gap-1">
            {DURATIONS.filter((d) => d.value > 0).map((d) => {
              const on = d.value === session.durationMin;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onUpdate({ durationMin: d.value })}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                    on
                      ? 'border-accent bg-accent-faint text-accent font-semibold'
                      : 'border-border bg-bg-raised text-text-muted hover:border-border-hover hover:text-text'
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Study mode">
          <Select
            value={session.mode}
            onChange={(e) => onUpdate({ mode: e.target.value as StudyMode })}
          >
            {STUDY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={session.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as Priority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target / goal" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={session.target}
            onChange={(e) => onUpdate({ target: e.target.value })}
            placeholder="e.g., Complete sets & relations, solve 20 PYQs"
            maxLength={280}
          />
        </Field>
        <Field label="Resource / topic (optional)" className="sm:col-span-2">
          <Input
            value={session.resource ?? ''}
            onChange={(e) => onUpdate({ resource: e.target.value })}
            placeholder="Rosen ch. 6, NPTEL lec 12, PYQ set…"
            maxLength={160}
          />
        </Field>
      </div>
    </div>
  );
}

/* ----------------------------- review editor ----------------------------- */

function ReviewEditor({
  review,
  onChange
}: {
  review: DayPlan['review'];
  onChange: (next: DayPlan['review']) => void;
}) {
  return (
    <div className="planner-review-editor flex flex-col gap-3">
      <Field label={`Completion — ${review.completionPct}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={review.completionPct}
          onChange={(e) => onChange({ ...review, completionPct: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="What went well">
          <Textarea
            rows={3}
            value={review.wentWell}
            onChange={(e) => onChange({ ...review, wentWell: e.target.value })}
            maxLength={500}
          />
        </Field>
        <Field label="What was missed & why">
          <Textarea
            rows={3}
            value={review.missed}
            onChange={(e) => onChange({ ...review, missed: e.target.value })}
            maxLength={500}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mood at end of day">
          <div className="flex flex-wrap gap-1.5">
            {END_MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...review,
                    endMood: review.endMood === m.value ? '' : m.value
                  })
                }
                className={cn(
                  'inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  review.endMood === m.value
                    ? 'border-accent bg-accent-faint text-accent'
                    : 'border-border bg-bg-raised text-text-muted hover:border-border-hover'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Replicate this plan?">
          <div className="inline-flex divide-x divide-border overflow-hidden rounded border border-border">
            {(['yes', 'partial', 'no'] as Replicate[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() =>
                  onChange({
                    ...review,
                    replicate: review.replicate === r ? '' : r
                  })
                }
                className={cn(
                  'flex-1 px-3 py-1.5 text-[12.5px] capitalize transition-colors',
                  review.replicate === r
                    ? 'bg-accent-faint font-semibold text-accent'
                    : 'text-text-muted hover:bg-bg-overlay'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------ primitives ------------------------------- */

function Field({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('planner-field flex flex-col gap-1', className)}>
      <span className="u-label">{label}</span>
      {children}
    </div>
  );
}

function formatHours(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
