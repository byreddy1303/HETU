import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CONSOLIDATE_DAYS, type StudyPhase } from '@/lib/study-signals';
import { addDaysISO, formatDate } from '@/lib/utils';
import './study-signals.css';

const span = (from: string, to: string) =>
  Math.max(0, differenceInCalendarDays(parseISO(to), parseISO(from)));

/** Cover -> Consolidate -> Simulate, drawn to scale from the start of Cover to the exam. */
export default function PhaseTimeline({ phase, today }: { phase: StudyPhase; today: string }) {
  const nominalCover = addDaysISO(phase.consolidateStartsOn, -CONSOLIDATE_DAYS);
  const start = today < nominalCover ? today : nominalCover;
  const segments = [
    {
      id: 'cover',
      label: 'Cover',
      from: start,
      to: phase.consolidateStartsOn
    },
    {
      id: 'consolidate',
      label: 'Consolidate',
      from: phase.consolidateStartsOn,
      to: phase.simulateStartsOn
    },
    { id: 'simulate', label: 'Simulate', from: phase.simulateStartsOn, to: phase.examDate }
  ];
  const total = span(start, phase.examDate) || 1;
  const position = Math.min(100, Math.max(0, (span(start, today) / total) * 100));
  const description = segments
    .map(
      (segment) =>
        `${segment.label} ${formatDate(segment.from, 'd MMM')} to ${formatDate(addDaysISO(segment.to, -1), 'd MMM')}`
    )
    .join(', ');
  return (
    <div
      className="phase-line"
      role="img"
      aria-label={`${description}. Exam on ${formatDate(phase.examDate, 'd MMM')}.`}
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          className={`phase-line__seg phase-line__seg--${segment.id}`}
          data-active={phase.id === segment.id}
          style={{ flex: `${Math.max(1, span(segment.from, segment.to))} 1 0` }}
        >
          <div className="phase-line__bar" />
          <span className="phase-line__label">
            <b>{segment.label}</b> · {formatDate(segment.from, 'd MMM')}
          </span>
        </div>
      ))}
      <span className="phase-line__today" style={{ left: `${position}%` }} aria-hidden />
    </div>
  );
}
