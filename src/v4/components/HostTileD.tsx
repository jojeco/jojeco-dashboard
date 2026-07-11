/**
 * HostTileD — "Instrument-grade dense rows" variant
 *
 * Same density philosophy as C ("dense rows"), but treated as a premium
 * control-room instrument rather than a flat table:
 *
 * Architecture:
 *   1. Fleet summary header — mono one-liner with live dot.
 *   2. One 52-56px row per host inside a Console panel:
 *      - 3px left status stripe (green/red)
 *      - Hairline seam between rows (dark, not light border)
 *      - Background CPU sparkline (low-opacity Command Blue area fill)
 *        drawn into a canvas positioned behind content
 *      - Content layer: status dot + hostname + role/GPU chip (left),
 *        three stacked metric clusters CPU / RAM / DSK (right)
 *   3. Status dot slow CSS pulse when online.
 *   4. Offline rows: 45% opacity, red stripe, "unreachable" mono.
 *   5. No-agent rows (online but cpu===null): "no agent" mono.
 *   6. Hover/tap: row lifts + 1px Command Blue glow on the stripe.
 *
 * CPU trace buffering (same pattern as LoadChartsPanel):
 *   useRef<number[][]> per host (ring buffer, MAX_TRACE_PTS points).
 *   useEffect fires on every SSE tick from useSnapshot('lab').
 *   A module-level WeakMap stores per-host buffers across re-renders without
 *   lifting state up. drawTrace() reads buf and paints to <canvas>.
 *
 * USAGE: render as a single <HostTileDPanel> receiving all machines.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { useSnapshot } from '../../hooks/useSnapshot';
import type { Machine, LabSection } from '../../hooks/useSnapshot';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TRACE_PTS = 80;     // ~20 min at 15s cadence
const CMD_BLUE      = '#58a6ff';
const CMD_BLUE_LINE = 'rgba(88,166,255,0.45)';
const CMD_BLUE_FILL = 'rgba(88,166,255,0.13)';

// ── Module-level trace store (survives component re-mounts) ─────────────────
// Map<machine.id → number[]>  — each entry is a ring of CPU % values [0-100]
const traceStore = new Map<string, number[]>();

function getTrace(id: string): number[] {
  if (!traceStore.has(id)) traceStore.set(id, []);
  return traceStore.get(id)!;
}

function pushTrace(id: string, value: number): void {
  const buf = getTrace(id);
  buf.push(value);
  if (buf.length > MAX_TRACE_PTS) buf.shift();
}

// ── Canvas sparkline painter ─────────────────────────────────────────────────

function drawTrace(
  canvas: HTMLCanvasElement,
  pts: number[],
  w: number,
  h: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || pts.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
  }
  ctx.clearRect(0, 0, w, h);

  const n = pts.length;
  const xStep = w / (n - 1);
  // Sparkline occupies the lower 60% of the row height for a subtle underlay
  const topMargin = h * 0.4;
  const plotH     = h - topMargin;

  const xOf = (i: number) => i * xStep;
  const yOf = (v: number) => topMargin + plotH - (v / 100) * plotH;

  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(pts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(pts[i]));

  // Area fill
  ctx.lineTo(xOf(n - 1), h);
  ctx.lineTo(xOf(0), h);
  ctx.closePath();
  ctx.fillStyle = CMD_BLUE_FILL;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(pts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(pts[i]));
  ctx.strokeStyle = CMD_BLUE_LINE;
  ctx.lineWidth   = 1.25;
  ctx.lineJoin    = 'round';
  ctx.stroke();
}

// ── Helper: metric color — hot values get status color, else neutral ─────────

function metricColor(pct: number | null): string {
  if (pct == null)   return 'var(--v4-trace)';
  if (pct >= 90)     return 'var(--v4-fault)';
  if (pct >= 85)     return 'var(--v4-degraded)';
  return 'var(--v4-signal)'; // neutral white — color encodes state only
}

// ── Fleet summary computation ────────────────────────────────────────────────

interface FleetSummary {
  online: number;
  total:  number;
  avgCpu: number | null;
  ramUsed: number;
  ramTotal: number;
}

function computeSummary(machines: Machine[]): FleetSummary {
  const online = machines.filter(m => m.online);
  const cpuVals = online.map(m => m.cpu).filter((v): v is number => v != null);
  const avgCpu  = cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : null;

  let ramUsed = 0, ramTotal = 0;
  for (const m of online) {
    if (m.mem) { ramUsed += m.mem.used; ramTotal += m.mem.total; }
  }
  return { online: online.length, total: machines.length, avgCpu, ramUsed, ramTotal };
}

function fmtGib(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(0);
}

// ── Fleet summary header ─────────────────────────────────────────────────────

function FleetHeader({ machines }: { machines: Machine[] }) {
  const { online, total, avgCpu, ramUsed, ramTotal } = computeSummary(machines);
  const allOk   = online === total;
  const dotColor = allOk ? 'var(--v4-nominal)' : online === 0 ? 'var(--v4-fault)' : 'var(--v4-degraded)';

  const cpuStr  = avgCpu != null ? `CPU ${avgCpu.toFixed(0)}% avg` : 'CPU —';
  const ramStr  = ramTotal > 0
    ? `RAM ${fmtGib(ramUsed)}/${fmtGib(ramTotal)} GB`
    : 'RAM —';

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{
        borderBottom: '1px solid var(--v4-hairline)',
        minHeight: 36,
      }}
    >
      {/* Live dot — pulses slowly (CSS keyframe defined in v4.css / inline) */}
      <span
        className="v4-dot-pulse shrink-0 rounded-full"
        style={{
          width: 6,
          height: 6,
          background: dotColor,
          animationDuration: '4s',
        }}
        aria-hidden
      />
      <span
        className="font-mono tabular-nums text-[0.6875rem] leading-none"
        style={{ color: 'var(--v4-readout)', letterSpacing: '0.02em' }}
      >
        {online}/{total} online
        <span style={{ color: 'var(--v4-hairline)', margin: '0 0.4em' }}>·</span>
        {cpuStr}
        <span style={{ color: 'var(--v4-hairline)', margin: '0 0.4em' }}>·</span>
        {ramStr}
      </span>
    </div>
  );
}

// ── Metric cluster — stacked value over dimmed label ─────────────────────────

function MetricCluster({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number | null;
}) {
  const color = metricColor(pct);
  return (
    <div className="flex flex-col items-end shrink-0" style={{ minWidth: 38 }}>
      <span
        className="font-mono tabular-nums leading-none"
        style={{ fontSize: '0.9375rem', color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
      <span
        className="font-mono uppercase leading-none mt-[2px]"
        style={{ fontSize: '0.5625rem', color: 'var(--v4-trace)', letterSpacing: '0.05em' }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Canvas trace — positioned absolutely behind content ──────────────────────

interface TraceProps {
  id: string;
  pts: number[];
  height: number;
}

function RowTrace({ id, pts, height }: TraceProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w > 0) drawTrace(el, pts, w, height);
  }, [pts, height]);

  // Also repaint on resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      if (width > 0) drawTrace(el, getTrace(id), width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, height]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position:   'absolute',
        inset:      0,
        width:      '100%',
        height:     '100%',
        pointerEvents: 'none',
        display:    'block',
      }}
    />
  );
}

// ── Single host row ──────────────────────────────────────────────────────────

interface RowProps {
  machine: Machine;
  onClick?: () => void;
}

function HostRowD({ machine, onClick }: RowProps) {
  const { id, name, role, online, cpu, mem, disks, gpu, temp } = machine;
  const disk = disks?.[0];

  // Detect "no agent" — machine is online but all metrics are null
  const hasAgent = online && (cpu != null || mem != null);

  const stripeColor = online
    ? (hasAgent ? 'var(--v4-nominal)' : 'var(--v4-standby)')
    : 'var(--v4-fault)';

  // Stable reference to trace for this render
  const pts = getTrace(id);

  const [hovered, setHovered] = useState(false);

  const stripeGlow = hovered
    ? `inset 3px 0 0 ${CMD_BLUE}, inset 4px 0 0 rgba(88,166,255,0.25)`
    : `inset 3px 0 0 ${stripeColor}`;

  // Row height: 54px (tap target comfortable, instrument-dense)
  const ROW_H = 54;

  // Dimming
  const dimOpacity = !online ? 0.45 : 1;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative w-full flex items-center gap-2 px-3',
        'transition-colors duration-100',
      )}
      style={{
        minHeight:  ROW_H,
        boxShadow:  stripeGlow,
        cursor:     onClick ? 'pointer' : 'default',
        opacity:    dimOpacity,
        background: hovered
          ? 'color-mix(in srgb, var(--v4-raised) 60%, transparent)'
          : 'transparent',
      }}
      aria-label={`${name} — ${online ? 'online' : 'offline'}`}
    >
      {/* Background CPU trace — absolute, behind content */}
      {online && hasAgent && pts.length >= 2 && (
        <RowTrace id={id} pts={[...pts]} height={ROW_H} />
      )}

      {/* ── Left: status dot + hostname + role chip ── */}
      <div className="relative flex items-center gap-2 flex-1 min-w-0 z-10">
        {/* Status dot — pulses when online */}
        <span
          className={cn('rounded-full shrink-0', online && hasAgent && 'v4-dot-pulse')}
          style={{
            width:      7,
            height:     7,
            background: stripeColor,
            animationDuration: '4s',
          }}
          aria-hidden
        />

        {/* Hostname */}
        <span
          className="text-[0.875rem] font-semibold truncate leading-none"
          style={{
            color:          online ? 'var(--v4-signal)' : 'var(--v4-readout)',
            letterSpacing: '-0.01em',
          }}
        >
          {name}
        </span>

        {/* Role chip — small, dimmed. Hidden on mobile: hostname wins the space fight */}
        {role && (
          <span
            className="font-mono text-[0.5625rem] uppercase shrink-0 px-1 py-0.5 rounded hidden sm:inline-block"
            style={{
              color:      'var(--v4-trace)',
              background: 'var(--v4-well)',
              letterSpacing: '0.05em',
              maxWidth: 96,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {role}
          </span>
        )}

        {/* GPU temp chip — blue-tinted, only when present. Desktop-only: with the 4th
            (GPU) metric cluster it crowds hostnames off a 390px row; temp lives beside
            CPU in the detail modal on mobile. Hot temps still surface via color. */}
        {online && (gpu?.temp != null || temp != null) && (() => {
          const t = gpu?.temp ?? temp!;
          const hot = t > 85;
          return (
            <span
              className={cn('font-mono tabular-nums text-[0.6rem] shrink-0 px-1 py-0.5 rounded', !hot && 'hidden sm:inline-block')}
              style={{
                color: hot ? 'var(--v4-fault)' : CMD_BLUE,
                background: hot
                  ? 'color-mix(in srgb, var(--v4-fault) 12%, transparent)'
                  : 'rgba(88,166,255,0.12)',
                letterSpacing: '0.01em',
              }}
            >
              {t}°
            </span>
          );
        })()}

        {/* GPU util is now shown in the right-side metric cluster — no redundant chip needed */}
      </div>

      {/* ── Right: metric clusters CPU · RAM · [GPU] · DSK, hairline seams between ── */}
      <div className="relative flex items-center gap-3 shrink-0 z-10">
        {online && hasAgent ? (
          <>
            <MetricCluster
              label="CPU"
              value={cpu != null ? `${cpu.toFixed(0)}%` : '—'}
              pct={cpu}
            />
            <ClusterSeam />
            <MetricCluster
              label="RAM"
              value={mem != null ? `${mem.percent.toFixed(0)}%` : '—'}
              pct={mem?.percent ?? null}
            />
            {/* GPU cluster — only for machines that report utilization */}
            {gpu?.utilization != null && (
              <>
                <ClusterSeam />
                <MetricCluster
                  label="GPU"
                  value={`${gpu.utilization.toFixed(0)}%`}
                  pct={gpu.utilization}
                />
              </>
            )}
            <ClusterSeam />
            <MetricCluster
              label="DSK"
              value={disk != null ? `${disk.percent.toFixed(0)}%` : '—'}
              pct={disk?.percent ?? null}
            />
          </>
        ) : online && !hasAgent ? (
          /* Online but no agent reporting */
          <span
            className="font-mono text-[0.625rem] uppercase tracking-wider"
            style={{ color: 'var(--v4-standby)' }}
          >
            no agent
          </span>
        ) : (
          /* Offline */
          <span
            className="font-mono text-[0.625rem] uppercase tracking-wider"
            style={{ color: 'var(--v4-fault)' }}
          >
            unreachable
          </span>
        )}
      </div>
    </button>
  );
}

// ── Vertical hairline seam between metric clusters ──────────────────────────

function ClusterSeam() {
  return (
    <div
      className="shrink-0"
      style={{
        width:      1,
        height:     22,
        background: 'var(--v4-hairline)',
        opacity:    0.7,
      }}
      aria-hidden
    />
  );
}

// ── Dark hairline seam between rows ─────────────────────────────────────────

function RowSeam() {
  return (
    <div
      style={{
        height:     1,
        background: 'var(--v4-hairline)',
        marginLeft: 14,  // indent past the stripe so seam reads as interior
        opacity:    0.6,
      }}
      aria-hidden
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  machines: Machine[];
  onClickMachine?: (machine: Machine) => void;
  /** ids/names of machines to group at the bottom under a "personal rigs" divider (Jordan: JoPc + JoMac) */
  secondaryIds?: string[];
}

// ── Main panel component ─────────────────────────────────────────────────────

/**
 * HostTileDPanel — receives all machines from HomePage.
 *
 * Trace buffering: subscribes to SSE lab data via useSnapshot('lab') and
 * pushes CPU samples into traceStore (module-level Map) on every tick.
 * Each HostRowD reads its slice from traceStore by machine.id and passes
 * a snapshot of the pts array to <RowTrace> which paints a canvas sparkline.
 * The canvas repaints on pts change via useEffect, and on container resize
 * via ResizeObserver. This matches the LoadChartsPanel approach exactly —
 * useRef ring buffer + forced re-render trigger — but scoped per host rather
 * than per-panel.
 */
export function HostTileDPanel({ machines, onClickMachine, secondaryIds }: Props) {
  const isSecondary = (m: Machine) =>
    (secondaryIds ?? []).some(s => {
      const t = s.toLowerCase();
      return m.id.toLowerCase() === t || m.name.toLowerCase() === t;
    });
  const primary   = machines.filter(m => !isSecondary(m));
  const secondary = machines.filter(isSecondary);
  // Connect to SSE stream for trace accumulation
  const { data } = useSnapshot('lab');
  // Force re-render when traces update (same pattern as LoadChartsPanel)
  const [, forceRepaint] = useState(0);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    const lab = data as LabSection | null;
    if (!lab?.machines) return;
    const now = Date.now();
    // Deduplicate: only push if >5s since last tick (matches LoadChartsPanel)
    if (now - lastTickRef.current < 5000) return;
    lastTickRef.current = now;
    let pushed = false;
    for (const m of lab.machines) {
      if (m.online && m.cpu != null) {
        pushTrace(m.id, m.cpu);
        pushed = true;
      }
    }
    if (pushed) forceRepaint(n => n + 1);
  }, [data]);

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
    <>
      {/* Inline keyframe for the status dot pulse — isolated, no global pollution */}
      <style>{`
        @keyframes v4DotPulse {
          0%,100% { opacity: 1;    transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.88); }
        }
        .v4-dot-pulse {
          animation: v4DotPulse 4s ease-in-out infinite;
        }
      `}</style>

      <div
        className="rounded-[0.75rem] overflow-hidden flex flex-col"
        style={{
          background: 'var(--v4-console)',
          boxShadow:  '0 1px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Fleet summary header */}
        <FleetHeader machines={machines} />

        {/* Lab host rows */}
        {primary.map((m, idx) => (
          <div key={m.id}>
            <HostRowD
              machine={m}
              onClick={onClickMachine ? () => onClickMachine(m) : undefined}
            />
            {(idx < primary.length - 1 || secondary.length > 0) && <RowSeam />}
          </div>
        ))}

        {/* Personal rigs — grouped at the bottom under a dimmed divider */}
        {secondary.length > 0 && (
          <div
            className="flex items-center gap-2 px-3 pt-2.5 pb-1"
            style={{ background: 'var(--v4-void)' }}
          >
            <span
              className="font-mono uppercase leading-none shrink-0"
              style={{ fontSize: '0.5625rem', color: 'var(--v4-trace)', letterSpacing: '0.08em' }}
            >
              personal rigs
            </span>
            <div className="flex-1" style={{ height: 1, background: 'var(--v4-hairline)', opacity: 0.6 }} aria-hidden />
          </div>
        )}
        {secondary.map((m, idx) => (
          <div key={m.id} style={{ background: 'var(--v4-void)' }}>
            <HostRowD
              machine={m}
              onClick={onClickMachine ? () => onClickMachine(m) : undefined}
            />
            {idx < secondary.length - 1 && <RowSeam />}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function HostTileDSkeleton() {
  return (
    <div
      className="rounded-[0.75rem] overflow-hidden flex flex-col"
      style={{ background: 'var(--v4-console)', boxShadow: '0 1px 0 rgba(0,0,0,0.4)' }}
    >
      {/* Header skeleton */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--v4-hairline)', minHeight: 36 }}
      >
        <div className="rounded-full v4-skeleton" style={{ width: 6, height: 6 }} />
        <div className="rounded v4-skeleton flex-1" style={{ height: 10, maxWidth: 220 }} />
      </div>

      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <div
            className="flex items-center gap-2 px-3"
            style={{ minHeight: 54, boxShadow: 'inset 3px 0 0 var(--v4-standby)' }}
          >
            <div className="rounded-full v4-skeleton" style={{ width: 7, height: 7 }} />
            <div className="flex-1 rounded v4-skeleton" style={{ height: 12 }} />
            <div className="flex gap-3">
              {[38, 38, 38].map((w, j) => (
                <div key={j} className="flex flex-col items-end gap-1" style={{ minWidth: w }}>
                  <div className="rounded v4-skeleton" style={{ height: 14, width: w - 4 }} />
                  <div className="rounded v4-skeleton" style={{ height: 8, width: w - 10 }} />
                </div>
              ))}
            </div>
          </div>
          {i < 4 && (
            <div
              style={{ height: 1, background: 'var(--v4-hairline)', marginLeft: 14, opacity: 0.6 }}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
