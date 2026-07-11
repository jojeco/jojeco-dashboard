/**
 * HostTileC — "Dense rows" variant
 * DESIGN.md: no individual cards — one Console-surface panel, every host
 * is a single full-width row. Status stripe edge (left 3px inset), hostname,
 * optional GPU chip, then right side = three fixed-width mono mini-columns:
 * "CPU 4%", "RAM 51%", "DSK 52%", each with a 24px inline bar below the number.
 * Row height ≈ 44px. Offline rows dimmed + red left stripe. Max information density.
 *
 * USAGE: render as a single <HostTileC> panel receiving all machines.
 */
import { cn } from '../lib/utils';
import type { Machine } from '../../hooks/useSnapshot';

interface Props {
  machines: Machine[];
  onClickMachine?: (machine: Machine) => void;
}

/** 24px-wide inline bar under a value */
function MiniBar({ pct, color }: { pct: number | null; color: string }) {
  const fill = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div
      className="rounded-full overflow-hidden"
      style={{ height: 2, width: 24, background: 'var(--v4-well)' }}
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

function metricColor(pct: number | null): string {
  if (pct == null) return 'var(--v4-trace)';
  if (pct >= 90) return 'var(--v4-fault)';
  if (pct >= 75) return 'var(--v4-degraded)';
  return 'var(--v4-signal)';
}

/** One mini stat column: label, number, micro-bar */
function MiniCol({
  label,
  value,
  pct,
  width = 44,
}: {
  label: string;
  value: string;
  pct: number | null;
  width?: number;
}) {
  const color = metricColor(pct);
  return (
    <div
      className="flex flex-col items-end gap-0.5 shrink-0"
      style={{ minWidth: width }}
    >
      {/* Label + value on one line */}
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono text-[0.6rem] uppercase"
          style={{ color: 'var(--v4-trace)' }}
        >
          {label}
        </span>
        <span
          className="font-mono tabular-nums text-[0.7rem]"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      <MiniBar pct={pct} color={color} />
    </div>
  );
}

/** Single host row */
function HostRow({
  machine,
  onClick,
}: {
  machine: Machine;
  onClick?: () => void;
}) {
  const { cpu, mem, disks, gpu, online, name } = machine;
  const disk = disks?.[0];

  const stripeColor = online ? 'var(--v4-nominal)' : 'var(--v4-fault)';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3',
        'active:bg-[var(--v4-raised)] transition-colors duration-100',
        !online && 'opacity-50',
      )}
      style={{
        minHeight: 44,
        boxShadow: `inset 3px 0 0 ${stripeColor}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      aria-label={`${name} — ${online ? 'online' : 'offline'}`}
    >
      {/* ── Hostname + GPU chip ── */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Status dot */}
        <span
          className="rounded-full shrink-0"
          style={{
            width: 6,
            height: 6,
            background: stripeColor,
          }}
          aria-hidden
        />

        <span
          className="text-[0.8125rem] font-semibold truncate"
          style={{
            color: online ? 'var(--v4-signal)' : 'var(--v4-readout)',
            letterSpacing: '-0.01em',
          }}
        >
          {name}
        </span>

        {/* GPU chip — small, only when data exists */}
        {online && gpu?.temp != null && (
          <span
            className="font-mono tabular-nums text-[0.6rem] shrink-0 px-1 py-0.5 rounded"
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
            className="font-mono text-[0.625rem] uppercase tracking-wider"
            style={{ color: 'var(--v4-fault)' }}
          >
            down
          </span>
        )}
      </div>

      {/* ── Three mini-columns — right-aligned ── */}
      {online ? (
        <div className="flex items-center gap-3 shrink-0">
          <MiniCol
            label="CPU"
            value={cpu != null ? `${cpu.toFixed(0)}%` : 'idle'}
            pct={cpu}
          />
          <MiniCol
            label="RAM"
            value={mem != null ? `${mem.percent.toFixed(0)}%` : '—'}
            pct={mem?.percent ?? null}
          />
          <MiniCol
            label="DSK"
            value={disk != null ? `${disk.percent.toFixed(0)}%` : '—'}
            pct={disk?.percent ?? null}
          />
        </div>
      ) : (
        /* Offline: dim placeholder columns */
        <div className="flex items-center gap-3 shrink-0 opacity-30">
          {['CPU', 'RAM', 'DSK'].map(lbl => (
            <div key={lbl} className="flex flex-col items-end gap-0.5" style={{ minWidth: 44 }}>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-[0.6rem] uppercase" style={{ color: 'var(--v4-trace)' }}>{lbl}</span>
                <span className="font-mono text-[0.7rem]" style={{ color: 'var(--v4-trace)' }}>—</span>
              </div>
              <div className="rounded-full" style={{ height: 2, width: 24, background: 'var(--v4-well)' }} aria-hidden />
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** Hairline separator */
function RowSep() {
  return (
    <div
      style={{ height: 1, background: 'var(--v4-hairline)', marginLeft: 12, marginRight: 0 }}
      aria-hidden
    />
  );
}

/** Full panel — receives all machines, renders a dense list */
export function HostTileCPanel({ machines, onClickMachine }: Props) {
  if (machines.length === 0) {
    return (
      <div
        className="rounded-[0.75rem] px-3 py-3 text-[0.875rem]"
        style={{ background: 'var(--v4-console)', color: 'var(--v4-readout)' }}
      >
        No host data — check SSE connection
      </div>
    );
  }

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{
        background: 'var(--v4-console)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
      }}
    >
      {machines.map((m, idx) => (
        <div key={m.id}>
          <HostRow
            machine={m}
            onClick={onClickMachine ? () => onClickMachine(m) : undefined}
          />
          {idx < machines.length - 1 && <RowSep />}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for loading state */
export function HostTileCSkeleton() {
  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ background: 'var(--v4-console)', boxShadow: '0 1px 0 rgba(0,0,0,0.4)' }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <div
            className="flex items-center gap-2 px-3"
            style={{ minHeight: 44 }}
          >
            <div className="rounded-full v4-skeleton" style={{ width: 6, height: 6 }} />
            <div className="flex-1 rounded v4-skeleton" style={{ height: 12 }} />
            <div className="flex gap-3">
              {[44, 44, 44].map((w, j) => (
                <div key={j} className="flex flex-col items-end gap-1" style={{ minWidth: w }}>
                  <div className="rounded v4-skeleton" style={{ height: 12, width: w }} />
                  <div className="rounded-full v4-skeleton" style={{ height: 2, width: 24 }} />
                </div>
              ))}
            </div>
          </div>
          {i < 4 && (
            <div style={{ height: 1, background: 'var(--v4-hairline)', marginLeft: 12 }} aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
