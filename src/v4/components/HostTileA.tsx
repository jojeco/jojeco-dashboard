/**
 * HostTileA — "Instrument bars" variant
 * DESIGN.md: mobile-first full-width cards (1-col), compact at ~88-104px.
 * Thin 4px meter bars on Recessed Well track, Command Blue fill.
 * No sparklines. GPU temp chip in corner when present.
 * Offline = collapsed red inset stripe row + "unreachable" label.
 */
import { fmtPct, fmtBytes, cn } from '../lib/utils';
import { StatusDot } from './Primitives';
import type { Machine } from '../../hooks/useSnapshot';

interface Props {
  machine: Machine;
  onClick?: () => void;
}

/** 4px slim meter bar — Well track + fill color */
function MeterBar({ pct, color }: { pct: number | null; color: string }) {
  const fill = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height: 4, background: 'var(--v4-well)' }}
      aria-hidden
    >
      <div
        style={{
          width: `${fill}%`,
          height: '100%',
          background: color,
          borderRadius: 'inherit',
          transition: 'width 400ms ease-out',
        }}
      />
    </div>
  );
}

/** One tight metric row: label + bar + value */
function MetricRow({
  label,
  pct,
  value,
}: {
  label: string;
  pct: number | null;
  value: string;
}) {
  const fillColor = pct != null && pct >= 90
    ? 'var(--v4-fault)'
    : pct != null && pct >= 75
      ? 'var(--v4-degraded)'
      : 'var(--v4-amber)';

  return (
    <div className="flex items-center gap-2">
      {/* 3-char mono label */}
      <span
        className="font-mono text-[0.6rem] uppercase tracking-wider shrink-0 w-7 text-right"
        style={{ color: 'var(--v4-trace)' }}
      >
        {label}
      </span>

      {/* Slim track */}
      <div className="flex-1 min-w-0">
        <MeterBar pct={pct} color={fillColor} />
      </div>

      {/* Right-aligned mono value */}
      <span
        className="font-mono tabular-nums text-[0.6875rem] shrink-0 text-right"
        style={{
          minWidth: 52,
          color: pct != null && pct >= 90
            ? 'var(--v4-fault)'
            : pct != null && pct >= 75
              ? 'var(--v4-degraded)'
              : 'var(--v4-signal)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function HostTileA({ machine, onClick }: Props) {
  const { cpu, mem, disks, gpu, online, name, role } = machine;
  const disk = disks?.[0];

  const stripeColor = online ? 'var(--v4-nominal)' : 'var(--v4-fault)';

  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left w-full flex flex-col gap-2 px-3 py-2.5 rounded-[0.5rem]',
        'active:scale-[0.98] transition-transform duration-100',
      )}
      style={{
        background: 'var(--v4-console)',
        boxShadow: `inset 3px 0 0 ${stripeColor}, 0 1px 0 rgba(0,0,0,0.4)`,
        minHeight: online ? 88 : 44,
        cursor: onClick ? 'pointer' : 'default',
      }}
      aria-label={`${name} — ${online ? 'online' : 'offline'}`}
    >
      {/* ── Header row: name · dot · role · GPU chip ── */}
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot level={online ? (cpu != null && cpu > 90 ? 'fault' : 'nominal') : 'fault'} />

        <span
          className="text-[0.8125rem] font-semibold truncate"
          style={{ color: 'var(--v4-signal)', letterSpacing: '-0.01em' }}
        >
          {name}
        </span>

        {role && (
          <span
            className="font-mono text-[0.6rem] uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--v4-trace)',
              background: 'var(--v4-well)',
            }}
          >
            {role}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* GPU temp chip — corner */}
        {online && gpu?.temp != null && (
          <span
            className="font-mono tabular-nums text-[0.625rem] shrink-0 px-1.5 py-0.5 rounded"
            style={{
              color: gpu.temp > 85 ? 'var(--v4-fault)' : 'var(--v4-amber)',
              background: 'color-mix(in srgb, var(--v4-amber) 10%, transparent)',
            }}
          >
            {gpu.temp}°
          </span>
        )}

        {/* Offline label */}
        {!online && (
          <span
            className="font-mono text-[0.625rem] uppercase tracking-wider shrink-0"
            style={{ color: 'var(--v4-fault)' }}
          >
            unreachable
          </span>
        )}
      </div>

      {/* ── Metric bars — only when online ── */}
      {online && (
        <div className="flex flex-col gap-1.5">
          {/* CPU */}
          <MetricRow
            label="CPU"
            pct={cpu}
            value={fmtPct(cpu)}
          />

          {/* RAM */}
          {mem && (
            <MetricRow
              label="RAM"
              pct={mem.percent}
              value={`${fmtBytes(mem.used, 1)} / ${fmtBytes(mem.total, 1)}`}
            />
          )}

          {/* Disk */}
          {disk && (
            <MetricRow
              label="DSK"
              pct={disk.percent}
              value={fmtPct(disk.percent)}
            />
          )}
        </div>
      )}
    </button>
  );
}

/** Skeleton for loading state */
export function HostTileASkeleton() {
  return (
    <div
      className="rounded-[0.5rem] px-3 py-2.5 flex flex-col gap-2"
      style={{ background: 'var(--v4-console)', minHeight: 88 }}
    >
      <div className="flex items-center gap-2">
        <div className="rounded-full v4-skeleton" style={{ width: 6, height: 6 }} />
        <div className="rounded v4-skeleton" style={{ height: 13, width: 80 }} />
      </div>
      <div className="flex flex-col gap-1.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className="rounded v4-skeleton" style={{ width: 28, height: 8 }} />
            <div className="flex-1 rounded-full v4-skeleton" style={{ height: 4 }} />
            <div className="rounded v4-skeleton" style={{ width: 52, height: 11 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
