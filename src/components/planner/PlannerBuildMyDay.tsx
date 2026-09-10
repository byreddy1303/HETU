import { useState } from 'react';
import { AlertTriangle, Check, Clock3, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { approveCompiledDayPlan, plannerSessionFromApprovedAction } from '@/lib/planner-approval';
import {
  compileCapacityAwareDay,
  type CompiledDayPlan,
  type PlannerWorkCandidate
} from '@/lib/planner-compiler';
import {
  estimateProposedPyqRecoveryLoad,
  type ProposedPyqRecoveryLoadEstimate
} from '@/lib/planner-operations';
import { plannerRecoveryDebtFromForecast, type ReviewLoadWindows } from '@/lib/planner-review-load';
import type { DayPlan } from '@/lib/planner-storage';
import { cn } from '@/lib/utils';

interface Props {
  plan: DayPlan;
  candidates: readonly PlannerWorkCandidate[];
  reviewForecast: ReviewLoadWindows;
  historicalCapture?: { capturedCount: number; attemptedCount: number };
  onApprove: (next: DayPlan) => void;
}

function proposalFingerprint(plan: DayPlan, candidates: readonly PlannerWorkCandidate[]): string {
  return JSON.stringify([
    plan.date,
    plan.availability,
    plan.mindset.energyForecast,
    plan.sessions.map((session) => [
      session.id,
      session.durationMin,
      session.priority,
      session.execution?.startedAt,
      session.execution?.completedAt
    ]),
    candidates.map((candidate) => [candidate.id, candidate.estimatedMin, candidate.priority])
  ]);
}

export default function PlannerBuildMyDay({
  plan,
  candidates,
  reviewForecast,
  historicalCapture,
  onApprove
}: Props) {
  const [proposalState, setProposalState] = useState<{
    fingerprint: string;
    proposal: CompiledDayPlan;
  } | null>(null);
  const fingerprint = proposalFingerprint(plan, candidates);
  const proposal = proposalState?.fingerprint === fingerprint ? proposalState.proposal : null;

  function buildProposal() {
    const dueDebt = plannerRecoveryDebtFromForecast(reviewForecast.next7Days);
    setProposalState({
      fingerprint,
      proposal: compileCapacityAwareDay({
        date: plan.date,
        plan,
        capacityMin: plan.availability.availableMin,
        energy: plan.mindset.energyForecast,
        timeWindows: plan.availability.timeWindows,
        recoveryDebt: dueDebt.estimatedMin > 0 ? dueDebt : undefined,
        candidates: candidates.filter((candidate) => candidate.id !== 'evidence:due-recovery'),
        options: {
          bufferMin: plan.availability.protectedBufferMin,
          bufferPct: 0,
          minActions: 3,
          maxActions: 5
        }
      })
    });
  }

  const tomorrow = reviewForecast.next7Days.days[1];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 divide-x divide-border border-y border-border bg-bg sm:grid-cols-4">
        <ForecastStat
          label="Tomorrow"
          value={`${tomorrow?.estimatedMin ?? 0}m`}
          hint={`${tomorrow?.dueCount ?? 0} reviews`}
        />
        <ForecastStat
          label="Next 7 days"
          value={`${reviewForecast.next7Days.totalEstimatedMin}m`}
          hint={`${reviewForecast.next7Days.totalCount} reviews`}
        />
        <ForecastStat
          label="Next 30 days"
          value={`${reviewForecast.next30Days.totalEstimatedMin}m`}
          hint={`${reviewForecast.next30Days.totalCount} reviews`}
        />
        <ForecastStat
          label="Peak day"
          value={reviewForecast.next30Days.peakDay?.date.slice(5) ?? '—'}
          hint={
            reviewForecast.next30Days.peakDay
              ? `${reviewForecast.next30Days.peakDay.estimatedMin}m`
              : 'No scheduled debt'
          }
        />
      </div>

      {!proposal ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-accent pl-3">
          <div>
            <p className="text-[12.5px] font-semibold text-text">Build 3–5 feasible actions</p>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-text-muted">
              Uses {candidates.length} current evidence candidate
              {candidates.length === 1 ? '' : 's'}, reserves due recovery and buffer first, then
              matches work to energy and time windows. Nothing changes until you approve.
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={buildProposal}>
            <Sparkles size={12} className="mr-1" /> Build my day
          </Button>
        </div>
      ) : (
        <ProposalLedger
          plan={plan}
          proposal={proposal}
          historicalCapture={historicalCapture}
          onDiscard={() => setProposalState(null)}
          onApprove={() => onApprove(approveCompiledDayPlan(plan, proposal))}
        />
      )}
    </div>
  );
}

function ProposalLedger({
  plan,
  proposal,
  historicalCapture,
  onDiscard,
  onApprove
}: {
  plan: DayPlan;
  proposal: CompiledDayPlan;
  historicalCapture?: { capturedCount: number; attemptedCount: number };
  onDiscard: () => void;
  onApprove: () => void;
}) {
  const estimates = new Map<string, ProposedPyqRecoveryLoadEstimate>();
  for (const action of proposal.actions) {
    if (
      action.kind !== 'pyq' &&
      action.kind !== 'guess' &&
      action.kind !== 'slow' &&
      !action.href?.startsWith('/pyq')
    ) {
      continue;
    }
    const block = plannerSessionFromApprovedAction(plan.date, action);
    estimates.set(
      action.id,
      estimateProposedPyqRecoveryLoad({
        plannerDate: plan.date,
        block,
        historicalCapture
      })
    );
  }

  return (
    <div className="border-y border-border bg-bg" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-3">
        <div>
          <p className="u-label">Proposed evidence rail · approval required</p>
          <p className="mt-1 text-[12.5px] text-text">
            {proposal.actions.length} actions · {proposal.scheduledMin}m work ·{' '}
            {proposal.bufferReservedMin}m protected
          </p>
          <p
            className={cn(
              'mt-1 text-[11px]',
              proposal.status === 'overloaded' ? 'text-danger' : 'text-text-muted'
            )}
          >
            {proposal.status === 'overloaded'
              ? `${proposal.deferredRecoveryMin}m recovery debt remains outside capacity.`
              : proposal.status === 'underfilled'
                ? 'Fewer than three evidence-backed actions fit; no filler was invented.'
                : 'The proposal fits the entered capacity, energy, windows, and buffer.'}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 u-label',
            proposal.status === 'overloaded'
              ? 'border-danger/40 text-danger'
              : proposal.status === 'underfilled'
                ? 'border-warn/40 text-warn'
                : 'border-success/40 text-success'
          )}
        >
          {proposal.status}
        </span>
      </div>

      <ol className="divide-y divide-border">
        {proposal.actions.map((action, index) => {
          const estimate = estimates.get(action.id);
          return (
            <li key={action.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[34px_1fr_auto]">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/50 u-num text-[10px] text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[13px] font-semibold text-text">{action.title}</p>
                  {action.subject && (
                    <span className="text-[11px] text-text-faint">{action.subject}</span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
                  {action.explanation}
                </p>
                {estimate && (
                  <details className="mt-2 text-[10.5px] text-text-faint">
                    <summary className="cursor-pointer text-warn">
                      Forecast: ~{estimate.expectedRecoveryItems} recovery items ·{' '}
                      {estimate.totalEstimatedMin}m across D3/D10/D30
                    </summary>
                    <p className="mt-1 leading-relaxed">{estimate.formula}</p>
                    <p className="mt-1 leading-relaxed">{estimate.assumptions[0]}</p>
                  </details>
                )}
              </div>
              <div className="flex items-center gap-1.5 self-start u-num text-[11px] text-text-muted">
                <Clock3 size={11} aria-hidden />
                {action.startsAt ? `${action.startsAt} · ` : ''}
                {action.durationMin}m
              </div>
            </li>
          );
        })}
      </ol>

      {proposal.notes.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          {proposal.notes.map((note) => (
            <p key={note} className="flex items-start gap-1.5 text-[10.5px] text-text-faint">
              {proposal.status === 'overloaded' ? (
                <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <span aria-hidden>—</span>
              )}
              {note}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3">
        <p className="max-w-xl text-[10.5px] leading-relaxed text-text-faint">
          Approval replaces only unfinished agenda rows. Active and completed execution evidence is
          retained. Exact PYQ prescriptions are frozen but resolve bank IDs only when started.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            <X size={11} className="mr-1" /> Discard
          </Button>
          <Button size="sm" variant="primary" onClick={onApprove}>
            <Check size={11} className="mr-1" /> Approve day
          </Button>
        </div>
      </div>
    </div>
  );
}

function ForecastStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="u-label">{label}</p>
      <p className="mt-1 u-num text-[12.5px] font-semibold text-text">{value}</p>
      <p className="mt-0.5 text-[10.5px] text-text-faint">{hint}</p>
    </div>
  );
}
