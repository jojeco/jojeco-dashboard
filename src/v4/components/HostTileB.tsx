/**
 * HostTileB — "Big-number readout" variant
 * DESIGN.md: 2-col mobile grid, instrument card style.
 * Hero: hostname small top, CPU% large mono (~1.75rem), sparkline as
 * subtle area trace behind the number (background, not divider).
 * Footer: compact mono "RAM 3.2/4.0 · DSK 52%" (+ "GPU 48°" when present).
 * Offline: red stripe card + hostname + "offline" only, half height.
 * Idle/no-data: dimmed "idle" not em-dash.
 */
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { useSparkBuffer } from './Sparkline';
import { StatusDot } from './Primitives';
import { fmtPct, fmtBytes, cn } from '../lib/utils';
import type { Machine } from '../../hooks/useSnapshot';

interface Props {
  machine: Machine;
  onClick?: () => void;
}

export function HostTileB({ machine, onClick }: Props) {
  const { cpu, mem, disks, gpu, online, name } = machine;
  const disk = disks?.[0];

  const cpuSpark = useSparkBuffer(cpu);

  const stripeColor = online ? 'var(--v4-nominal)' : 'var(--v4-fault)';
  const cpuDisplay = cpu != null ? `${cpu.toFixed(0)}%` : null;

  // Build compact footer string
  const footerParts: string[] = [];
  if (mem) {
    footerParts.push(`RAM ${fmtBytes(mem.used, 1)} / ${fmtBytes(mem.total, 1)}`);
  }
  if (disk) {
    footerParts.push(`DSK ${fmtPct(disk.percent)}`);
  }
  if (gpu?.temp != null) {
    footerParts.push(`GPU ${gpu.temp}°`);
  }
  const footer = footerParts.join(' · ');

  // CPU color for hero number
  const heroColor = cpu != null
    ? (cpu >= 90 ? 'var(--v4-fault)' : cpu >= 75 ? 'var(--v4-degraded)' : 'var(--v4-signal)')
    : 'var(--v4-trace)';

  if (!online) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'text-left flex flex-col justify-center gap-1.5 px-3 py-2.5 rounded-[0.5rem]',
          'active:scale-[0.98] transition-transform duration-100',
        )}
        style={{
          background: 'var(--v4-console)',
          boxShadow: `inset 3px 0 0 ${stripeColor}, 0 1px 0 rgba(0,0,0,0.4)`,
          minHeight: 64,
          cursor: onClick ? 'pointer' : 'default',
        }}
        aria-label={`${name} — offline`}
      >
        <div className="flex items-center gap-2">
          <StatusDot level="fault" />
          <span
            className="text-[0.75rem] font-semibold truncate"
            style={{ color: 'var(--v4-readout)', letterSpacing: '-0.01em' }}
          >
            {name}
          </span>
        </div>
        <span
          className="font-mono text-[0.75rem] uppercase tracking-wider"
          style={{ color: 'var(--v4-fault)' }}
        >
          offline
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left relative flex flex-col gap-0 px-3 pt-2.5 pb-2 rounded-[0.5rem] overflow-hidden',
        'active:scale-[0.98] transition-transform duration-100',
      )}
      style={{
        background: 'var(--v4-console)',
        boxShadow: `inset 3px 0 0 ${stripeColor}, 0 1px 0 rgba(0,0,0,0.4)`,
        minHeight: 110,
        cursor: onClick ? 'pointer' : 'default',
      }}
      aria-label={`${name} — CPU ${cpuDisplay ?? 'idle'}`}
    >
      {/* ── Sparkline — rendered as background area trace ── */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        aria-hidden
        style={{ height: 60, opacity: 0.25 }}
      >
        {cpuSpark.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cpuSpark} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-b-${machine.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--v4-amber)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--v4-amber)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis domain={[0, 100]} hide />
              <Area
                type="monotoneX"
                dataKey="v"
                stroke="var(--v4-amber)"
                strokeWidth={1.5}
                fill={`url(#spark-b-${machine.id})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Foreground content ── */}
      <div className="relative flex flex-col gap-1 z-10">
        {/* Hostname row */}
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot level={cpu != null && cpu > 90 ? 'fault' : 'nominal'} />
          <span
            className="text-[0.7rem] font-semibold truncate"
            style={{ color: 'var(--v4-readout)', letterSpacing: '-0.01em' }}
          >
            {name}
          </span>
        </div>

        {/* Hero CPU number */}
        <div className="flex items-baseline gap-1">
          <span
            className="font-mono tabular-nums font-semibold leading-none"
            style={{
              fontSize: '1.75rem',
              color: heroColor,
              letterSpacing: '-0.02em',
            }}
          >
            {cpuDisplay ?? (
              <span style={{ fontSize: '1rem', color: 'var(--v4-trace)' }}>idle</span>
            )}
          </span>
          {cpuDisplay && (
            <span
              className="font-mono text-[0.7rem]"
              style={{ color: 'var(--v4-trace)' }}
            >
              CPU
            </span>
          )}
        </div>

        {/* Footer line */}
        {footer && (
          <span
            className="font-mono tabular-nums text-[0.65rem] truncate"
            style={{ color: 'var(--v4-readout)' }}
          >
            {footer}
          </span>
        )}
      </div>
    </button>
  );
}

/** Skeleton for loading state */
export function HostTileBSkeleton() {
  return (
    <div
      className="rounded-[0.5rem] px-3 pt-2.5 pb-2 flex flex-col gap-1"
      style={{ background: 'var(--v4-console)', minHeight: 110 }}
    >
      <div className="flex items-center gap-1.5">
        <div className="rounded-full v4-skeleton" style={{ width: 6, height: 6 }} />
        <div className="rounded v4-skeleton" style={{ height: 10, width: 60 }} />
      </div>
      <div className="rounded v4-skeleton" style={{ height: 42, width: 72 }} />
      <div className="rounded v4-skeleton" style={{ height: 10, width: 110 }} />
    </div>
  );
}
