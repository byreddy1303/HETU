import ActivityChart from '@/components/progress/ActivityChart';
import CoverageMap from '@/components/progress/CoverageMap';
import PhaseTimeline from '@/components/progress/PhaseTimeline';
import ReattemptLadder from '@/components/progress/ReattemptLadder';
import { useStudySignals } from '@/hooks/useStudySignals';
import { PACE_FROM_YEAR } from '@/lib/study-signals';
import { formatDate } from '@/lib/utils';
import './study-signals.css';

const number = new Intl.NumberFormat('en-IN');

function Kpi({
  label,
  value,
  unit,
  detail
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
}) {
  return (
    <div className="kpi">
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </p>
      <p className="kpi__detail">{detail}</p>
    </div>
  );
}

/** Coverage, accuracy, the re-attempt ladder and recent activity, from local records. */
export default function ProgressDashboard() {
  const { signals, bank, bankError, retryBank, today } = useStudySignals();
  if (!signals)
    return (
      <p role="status" className="text-sm text-text-muted">
        Reading your saved work…
      </p>
    );
  const { subjects, phase, pipeline, reattempts } = signals;
  const paceTotal = subjects.reduce((sum, subject) => sum + subject.paceTotal, 0);
  const paceAttempted = subjects.reduce((sum, subject) => sum + subject.paceAttempted, 0);
  const firstTries = subjects.reduce((sum, subject) => sum + subject.firstTries, 0);
  const firstTryCorrect = subjects.reduce((sum, subject) => sum + subject.firstTryCorrect, 0);
  const syllabusDone = subjects.reduce((sum, subject) => sum + (subject.syllabus?.done ?? 0), 0);
  const syllabusTotal = subjects.reduce((sum, subject) => sum + (subject.syllabus?.total ?? 0), 0);
  const notStarted = subjects.filter(
    (subject) => subject.syllabus && subject.syllabus.total > 0 && subject.syllabus.done === 0
  ).length;
  const open = pipeline.total - pipeline.stages.MASTERED;

  return (
    <div className="progress-board">
      <div className="kpi-row">
        <Kpi
          label={`PYQs since ${PACE_FROM_YEAR}`}
          value={bank.loaded ? number.format(paceAttempted) : '…'}
          unit={bank.loaded ? `/ ${number.format(paceTotal)}` : undefined}
          detail={
            bankError
              ? 'The question bank could not load.'
              : bank.loaded
                ? `${paceTotal ? Math.round((paceAttempted / paceTotal) * 100) : 0}% attempted at least once`
                : 'Counting the bank…'
          }
        />
        <Kpi
          label="Right first try"
          value={firstTries ? `${Math.round((firstTryCorrect / firstTries) * 100)}%` : '–'}
          detail={
            firstTries
              ? `${firstTryCorrect} of ${firstTries} answered; 50/50 guesses don't count`
              : 'Answer a PYQ to start measuring'
          }
        />
        <Kpi
          label="Syllabus marked studied"
          value={String(syllabusDone)}
          unit={`/ ${syllabusTotal}`}
          detail={
            notStarted > 0
              ? `${notStarted} ${notStarted === 1 ? 'subject has' : 'subjects have'} no topic ticked`
              : 'Every subject has started'
          }
        />
        <Kpi
          label="Re-attempts open"
          value={String(open)}
          detail={`${reattempts.dueNow} due now · ${pipeline.stages.MASTERED} mastered`}
        />
        <Kpi
          label="Days to GATE"
          value={String(Math.max(0, phase.daysToExam))}
          detail={`${phase.label} phase · exam ${formatDate(phase.examDate, 'EEE d MMM')}`}
        />
      </div>

      {phase.id !== 'done' && phase.id !== 'exam' && (
        <section className="signal-card" aria-labelledby="plan-title">
          <div className="signal-card__head">
            <h2 id="plan-title" className="study-section-label">
              Plan to the exam
            </h2>
          </div>
          <p className="signal-card__note">{phase.focus}</p>
          <div className="mt-4">
            <PhaseTimeline phase={phase} today={today} />
          </div>
        </section>
      )}

      {bankError && (
        <p role="alert" className="text-sm text-danger">
          {bankError}{' '}
          <button type="button" className="underline" onClick={retryBank}>
            Try again
          </button>
        </p>
      )}

      <CoverageMap
        subjects={subjects}
        bankLoaded={bank.loaded}
        lastYear={bank.lastYear}
        paceLastYear={bank.paceLastYear}
      />

      <div className="progress-board__split">
        <ReattemptLadder pipeline={pipeline} dueNow={reattempts.dueNow} />
        <ActivityChart days={signals.activity} streak={signals.streak} today={today} />
      </div>
    </div>
  );
}
