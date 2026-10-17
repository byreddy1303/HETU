import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import {
  exportMemory,
  getMemoryEntry,
  saveMemoryEntry,
  type StudyMemoryEntry
} from '@/lib/study-memory';
import {
  buildStudySessionSynthesis,
  createSessionRepairDraft
} from '@/lib/study-session-synthesis';
import { secondsToClock, todayISOInTimeZone } from '@/lib/utils';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';

function marks(thirds: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(thirds / 3);
}

export default function SessionEvidenceSummary({
  session,
  attempts,
  onSelectAttempt,
  revision = 0
}: {
  session: PyqSessionRow;
  attempts: PyqAttemptRow[];
  onSelectAttempt: (id: string) => void;
  revision?: number;
}) {
  const { userId, profile } = useAuth();
  const [reflections, setReflections] = useState<StudyMemoryEntry[]>([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setReflections([]);
    setSaved({});
    setLoadError('');
    void exportMemory({ session_id: session.id })
      .then((entries) => {
        if (active) setReflections(entries);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(cause instanceof Error ? cause.message : 'Saved thinking could not load.');
      });
    return () => {
      active = false;
    };
  }, [session.id, userId, revision]);
  const summary = useMemo(
    () => buildStudySessionSynthesis(session, attempts, reflections),
    [session, attempts, reflections]
  );
  const byId = useMemo(() => new Map(attempts.map((attempt) => [attempt.id, attempt])), [attempts]);
  const thinking = reflections.filter(
    (entry) =>
      entry.kind === 'reflection' &&
      entry.user_id === session.user_id &&
      entry.attempt_id &&
      summary.sourceAttemptIds.includes(entry.attempt_id)
  );
  const submittedShare = summary.plannedCount
    ? (100 * summary.submittedCount) / summary.plannedCount
    : 0;

  async function prepare(actionId: string) {
    if (!userId) return;
    const proposal = createSessionRepairDraft(
      session,
      summary,
      actionId,
      userId,
      todayISOInTimeZone(profile?.timezone)
    );
    if (!proposal) return;
    setBusy(actionId);
    setActionError('');
    try {
      try {
        const existing = await getMemoryEntry(proposal.id);
        setSaved((old) => ({ ...old, [actionId]: existing.entry.id }));
      } catch (cause) {
        if ((cause as { status?: number })?.status !== 404) throw cause;
        const entry = await saveMemoryEntry(proposal);
        setSaved((old) => ({ ...old, [actionId]: entry.id }));
      }
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'The focused repair could not be saved.'
      );
    } finally {
      setBusy(null);
    }
  }

  function receiptLink(id: string) {
    const attempt = byId.get(id);
    if (!attempt) return null;
    return (
      <button
        key={id}
        onClick={() => onSelectAttempt(id)}
        className="rounded px-2 py-1 text-left text-xs font-medium text-accent underline hover:bg-accent-faint"
      >
        {attempt.question_snapshot?.paper_label || attempt.year} · Q
        {attempt.question_snapshot?.number ||
          session.question_uids.indexOf(attempt.question_uid) + 1}
      </button>
    );
  }

  return (
    <section
      className="space-y-5 border-b border-border p-4 sm:p-5"
      aria-label="Session evidence summary"
    >
      <div className="max-w-prose">
        <h3 className="font-display text-lg font-semibold">What this set tells us</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          <strong className="text-text">
            {summary.submittedCount} submitted of {summary.plannedCount} selected.
          </strong>{' '}
          {summary.notSubmittedCount
            ? `${summary.notSubmittedCount} have no submitted answer. Those questions are not graded or counted as skips.`
            : 'Every selected question has a submitted receipt.'}{' '}
          {session.config.mode !== 'exam' && 'This was practice mode.'}
        </p>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-bg-overlay"
        role="img"
        aria-label={`${summary.submittedCount} submitted; ${summary.notSubmittedCount} without a submitted answer`}
      >
        <div className="bg-accent" style={{ width: `${submittedShare}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">Correct / incorrect</dt>
          <dd className="mt-1 text-lg font-semibold">
            {summary.correctCount} / {summary.wrongCount}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Explicit skips</dt>
          <dd className="mt-1 text-lg font-semibold">{summary.skippedCount}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Marks on scored submissions</dt>
          <dd className="mt-1 text-lg font-semibold">
            {summary.score.coveredCount
              ? `${marks(summary.score.scoreThirds)} / ${marks(summary.score.maxThirds)}`
              : 'Unavailable'}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Exact scoring coverage</dt>
          <dd className="mt-1 text-lg font-semibold">
            {summary.score.coveredCount} / {summary.submittedCount}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-text-muted">
        The marks denominator covers scored submissions only.{' '}
        {summary.bonusCount > 0 && `${summary.bonusCount} bonus receipt(s). `}
        {summary.unscorableCount > 0 &&
          `${summary.unscorableCount} receipt(s) cannot establish correctness. `}
        Negative marks recorded: {marks(summary.score.penaltyThirds)}. Missing submissions do not
        establish a score for the full selected set.
      </p>
      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Where to investigate</h4>
        {summary.highConfidenceWrongCount > 0 && (
          <div>
            <p className="text-sm">
              {summary.highConfidenceWrongCount} incorrect answer(s) with high reported confidence.
              Inspect the reasoning and conditions before choosing a cause.
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {summary.highConfidenceWrongAttemptIds.map(receiptLink)}
            </div>
          </div>
        )}
        {summary.uncertainCorrectCount > 0 && (
          <div>
            <p className="text-sm">
              {summary.uncertainCorrectCount} correct answer(s) with reported uncertainty. A later
              independent check will be more informative than rereading the key.
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {summary.uncertainCorrectAttemptIds.map(receiptLink)}
            </div>
          </div>
        )}
        {summary.slowCorrectCount > 0 && (
          <div>
            <p className="text-sm">
              {summary.slowCorrectCount} correct answer(s) exceeded the marks-based time target.
              Recorded time alone does not explain why.
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {summary.slowCorrectAttemptIds.map(receiptLink)}
            </div>
          </div>
        )}
        {summary.wrongCount === 0 &&
          summary.uncertainCorrectCount === 0 &&
          summary.slowCorrectCount === 0 && (
            <p className="text-sm text-text-muted">
              No error or uncertainty flag appears in these receipts. Retention and fresh
              application still require their own checks.
            </p>
          )}
      </div>
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Inspect time and topic evidence
        </summary>
        <div className="mt-3 space-y-4">
          <p className="text-sm text-text-muted">
            Submitted work: {secondsToClock(Math.round(summary.timing.measuredSeconds))} measured;{' '}
            {secondsToClock(Math.round(summary.timing.reportedSeconds))} reported.{' '}
            {summary.timing.unknownCount} receipt(s) have unknown timing conditions.
            {summary.timing.draftTimedCount > 0 &&
              ` Unsubmitted drafts retain ${secondsToClock(Math.round(summary.timing.draftSeconds))} of recorded work across ${summary.timing.draftTimedCount} question(s); this is not a graded attempt.`}
          </p>
          <ul className="space-y-2">
            {summary.timing.largestConcentrations.map((row) => (
              <li key={`${row.questionUid}:${row.source}`} className="text-sm">
                {row.attemptId
                  ? receiptLink(row.attemptId)
                  : `Selected question ${session.question_uids.indexOf(row.questionUid) + 1}`}{' '}
                — {secondsToClock(Math.round(row.seconds))},{' '}
                {row.source === 'draft' ? 'unsubmitted draft' : row.source}.{' '}
                {row.source !== 'draft' &&
                  `${Math.round(row.sharePercent)}% of recorded work in this set.`}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left font-medium">Submitted evidence by topic</caption>
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-2 pr-3 font-medium">Topic</th>
                  <th className="px-2 font-medium">Submitted</th>
                  <th className="px-2 font-medium">Correct</th>
                  <th className="px-2 font-medium">Incorrect</th>
                  <th className="px-2 font-medium">Scored marks</th>
                </tr>
              </thead>
              <tbody>
                {summary.topics.map((topic) => (
                  <tr key={`${topic.subject}:${topic.topic}`} className="border-b border-border">
                    <td className="py-2 pr-3">
                      {topic.subject}
                      <span className="block text-xs text-text-muted">{topic.topic}</span>
                    </td>
                    <td className="px-2">{topic.submittedCount}</td>
                    <td className="px-2">{topic.correctCount}</td>
                    <td className="px-2">{topic.wrongCount}</td>
                    <td className="px-2">
                      {topic.scoringCoveredCount
                        ? `${marks(topic.scoreThirds)} / ${marks(topic.maxThirds)}`
                        : 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      {!loadError && thinking.length > 0 && (
        <p className="text-sm text-text-muted">
          Thinking saved for {thinking.length} submitted question(s), including{' '}
          {thinking.filter((entry) => entry.content.trim()).length} written explanation(s).{' '}
          {thinking.filter((entry) => entry.state === 'deferred').length} deferred;{' '}
          {thinking.filter((entry) => entry.state === 'completed').length} finished. Saving for
          later preserves your notes without marking a review finished.
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-danger">
          Saved thinking is unavailable: {loadError} The result summary still uses submitted
          receipts.
        </p>
      )}
      {summary.mechanisms.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Your stated explanations</h4>
          {summary.mechanisms.map((item) => (
            <p key={item.entryId} className="text-sm">
              <Link to={`/memory/${item.entryId}`} className="text-accent underline">
                {item.mechanism}
              </Link>
              <span className="text-xs text-text-muted">
                {' '}
                · {item.state === 'deferred' ? 'Deferred assessment' : 'Learner assessment'}
              </span>
            </p>
          ))}
        </div>
      )}
      {summary.actions.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Prepare the next useful work</h4>
          <p className="max-w-prose text-xs text-text-muted">
            These suggestions follow the saved evidence. Saving a repair prepares it for review; add
            it to Planner after checking your available time.
          </p>
          <ol className="divide-y divide-border">
            {summary.actions.map((action) => (
              <li key={action.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-prose">
                    <h5 className="text-sm font-semibold">{action.title}</h5>
                    <p className="mt-1 text-sm text-text-muted">{action.reason}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Success check: {action.successCriteria}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">{action.exposureNote}</p>
                  </div>
                  {saved[action.id] ? (
                    <Link
                      className="text-sm font-medium text-accent underline"
                      to={`/memory/${saved[action.id]}`}
                    >
                      Open focused repair
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy !== null || !userId}
                      onClick={() => void prepare(action.id)}
                    >
                      {busy === action.id ? 'Saving repair…' : `Save repair: ${action.title}`}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}
    </section>
  );
}
