// F5.4 — MARK / SKIP / 50-50 calibration under -1/3 negative marking.
// Shows per-subject accuracy + expected value + a nudge on whether to
// raise/lower confidence threshold. Also lets the user quickly edit
// mark_decision / mark_correct on questions that are missing them.
//
// UX notes (2026-07-19 refresh):
//   - Option labels are plain English instead of the internal MARK/SKIP/FIFTY_FIFTY
//     codes. The Empty state below explains what each choice means.
//   - Every decision keeps a 10s toast-style undo. If you close it, the row is
//     also editable from the "Recently decided" panel so you can still fix
//     mistakes days later.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  History,
  Info,
  MinusCircle,
  RotateCcw,
  X
} from 'lucide-react';
import type { QuestionRow } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db';
import { writeLocal } from '@/lib/sync';
import { useAuth } from '@/hooks/useAuth';
import { calibrationBySubject, calibrationOverall, type CalibrationRow } from '@/lib/analysis';
import { cn, formatDate, plural } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { OUTCOME_BY_CODE } from '@/lib/constants';
import type { MarkDecision } from '@/types';

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${Math.round(v * 100)}%`;
}

function fmtEV(v: number): string {
  return v.toFixed(2);
}

/** Plain-language labels for the three decision options.
 *
 *  MARK is exam jargon: "I chose to answer this question under −⅓ negative
 *  marking." Users kept confusing it with "marked-for-review". The renames
 *  below stick with jargon-free verbs. */
const DECISION_OPTIONS: {
  value: MarkDecision;
  label: string;
  hint: string;
  Icon: typeof Check;
  tone: 'accent' | 'warn' | 'muted';
}[] = [
  {
    value: 'MARK',
    label: 'I answered it',
    hint: 'You committed to an option under −⅓ negative marking.',
    Icon: Check,
    tone: 'accent'
  },
  {
    value: 'FIFTY_FIFTY',
    label: 'Guessed 50/50',
    hint: 'You eliminated two options and picked between the other two.',
    Icon: AlertTriangle,
    tone: 'warn'
  },
  {
    value: 'SKIP',
    label: 'Left blank',
    hint: 'You skipped this question to avoid the −⅓.',
    Icon: MinusCircle,
    tone: 'muted'
  }
];

const RECOMMENDATION_COPY: Record<
  CalibrationRow['recommendation'],
  { label: string; hint: string; tone: 'success' | 'warn' | 'neutral' }
> = {
  raise: {
    label: 'Skip more',
    hint: 'Committed-answer accuracy is below the 25% break-even point and answer EV is negative.',
    tone: 'warn'
  },
  lower: {
    label: 'Answer more',
    hint: 'Committed-answer accuracy is above 80%, answer EV is strong, and some questions were skipped.',
    tone: 'success'
  },
  hold: {
    label: 'Hold threshold',
    hint: 'The current evidence does not support answering materially more or less.',
    tone: 'neutral'
  },
  insufficient: {
    label: 'Need more decisions',
    hint: 'Fewer than four answered decisions is not enough evidence to recommend a threshold.',
    tone: 'neutral'
  }
};

interface UndoSnapshot {
  id: string;
  prev: Pick<QuestionRow, 'mark_decision' | 'mark_correct'>;
  label: string;
  at: number;
}

export default function Calibration() {
  const { userId } = useAuth();
  const questions = useLiveQuery(
    async () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const rows = useMemo(() => calibrationBySubject(questions), [questions]);
  const overall = useMemo(() => calibrationOverall(rows), [rows]);

  const allMissing = useMemo(
    () =>
      questions
        .filter((q) => q.mark_decision === null)
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1)),
    [questions]
  );
  const missing = allMissing.slice(0, 25);

  const recentDecided = useMemo(
    () =>
      questions
        .filter((q) => q.mark_decision !== null)
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
        .slice(0, 15),
    [questions]
  );

  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!undo) return;
    undoTimer.current = setTimeout(() => setUndo(null), 10_000);
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, [undo]);

  async function stashUndoAndPersist(
    q: QuestionRow,
    update: Partial<Pick<QuestionRow, 'mark_decision' | 'mark_correct'>>,
    label: string
  ) {
    setUndo({
      id: q.id,
      prev: { mark_decision: q.mark_decision, mark_correct: q.mark_correct },
      label,
      at: Date.now()
    });
    await writeLocal('questions', { ...q, ...update });
  }

  async function doUndo() {
    if (!undo) return;
    const q = questions.find((x) => x.id === undo.id);
    if (!q) {
      setUndo(null);
      return;
    }
    await writeLocal('questions', { ...q, ...undo.prev });
    setUndo(null);
  }

  async function resetRow(q: QuestionRow) {
    await stashUndoAndPersist(q, { mark_decision: null, mark_correct: null }, 'Cleared decision');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calibration"
        description="How well your answer/skip calls hold up under −⅓ negative marking."
      />

      <Card>
        <CardHeader title="Overall this account" />
        <CardBody>
          {overall.decided === 0 && overall.skipped === 0 ? (
            <Empty
              title="Nothing to calibrate yet"
              hint="Tell us what you did on a logged question below. It takes a second per row."
              className="border-0 py-8"
            />
          ) : (
            <div className="calibration-summary grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCell label="Answered" value={overall.decided} />
              <StatCell label="Correct" value={overall.correct} color="text-success" />
              <StatCell label="Wrong" value={overall.wrong} color="text-danger" />
              <StatCell label="Left blank" value={overall.skipped} muted />
              <div className="flex flex-col gap-1 rounded border border-border bg-bg-overlay/40 px-3 py-2">
                <span className="u-label">Expected value / Q</span>
                <span
                  className={cn(
                    'u-num text-[20px] font-semibold leading-none',
                    overall.expectedValue > 0
                      ? 'text-success'
                      : overall.expectedValue < 0
                        ? 'text-danger'
                        : 'text-text-faint'
                  )}
                >
                  {fmtEV(overall.expectedValue)}
                </span>
                <span className="text-[11px] text-text-faint">
                  Committed-answer accuracy {fmtPct(overall.accuracy)}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Per subject" />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-[13px] text-text-faint">
              Nothing tagged yet. Set a decision on any question via the inbox below.
            </p>
          ) : (
            <div className="u-mobile-cards-wrap u-table-wrap">
              <table className="u-data-table u-mobile-cards min-w-[760px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
                    <th className="px-4 py-2 font-mono">Subject</th>
                    <th className="px-2 py-2 text-right font-mono">Answered</th>
                    <th className="px-2 py-2 text-right font-mono">50/50</th>
                    <th className="px-2 py-2 text-right font-mono">Blank</th>
                    <th className="px-2 py-2 text-right font-mono">Answer accuracy</th>
                    <th className="px-2 py-2 text-right font-mono">EV / Q</th>
                    <th className="px-4 py-2 font-mono">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const rec = RECOMMENDATION_COPY[r.recommendation];
                    const answered = r.marked + r.fiftyFifty;
                    const ink = subjectInk(r.subject);
                    return (
                      <tr key={r.subject}>
                        <td data-label="Subject" data-mobile-primary className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
                            <span className="font-medium text-text">{r.subject}</span>
                          </span>
                        </td>
                        <td
                          data-label="Answered"
                          className="u-num px-2 py-2 text-right text-text-muted"
                        >
                          {r.markedCorrect}/{r.marked}
                        </td>
                        <td
                          data-label="50/50"
                          className="u-num px-2 py-2 text-right text-text-muted"
                        >
                          {r.fiftyFiftyCorrect}/{r.fiftyFifty}
                        </td>
                        <td
                          data-label="Blank"
                          className="u-num px-2 py-2 text-right text-text-muted"
                        >
                          {r.skipped}
                        </td>
                        <td data-label="Answer accuracy" className="u-num px-2 py-2 text-right">
                          {fmtPct(r.accuracy)}
                        </td>
                        <td
                          data-label="Expected value / Q"
                          className={cn(
                            'u-num px-2 py-2 text-right font-semibold',
                            r.expectedValue > 0
                              ? 'text-success'
                              : r.expectedValue < 0
                                ? 'text-danger'
                                : 'text-text-faint'
                          )}
                        >
                          {fmtEV(r.expectedValue)}
                        </td>
                        <td data-label="Recommendation" data-mobile-wide className="px-4 py-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 text-[12px]',
                              rec.tone === 'warn' && 'text-warn',
                              rec.tone === 'success' && 'text-success',
                              rec.tone === 'neutral' && 'text-text-muted'
                            )}
                            title={rec.hint}
                          >
                            {rec.tone === 'warn' ? (
                              <AlertTriangle size={12} strokeWidth={2} />
                            ) : rec.tone === 'success' ? (
                              <Check size={12} strokeWidth={2} />
                            ) : (
                              <Info size={12} strokeWidth={2} />
                            )}
                            {r.recommendation === 'insufficient'
                              ? `${Math.max(0, 4 - answered)} more needed`
                              : rec.label}
                          </span>
                          <span className="mt-0.5 block max-w-[250px] text-[10.5px] leading-relaxed text-text-faint">
                            {rec.hint}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Waiting on a decision"
          aside={
            allMissing.length > 0 && (
              <Badge tone="warn">
                {allMissing.length} {plural(allMissing.length, 'row')}
              </Badge>
            )
          }
        />
        <CardBody className="p-0">
          {missing.length === 0 ? (
            <p className="p-4 text-[13px] text-text-faint">
              Every logged question has a decision. Nothing to do here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {missing.map((q) => (
                <MissingRow
                  key={q.id}
                  q={q}
                  onDecide={(update, label) => void stashUndoAndPersist(q, update, label)}
                />
              ))}
            </ul>
          )}
          {allMissing.length > missing.length && (
            <p className="border-t border-border px-4 py-2 text-[11.5px] text-text-faint">
              Showing the newest 25 of {allMissing.length}. Record these before older rows.
            </p>
          )}
        </CardBody>
      </Card>

      {recentDecided.length > 0 && (
        <Card>
          <CardHeader
            title="Latest recorded decisions"
            aside={
              <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
                <History size={11} strokeWidth={1.75} /> ordered by question date
              </span>
            }
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {recentDecided.map((q) => (
                <DecidedRow key={q.id} q={q} onReset={() => void resetRow(q)} />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-text-faint">
          <span className="u-label">EV math</span>
          <span>
            Blank = <span className="u-num">0</span>
          </span>
          <span>
            Answered correct = <span className="u-num">+1</span>
          </span>
          <span>
            Answered wrong = <span className="u-num">−⅓</span>
          </span>
          <span className="ml-auto">
            EV / Q averages over every recorded decision. Blank answers contribute zero, so the
            number evaluates the full answer/skip policy.
          </span>
        </CardBody>
      </Card>

      {undo && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-bg-raised px-4 py-2 shadow-lift">
          <span className="text-[12.5px] text-text-muted">{undo.label}.</span>
          <button
            type="button"
            onClick={() => void doUndo()}
            className="inline-flex items-center gap-1 rounded-full bg-accent-faint px-3 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-contrast"
          >
            <RotateCcw size={11} strokeWidth={2} />
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label="Dismiss"
            className="rounded-full p-0.5 text-text-faint hover:text-text"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  color,
  muted = false
}: {
  label: string;
  value: number;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-bg-overlay/40 px-3 py-2">
      <span className="u-label">{label}</span>
      <span
        className={cn(
          'u-num text-[20px] font-semibold leading-none',
          value > 0 ? (color ?? 'text-text') : muted ? 'text-text-faint' : 'text-text-faint'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MissingRow({
  q,
  onDecide
}: {
  q: QuestionRow;
  onDecide: (
    update: Partial<Pick<QuestionRow, 'mark_decision' | 'mark_correct'>>,
    label: string
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<MarkDecision | null>(null);
  const spec = OUTCOME_BY_CODE[q.outcome];

  function pickDecision(v: MarkDecision) {
    // SKIP has no correctness follow-up — persist immediately and collapse.
    if (v === 'SKIP') {
      onDecide({ mark_decision: 'SKIP', mark_correct: null }, 'Marked as left blank');
      setOpen(false);
      return;
    }
    setDecision(v);
  }

  function pickOutcome(correct: boolean) {
    if (!decision) return;
    onDecide(
      { mark_decision: decision, mark_correct: correct },
      correct ? 'Recorded correct answer' : 'Recorded wrong answer'
    );
    setDecision(null);
    setOpen(false);
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-bg-overlay/40"
      >
        <span className="u-num w-[74px] shrink-0 text-[11px] text-text-faint">
          {formatDate(q.created_at.slice(0, 10), 'dd MMM')}
        </span>
        <span className="flex w-[170px] shrink-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', subjectInk(q.subject).dot)} />
          <span className="truncate text-[12px] text-text-muted">{q.subject}</span>
        </span>
        <Badge
          tone={
            spec.tone === 'ok'
              ? 'success'
              : spec.tone === 'slow'
                ? 'warn'
                : spec.tone === 'guess'
                  ? 'guess'
                  : 'danger'
          }
        >
          {q.outcome}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {q.pattern_name ?? <span className="text-text-faint">no pattern</span>}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn('shrink-0 text-text-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-border bg-bg-overlay/40 px-4 py-3">
          {decision === null ? (
            <div className="flex flex-col gap-2">
              <p className="u-label">What did you do on this question in the mock/exam?</p>
              <div className="flex flex-wrap gap-2">
                {DECISION_OPTIONS.map((opt) => {
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => pickDecision(opt.value)}
                      title={opt.hint}
                      className={cn(
                        'inline-flex flex-col items-start gap-0.5 rounded border px-3 py-2 text-left transition-colors',
                        opt.tone === 'accent' &&
                          'border-border bg-bg-raised hover:border-accent hover:bg-accent-faint',
                        opt.tone === 'warn' &&
                          'border-border bg-bg-raised hover:border-warn hover:bg-warn/5',
                        opt.tone === 'muted' &&
                          'border-border bg-bg-raised hover:border-border-hover'
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
                        <Icon size={13} strokeWidth={2} />
                        {opt.label}
                      </span>
                      <span className="text-[11px] text-text-muted">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="u-label">
                You picked{' '}
                <span className="text-text">
                  {DECISION_OPTIONS.find((o) => o.value === decision)?.label}
                </span>
                . Was your answer correct?
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => pickOutcome(true)}>
                  <Check size={13} strokeWidth={2} className="mr-1" />
                  Correct
                </Button>
                <Button variant="danger" size="sm" onClick={() => pickOutcome(false)}>
                  <X size={13} strokeWidth={2} className="mr-1" />
                  Wrong
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDecision(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function DecidedRow({ q, onReset }: { q: QuestionRow; onReset: () => void }) {
  const decLabel = DECISION_OPTIONS.find((o) => o.value === q.mark_decision)?.label ?? '—';
  const outcomeLabel =
    q.mark_decision === 'SKIP'
      ? 'left blank'
      : q.mark_correct === true
        ? 'correct'
        : q.mark_correct === false
          ? 'wrong'
          : 'no outcome';
  const outcomeTone =
    q.mark_decision === 'SKIP'
      ? 'text-text-faint'
      : q.mark_correct
        ? 'text-success'
        : 'text-danger';

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="u-num w-[74px] shrink-0 text-[11px] text-text-faint">
        {formatDate(q.created_at.slice(0, 10), 'dd MMM')}
      </span>
      <span className="flex w-[170px] shrink-0 items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', subjectInk(q.subject).dot)} />
        <span className="truncate text-[12px] text-text-muted">{q.subject}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">
        {decLabel} · <span className={outcomeTone}>{outcomeLabel}</span>
      </span>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded border border-border bg-bg-raised px-2 py-1 text-[11.5px] text-text-muted transition-colors hover:border-border-hover hover:text-text"
        title="Clear this decision so it goes back to the inbox"
      >
        <RotateCcw size={11} strokeWidth={1.75} />
        Reset
      </button>
    </li>
  );
}
