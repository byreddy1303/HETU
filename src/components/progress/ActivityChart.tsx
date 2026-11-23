import { parseISO } from 'date-fns';
import type { ActivityDay } from '@/lib/study-signals';
import { formatDate } from '@/lib/utils';
import './study-signals.css';

/** Questions per day for the last two weeks: new PYQs below, re-solves stacked on top. */
export default function ActivityChart({
  days,
  streak,
  today
}: {
  days: readonly ActivityDay[];
  streak: number;
  today: string;
}) {
  const totals = days.map((day) => day.newPyqs + day.revisits);
  // Keep a floor so one question does not fill the whole plot.
  const scale = Math.max(8, ...totals);
  const lastWeek = days.slice(-7);
  const weekNew = lastWeek.reduce((sum, day) => sum + day.newPyqs, 0);
  const weekRevisits = lastWeek.reduce((sum, day) => sum + day.revisits, 0);
  const activeDays = days.filter((_, index) => totals[index] > 0).length;

  return (
    <section className="signal-card" aria-labelledby="activity-title">
      <div className="signal-card__head">
        <h2 id="activity-title" className="study-section-label">
          Last 14 days
        </h2>
        <div className="activity__legend" aria-hidden>
          <span>
            <i className="activity__key activity__key--new" /> New PYQs
          </span>
          <span>
            <i className="activity__key activity__key--resolve" /> Re-solves
          </span>
        </div>
      </div>
      <div className="activity__plot" role="list" aria-label="Questions per day">
        {days.map((day, index) => {
          const label = `${formatDate(day.date, 'EEE d MMM')}: ${day.newPyqs} new, ${day.revisits} re-solved`;
          return (
            <div
              key={day.date}
              className="activity__col"
              role="listitem"
              tabIndex={0}
              aria-label={label}
            >
              <span className="activity__tip" aria-hidden>
                <b>{formatDate(day.date, 'EEE d MMM')}</b>
                {totals[index] === 0 ? (
                  'No questions'
                ) : (
                  <>
                    {day.newPyqs} new · {day.revisits} re-solved
                  </>
                )}
              </span>
              {day.newPyqs > 0 && (
                <span
                  className="activity__seg activity__seg--new"
                  style={{ height: `${(day.newPyqs / scale) * 100}%` }}
                />
              )}
              {day.revisits > 0 && (
                <span
                  className="activity__seg activity__seg--resolve"
                  style={{ height: `${(day.revisits / scale) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="activity__axis" aria-hidden>
        {days.map((day) => (
          <span key={day.date} className={day.date === today ? 'is-today' : undefined}>
            {day.date === today ? 'Today' : parseISO(day.date).getDate()}
          </span>
        ))}
      </div>
      <p className="activity__summary">
        <span>
          This week: <strong>{weekNew}</strong> new · <strong>{weekRevisits}</strong> re-solved
        </span>
        <span>
          <strong>{activeDays}</strong> of 14 days active
        </span>
        <span>
          Streak: <strong>{streak}</strong> {streak === 1 ? 'day' : 'days'}
        </span>
      </p>
      <details className="signal-disclosure">
        <summary>Show as a table</summary>
        <table className="signal-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">New PYQs</th>
              <th scope="col">Re-solves</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{formatDate(day.date, 'EEE d MMM')}</td>
                <td>{day.newPyqs}</td>
                <td>{day.revisits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
