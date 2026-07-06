/**
 * v4 HostTile — CT100/S1/S2/S3/MacMini telemetry tiles
 * DESIGN.md §4 Status tile: Console Surface, 0.75rem radius, 2px left edge-stripe,
 * name in body face, readout in mono. Tap target >=44px. Press: scale(0.98) spring.
 * Asymmetric auto-fill grid (minmax 140px, 1fr) — no 3-equal-cards rows.
 */
import { Mono, Skeleton, StatusDot } from './Primitives';
import { Sparkline, useSparkBuffer } from './Sparkline';
import { fmtPct, fmtBytes, pctColor, stripeClass } from '../lib/utils';
import type { Machine } from '../../hooks/useSnapshot';
import { cn } from '../lib/utils';

interface HostTileProps {
  machine: Machine;
  onClick?: () => void;
}

export function HostTile({ machine, onClick }: HostTileProps) {
  const cpu = machine.cpu;
  const mem = machine.mem;
  const disk = machine.disks?.[0];

  // Rolling spark buffers
  const cpuSpark = useSparkBuffer(cpu);
  const memSpark = useSparkBuffer(mem?.percent ?? null);

  const statusLevel = machine.online
    ? (cpu != null && cpu > 90 ? 'fault' : 'nominal')
    : 'fault';

  return (
    <button
      onClick={onClick}
      className={cn(
        'v4-tile text-left flex flex-col gap-2 p-3 rounded-[0.75rem] w-full',
        stripeClass(machine.online ? 'online' : 'offline'),
      )}
      style={{
        background: 'var(--v4-console)',
        minHeight: 44,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: `inset 2px 0 0 ${machine.online ? 'var(--v4-nominal)' : 'var(--v4-fault)'}, 0 1px 0 rgba(0,0,0,0.4)`,
        // Override box-shadow from stripeClass since we need both inset and drop
      }}
      aria-label={`${machine.name} — ${machine.online ? 'online' : 'offline'}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot level={statusLevel} />
          <span
            className="text-[0.8125rem] font-semibold truncate"
            style={{ color: 'var(--v4-signal)', letterSpacing: '-0.01em' }}
          >
            {machine.name}
          </span>
        </div>
        {!machine.online && (
          <span
            className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider shrink-0"
            style={{ color: 'var(--v4-fault)' }}
          >
            DOWN
          </span>
        )}
        {machine.online && machine.gpu && (
          <span
            className="font-mono text-[0.625rem] uppercase tracking-wider shrink-0"
            style={{ color: 'var(--v4-trace)' }}
          >
            GPU
          </span>
        )}
      </div>

      {machine.online ? (
        <>
          {/* CPU sparkline + readout */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>CPU</span>
              <Mono className="text-[0.75rem]" style={{ color: pctColor(cpu) }}>
                {fmtPct(cpu)}
              </Mono>
            </div>
            <Sparkline
              data={cpuSpark.length > 1 ? cpuSpark : [{ v: cpu ?? 0 }]}
              color={pctColor(cpu)}
              height={28}
            />
          </div>

          {/* RAM row */}
          {mem && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>RAM</span>
                <Mono className="text-[0.75rem] whitespace-nowrap" style={{ color: pctColor(mem.percent) }}>
                  {fmtBytes(mem.used)} / {fmtBytes(mem.total)}
                </Mono>
              </div>
              <Sparkline
                data={memSpark.length > 1 ? memSpark : [{ v: mem.percent }]}
                color={pctColor(mem.percent)}
                height={22}
              />
            </div>
          )}

          {/* Disk */}
          {disk && (
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>
                {disk.label || 'Disk'}
              </span>
              <Mono className="text-[0.75rem]" style={{ color: pctColor(disk.percent) }}>
                {fmtPct(disk.percent)}
              </Mono>
            </div>
          )}

          {/* GPU temp if present */}
          {machine.gpu?.temp != null && (
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>GPU</span>
              <Mono className="text-[0.75rem]" style={{ color: machine.gpu.temp > 85 ? 'var(--v4-fault)' : 'var(--v4-readout)' }}>
                {machine.gpu.temp}°C
              </Mono>
            </div>
          )}
        </>
      ) : (
        <div className="text-[0.75rem] font-mono" style={{ color: 'var(--v4-trace)' }}>
          unreachable
        </div>
      )}
    </button>
  );
}

// ── Loading skeleton for host tile ───────────────────────────────────────────
export function HostTileSkeleton() {
  return (
    <div
      className="rounded-[0.75rem] p-3 flex flex-col gap-2"
      style={{ background: 'var(--v4-console)', minHeight: 130 }}
    >
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-6 w-full" />
    </div>
  );
}
