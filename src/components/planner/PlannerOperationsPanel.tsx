import { useMemo, useState } from 'react';
import { CalendarPlus, Copy, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  copyFullPlannerDay,
  copyPlannerBlock,
  copySelectedPlannerBlocks,
  createPlannerReplicateAction,
  expandPlannerRecurrenceDates,
  plannerCopySourceDate,
  rolloverUnfinishedPlannerBlocks,
  type PlannerCopySource,
  type PlannerRecurrenceKind
} from '@/lib/planner-operations';
import { emptyDayPlan, loadDayPlan, type DayPlan, type StudySession } from '@/lib/planner-storage';
import { addDaysISO } from '@/lib/utils';
import {
  usePlannerTemplatesStore,
  type PlannerTemplate,
  type PlannerTemplateRecurrence,
  type PlannerTemplateWeekday
} from '@/stores/planner-templates';
import { cn } from '@/lib/utils';

interface Props {
  plan: DayPlan;
  onPersistPlans: (plans: DayPlan[], message: string) => void;
}

interface PendingReplacement {
  plans: DayPlan[];
  message: string;
  warning: string;
}

interface DatedSelection {
  date: string;
  deselectedIds: Set<string>;
}

interface DatedValue {
  date: string;
  value: string;
}

const WEEKDAYS: Array<{ value: PlannerTemplateWeekday; label: string }> = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' }
];

function planWithAppended(plan: DayPlan, sessions: readonly StudySession[]): DayPlan {
  return { ...plan, sessions: [...plan.sessions, ...sessions] };
}

function templateSourceBlock(template: PlannerTemplate): StudySession {
  return {
    id: `template:${template.id}`,
    subject: template.block.subject,
    subjectId: template.block.subjectId,
    ...(template.block.customSubject ? { customSubject: template.block.customSubject } : {}),
    durationMin: template.block.durationMin,
    mode: template.block.mode,
    priority: template.block.priority,
    target: template.block.target,
    ...(template.block.resource ? { resource: template.block.resource } : {}),
    startAt: template.block.startAt
  };
}

export default function PlannerOperationsPanel({ plan, onPersistPlans }: Props) {
  const templates = usePlannerTemplatesStore((state) => state.templates);
  const saveTemplate = usePlannerTemplatesStore((state) => state.saveTemplate);
  const deleteTemplate = usePlannerTemplatesStore((state) => state.deleteTemplate);
  const [targetDateState, setTargetDateState] = useState<DatedValue>(() => ({
    date: plan.date,
    value: addDaysISO(plan.date, 1)
  }));
  const [selection, setSelection] = useState<DatedSelection>(() => ({
    date: plan.date,
    deselectedIds: new Set()
  }));
  const [templateBlockState, setTemplateBlockState] = useState<DatedValue>(() => ({
    date: plan.date,
    value: plan.sessions[0]?.id ?? ''
  }));
  const [templateName, setTemplateName] = useState('');
  const [recurrenceKind, setRecurrenceKind] = useState<PlannerRecurrenceKind>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceLimit, setRecurrenceLimit] = useState(8);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<PlannerTemplateWeekday[]>([1]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReplacement | null>(null);

  const targetDate =
    targetDateState.date === plan.date ? targetDateState.value : addDaysISO(plan.date, 1);
  const deselectedIds = selection.date === plan.date ? selection.deselectedIds : null;
  const selected = useMemo(
    () => plan.sessions.filter((session) => !deselectedIds?.has(session.id)),
    [deselectedIds, plan.sessions]
  );
  const selectedIds = useMemo(
    () => new Set(selected.map((session) => session.id)),
    [selected]
  );
  const requestedTemplateBlockId =
    templateBlockState.date === plan.date ? templateBlockState.value : '';
  const templateBlockId = plan.sessions.some(
    (session) => session.id === requestedTemplateBlockId
  )
    ? requestedTemplateBlockId
    : (plan.sessions[0]?.id ?? '');

  function commit(plans: DayPlan[], message: string, warning?: string) {
    const overwrites = plans.filter((candidate) => {
      const existing = candidate.date === plan.date ? plan : loadDayPlan(candidate.date);
      return Boolean(existing && existing.sessions.length > 0 && candidate.sessions.length > 0);
    });
    if (warning && overwrites.length > 0) {
      setPending({ plans, message, warning });
      return;
    }
    onPersistPlans(plans, message);
    setStatus(message);
  }

  function copySource(sourceKind: PlannerCopySource) {
    const sourceDate = plannerCopySourceDate(plan.date, sourceKind);
    const source = loadDayPlan(sourceDate);
    if (!source) {
      setStatus(`No saved plan exists on ${sourceDate}.`);
      return;
    }
    commit(
      [copyFullPlannerDay(source, plan.date)],
      `Copied ${source.sessions.length} actions from ${sourceDate}.`,
      `Replace this date's current agenda with the complete plan from ${sourceDate}?`
    );
  }

  function rollYesterdayIntoCurrent() {
    const sourceDate = plannerCopySourceDate(plan.date, 'yesterday');
    const source = loadDayPlan(sourceDate);
    if (!source) {
      setStatus(`No saved plan exists on ${sourceDate}.`);
      return;
    }
    const blocks = rolloverUnfinishedPlannerBlocks(source, plan.date, {
      existingBlockIds: plan.sessions.map((session) => session.id)
    });
    if (blocks.length === 0) {
      setStatus(`${sourceDate} has no unfinished actions to roll over.`);
      return;
    }
    commit(
      [planWithAppended(plan, blocks)],
      `Rolled ${blocks.length} unfinished action${blocks.length === 1 ? '' : 's'} into this date.`
    );
  }

  function copySelectedToTarget() {
    if (selected.length === 0) {
      setStatus('Select at least one agenda action first.');
      return;
    }
    const target = loadDayPlan(targetDate) ?? emptyDayPlan(targetDate);
    const copied = copySelectedPlannerBlocks(plan, [...selectedIds], targetDate, {
      existingBlockIds: target.sessions.map((session) => session.id)
    });
    commit(
      [planWithAppended(target, copied)],
      `Copied ${copied.length} selected action${copied.length === 1 ? '' : 's'} to ${targetDate}.`
    );
  }

  function rollToTarget() {
    const target = loadDayPlan(targetDate) ?? emptyDayPlan(targetDate);
    const copied = rolloverUnfinishedPlannerBlocks(plan, targetDate, {
      existingBlockIds: target.sessions.map((session) => session.id)
    });
    if (copied.length === 0) {
      setStatus('Every action in this day is already complete.');
      return;
    }
    commit(
      [planWithAppended(target, copied)],
      `Rolled ${copied.length} unfinished action${copied.length === 1 ? '' : 's'} to ${targetDate}.`
    );
  }

  function applyReplicateDecision() {
    if (!plan.review.replicate) {
      setStatus('Choose Yes, Partial, or No in the day review first.');
      return;
    }
    const result = createPlannerReplicateAction(plan, targetDate, plan.review.replicate, {
      partialBlockIds: plan.review.replicate === 'partial' ? [...selectedIds] : undefined
    });
    if (!result.plan) {
      setStatus(result.explanation);
      return;
    }
    commit(
      [result.plan],
      result.explanation,
      `Replace the existing ${targetDate} agenda with this ${plan.review.replicate} replication?`
    );
  }

  function saveSelectedTemplate() {
    const block = plan.sessions.find((session) => session.id === templateBlockId);
    if (!block) {
      setStatus('Choose an agenda action to save.');
      return;
    }
    const recurrence: PlannerTemplateRecurrence | null =
      recurrenceKind === 'none'
        ? null
        : {
            kind: recurrenceKind,
            interval: recurrenceInterval,
            weekdays:
              recurrenceKind === 'custom'
                ? recurrenceWeekdays
                : recurrenceKind === 'weekly'
                  ? ([new Date(`${plan.date}T12:00:00Z`).getUTCDay()] as PlannerTemplateWeekday[])
                  : recurrenceKind === 'weekdays'
                    ? [1, 2, 3, 4, 5]
                    : [],
            startDate: plan.date,
            endDate: recurrenceEndDate || null,
            maxOccurrences: recurrenceLimit
          };
    const saved = saveTemplate({
      name: templateName.trim() || block.target.trim() || `${block.subject} ${block.mode}`,
      block: {
        subject: block.subject,
        subjectId: block.subjectId ?? null,
        customSubject: block.customSubject ?? null,
        durationMin: block.durationMin,
        mode: block.mode,
        priority: block.priority,
        target: block.target,
        resource: block.resource ?? null,
        startAt: block.startAt ?? null
      },
      recurrence
    });
    setStatus(saved ? `Saved template “${saved.name}”.` : 'Template values were invalid.');
    if (saved) setTemplateName('');
  }

  function applyTemplate(template: PlannerTemplate, recurring: boolean) {
    const dates =
      recurring && template.recurrence
        ? expandPlannerRecurrenceDates({
            ...template.recurrence,
            endDate: template.recurrence.endDate,
            maxOccurrences: template.recurrence.maxOccurrences
          })
        : [plan.date];
    const source = templateSourceBlock(template);
    const plans = dates.map((date) => {
      const target = date === plan.date ? plan : (loadDayPlan(date) ?? emptyDayPlan(date));
      const copied = copyPlannerBlock(source, date, {
        sourceDate: template.recurrence?.startDate ?? plan.date,
        operation: template.recurrence ? 'recurrence' : 'selected-block',
        existingBlockIds: target.sessions.map((session) => session.id)
      });
      return planWithAppended(target, [copied]);
    });
    commit(
      plans,
      recurring && template.recurrence
        ? `Added “${template.name}” to ${plans.length} bounded recurrence date${plans.length === 1 ? '' : 's'}.`
        : `Added “${template.name}” to ${plan.date}.`
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {pending && (
        <div className="border-l-2 border-warn bg-warn/5 px-3 py-2.5" role="alert">
          <p className="text-[12px] font-semibold text-warn">{pending.warning}</p>
          <p className="mt-1 text-[10.5px] text-text-muted">
            Execution evidence in the source is never copied, but the target agenda will be
            replaced.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Keep target
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onPersistPlans(pending.plans, pending.message);
                setStatus(pending.message);
                setPending(null);
              }}
            >
              Confirm replace
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="u-label">Bring a prior plan into this date</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => copySource('yesterday')}>
            <Copy size={11} className="mr-1" /> Copy yesterday
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copySource('last-weekday')}>
            <Copy size={11} className="mr-1" /> Copy last weekday
          </Button>
          <Button size="sm" variant="secondary" onClick={rollYesterdayIntoCurrent}>
            <RotateCcw size={11} className="mr-1" /> Roll yesterday unfinished
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
          <label className="flex flex-col gap-1">
            <span className="u-label">Target date</span>
            <Input
              aria-label="Planner operation target date"
              type="date"
              value={targetDate}
              onChange={(event) =>
                setTargetDateState({ date: plan.date, value: event.target.value })
              }
            />
          </label>
          <div>
            <p className="u-label">Selected actions</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plan.sessions.length === 0 ? (
                <span className="text-[11.5px] text-text-faint">No agenda actions yet.</span>
              ) : (
                plan.sessions.map((session, index) => (
                  <label
                    key={session.id}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px]',
                      selectedIds.has(session.id)
                        ? 'border-accent bg-accent-faint text-accent'
                        : 'border-border text-text-muted'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedIds.has(session.id)}
                      onChange={() =>
                        setSelection((current) => {
                          const next = new Set(
                            current.date === plan.date ? current.deselectedIds : []
                          );
                          if (next.has(session.id)) next.delete(session.id);
                          else next.add(session.id);
                          return { date: plan.date, deselectedIds: next };
                        })
                      }
                    />
                    {index + 1} · {session.subject} · {session.durationMin}m
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copySelectedToTarget}>
            Copy selected
          </Button>
          <Button size="sm" variant="secondary" onClick={rollToTarget}>
            Roll unfinished
          </Button>
          <Button size="sm" variant="secondary" onClick={applyReplicateDecision}>
            Apply Replicate {plan.review.replicate ? `· ${plan.review.replicate}` : ''}
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="u-label">Template name</span>
            <Input
              aria-label="Template name"
              value={templateName}
              maxLength={80}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Morning OS repair"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="u-label">Agenda action</span>
            <Select
              aria-label="Template agenda action"
              value={templateBlockId}
              onChange={(event) =>
                setTemplateBlockState({ date: plan.date, value: event.target.value })
              }
            >
              <option value="">Choose an action</option>
              {plan.sessions.map((session, index) => (
                <option key={session.id} value={session.id}>
                  {index + 1} · {session.subject} · {session.durationMin}m
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="u-label">Recurrence</span>
            <Select
              aria-label="Template recurrence"
              value={recurrenceKind}
              onChange={(event) => setRecurrenceKind(event.target.value as PlannerRecurrenceKind)}
            >
              <option value="none">One-off template</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom weekdays</option>
            </Select>
          </label>
          {recurrenceKind !== 'none' && (
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="u-label">Every</span>
                <Input
                  aria-label="Recurrence interval"
                  type="number"
                  min={1}
                  max={52}
                  value={recurrenceInterval}
                  onChange={(event) =>
                    setRecurrenceInterval(Math.max(1, Number(event.target.value)))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="u-label">End date</span>
                <Input
                  aria-label="Recurrence end date"
                  type="date"
                  min={plan.date}
                  value={recurrenceEndDate}
                  onChange={(event) => setRecurrenceEndDate(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="u-label">Max runs</span>
                <Input
                  aria-label="Maximum recurrence occurrences"
                  type="number"
                  min={1}
                  max={366}
                  value={recurrenceLimit}
                  onChange={(event) => setRecurrenceLimit(Math.max(1, Number(event.target.value)))}
                />
              </label>
            </div>
          )}
        </div>
        {recurrenceKind === 'custom' && (
          <div className="mt-2 flex gap-1" aria-label="Custom recurrence weekdays">
            {WEEKDAYS.map((day, index) => (
              <button
                key={`${day.value}-${index}`}
                type="button"
                aria-pressed={recurrenceWeekdays.includes(day.value)}
                aria-label={`Toggle weekday ${day.value}`}
                onClick={() =>
                  setRecurrenceWeekdays((current) =>
                    current.includes(day.value)
                      ? current.filter((value) => value !== day.value)
                      : [...current, day.value]
                  )
                }
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full border u-num text-[10px]',
                  recurrenceWeekdays.includes(day.value)
                    ? 'border-accent bg-accent-faint text-accent'
                    : 'border-border text-text-faint'
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}
        <Button className="mt-3" size="sm" variant="secondary" onClick={saveSelectedTemplate}>
          <Save size={11} className="mr-1" /> Save reusable template
        </Button>

        {templates.length > 0 && (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div>
                  <p className="text-[12px] font-semibold text-text">{template.name}</p>
                  <p className="mt-0.5 text-[10.5px] text-text-faint">
                    {template.block.subject} · {template.block.durationMin}m ·{' '}
                    {template.recurrence?.kind ?? 'one-off'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => applyTemplate(template, false)}>
                    <CalendarPlus size={11} className="mr-1" /> Add here
                  </Button>
                  {template.recurrence && (
                    <Button size="sm" variant="ghost" onClick={() => applyTemplate(template, true)}>
                      Apply recurrence
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteTemplate(template.id)}
                    aria-label={`Delete template ${template.name}`}
                    className="rounded p-1.5 text-text-faint hover:bg-danger-faint hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status && (
        <p className="border-l-2 border-success pl-2 text-[11.5px] text-text-muted" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
