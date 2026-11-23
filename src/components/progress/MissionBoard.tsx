import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, Check, ClipboardList, Lightbulb, Repeat2, Sparkles } from 'lucide-react';
import PhaseTimeline from '@/components/progress/PhaseTimeline';
import type { StudySignals } from '@/hooks/useStudySignals';
import {
  APTITUDE_ID,
  FULL_MOCK_HREF,
  PACE_FROM_YEAR,
  practiceHref,
  type PaceTarget
} from '@/lib/study-signals';
import { BACKLOG_PER_DAY } from '@/lib/recovery-housekeeping';
import { addDaysISO, formatDate, plural } from '@/lib/utils';
import './study-signals.css';

interface MissionBoardProps {
  signals: StudySignals | null;
  today: string;
  bankLoaded: boolean;
  bankError: string | null;
  lastYear: number | null;
  onRetryBank: () => void;
}

const number = new Intl.NumberFormat('en-IN');

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A set size that fits what is left today: sets of 10, or 5 near the end. */
function setSize(target: number | null, done: number): number {
  const left = Math.max(0, (target ?? 10) - done);
  return left > 5 ? 10 : 5;
}

function PaceTile({
  kind,
  title,
  icon,
  pace,
  ready,
  href,
  actionLabel
}: {
  kind: 'new' | 'aptitude';
  title: string;
  icon: ReactNode;
  pace: PaceTarget;
  /** False until the bank's question counts are known. */
  ready: boolean;
  href: string;
  actionLabel: string;
}) {
  const target = pace.dailyTarget;
  const met =
    ready && target !== null && pace.doneToday >= target && (target > 0 || pace.remaining === 0);
  if (!ready)
    return (
      <li className={`target-tile target-tile--${kind}`} data-state="open">
        <p className="target-tile__label">
          {icon}
          {title}
        </p>
        <p className="target-tile__value">
          <strong>{pace.doneToday}</strong>
          <span>today</span>
        </p>
        <p className="target-tile__hint">Counting unseen PYQs…</p>
      </li>
    );
  return (
    <li className={`target-tile target-tile--${kind}`} data-state={met ? 'done' : 'open'}>
      <p className="target-tile__label">
        {icon}
        {title}
      </p>
      {target === null ? (
        <p className="target-tile__value target-tile__value--text">
          <strong>Mocks first</strong>
        </p>
      ) : (
        <p className="target-tile__value">
          <strong>{pace.doneToday}</strong>
          <span>of {target} today</span>
        </p>
      )}
      {target !== null && (
        <Meter value={pace.doneToday} max={Math.max(target, 1)} label={`${title} today`} />
      )}
      <p className="target-tile__hint">
        {pace.remaining === 0
          ? `Every PYQ from ${PACE_FROM_YEAR} is attempted.`
          : `${number.format(pace.remaining)} unseen since ${PACE_FROM_YEAR}`}
        {pace.olderToday > 0 ? ` · +${pace.olderToday} older today` : ''}
      </p>
      {met ? (
        <span className="target-tile__done">
          <Check size={15} aria-hidden /> Target met. Extra sets still count.
        </span>
      ) : pace.remaining > 0 ? (
        <Link className="target-tile__action" to={href}>
          {actionLabel} <ArrowRight size={14} aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}

/** Today's phase, countdown and four daily targets, each one click from starting. */
export default function MissionBoard({
  signals,
  today,
  bankLoaded,
  bankError,
  lastYear,
  onRetryBank
}: MissionBoardProps) {
  if (!signals) {
    return (
      <section className="signal-card mission" aria-label="Today's mission" aria-busy>
        <p role="status" className="text-sm text-text-muted">
          Reading your saved work…
        </p>
      </section>
    );
  }
  const { phase, plan, reattempts, mock, subjects } = signals;
  const daysLeftInPhase = phase.endsOn
    ? differenceInCalendarDays(parseISO(phase.endsOn), parseISO(today)) + 1
    : null;
  const focus =
    subjects.find((subject) => subject.subjectId !== APTITUDE_ID && subject.stage === 'practise') ??
    subjects.find((subject) => subject.subjectId !== APTITUDE_ID) ??
    null;
  const coreSet = setSize(plan.core.dailyTarget, plan.core.doneToday);
  const aptitudeSet = setSize(plan.aptitude.dailyTarget, plan.aptitude.doneToday);
  const reviewTotal = reattempts.doneToday + reattempts.dueNow;
  const reviewsClear = reattempts.dueNow === 0;
  const remaining = plan.core.remaining + plan.aptitude.remaining;
  const pacing = plan.core.dailyTarget !== null;
  const finishBy = formatDate(addDaysISO(plan.core.deadline, -1), 'd MMM');

  return (
    <section className="signal-card mission" data-phase={phase.id} aria-label="Today's mission">
      <div className="mission__head">
        <div className="min-w-0">
          <p className="mission__phase">
            <span className="phase-chip">{phase.label} phase</span>
            {daysLeftInPhase !== null && (
              <span>
                {daysLeftInPhase} {plural(daysLeftInPhase, 'day')} left
                {phase.next
                  ? ` · ${phase.next.label} from ${formatDate(phase.next.startsOn, 'd MMM')}`
                  : ''}
              </span>
            )}
          </p>
          <p className="mission__focus">{phase.focus}</p>
        </div>
        {phase.daysToExam >= 0 && (
          <div className="mission__countdown" aria-label={`${phase.daysToExam} days to GATE`}>
            <strong>{phase.daysToExam}</strong>
            <span>{phase.daysToExam === 1 ? 'day to GATE' : 'days to GATE'}</span>
            <small>{formatDate(phase.examDate, 'EEE, d MMM')}</small>
          </div>
        )}
      </div>

      {phase.id !== 'done' && phase.id !== 'exam' && <PhaseTimeline phase={phase} today={today} />}

      <ol className="mission__targets" aria-label="Today's targets">
        <li
          className="target-tile target-tile--reattempts"
          data-state={reviewsClear && reviewTotal > 0 ? 'done' : 'open'}
        >
          <p className="target-tile__label">
            <Repeat2 size={15} aria-hidden /> Re-attempts due
          </p>
          {reviewTotal > 0 ? (
            <>
              <p className="target-tile__value">
                <strong>{reattempts.doneToday}</strong>
                <span>of {reviewTotal} today</span>
              </p>
              <Meter value={reattempts.doneToday} max={reviewTotal} label="Re-attempts today" />
            </>
          ) : (
            <p className="target-tile__value target-tile__value--text">
              <strong>None due</strong>
            </p>
          )}
          <p className="target-tile__hint">
            {reattempts.dueNow > BACKLOG_PER_DAY + 2
              ? `That is a backlog. Re-attempts can spread it to ${BACKLOG_PER_DAY} a day.`
              : reattempts.dueNow > 0
                ? 'Retrieve before practising new questions.'
                : reattempts.nextDueOn
                  ? `Next due ${formatDate(reattempts.nextDueOn, 'EEE d MMM')}.`
                  : 'Missed questions return here on a D3 → D10 → D30 ladder.'}
          </p>
          {reattempts.dueNow > 0 ? (
            <Link className="target-tile__action target-tile__action--primary" to="/reattempts">
              Start retrieval <ArrowRight size={14} aria-hidden />
            </Link>
          ) : reviewTotal > 0 ? (
            <span className="target-tile__done">
              <Check size={15} aria-hidden /> All retrieved
            </span>
          ) : null}
        </li>

        <PaceTile
          kind="new"
          title="New PYQs"
          icon={<Sparkles size={15} aria-hidden />}
          pace={plan.core}
          ready={bankLoaded}
          href={practiceHref({ subjectId: focus?.subjectId, count: coreSet, toYear: lastYear })}
          actionLabel={`Start ${coreSet} · ${focus?.shortLabel ?? 'mixed'}`}
        />

        <PaceTile
          kind="aptitude"
          title="General Aptitude"
          icon={<Lightbulb size={15} aria-hidden />}
          pace={plan.aptitude}
          ready={bankLoaded}
          href={practiceHref({ subjectId: APTITUDE_ID, count: aptitudeSet, toYear: lastYear })}
          actionLabel={`Start ${aptitudeSet} aptitude`}
        />

        <li className="target-tile target-tile--mock" data-state={mock.doneToday ? 'done' : 'open'}>
          <p className="target-tile__label">
            <ClipboardList size={15} aria-hidden /> Full mock
          </p>
          <p className="target-tile__value target-tile__value--text">
            <strong>
              {mock.doneToday
                ? 'Done today'
                : mock.scheduledToday
                  ? 'Today'
                  : mock.nextOn
                    ? formatDate(mock.nextOn, 'EEE d MMM')
                    : 'None left'}
            </strong>
          </p>
          <p className="target-tile__hint">
            {mock.cadence}. Three hours, one sitting, then a debrief.
          </p>
          {mock.doneToday ? (
            <span className="target-tile__done">
              <Check size={15} aria-hidden /> Debrief before new work
            </span>
          ) : mock.scheduledToday ? (
            <Link className="target-tile__action target-tile__action--primary" to={FULL_MOCK_HREF}>
              Choose a paper <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <Link className="target-tile__action" to={FULL_MOCK_HREF}>
              See the papers <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </li>
      </ol>

      <p className="mission__pace">
        {bankError ? (
          <>
            <span>The question bank could not load, so PYQ targets are paused.</span>
            <button type="button" className="signal-link" onClick={onRetryBank}>
              Try again
            </button>
          </>
        ) : !bankLoaded ? (
          <span>Counting PYQs in the bank…</span>
        ) : !pacing ? (
          <span>
            {remaining > 0
              ? `${number.format(remaining)} PYQs from ${PACE_FROM_YEAR} remain unseen; meet them inside full mocks now.`
              : `Every PYQ from ${PACE_FROM_YEAR} has been attempted.`}
          </span>
        ) : remaining === 0 ? (
          <span>
            Every PYQ from {PACE_FROM_YEAR} has been attempted. Use older papers and mixed sets.
          </span>
        ) : (
          <>
            <span>
              <strong>{number.format(remaining)}</strong> PYQs from {PACE_FROM_YEAR}–
              {lastYear ?? 'now'} still unseen.{' '}
              <strong>
                {plan.core.dailyTarget} core + {plan.aptitude.dailyTarget} aptitude a day
              </strong>{' '}
              clears them by {finishBy}, before the full-mock weeks.
            </span>
            {plan.savedGoal &&
              (plan.savedGoal.afterExam ? (
                <span className="mission__pace-warning">
                  At your saved goal of {plan.savedGoal.perDay} a day they would run past the exam
                  (to {formatDate(plan.savedGoal.finishesOn, 'd MMM')}).
                </span>
              ) : plan.savedGoal.afterDeadline ? (
                <span className="mission__pace-warning">
                  At your saved goal of {plan.savedGoal.perDay} a day you would finish on{' '}
                  {formatDate(plan.savedGoal.finishesOn, 'd MMM')}, inside the mock weeks.
                </span>
              ) : (
                <span>
                  Your saved goal of {plan.savedGoal.perDay} a day finishes them by{' '}
                  {formatDate(plan.savedGoal.finishesOn, 'd MMM')}.
                </span>
              ))}
            {plan.savedGoal?.afterDeadline && (
              <Link className="signal-link" to="/settings">
                Change daily goal
              </Link>
            )}
          </>
        )}
      </p>
    </section>
  );
}
