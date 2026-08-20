import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
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
  const data = OUTCOMES.map((outcome) => ({
    code: outcome.code,
    value: distribution[outcome.code]
  })).filter((entry) => entry.value > 0);

  return (
    <div
      className="immersive-outcome-donut relative h-[150px] w-[150px] shrink-0"
      role="img"
      aria-label={`Last session outcome distribution across ${total} questions`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="code"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={66}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="rgb(var(--color-bg-raised, 251 253 251))"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.code} fill={COLOR[entry.code]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
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
