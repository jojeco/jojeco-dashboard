/**
 * GamingGlance — compact Home-screen panel for the game servers, restyled to the
 * instrument aesthetic (DESIGN.md): Console surface, a mono summary header with a
 * live dot, dense rows with left status stripes and mono readouts. Reuses the
 * `gaming` SSE section. Whole panel taps through to /v4/gaming. Quiet one-liner
 * when Server 1 is powered down.
 */
import { useNavigate } from 'react-router-dom';
import { Gamepad2, ChevronRight } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { PanelTitle, Mono } from './Primitives';
import type { GamingMcServer, GamingVintageStory } from '../../hooks/useSnapshot';

function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':  return 'var(--v4-nominal)';
    case 'starting': return 'var(--v4-degraded)';
    default:         return 'var(--v4-standby)'; // sleeping / stopped / unknown
  }
}
function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':  return 'running';
    case 'starting': return 'starting';
    case 'sleeping': return 'sleeping';
    case 'stopped':  return 'stopped';
    default:         return status || 'unknown';
  }
}

/** Instrument-style row: left status stripe, dot, name, players, mono state. */
function GlanceRow({ name, status, players, last }: { name: string; status: string; players?: number; last: boolean }) {
  const color = statusColor(status);
  const running = status?.toLowerCase() === 'running';
  return (
    <div
      className="relative flex items-center gap-2.5 px-3"
      style={{
        minHeight: 40,
        boxShadow: `inset 3px 0 0 ${color}`,
        borderBottom: last ? undefined : '1px solid var(--v4-hairline)',
      }}
    >
      <span
        className={running ? 'v4-dot-pulse inline-block rounded-full shrink-0' : 'inline-block rounded-full shrink-0'}
        style={{ width: 7, height: 7, background: color, animationDuration: '4s' }}
        aria-hidden
      />
      <span className="flex-1 text-[0.8125rem] font-medium truncate" style={{ color: 'var(--v4-signal)' }}>{name}</span>
      {players != null && players > 0 && (
        <Mono className="text-[0.6875rem] shrink-0" style={{ color: 'var(--v4-nominal)' }}>{players}p</Mono>
      )}
      <Mono trace className="text-[0.625rem] uppercase tracking-wider shrink-0">{statusLabel(status)}</Mono>
    </div>
  );
}

export function GamingGlance() {
  const navigate = useNavigate();
  const { data: gaming } = useSnapshot('gaming');

  // Nothing to show until the first snapshot lands.
  if (gaming == null) return null;

  const s1Online = gaming.s1Online;
  const mc: GamingMcServer[] = gaming.minecraft ?? [];
  const vs: GamingVintageStory | null = gaming.vintageStory ?? null;

  const rows: Array<{ key: string; name: string; status: string; players?: number }> = [
    ...mc.map(s => ({ key: s.id, name: s.name, status: s.status, players: s.players })),
    ...(vs ? [{ key: 'vs', name: 'Vintage Story', status: vs.status, players: vs.players }] : []),
  ];
  const runningCount = rows.filter(r => r.status?.toLowerCase() === 'running').length;

  const go = () => navigate('/v4/gaming');

  return (
    <section
      className="rounded-[0.75rem] overflow-hidden flex flex-col v4-tile"
      style={{
        background: 'var(--v4-console)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
        cursor: 'pointer',
        height: '100%',
      }}
      onClick={go}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
    >
      {/* Header — panel title + summary readout with live dot */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--v4-hairline)', minHeight: 36 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Gamepad2 size={13} style={{ color: 'var(--v4-trace)' }} />
          <PanelTitle>Gaming</PanelTitle>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {s1Online && rows.length > 0 && (
            <Mono trace className="text-[0.625rem] uppercase tracking-wide">{runningCount}/{rows.length} up</Mono>
          )}
          <ChevronRight size={14} style={{ color: 'var(--v4-trace)' }} />
        </div>
      </div>

      {!s1Online ? (
        <div className="px-3 py-3">
          <Mono trace className="text-[0.75rem]">Server 1 offline — gaming servers unavailable</Mono>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-3">
          <Mono trace className="text-[0.75rem]">No game servers reported</Mono>
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <GlanceRow key={r.key} name={r.name} status={r.status} players={r.players} last={i === rows.length - 1} />
          ))}
        </div>
      )}
    </section>
  );
}
