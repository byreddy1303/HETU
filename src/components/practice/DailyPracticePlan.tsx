import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError, type PracticePlan } from '@/lib/practice-coach';

export default function DailyPracticePlan() {
  const [budget, setBudget] = useState(20);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function build() {
    setBusy(true);
    setError('');
    try {
      setPlan(await practiceApi<PracticePlan>(`/plan?budget=${budget}`, 'POST'));
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  async function complete(step: string) {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      setPlan(
        await practiceApi<PracticePlan>(`/plan/${plan.id}`, 'PUT', {
          step,
          expected_version: plan.version
        })
      );
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-bg-raised p-5"
      aria-label="Build a balanced practice session"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Make this session count</h2>
          <p className="mt-1 text-sm text-text-muted">
            A little recall, one repair, fresh coverage, and a short review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="practice-plan-budget">
            Session length
          </label>
          <select
            id="practice-plan-budget"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            disabled={busy}
            className="rounded border border-border bg-bg-raised p-2 text-sm"
          >
            {[10, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
          <Button disabled={busy} onClick={() => void build()}>
            {busy ? 'Saving…' : plan ? 'Refresh plan' : 'Build session'}
          </Button>
        </div>
      </div>
      {plan && (
        <>
          <ol className="grid gap-3 sm:grid-cols-2">
            {plan.steps.map((step, i) => (
              <li key={step.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link className="text-sm font-semibold text-accent" to={step.href}>
                    {i + 1}. {step.title}
                  </Link>
                  <span className="whitespace-nowrap text-xs text-text-muted">
                    {step.minutes} min
                  </span>
                </div>
                <p className="my-2 text-xs leading-relaxed text-text-muted">{step.reason}</p>
                <button
                  type="button"
                  disabled={busy || plan.completed[step.id]}
                  onClick={() => void complete(step.id)}
                  className="text-xs text-accent underline"
                >
                  {plan.completed[step.id] ? 'Marked done' : 'Mark done'}
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-text-muted">
            {plan.budget} minutes planned · {plan.fresh_count} fresh bank questions available. Time
            estimates guide the session; pause whenever you need to. Completion marks are your
            report, not a skill assessment.
            {!plan.complete_history &&
              ' Selection uses bounded recent history; older exposure may be missing.'}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
