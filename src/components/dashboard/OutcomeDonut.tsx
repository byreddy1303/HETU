import type { Outcome } from '@/types';
import { OUTCOMES } from '@/lib/constants';

const COLOR: Record<Outcome, string> = {
  R: 'rgb(var(--color-success, 79 124 69))',
  RBS: 'rgb(var(--color-warn, 138 91 19))',
  RBG: 'rgb(var(--color-guess, 103 81 143))',
  'W-C': 'rgb(var(--color-danger, 184 80 69))',
  'W-E': 'rgb(var(--color-danger, 184 80 69))',
  'W-R': 'rgb(var(--color-danger, 184 80 69))'
};

export default function OutcomeDonut({
  distribution,
  total
}: {
  distribution: Record<Outcome, number>;
  total: number;
}) {
  let cursor = 0;
  const stops = OUTCOMES.flatMap((outcome) => {
    const value = distribution[outcome.code];
    if (value <= 0 || total <= 0) return [];
    const start = cursor;
    cursor += (value / total) * 100;
    return `${COLOR[outcome.code]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const backgroundImage = stops.length
    ? `conic-gradient(from -90deg, ${stops.join(', ')})`
    : 'none';

  return (
    <div
      className="immersive-outcome-donut relative h-[150px] w-[150px] shrink-0"
      role="img"
      aria-label={`Last session outcome distribution across ${total} questions`}
    >
      <div
        className="absolute inset-[9px] rounded-full shadow-sm"
        style={{ backgroundImage }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-[29px] rounded-full border-2 border-bg-raised bg-bg-raised"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="u-num text-[24px] font-semibold leading-none text-text">{total}</span>
        <span className="u-label mt-1">questions</span>
      </div>
      <span className="immersive-outcome-donut__satellite" aria-hidden>
        R
      </span>
    </div>
  );
}
