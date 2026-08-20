import { useId, useMemo } from 'react';
import type { MistakeSurfacePoint } from '@/lib/analysis';
import { formatDate } from '@/lib/utils';

const WIDTH = 520;
const HEIGHT = 220;
const PLOT = { left: 34, right: 8, top: 14, bottom: 28 } as const;

export default function SurfaceTrendChart({ data }: { data: MistakeSurfacePoint[] }) {
  const rawId = useId();
  const gradientId = `surface-${rawId.replace(/:/g, '')}`;
  const chart = useMemo(() => {
    const top = Math.max(1, ...data.map((point) => point.open)) + 1;
    const plotWidth = WIDTH - PLOT.left - PLOT.right;
    const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
    const bottom = PLOT.top + plotHeight;
    const points = data.map((point, index) => ({
      ...point,
      x:
        data.length <= 1
          ? PLOT.left + plotWidth / 2
          : PLOT.left + (index / (data.length - 1)) * plotWidth,
      y: PLOT.top + (1 - point.open / top) * plotHeight
    }));
    const linePath = points.length
      ? points
          .slice(1)
          .reduce(
            (path, point) => `${path} H ${point.x.toFixed(1)} V ${point.y.toFixed(1)}`,
            `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
          )
      : '';
    const areaPath = points.length
      ? `M ${points[0].x.toFixed(1)} ${bottom} L ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}${points
          .slice(1)
          .map((point) => ` H ${point.x.toFixed(1)} V ${point.y.toFixed(1)}`)
          .join('')} L ${points.at(-1)!.x.toFixed(1)} ${bottom} Z`
      : '';

    return { areaPath, bottom, linePath, plotHeight, points, top };
  }, [data]);

  return (
    <div
      className="h-[220px] w-full"
      role="img"
      aria-label="Open mistake surface at the end of each of the last seven days"
    >
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="rgb(var(--color-ink-violet, 103 81 143))"
              stopOpacity="0.3"
            />
            <stop
              offset="100%"
              stopColor="rgb(var(--color-ink-violet, 103 81 143))"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>

        {[0, 1, 2].map((index) => {
          const y = PLOT.top + (index / 2) * chart.plotHeight;
          const value = Math.round(chart.top * (1 - index / 2));
          return (
            <g key={index}>
              <line
                x1={PLOT.left}
                x2={WIDTH - PLOT.right}
                y1={y}
                y2={y}
                stroke="rgb(var(--color-border, 213 225 216))"
                strokeDasharray="2 5"
              />
              <text
                x={PLOT.left - 8}
                y={y + 3.5}
                fill="rgb(var(--color-text-faint, 101 120 113))"
                fontFamily="Azeret Mono Variable, monospace"
                fontSize="10"
                textAnchor="end"
              >
                {value}
              </text>
            </g>
          );
        })}

        {chart.areaPath && <path d={chart.areaPath} fill={`url(#${gradientId})`} />}
        {chart.linePath && (
          <path
            d={chart.linePath}
            fill="none"
            stroke="rgb(var(--color-ink-violet, 103 81 143))"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        )}
        {chart.points.map((point) => (
          <g key={point.date}>
            <circle
              cx={point.x}
              cy={point.y}
              r="8"
              fill="transparent"
              tabIndex={0}
              aria-label={`${formatDate(point.date, 'EEEE, dd MMM')}: ${point.open} open`}
            >
              <title>{`${formatDate(point.date, 'EEEE, dd MMM')}: ${point.open} open`}</title>
            </circle>
            <circle
              cx={point.x}
              cy={point.y}
              r="3"
              fill="rgb(var(--color-ink-violet, 103 81 143))"
              stroke="rgb(var(--color-bg-raised, 251 253 251))"
              strokeWidth="1.5"
              aria-hidden="true"
            />
            <text
              x={point.x}
              y={chart.bottom + 18}
              fill="rgb(var(--color-text-faint, 101 120 113))"
              fontFamily="Azeret Mono Variable, monospace"
              fontSize="10"
              textAnchor="middle"
            >
              {formatDate(point.date, 'EEE')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
