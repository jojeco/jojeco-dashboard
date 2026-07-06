/**
 * v4 LoadChartsPanel — live CPU history across servers (client-accumulated
 * from SSE lab ticks, ~15s cadence). Fills the desktop lead column (review #3).
 * Focal trace = busiest host in Command Blue; context traces muted (DESIGN.md §4).
 */
import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono } from './Primitives';
import { cn } from '../lib/utils';

interface Sample { t: number; [host: string]: number }

const MAX_SAMPLES = 120; // ~30 min at 15s cadence
const TRACES = ['Server 1', 'Server 2', 'Server 3', 'Mac Mini'];
const CONTEXT_COLORS = ['#8b949e', '#6e7681', '#565e68'];

export function LoadChartsPanel({ className }: { className?: string }) {
  const { data } = useSnapshot('lab');
  const buf = useRef<Sample[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!data?.machines) return;
    const s: Sample = { t: Date.now() };
    for (const m of data.machines) {
      if (TRACES.includes(m.name) && m.online && m.cpu != null) s[m.name] = m.cpu;
    }
    if (Object.keys(s).length > 1) {
      const last = buf.current[buf.current.length - 1];
      if (!last || s.t - last.t > 5000) {
        buf.current = [...buf.current, s].slice(-MAX_SAMPLES);
        force(n => n + 1);
      }
    }
  }, [data]);

  const samples = buf.current;
  const present = TRACES.filter(h => samples.some(s => s[h] != null));
  // focal = highest current CPU
  const latest = samples[samples.length - 1] ?? {};
  const focal = present.reduce((a, b) => ((latest[a] ?? -1) >= (latest[b] ?? -1) ? a : b), present[0]);

  return (
    <Panel className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-2">
        <PanelTitle>CPU — last 30 min</PanelTitle>
        <div className="flex items-center gap-3">
          {present.map(h => (
            <span key={h} className="flex items-center gap-1 text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>
              <span style={{ width: 8, height: 2, background: h === focal ? 'var(--v4-amber)' : CONTEXT_COLORS[0], display: 'inline-block' }} />
              {h} <Mono style={{ color: h === focal ? 'var(--v4-amber)' : 'var(--v4-trace)' }}>{latest[h] != null ? `${(latest[h] as number).toFixed(0)}%` : '—'}</Mono>
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-[0.5rem] px-1 pt-2" style={{ background: 'var(--v4-well)', height: 180 }}>
        {samples.length < 2 ? (
          <div className="h-full flex items-center justify-center text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
            collecting samples…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <XAxis
                dataKey="t"
                tickFormatter={(t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                tick={{ fill: 'var(--v4-trace)', fontSize: 10, fontFamily: 'Geist Mono' }}
                axisLine={false} tickLine={false} minTickGap={60}
              />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--v4-trace)', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--v4-raised)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'Geist Mono' }}
                labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
                formatter={(v: number) => [`${v.toFixed(1)}%`]}
              />
              {present.map((h, i) => (
                <Line key={h} type="monotone" dataKey={h} dot={false} strokeWidth={h === focal ? 2 : 1.25}
                  stroke={h === focal ? 'var(--v4-amber)' : CONTEXT_COLORS[i % CONTEXT_COLORS.length]}
                  isAnimationActive={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
