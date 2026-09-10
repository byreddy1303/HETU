// Cross-day rollups from every DayPlan in localStorage. Purely local — no
// server round-trip. Refreshes whenever `revision` (a number driven by
// upstream saves) changes.
import { useMemo } from 'react';
import { ChevronDown, Plus, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PLANNER_SUBJECTS } from '@/lib/planner-constants';
import {
  loadAllDayPlans,
  modeShare,
  neglectedSubjects,
  priorityShare,
  reviewStats,
  rollup,
  subjectShare,
  windowed,
  type Share
} from '@/lib/planner-insights';
import { cn } from '@/lib/utils';
import { isNativeApp } from '@/lib/native';
import { plannerPlanVsActualBySubjectMode } from '@/lib/planner-operations';
import type { PlannerWorkCandidate } from '@/lib/planner-compiler';
import { todayISO } from '@/lib/utils';

interface Props {
  /** Bumped by the caller after saves/deletes so the memo recomputes. */
  revision: number;
  evidenceCandidates?: readonly PlannerWorkCandidate[];
  onCreateEvidenceBlock?: (candidate: PlannerWorkCandidate) => void;
  onCreateNeglectedBlock?: (subject: string) => void;
}

function formatHours(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

export default function PlannerInsights({
  revision,
  evidenceCandidates = [],
  onCreateEvidenceBlock,
  onCreateNeglectedBlock
}: Props) {
  const { plans, plans30, r30, subj30, mode30, prio30, review30, neglect30, calibration } =
    useMemo(() => {
      void revision;
      const plans = loadAllDayPlans();
      const plans30 = windowed(plans, 30);
      return {
        plans,
        plans30,
        r30: rollup(plans30),
        subj30: subjectShare(plans30),
        mode30: modeShare(plans30),
        prio30: priorityShare(plans30),
        review30: reviewStats(plans30),
        neglect30: neglectedSubjects(plans30, PLANNER_SUBJECTS, 30, 60),
        calibration: plannerPlanVsActualBySubjectMode(plans, { throughDate: todayISO() }).filter(
          (row) => row.timeEvidenceBlockCount > 0 || row.plannedQuestionsWithResult > 0
        )
      };
    }, [revision]);

  if (plans.length === 0 && evidenceCandidates.length === 0) {
    return null;
  }

  if (isNativeApp) {
    return (
      <Card>
        <CardHeader title="30-day overview" aside={<span className="u-label">on-device</span>} />
        <CardBody className="flex flex-col gap-6">
          <ActionablePriorities candidates={evidenceCandidates} onCreate={onCreateEvidenceBlock} />
          {plans30.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-text-muted">
              No plans in the last 30 days. Pick a date above to begin.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Kpi label="Days planned" value={String(r30.daysPlanned)} />
                <Kpi label="Total planned" value={formatHours(r30.totalMinPlanned)} />
                <Kpi
                  label="Sessions / day"
                  value={String(r30.avgSessionsPerDay)}
                  hint={`Average ${r30.avgSessionDurationMin}m`}
                />
                <Kpi
                  label="Completion"
                  value={review30.reviewedDays > 0 ? `${review30.avgCompletionPct}%` : '—'}
                  hint={`${review30.reviewedDays} days reviewed`}
                />
              </div>

              <details className="group overflow-hidden rounded-[16px] border border-border bg-bg-raised">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between px-4 text-[13px] font-semibold text-text">
                  Study balance
                  <ChevronDown
                    size={17}
                    strokeWidth={1.75}
                    className="text-text-faint transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="flex flex-col gap-6 border-t border-border p-4">
                  <ShareBlock title="Subject share" shares={subj30.slice(0, 8)} />
                  <ShareBlock title="Study modes" shares={mode30} />
                  <ShareBlock title="Priority mix" shares={prio30} />

                  {review30.reviewedDays > 0 && (
                    <div className="rounded-[14px] bg-bg-overlay/55 p-4">
                      <p className="u-label mb-3">Would you repeat the plan?</p>
                      <div className="grid grid-cols-3 gap-3 text-center text-[12px]">
                        <Kpi label="Yes" value={String(review30.replicateYes)} />
                        <Kpi label="Partly" value={String(review30.replicatePartial)} />
                        <Kpi label="No" value={String(review30.replicateNo)} />
                      </div>
                    </div>
                  )}

                  {neglect30.length > 0 && (
                    <div className="rounded-[14px] border border-warn/35 bg-warn/5 p-4">
                      <p className="u-label text-warn">Needs room next month</p>
                      <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                        Subjects with less than 60 planned minutes.
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {neglect30.slice(0, 8).map((s) => (
                          <li
                            key={s.label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-raised px-3 py-1.5 text-[11.5px] text-text"
                          >
                            {s.label} <span className="u-num text-text-faint">{s.min}m</span>
                            {onCreateNeglectedBlock && (
                              <button
                                type="button"
                                onClick={() => onCreateNeglectedBlock(s.label)}
                                className="rounded-full p-0.5 text-accent"
                                aria-label={`Create ${s.label} Planner block`}
                              >
                                <Plus size={11} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <CalibrationLedger rows={calibration} />
                </div>
              </details>
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Planner insights"
        aside={
          <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
            <Sparkles size={11} strokeWidth={1.75} /> last 30 days · on-device
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <ActionablePriorities candidates={evidenceCandidates} onCreate={onCreateEvidenceBlock} />
        {plans30.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">
            No plans in the last 30 days. Your all-time count is{' '}
            <span className="u-num text-text">{plans.length}</span> — pick a date in the calendar to
            start.
          </p>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Days planned" value={String(r30.daysPlanned)} />
              <Kpi label="Total planned" value={formatHours(r30.totalMinPlanned)} />
              <Kpi
                label="Avg sessions/day"
                value={String(r30.avgSessionsPerDay)}
                hint={`Avg length ${r30.avgSessionDurationMin}m`}
              />
              <Kpi
                label="Avg completion"
                value={review30.reviewedDays > 0 ? `${review30.avgCompletionPct}%` : '—'}
                hint={`${review30.reviewedDays} days reviewed`}
              />
            </div>

            {/* Subject share */}
            <ShareBlock title="Subject share (by minutes)" shares={subj30.slice(0, 8)} />

            {/* Mode share */}
            <ShareBlock title="Study mode split" shares={mode30} />

            {/* Priority share */}
            <ShareBlock title="Priority mix" shares={prio30} />

            {/* Replicate rate */}
            {review30.reviewedDays > 0 && (
              <div className="rounded border border-border bg-bg-overlay/40 p-3">
                <p className="u-label mb-1.5">Would you replicate the plan?</p>
                <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-text">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Yes:{' '}
                    <span className="u-num font-semibold">{review30.replicateYes}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Partial:{' '}
                    <span className="u-num font-semibold">{review30.replicatePartial}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" /> No:{' '}
                    <span className="u-num font-semibold">{review30.replicateNo}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Neglected subjects */}
            {neglect30.length > 0 && (
              <div className="rounded border border-warn/40 bg-warn/5 p-3">
                <p className="u-label mb-1 text-warn">Neglected in last 30 days</p>
                <p className="text-[12.5px] text-text-muted">
                  These GATE-CS subjects got &lt; 60 min of planned time.
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {neglect30.slice(0, 8).map((s) => (
                    <li
                      key={s.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-raised px-2.5 py-0.5 text-[11.5px] text-text"
                    >
                      {s.label}
                      <span className="ml-1 u-num text-text-faint">{s.min}m</span>
                      {onCreateNeglectedBlock && (
                        <button
                          type="button"
                          onClick={() => onCreateNeglectedBlock(s.label)}
                          className="rounded-full p-0.5 text-accent hover:bg-accent-faint"
                          aria-label={`Create ${s.label} Planner block`}
                        >
                          <Plus size={11} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CalibrationLedger rows={calibration} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ActionablePriorities({
  candidates,
  onCreate
}: {
  candidates: readonly PlannerWorkCandidate[];
  onCreate?: (candidate: PlannerWorkCandidate) => void;
}) {
  const visible = candidates.filter((candidate) => candidate.kind !== 'planned').slice(0, 5);
  if (visible.length === 0) return null;
  return (
    <section className="border-y border-border bg-bg" aria-label="Current evidence priorities">
      <div className="border-b border-border px-3 py-2">
        <p className="u-label">Current evidence priorities</p>
        <p className="mt-1 text-[10.5px] text-text-faint">
          These are live obligations, not retrospective activity counts.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-text">{candidate.title}</p>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-text-muted">
                {candidate.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="u-num text-[10.5px] text-text-faint">{candidate.estimatedMin}m</span>
              {onCreate && (
                <Button size="sm" variant="ghost" onClick={() => onCreate(candidate)}>
                  <Plus size={11} /> Add block
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CalibrationLedger({
  rows
}: {
  rows: ReturnType<typeof plannerPlanVsActualBySubjectMode>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="border-y border-border bg-bg" aria-label="Planner estimation calibration">
      <div className="border-b border-border px-3 py-2">
        <p className="u-label">Plan vs actual · calibration evidence</p>
        <p className="mt-1 text-[10.5px] text-text-faint">
          Actual time and question outcomes are kept separate from target completion.
        </p>
      </div>
      <div className="u-table-wrap">
        <table className="u-data-table min-w-[650px] text-[11px]">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Subject / mode</th>
              <th className="px-3 py-2 text-right">Plan / actual</th>
              <th className="px-3 py-2 text-right">Mean error</th>
              <th className="px-3 py-2 text-right">PYQs done</th>
              <th className="px-3 py-2 text-right">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={`${row.subject}:${row.mode}`}>
                <td className="px-3 py-2">
                  <span className="font-semibold text-text">{row.subject}</span>
                  <span className="block text-[10px] text-text-faint">{row.mode}</span>
                </td>
                <td className="px-3 py-2 text-right u-num text-text-muted">
                  {row.plannedMinWithActual}m / {row.actualMin}m
                </td>
                <td className="px-3 py-2 text-right u-num text-text-muted">
                  {row.meanErrorMin == null
                    ? '—'
                    : `${row.meanErrorMin > 0 ? '+' : ''}${row.meanErrorMin}m`}
                </td>
                <td className="px-3 py-2 text-right u-num text-text-muted">
                  {row.plannedQuestionsWithResult > 0
                    ? `${row.attemptedQuestions}/${row.plannedQuestionsWithResult}`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right u-num text-text-muted">
                  {row.answerAccuracyPct == null ? '—' : `${row.answerAccuracyPct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="planner-kpi rounded border border-border bg-bg-overlay/40 px-3 py-2">
      <p className="u-label">{label}</p>
      <p className="u-num mt-0.5 text-[20px] font-semibold text-text">{value}</p>
      {hint && <p className="text-[10.5px] text-text-faint">{hint}</p>}
    </div>
  );
}

function ShareBlock({
  title,
  shares,
  unit = 'min'
}: {
  title: string;
  shares: Share[];
  unit?: 'min' | 'days';
}) {
  if (shares.length === 0) return null;
  const max = shares[0].min;
  return (
    <div>
      <p className="u-label mb-1.5">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {shares.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-40 truncate text-text">{s.label}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-overlay">
              <div
                className={cn('absolute inset-y-0 left-0 rounded', 'bg-accent')}
                style={{ width: `${Math.max(2, Math.round((s.min / max) * 100))}%` }}
              />
            </div>
            <span className="u-num w-24 text-right text-text-muted">
              {unit === 'min' ? formatHours(s.min) : `${s.min} d`} · {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
