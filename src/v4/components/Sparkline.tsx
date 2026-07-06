/**
 * v4 Sparkline — recharts-based micro chart for host tiles
 * DESIGN.md §4 Charts: plot on Recessed Well, Amber Command focal trace,
 * Muted Readout context series, mono axis ticks, no gradient fills >12%.
 */
import { useRef, useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Well } from './Primitives';
import { cn } from '../lib/utils';

interface SparkPoint {
  v: number;
}

interface SparklineProps {
  data: SparkPoint[];
  color?: string;
  height?: number;
  className?: string;
  /** If true, show a minimal y-axis range tooltip */
  tooltip?: boolean;
}

// Custom tooltip per DESIGN.md — Raised Console bg, mono text
function SparkTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="font-mono text-[0.7rem] tabular-nums px-2 py-1 rounded"
      style={{
        background: 'var(--v4-raised)',
        color: 'var(--v4-signal)',
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      {payload[0].value.toFixed(1)}%
    </div>
  );
}

export function Sparkline({ data, color = 'var(--v4-amber)', height = 40, className, tooltip = false }: SparklineProps) {
  return (
    <Well className={cn('w-full overflow-hidden', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-fill-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          {tooltip && <Tooltip content={<SparkTooltip />} cursor={false} />}
          <Area
            type="monotoneX"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-fill-${color.replace(/[^a-z0-9]/gi, '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Well>
  );
}

// ── Rolling sparkline buffer hook ────────────────────────────────────────────
/** Keeps a rolling window of numeric samples for a sparkline */
export function useSparkBuffer(value: number | null, maxPoints = 30): SparkPoint[] {
  const [points, setPoints] = useState<SparkPoint[]>([]);
  const prevValue = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    if (value === prevValue.current) return; // no change, don't push duplicate
    prevValue.current = value;
    setPoints(prev => {
      const next = [...prev, { v: value }];
      return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
    });
  }, [value, maxPoints]);

  return points;
}
