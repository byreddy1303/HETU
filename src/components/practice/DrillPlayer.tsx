import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError, type DrillPack } from '@/lib/practice-coach';
import RepairAssessment from '@/components/practice/RepairAssessment';

export default function DrillPlayer({
  id,
  mixed = false,
  onAnswered
}: {
  id: string;
  mixed?: boolean;
  onAnswered?: () => void;
}) {
  const [pack, setPack] = useState<DrillPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assistance, setAssistance] = useState('unknown');
  const [feedbackIndex, setFeedbackIndex] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const pendingAnswer = useRef<{
    round: number;
    index: number;
    choice: number;
    assistance: string;
    elapsed_sec: number;
  } | null>(null);
  const timer = useRef({ started: performance.now(), seconds: 0 });
  useEffect(() => {
    const abort = new AbortController();
    setPack(null);
    setError('');
    setFeedbackIndex(null);
    setAssistance('unknown');
    pendingAnswer.current = null;
    void practiceApi<DrillPack>(`/packs/${id}`, 'GET', undefined, abort.signal)
      .then(setPack)
      .catch((e) => {
        if (!abort.signal.aborted) setError(practiceError(e));
      });
    return () => abort.abort();
  }, [id, reload]);
  const next = pack?.questions.findIndex((q) => !q.result) ?? -1;
  const index = feedbackIndex ?? next;
  useEffect(() => {
    timer.current = { started: document.hidden ? 0 : performance.now(), seconds: 0 };
    const visible = () => {
      if (timer.current.started)
        timer.current.seconds += (performance.now() - timer.current.started) / 1000;
      timer.current.started = document.hidden ? 0 : performance.now();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [id, index]);
  async function choose(choice: number) {
    if (!pack || busy) return;
    pendingAnswer.current = null;
    setBusy(true);
    setError('');
    setPack({ ...pack, selections: { ...pack.selections, [index]: choice } });
    try {
      setPack(
        await practiceApi<DrillPack>(`/packs/${id}/draft`, 'PUT', {
          expected_version: pack.version,
          round: pack.round,
          selections: { ...pack.selections, [index]: choice }
        })
      );
    } catch (e) {
      setPack(pack);
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!pack || busy || pack.selections[index] === undefined) return;
    setBusy(true);
    setError('');
    const elapsed =
      timer.current.seconds +
      (timer.current.started ? (performance.now() - timer.current.started) / 1000 : 0);
    try {
      pendingAnswer.current ??= {
        round: pack.round,
        index,
        choice: pack.selections[index],
        assistance,
        elapsed_sec: Math.min(7200, Math.max(0, Math.round(elapsed)))
      };
      const updated = await practiceApi<DrillPack>(
        `/packs/${id}/answers`,
        'POST',
        pendingAnswer.current
      );
      pendingAnswer.current = null;
      setPack(updated);
      setFeedbackIndex(index);
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      setPack(await practiceApi<DrillPack>(`/packs/${id}/start`, 'POST'));
      setFeedbackIndex(null);
      setAssistance('unknown');
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  if (!pack)
    return (
      <div className="rounded-xl border border-border bg-bg-raised p-5">
        {error ? (
          <p role="alert">
            {error} <Button onClick={() => setReload((n) => n + 1)}>Retry</Button>
          </p>
        ) : (
          <p role="status">Opening your saved practice…</p>
        )}
      </div>
    );
  const problem = pack.questions[index];
  return (
    <section
      className="space-y-5 rounded-xl border border-accent/30 bg-bg-raised p-5 sm:p-6"
      aria-label="Mistake repair practice"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          {mixed ? 'Mixed method practice' : 'A small repair'}
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold">
          {mixed && !problem?.result ? 'Choose the method from the problem' : pack.title}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Original exercises · answers saved automatically · {pack.completed_rounds} completed
          rounds
        </p>
      </div>
      {problem && (
        <>
          <p className="text-xs text-text-muted">
            Question {index + 1} of {pack.questions.length}
            {!mixed && ` · ${problem.kind}`}
          </p>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{problem.prompt}</p>
          <fieldset disabled={busy || !!problem.result} className="space-y-2">
            <legend className="sr-only">Choose your answer</legend>
            {problem.choices.map((choice, choiceIndex) => (
              <label
                key={choiceIndex}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${pack.selections[index] === choiceIndex ? 'border-accent bg-accent-faint' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name={`drill-${id}-${index}`}
                  checked={pack.selections[index] === choiceIndex}
                  onChange={() => void choose(choiceIndex)}
                  className="mt-0.5"
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          {!problem.result && (
            <>
              <label className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                Practice conditions (optional)
                <select
                  aria-label="Practice conditions"
                  value={assistance}
                  onChange={(e) => setAssistance(e.target.value)}
                  disabled={busy}
                  className="rounded border border-border bg-bg-raised p-2"
                >
                  <option value="unknown">Not reported</option>
                  <option value="without-help">Answering without help</option>
                  <option value="with-help">Using notes or help</option>
                </select>
              </label>
              <Button
                variant="primary"
                disabled={busy || pack.selections[index] === undefined}
                onClick={() => void submit()}
              >
                {busy ? 'Saving…' : 'Check answer'}
              </Button>
            </>
          )}
          {problem.result && (
            <div className="space-y-3 rounded-lg bg-accent-faint p-4">
              <p className="font-semibold">
                {problem.result.correct ? 'Correct' : 'A useful correction'}
              </p>
              <p className="text-sm">Answer: {problem.choices[problem.answer!]}</p>
              <p className="text-sm leading-relaxed">{problem.explanation}</p>
              <Button
                variant="primary"
                onClick={() => {
                  setFeedbackIndex(null);
                  onAnswered?.();
                }}
              >
                {mixed ? 'Next mixed problem' : next >= 0 ? 'Next question' : 'See next step'}
              </Button>
            </div>
          )}
        </>
      )}
      {pack.done && feedbackIndex === null && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">
            {pack.questions.filter((q) => q.result?.correct).length}/{pack.questions.length}{' '}
            correct. Next check: {pack.due_date}.
          </p>
          <p className="text-sm text-text-muted">
            {pack.round_outcome === 'needs-independent-check'
              ? `The answers were correct with help or unreported conditions. Independent check: ${pack.due_date}. The review interval has not been extended.`
              : pack.round_outcome === 'needs-repair'
                ? `Use the correction below, then return on ${pack.due_date}. The next attempt can test a different approach.`
                : pack.round_outcome === 'independent'
                  ? 'Correct without reported help. Apply the idea to fresh questions, then return for the scheduled check.'
                  : 'This earlier round keeps its saved date. Future checks will distinguish independent answers from helped practice.'}
          </p>
          <div className="space-y-2 text-sm">
            <p>{pack.principle}</p>
            <p className="text-text-muted">Applies when: {pack.conditions}</p>
            <p className="text-text-muted">Watch the boundary: {pack.counterexample}</p>
          </div>
          <p className="text-xs text-text-muted">
            A completed correction is evidence of this attempt. Repeated questions and helped
            answers stay separate from fresh, independent application.
          </p>
          <RepairAssessment key={`${pack.id}:${pack.round}`} pack={pack} onSaved={setPack} />
          <div className="flex flex-wrap gap-3">
            {pack.transfer_id && (
              <Link
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
                to={`/memory/${pack.transfer_id}`}
              >
                Apply to fresh questions
              </Link>
            )}
            {pack.due && (
              <Button disabled={busy} onClick={() => void start()}>
                Start due check
              </Button>
            )}
            <Link
              to="/practice-lab?tab=traps"
              className="self-center text-sm text-accent underline"
            >
              Keep a useful principle
            </Link>
          </div>
          {pack.source_url && /^https:\/\//.test(pack.source_url) && (
            <a
              href={pack.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-accent underline"
            >
              Reference for the underlying concept
            </a>
          )}
        </div>
      )}
      <Link to="/practice-lab" className="inline-block text-sm text-accent underline">
        Return to repair focus
      </Link>
      {error && (
        <div role="alert" className="space-y-2 text-sm text-danger">
          <p>{error}</p>
          <Button size="sm" disabled={busy} onClick={() => setReload((x) => x + 1)}>
            Reload saved state
          </Button>
        </div>
      )}
    </section>
  );
}
