import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MockTestRow } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { SUBJECTS } from '@/lib/constants';
import { db } from '@/lib/db';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { markPlannerBlockComplete } from '@/lib/planner-execution';
import {
  mockAccuracy,
  mockScorePercent,
  mockSubjectScoreRecord,
  mockSubjectScoresFromRecord,
  mockSummary,
  validateMockDraft
} from '@/lib/mocks';
import { cn, formatDate, nowISO, todayISO, uuid } from '@/lib/utils';

interface FormState {
  id: string | null;
  name: string;
  date: string;
  score: string;
  maxMarks: string;
  totalQuestions: string;
  correct: string;
  wrong: string;
  skipped: string;
  duration: string;
  subjectScores: Record<string, string>;
  mistakes: [string, string, string];
}

function blankForm(date = todayISO()): FormState {
  return {
    id: null,
    name: '',
    date,
    score: '',
    maxMarks: '100',
    totalQuestions: '65',
    correct: '',
    wrong: '',
    skipped: '',
    duration: '180',
    subjectScores: {},
    mistakes: ['', '', '']
  };
}

function formFromRow(row: MockTestRow): FormState {
  return {
    id: row.id,
    name: row.name,
    date: row.test_date,
    score: String(row.total_marks),
    maxMarks: String(row.max_marks),
    totalQuestions: String(row.total_questions),
    correct: String(row.correct),
    wrong: String(row.wrong),
    skipped: String(row.skipped),
    duration: String(row.duration_min),
    subjectScores: mockSubjectScoreRecord(row.subject_scores),
    mistakes: [row.mistakes[0] ?? '', row.mistakes[1] ?? '', row.mistakes[2] ?? '']
  };
}

function integer(value: string): number {
  return value.trim() === '' ? 0 : Math.round(Number(value));
}

export default function Mocks() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const [params] = useSearchParams();
  const plannerDate = params.get('plannerDate');
  const plannerBlock = params.get('plannerBlock');
  const initialOpen = params.get('new') === '1';
  const [form, setForm] = useState<FormState>(() => blankForm(params.get('date') ?? todayISO()));
  const [formOpen, setFormOpen] = useState(initialOpen);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const mocks = useLiveQuery(
    async () => {
      if (!userId) return [];
      const rows = await db.mock_tests.where('user_id').equals(userId).sortBy('test_date');
      return rows.reverse();
    },
    [userId],
    []
  );
  const summary = useMemo(() => mockSummary(mocks), [mocks]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function edit(row: MockTestRow) {
    setForm(formFromRow(row));
    setFormOpen(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    if (!userId || saving) return;
    const draft = {
      name: form.name,
      testDate: form.date,
      totalMarks: Number(form.score),
      maxMarks: Number(form.maxMarks),
      totalQuestions: integer(form.totalQuestions),
      correct: integer(form.correct),
      wrong: integer(form.wrong),
      skipped: integer(form.skipped),
      durationMin: integer(form.duration)
    };
    const validation = validateMockDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      const existing = form.id ? await db.mock_tests.get(form.id) : null;
      const now = nowISO();
      const subjectScores = mockSubjectScoresFromRecord(form.subjectScores);
      const row: MockTestRow = {
        id: existing?.id ?? uuid(),
        user_id: userId,
        name: draft.name.trim(),
        test_date: draft.testDate,
        total_marks: draft.totalMarks,
        max_marks: draft.maxMarks,
        total_questions: draft.totalQuestions,
        correct: draft.correct,
        wrong: draft.wrong,
        skipped: draft.skipped,
        duration_min: draft.durationMin,
        subject_scores: subjectScores,
        mistakes: form.mistakes.map((item) => item.trim()).filter(Boolean),
        planner_date: existing?.planner_date ?? plannerDate,
        planner_block_id: existing?.planner_block_id ?? plannerBlock,
        created_at: existing?.created_at ?? now,
        updated_at: now
      };
      await writeLocal('mock_tests', row);
      if (row.planner_date && row.planner_block_id) {
        markPlannerBlockComplete(row.planner_date, row.planner_block_id, row.duration_min);
      }
      setForm(blankForm());
      setFormOpen(false);
      pushToast(existing ? 'Mock updated.' : 'Mock recorded.', 'success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save this mock.';
      setError(message);
      pushToast(message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MockTestRow) {
    try {
      await deleteLocal('mock_tests', row.id);
      setDeletePending(null);
      pushToast('Mock deleted.', 'neutral');
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not delete this mock.', 'danger');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mock tests"
        description="Record mocks taken anywhere. Track scores, subject marks, and repeated losses."
      />

      {!formOpen && (
        <div>
          <Button
            variant="primary"
            onClick={() => {
              setForm(blankForm());
              setFormOpen(true);
            }}
          >
            <Plus size={15} /> Record mock
          </Button>
        </div>
      )}

      {formOpen && (
        <Card className="overflow-hidden">
          <CardHeader title={form.id ? 'Edit mock' : 'Record mock'} />
          <CardBody className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Mock name" className="sm:col-span-2">
                <Input
                  value={form.name}
                  maxLength={140}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="e.g. Test series 04"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  mono
                  value={form.date}
                  onChange={(event) => update('date', event.target.value)}
                />
              </Field>
              <Field label="Duration (min)">
                <NumberInput
                  value={form.duration}
                  onChange={(value) => update('duration', value)}
                  min={1}
                  max={720}
                />
              </Field>
              <Field label="Score">
                <NumberInput
                  value={form.score}
                  onChange={(value) => update('score', value)}
                  step="0.01"
                />
              </Field>
              <Field label="Maximum marks">
                <NumberInput
                  value={form.maxMarks}
                  onChange={(value) => update('maxMarks', value)}
                  min={1}
                  step="0.01"
                />
              </Field>
              <Field label="Total questions">
                <NumberInput
                  value={form.totalQuestions}
                  onChange={(value) => update('totalQuestions', value)}
                  min={1}
                  max={500}
                />
              </Field>
              <div className="hidden lg:block" />
              <Field label="Correct">
                <NumberInput
                  value={form.correct}
                  onChange={(value) => update('correct', value)}
                  min={0}
                />
              </Field>
              <Field label="Wrong">
                <NumberInput
                  value={form.wrong}
                  onChange={(value) => update('wrong', value)}
                  min={0}
                />
              </Field>
              <Field label="Skipped">
                <NumberInput
                  value={form.skipped}
                  onChange={(value) => update('skipped', value)}
                  min={0}
                />
              </Field>
              <div className="flex items-end pb-2 text-[11px] text-text-faint">
                Correct + wrong + skipped must equal total.
              </div>
            </div>

            <details className="rounded border border-border bg-bg-overlay/20">
              <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-semibold text-text">
                Subject-wise marks <span className="font-normal text-text-faint">· optional</span>
              </summary>
              <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
                {SUBJECTS.map((subject) => (
                  <label
                    key={subject}
                    className="flex items-center gap-2 text-[11.5px] text-text-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{subject}</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-20"
                      aria-label={`${subject} marks`}
                      value={form.subjectScores[subject] ?? ''}
                      onChange={(event) =>
                        update('subjectScores', {
                          ...form.subjectScores,
                          [subject]: event.target.value
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </details>

            <fieldset>
              <legend className="u-label mb-2">Three biggest mistakes · optional</legend>
              <div className="grid gap-2">
                {form.mistakes.map((mistake, index) => (
                  <Textarea
                    key={index}
                    rows={2}
                    maxLength={500}
                    value={mistake}
                    aria-label={`Mistake ${index + 1}`}
                    placeholder={`${index + 1}. What cost marks?`}
                    onChange={(event) => {
                      const next = [...form.mistakes] as FormState['mistakes'];
                      next[index] = event.target.value;
                      update('mistakes', next);
                    }}
                  />
                ))}
              </div>
            </fieldset>

            {error && (
              <p
                role="alert"
                className="rounded border border-danger/25 bg-danger-faint px-3 py-2 text-[12px] text-danger"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                onClick={() => {
                  setFormOpen(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save mock'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {mocks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Latest"
            value={`${summary.latest?.total_marks ?? 0}/${summary.latest?.max_marks ?? 100}`}
          />
          <Metric
            label="Change"
            value={
              summary.scoreDelta === null
                ? '—'
                : `${summary.scoreDelta > 0 ? '+' : ''}${summary.scoreDelta} pts`
            }
            tone={summary.scoreDelta !== null && summary.scoreDelta < 0 ? 'danger' : 'success'}
          />
          <Metric label="Best" value={summary.best ? `${mockScorePercent(summary.best)}%` : '—'} />
          <Metric label="Mocks" value={String(mocks.length)} />
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Mock history"
          aside={<span className="u-num text-[11px] text-text-faint">{mocks.length}</span>}
        />
        {mocks.length === 0 ? (
          <Empty
            title="No mocks recorded"
            hint="Log the next mock you take. Hetu only needs the result, not the testing platform."
            className="border-0"
          />
        ) : (
          <div className="u-table-wrap">
            <table className="u-data-table min-w-[780px] text-[12.5px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mock</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>C/W/S</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mocks.map((row, index) => {
                  const prior = mocks[index + 1];
                  const delta = prior ? mockScorePercent(row) - mockScorePercent(prior) : null;
                  return (
                    <tr key={row.id}>
                      <td className="u-num whitespace-nowrap">
                        {formatDate(row.test_date, 'dd MMM yy')}
                      </td>
                      <td>
                        <p className="font-semibold text-text">{row.name}</p>
                        {row.mistakes[0] && (
                          <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-text-faint">
                            {row.mistakes[0]}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className="u-num font-semibold text-text">
                          {row.total_marks}/{row.max_marks}
                        </span>
                        {delta !== null && (
                          <span
                            className={cn(
                              'ml-2 inline-flex items-center text-[10px]',
                              delta >= 0 ? 'text-success' : 'text-danger'
                            )}
                          >
                            {delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                            {Math.abs(Math.round(delta * 10) / 10)}
                          </span>
                        )}
                      </td>
                      <td className="u-num">
                        {mockAccuracy(row) ?? '—'}
                        {mockAccuracy(row) !== null && '%'}
                      </td>
                      <td className="u-num">
                        {row.correct}/{row.wrong}/{row.skipped}
                      </td>
                      <td className="u-num">{row.duration_min}m</td>
                      <td>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => edit(row)}>
                            <Pencil size={12} /> Edit
                          </Button>
                          {deletePending === row.id ? (
                            <Button size="sm" variant="danger" onClick={() => void remove(row)}>
                              Confirm
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeletePending(row.id)}
                            >
                              <Trash2 size={12} /> Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
    <label className={cn('text-[12px] font-medium text-text-muted', className)}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step
}: {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <Input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(event.target.value)}
      mono
    />
  );
}

function Metric({
  label,
  value,
  tone = 'normal'
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'success' | 'danger';
}) {
  return (
    <Card>
      <CardBody>
        <p className="u-label">{label}</p>
        <p
          className={cn(
            'u-num mt-1 text-[20px] font-semibold',
            tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-text'
          )}
        >
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
