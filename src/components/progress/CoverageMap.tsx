import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import {
  APTITUDE_ID,
  PACE_FROM_YEAR,
  practiceHref,
  type SubjectSignal,
  type SubjectStage
} from '@/lib/study-signals';
import { subjectInk } from '@/lib/subjectInk';
import { cn } from '@/lib/utils';
import './study-signals.css';

interface CoverageMapProps {
  subjects: readonly SubjectSignal[];
  bankLoaded: boolean;
  lastYear: number | null;
  /** Newest year counted towards coverage; later papers stay sealed for mocks. */
  paceLastYear?: number | null;
  /** Show only the first N subjects (already ranked by open marks). */
  limit?: number;
  includeAptitude?: boolean;
  /** Link to the full map on Progress. */
  moreHref?: string;
}

const STAGE_LABEL: Record<SubjectStage, string> = {
  learn: 'Study first',
  practise: 'Ready for PYQs',
  maintain: 'Keep warm'
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Action({ subject, lastYear }: { subject: SubjectSignal; lastYear: number | null }) {
  if (subject.stage === 'learn')
    return (
      <>
        {subject.syllabus?.nextTopic && (
          <span className="coverage-row__next" title={subject.syllabus.nextTopic}>
            Next: {subject.syllabus.nextTopic}
          </span>
        )}
        <span className="flex flex-wrap justify-end gap-2">
          <Link className="coverage-row__cta" to="/syllabus">
            Syllabus <ArrowUpRight size={13} aria-hidden />
          </Link>
          <Link
            className="coverage-row__cta"
            to={practiceHref({ subjectId: subject.subjectId, count: 5, toYear: lastYear })}
            aria-label={`Try 5 ${subject.label} PYQs`}
          >
            Try 5 <ArrowRight size={13} aria-hidden />
          </Link>
        </span>
      </>
    );
  if (subject.stage === 'maintain')
    return (
      <Link
        className="coverage-row__cta"
        to={practiceHref({
          subjectId: subject.subjectId,
          count: 10,
          history: 'all',
          order: 'random',
          toYear: lastYear
        })}
        aria-label={`Mixed set of 10 ${subject.label} PYQs`}
      >
        Mixed 10 <ArrowRight size={13} aria-hidden />
      </Link>
    );
  return (
    <Link
      className="coverage-row__cta"
      to={practiceHref({ subjectId: subject.subjectId, count: 10, toYear: lastYear })}
      aria-label={`10 new ${subject.label} PYQs`}
    >
      10 new <ArrowRight size={13} aria-hidden />
    </Link>
  );
}

/**
 * Subjects ranked by marks not yet secured. Each track is as long as the
 * subject's marks per paper; the fill is the share of recent PYQs attempted.
 */
export default function CoverageMap({
  subjects,
  bankLoaded,
  lastYear,
  paceLastYear = null,
  limit,
  includeAptitude = true,
  moreHref
}: CoverageMapProps) {
  const pool = includeAptitude
    ? subjects
    : subjects.filter((subject) => subject.subjectId !== APTITUDE_ID);
  const shown = limit ? pool.slice(0, limit) : pool;
  const maxWeight = Math.max(1, ...pool.map((subject) => subject.weight));
  const notStudied = pool.filter(
    (subject) => subject.syllabus && subject.syllabus.total > 0 && subject.syllabus.done === 0
  );
  const notStudiedMarks = notStudied.reduce((sum, subject) => sum + subject.weight, 0);

  return (
    <section className="signal-card coverage" aria-labelledby="coverage-title">
      <div className="signal-card__head">
        <h2 id="coverage-title" className="study-section-label">
          Where the marks are
        </h2>
        {moreHref && (
          <Link className="signal-link" to={moreHref}>
            All subjects <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </div>
      <p className="signal-card__note">
        Ranked by marks per paper not yet backed by correct practice. Each bar is as long as the
        subject&apos;s marks in a paper; the fill is the share of its {PACE_FROM_YEAR}–
        {paceLastYear ?? lastYear ?? 'now'} PYQs you have attempted.
        {notStudied.length > 0 && (
          <>
            {' '}
            <strong className="text-text">
              About {Math.round(notStudiedMarks)} marks a paper
            </strong>{' '}
            sit in {notStudied.length} {notStudied.length === 1 ? 'subject' : 'subjects'} with no
            syllabus topic marked studied.
          </>
        )}
      </p>
      <ol className="coverage__list">
        {shown.map((subject) => {
          const weak = subject.accuracy !== null && subject.accuracy < 0.6;
          return (
            <li key={subject.subjectId} className="coverage-row">
              <div className="coverage-row__name">
                <span
                  className={cn('coverage-row__dot', subjectInk(subject.label).dot)}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="coverage-row__label">{subject.label}</p>
                  <p className="coverage-row__weight">
                    {subject.weight.toFixed(1)} marks a paper · {subject.openMarks.toFixed(1)} open
                  </p>
                </div>
              </div>
              <div
                className="coverage-row__bar"
                title={
                  bankLoaded
                    ? `${subject.paceAttempted} of ${subject.paceTotal} PYQs from ${PACE_FROM_YEAR} attempted (${percent(subject.coverage)})`
                    : 'Counting PYQs…'
                }
              >
                <span
                  className="coverage-row__track"
                  style={{ width: `${(subject.weight / maxWeight) * 100}%` }}
                  role="progressbar"
                  aria-label={`${subject.label} PYQs from ${PACE_FROM_YEAR} attempted`}
                  aria-valuemin={0}
                  aria-valuemax={subject.paceTotal}
                  aria-valuenow={subject.paceAttempted}
                >
                  <span
                    className="coverage-row__fill"
                    style={{
                      width: `${subject.coverage > 0 ? Math.max(2, subject.coverage * 100) : 0}%`
                    }}
                  />
                </span>
              </div>
              <p className="coverage-row__facts">
                <span>
                  {bankLoaded
                    ? `${subject.paceAttempted}/${subject.paceTotal} PYQs (${percent(subject.coverage)})`
                    : 'Counting PYQs…'}
                </span>
                <span className={cn(weak && 'is-weak')}>
                  {subject.accuracy === null
                    ? subject.firstTries > 0
                      ? `${subject.firstTryCorrect}/${subject.firstTries} right first try`
                      : 'No first tries yet'
                    : `${percent(subject.accuracy)} right first try`}
                </span>
                {subject.syllabus && subject.syllabus.total > 0 && (
                  <span>
                    Syllabus {subject.syllabus.done}/{subject.syllabus.total}
                  </span>
                )}
                {subject.dueReattempts > 0 && (
                  <span className="is-due">{subject.dueReattempts} re-attempts due</span>
                )}
              </p>
              <div className="coverage-row__action">
                <span className={`stage-badge stage-badge--${subject.stage}`}>
                  {STAGE_LABEL[subject.stage]}
                </span>
                <Action subject={subject} lastYear={lastYear} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="coverage__legend" aria-hidden>
        <span>
          <i className="coverage__swatch" /> Marks a paper (bar length)
        </span>
        <span>
          <i className="coverage__swatch coverage__swatch--fill" /> PYQs since {PACE_FROM_YEAR}{' '}
          attempted
        </span>
      </div>
    </section>
  );
}
