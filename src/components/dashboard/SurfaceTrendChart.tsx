import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { MistakeSurfacePoint } from '@/lib/analysis';
import { formatDate } from '@/lib/utils';

export default function SurfaceTrendChart({ data }: { data: MistakeSurfacePoint[] }) {
  const rawId = useId();
  const gradientId = `surface-${rawId.replace(/:/g, '')}`;
  const top = useMemo(() => Math.max(1, ...data.map((point) => point.open)) + 1, [data]);

  return (
    <div
      className="h-[220px] w-full"
      role="img"
      aria-label="Open mistake surface at the end of each of the last seven days"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 6, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(var(--color-ink-violet, 103 81 143))"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="rgb(var(--color-ink-violet, 103 81 143))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="rgb(var(--color-border, 213 225 216))"
            strokeDasharray="2 5"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => formatDate(date, 'EEE')}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: 'rgb(var(--color-text-faint, 101 120 113))',
              fontSize: 10,
              fontFamily: 'Azeret Mono'
            }}
            dy={8}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: 'rgb(var(--color-text-faint, 101 120 113))',
              fontSize: 10,
              fontFamily: 'Azeret Mono'
            }}
            domain={[0, top]}
            tickCount={4}
          />
          <Tooltip
            cursor={{
              stroke: 'rgb(var(--color-border-hover, 184 201 189))',
              strokeDasharray: '3 3'
            }}
            labelFormatter={(date) => formatDate(String(date), 'EEEE, dd MMM')}
            formatter={(value) => [value, 'Open surface']}
            contentStyle={{
              background: 'rgb(var(--color-bg-raised, 251 253 251))',
              border: '1px solid rgb(var(--color-border, 213 225 216))',
              borderRadius: 10,
              boxShadow: 'var(--shadow-card)',
              color: 'rgb(var(--color-text, 25 53 47))',
              fontSize: 12
            }}
            labelStyle={{ color: 'rgb(var(--color-text-muted, 80 102 95))', marginBottom: 4 }}
          />
          <Area
            type="stepAfter"
            dataKey="open"
            stroke="rgb(var(--color-ink-violet, 103 81 143))"
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            activeDot={{
              r: 4,
              fill: 'rgb(var(--color-ink-violet, 103 81 143))',
              stroke: 'rgb(var(--color-bg-raised, 251 253 251))',
              strokeWidth: 2
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
