// Shared per-question History timeline (spec §2): the same component renders
// everywhere a question appears — practice workbench, reattempt rows, journal
// rows. One reader over the immutable attempt log, so every surface agrees.
import { useMemo } from 'react';
import { History } from 'lucide-react';
import type { PyqAttemptRow, QuestionRow } from '@/types';
import { Badge } from '@/components/ui/Badge';
import {
  buildQuestionTimeline,
  type QuestionMastery,
  type TimelineAttempt,
  type TimelineVerdict
} from '@/lib/question-attempt-timeline';
import { deriveMistakeDNAForAttempt } from '@/lib/mistake-dna';
import { secondsToClock } from '@/lib/utils';

const MASTERY_META: Record<QuestionMastery, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warn' }> = {
  new: { label: 'New', tone: 'neutral' },
  learning: { label: 'Learning', tone: 'warn' },
  fragile: { label: 'Fragile', tone: 'warn' },
  mastered: { label: 'Mastered', tone: 'success' }
};

const VERDICT_META: Record<TimelineVerdict, { label: string; tone: 'neutral' | 'success' | 'danger' | 'accent' }> = {
  correct: { label: 'Correct', tone: 'success' },
  wrong: { label: 'Wrong', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'accent' },
  unknown: { label: 'Ungraded', tone: 'neutral' }
};

function formatDelta(deltaSec: number | null): string | null {
  if (deltaSec == null || deltaSec === 0) return null;
  const sign = deltaSec > 0 ? '+' : '−';
  return `${sign}${secondsToClock(Math.abs(deltaSec))}`;
}

function AttemptRow({
  attempt,
  deltaSec,
  journalNote,
  targetTimeSec
}: {
  attempt: TimelineAttempt;
  deltaSec: number | null;
  journalNote: string | null;
  targetTimeSec?: number | null;
}) {
  const verdict = VERDICT_META[attempt.verdict];
  const delta = formatDelta(deltaSec);
  const dna =
    attempt.verdict === 'correct'
      ? []
      : deriveMistakeDNAForAttempt(
          {
            mark_decision: attempt.decision as 'MARK' | 'SKIP' | 'FIFTY_FIFTY',
            mark_correct: attempt.verdict === 'wrong' ? false : null,
            confidence: null,
            time_spent_sec: attempt.timeSpentSec
          },
          { targetTimeSec: targetTimeSec ?? null }
        );
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center" aria-hidden="true">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-overlay text-[11px] font-semibold text-text-muted">
          {attempt.position}
        </span>
        <span className="w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
          <Badge>{attempt.mode}</Badge>
          {attempt.reattemptRound != null && <Badge tone="accent">round {attempt.reattemptRound}</Badge>}
          <span className="text-[11px] text-text-faint">
            {new Date(attempt.attemptedAt).toLocaleDateString()}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-text-muted">
          <span className="u-num">{secondsToClock(attempt.timeSpentSec)}</span>
          {delta && <span className="ml-1 text-text-faint">({delta} vs prior)</span>}
          {attempt.confidence && <span className="ml-1 capitalize">· {attempt.confidence} confidence</span>}
        </p>
        {dna.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {dna.map((tag) => (
              <Badge key={tag} tone="warn">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {journalNote && (
          <p className="mt-1 truncate text-[11px] italic text-text-faint" title={journalNote}>
            “{journalNote}”
          </p>
        )}
      </div>
    </li>
  );
}

export default function QuestionAttemptTimeline({
  questionUid,
  attempts,
  journalQuestions = [],
  targetTimeSec = null
}: {
  questionUid: string;
  attempts: readonly PyqAttemptRow[];
  journalQuestions?: readonly Pick<QuestionRow, 'id' | 'source_pyq_attempt_id' | 'trigger_sentence'>[];
  targetTimeSec?: number | null;
}) {
  const timeline = useMemo(
    () => buildQuestionTimeline(questionUid, attempts, journalQuestions),
    [questionUid, attempts, journalQuestions]
  );
  const journalNoteByAttempt = useMemo(() => {
    const notes = new Map<string, string>();
    for (const question of journalQuestions) {
      if (question.source_pyq_attempt_id && question.trigger_sentence) {
        notes.set(question.source_pyq_attempt_id, question.trigger_sentence);
      }
    }
    return notes;
  }, [journalQuestions]);
  const mastery = MASTERY_META[timeline.mastery];

  if (timeline.totalAttempts === 0) {
    return (
      <p className="text-[12px] text-text-faint">
        No attempts yet — your first answer here starts this question&apos;s history.
      </p>
    );
  }

  return (
    <details className="rounded-lg border border-border bg-bg-raised">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 text-[12px] marker:hidden [&::-webkit-details-marker]:hidden">
        <History size={14} className="text-text-faint" aria-hidden="true" />
        <span className="font-semibold text-text">
          History · {timeline.totalAttempts} {timeline.totalAttempts === 1 ? 'attempt' : 'attempts'}
        </span>
        <Badge tone={mastery.tone}>{mastery.label}</Badge>
        {timeline.completedReattemptRounds > 0 && (
          <span className="text-text-faint">
            · {timeline.completedReattemptRounds} reattempt {timeline.completedReattemptRounds === 1 ? 'round' : 'rounds'}
          </span>
        )}
        <span className="text-text-faint">· avg {secondsToClock(timeline.avgTimeSec)}</span>
      </summary>
      <ol className="border-t border-border px-3 pt-3">
        {timeline.attempts.map((attempt, index) => (
          <AttemptRow
            key={attempt.id}
            attempt={attempt}
            deltaSec={timeline.timeDeltaSec[index]}
            journalNote={journalNoteByAttempt.get(attempt.id) ?? null}
            targetTimeSec={targetTimeSec}
          />
        ))}
      </ol>
    </details>
  );
}
