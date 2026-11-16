import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError } from '@/lib/practice-coach';
import { backendConfig } from '@/lib/backend-config';

interface StrategyData {
  plan: { version: number; approach: string; first_pass_minutes: number; review_minutes: number };
  evidence: {
    exam_count: number;
    attempts: number;
    wrong: number;
    correct: number;
    correct_timing_count: number;
    median_correct_sec: number | null;
    longest_wrong_sec: number[];
    penalty_thirds: number;
    complete: boolean;
  };
}
const approaches = {
  'two-pass': 'Two passes: secure approachable questions, then return',
  'check-conditions': 'Check constraints and boundary cases before committing',
  'protect-review': 'Reserve time for a final answer and calculation check'
};
export default function ExamStrategy({
  reminder = false,
  sessionId
}: {
  reminder?: boolean;
  sessionId?: string;
}) {
  const [data, setData] = useState<StrategyData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!backendConfig.isLocal) return;
    const abort = new AbortController();
    void practiceApi<StrategyData>(
      `/strategy${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`,
      'GET',
      undefined,
      abort.signal
    )
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted) setError(practiceError(e));
      });
    return () => abort.abort();
  }, [sessionId]);
  if (!backendConfig.isLocal || (reminder && !data?.plan.version)) return null;
  async function save() {
    if (!data) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      setData(
        await practiceApi<StrategyData>('/strategy', 'PUT', {
          approach: data.plan.approach,
          first_pass_minutes: data.plan.first_pass_minutes,
          review_minutes: data.plan.review_minutes,
          expected_version: data.plan.version
        })
      );
      setSaved(true);
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  if (reminder && data)
    return (
      <p className="rounded border border-border bg-bg-raised px-3 py-2 text-xs text-text-muted">
        Your strategy: {approaches[data.plan.approach as keyof typeof approaches]}. First-pass
        checkpoint: {data.plan.first_pass_minutes} min per question; leave{' '}
        {data.plan.review_minutes} min to review. These are reminders, not automatic skips.
      </p>
    );
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-bg-raised p-5"
      aria-label="Exam judgement experiment"
    >
      <h2 className="font-display text-lg font-semibold">Practise exam judgement</h2>
      <p className="text-sm text-text-muted">
        Choose one strategy to test in your next timed set. Nothing interrupts the exam or changes
        your answers.
      </p>
      {data && (
        <>
          <p className="text-sm">
            {data.evidence.exam_count} completed exams · {data.evidence.correct}/
            {data.evidence.attempts} recorded answers correct.
            {data.evidence.median_correct_sec !== null &&
              ` Median recorded time on correct answers: ${data.evidence.median_correct_sec}s across ${data.evidence.correct_timing_count} timed receipts.`}
          </p>
          {data.evidence.longest_wrong_sec.length > 0 && (
            <p className="text-sm text-text-muted">
              Longest recorded times on incorrect answers:{' '}
              {data.evidence.longest_wrong_sec.join('s, ')}s. Inspect these in the exam report
              before deciding why time was spent.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs sm:col-span-3">
              Next experiment
              <select
                className="rounded border border-border bg-bg-raised p-2 text-sm"
                value={data.plan.approach}
                onChange={(e) =>
                  setData({ ...data, plan: { ...data.plan, approach: e.target.value } })
                }
              >
                {Object.entries(approaches).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              First-pass checkpoint (minutes)
              <input
                type="number"
                min={1}
                max={10}
                value={data.plan.first_pass_minutes}
                onChange={(e) =>
                  setData({
                    ...data,
                    plan: { ...data.plan, first_pass_minutes: Number(e.target.value) }
                  })
                }
                className="rounded border border-border bg-bg-raised p-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs">
              Reserve for review (minutes)
              <input
                type="number"
                min={1}
                max={30}
                value={data.plan.review_minutes}
                onChange={(e) =>
                  setData({
                    ...data,
                    plan: { ...data.plan, review_minutes: Number(e.target.value) }
                  })
                }
                className="rounded border border-border bg-bg-raised p-2 text-sm"
              />
            </label>
          </div>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save next exam experiment'}
          </Button>
          <p className="text-xs text-text-muted">
            Timing is recorded evidence, not a diagnosis. Different papers have different
            difficulty; this does not estimate marks you would certainly gain by skipping.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-xs text-success">
          Saved. Your timed workspace will show this strategy.
        </p>
      )}
    </section>
  );
}
