import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import { SUBJECTS } from '@/lib/constants';
import { addDaysISO, formatDate, nowISO, todayISO, uuid } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import type { FormulaRow } from '@/types';

const DEFAULT_SUBJECT = SUBJECTS[0];
const REVIEW_INTERVALS = [3, 10, 30];

function nextReviewOnRecall(row: FormulaRow, today: string): string {
  const current = row.last_reviewed ?? row.created_at.slice(0, 10);
  const gap = Math.round((new Date(today).getTime() - new Date(current).getTime()) / 86_400_000);
  const nextIndex = REVIEW_INTERVALS.findIndex((days) => days > gap);
  const delay = nextIndex === -1 ? REVIEW_INTERVALS.at(-1)! : REVIEW_INTERVALS[nextIndex];
  return addDaysISO(today, delay);
}

export default function Formulas() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const today = todayISO();
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [subject, setSubject] = useState<string>(DEFAULT_SUBJECT);
  const [saving, setSaving] = useState(false);

  const formulas = useLiveQuery(
    async () => (userId ? db.formulas.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const dueToday = useMemo(
    () => formulas.filter((formula) => formula.next_review <= today),
    [formulas, today]
  );
  const bySubject = useMemo(() => {
    const grouped = new Map<string, FormulaRow[]>();
    for (const formula of formulas) {
      const rows = grouped.get(formula.subject) ?? [];
      rows.push(formula);
      grouped.set(formula.subject, rows);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [formulas]);

  async function addFormula() {
    if (!userId || !name.trim() || !expression.trim() || saving) return;
    setSaving(true);
    try {
      await writeLocal('formulas', {
        id: uuid(),
        user_id: userId,
        name: name.trim(),
        subject,
        expression: expression.trim(),
        forgot_count: 0,
        last_reviewed: null,
        next_review: today,
        created_at: nowISO()
      });
      setName('');
      setExpression('');
      pushToast('Formula added to today’s review.', 'success');
    } finally {
      setSaving(false);
    }
  }

  async function markRecalled(row: FormulaRow) {
    await writeLocal('formulas', {
      ...row,
      last_reviewed: today,
      next_review: nextReviewOnRecall(row, today)
    });
  }

  async function markForgot(row: FormulaRow) {
    await writeLocal('formulas', {
      ...row,
      forgot_count: row.forgot_count + 1,
      last_reviewed: today,
      next_review: addDaysISO(today, REVIEW_INTERVALS[0])
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Formulas"
        description="Build a compact formula library by hand, then review each item on a calm spaced schedule."
      />

      <Card>
        <CardHeader
          title="Add formula"
          aside={<span className="text-[11px] text-text-faint">due today after saving</span>}
        />
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(160px,.7fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void addFormula();
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name, e.g. Bayes theorem"
              maxLength={120}
              aria-label="Formula name"
            />
            <Input
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              placeholder="Expression"
              maxLength={500}
              className="font-mono"
              aria-label="Formula expression"
            />
            <Select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              aria-label="Subject"
            >
              {SUBJECTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || !expression.trim() || saving}
            >
              <Plus size={15} strokeWidth={1.8} />
              Add
            </Button>
          </form>
        </CardBody>
      </Card>

      {dueToday.length > 0 && (
        <Card>
          <CardHeader
            title="Due today"
            aside={<span className="u-num text-[11px] text-text-faint">{dueToday.length}</span>}
          />
          <ul className="divide-y divide-border">
            {dueToday.map((formula) => (
              <FormulaReviewRow
                key={formula.id}
                row={formula}
                onRecalled={() => void markRecalled(formula)}
                onForgot={() => void markForgot(formula)}
                onDelete={() => void deleteLocal('formulas', formula.id)}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Library"
          aside={<span className="u-num text-[11px] text-text-faint">{formulas.length}</span>}
        />
        {formulas.length === 0 ? (
          <Empty
            title="No formulas yet"
            hint="Add only the formulas you need to recall under pressure. A smaller reviewed set beats a large forgotten one."
            className="border-0 py-8"
          />
        ) : (
          <div className="flex flex-col">
            {bySubject.map(([subjectName, rows]) => {
              const ink = subjectInk(subjectName);
              return (
                <div key={subjectName}>
                  <div className="flex items-center gap-2 border-b border-border/60 bg-bg-overlay/30 px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${ink.dot}`} />
                    <span className={`font-medium ${ink.text}`}>{subjectName}</span>
                    <span className="u-num ml-auto text-text-faint">{rows.length}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {rows.map((formula) => (
                      <FormulaLibraryRow
                        key={formula.id}
                        row={formula}
                        onDelete={() => void deleteLocal('formulas', formula.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function FormulaReviewRow({
  row,
  onRecalled,
  onForgot,
  onDelete
}: {
  row: FormulaRow;
  onRecalled: () => void;
  onForgot: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display font-semibold text-text">{row.name}</span>
          <code className="max-w-full break-words rounded bg-bg-overlay px-1.5 py-0.5 font-mono text-[12px] text-accent">
            {row.expression}
          </code>
        </div>
        <p className="text-[11.5px] text-text-faint">
          due {formatDate(row.next_review, 'dd MMM')} ·{' '}
          {row.forgot_count > 0 && `forgot ${row.forgot_count}× · `}
          {row.last_reviewed ? `last ${formatDate(row.last_reviewed, 'dd MMM')}` : 'never reviewed'}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        <Button variant="ghost" size="sm" onClick={onForgot}>
          <RotateCcw size={12} strokeWidth={1.75} /> Forgot
        </Button>
        <Button variant="primary" size="sm" onClick={onRecalled}>
          Recalled
        </Button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete formula"
          className="rounded p-1 text-text-faint hover:text-danger"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

function FormulaLibraryRow({ row, onDelete }: { row: FormulaRow; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [expression, setExpression] = useState(row.expression);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !expression.trim()) return;
    setSaving(true);
    try {
      await writeLocal('formulas', { ...row, name: name.trim(), expression: expression.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-bg-overlay/30">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
            />
            <Input
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              placeholder="Expression"
              className="font-mono"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display font-semibold text-text">{row.name}</span>
            <code className="max-w-full break-words rounded bg-bg-overlay px-1.5 py-0.5 font-mono text-[12px] text-accent">
              {row.expression}
            </code>
            {row.forgot_count > 0 && <Badge tone="warn">{row.forgot_count} forgot</Badge>}
          </div>
        )}
        <p className="text-[11px] text-text-faint">
          next review {formatDate(row.next_review, 'dd MMM')}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto">
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
              Save
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] text-text-faint underline decoration-dotted underline-offset-2 hover:text-text"
            >
              edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete formula"
              className="rounded p-1 text-text-faint hover:text-danger"
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
