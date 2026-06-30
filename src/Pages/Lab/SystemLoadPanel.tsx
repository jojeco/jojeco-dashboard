/**
 * SystemLoadPanel — live area charts for the desktop command-center layout.
 *
 * The snapshot endpoint has no time-series, so we keep a small client-side
 * rolling buffer: each time the snapshot timestamp (`tick`) changes we append
 * one aggregate point (avg CPU% + avg RAM% across online always-on machines).
 * Buffer is capped at MAX_POINTS. Pure presentational + local state — no fetch.
 */
import { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import type { Machine } from '@/hooks/useSnapshot';

const MAX_POINTS = 40;

interface Point { t: number; cpu: number; ram: number }

function avg(nums: number[]): number {
  const v = nums.filter(n => Number.isFinite(n));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

function Spark({ data, dataKey, color, unit, label, value }: {
  data: Point[]; dataKey: 'cpu' | 'ram'; color: string; unit: string; label: string; value: number;
}) {
  const gid = `slp-${dataKey}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: 'var(--mono, monospace)' }}>{value}{unit}</span>
      </div>
      <div style={{ height: 46 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              cursor={{ stroke: 'var(--line)' }}
              contentStyle={{ background: 'var(--raised-2)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11, padding: '4px 8px' }}
              labelFormatter={() => ''}
              formatter={(v: number) => [`${v}${unit}`, label]}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
              fill={`url(#${gid})`} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SystemLoadPanel({ machines, tick }: { machines: Machine[]; tick: number | null }) {
  const [buf, setBuf] = useState<Point[]>([]);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (tick == null || tick === lastTick.current) return;
    lastTick.current = tick;
    const online = machines.filter(m => m.online && m.always_on);
    const cpu = avg(online.map(m => m.cpu ?? 0));
    const ram = avg(online.map(m => m.mem?.percent ?? 0));
    setBuf(prev => [...prev, { t: tick, cpu, ram }].slice(-MAX_POINTS));
  }, [tick, machines]);

  const cur = buf[buf.length - 1] ?? { cpu: 0, ram: 0 };
  // Seed a flat line until we have ≥2 points so the chart isn't empty
  const data = buf.length >= 2 ? buf : [{ t: 0, cpu: cur.cpu, ram: cur.ram }, { t: 1, cpu: cur.cpu, ram: cur.ram }];

  return (
    <div style={{ background: 'var(--raised)', borderRadius: 'var(--r-md, 12px)', padding: 16, boxShadow: 'var(--shadow-ring)' }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>System Load</span>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>avg · always-on · live</span>
      </div>
      <div className="flex flex-col gap-3">
        <Spark data={data} dataKey="cpu" color="var(--accent-bright, #2dd4bf)" unit="%" label="CPU" value={cur.cpu} />
        <Spark data={data} dataKey="ram" color="#f59e0b" unit="%" label="Memory" value={cur.ram} />
      </div>
    </div>
  );
}
