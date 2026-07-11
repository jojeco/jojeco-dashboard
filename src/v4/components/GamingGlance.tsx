/**
 * GamingGlance — compact Home-screen panel for the game servers.
 * One dense row per server (name + status dot + players), reusing the `gaming`
 * SSE section. Whole panel taps through to /v4/gaming. Quiet one-liner when
 * Server 1 is powered down.
 */
import { useNavigate } from 'react-router-dom';
import { Gamepad2, ChevronRight } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono } from './Primitives';
import type { GamingMcServer, GamingVintageStory } from '../../hooks/useSnapshot';

function dotColor(status: string): string {
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

function GlanceRow({ name, status, players }: { name: string; status: string; players?: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 min-w-0">
      <span className="inline-block rounded-full shrink-0" style={{ width: 6, height: 6, background: dotColor(status) }} aria-hidden />
      <span className="flex-1 text-[0.8125rem] truncate" style={{ color: 'var(--v4-signal)' }}>{name}</span>
      {players != null && players > 0 && (
        <Mono className="text-[0.6875rem] shrink-0" style={{ color: 'var(--v4-nominal)' }}>{players}p</Mono>
      )}
      <Mono trace className="text-[0.6875rem] shrink-0">{statusLabel(status)}</Mono>
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

  const go = () => navigate('/v4/gaming');

  return (
    <Panel
      as="section"
      className="p-4 v4-tile cursor-pointer"
      style={{ cursor: 'pointer' }}
      onClick={go}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gamepad2 size={13} style={{ color: 'var(--v4-trace)' }} />
          <PanelTitle>Gaming</PanelTitle>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--v4-trace)' }} />
      </div>

      {!s1Online ? (
        <Mono trace className="text-[0.75rem]">Server 1 offline — gaming servers unavailable</Mono>
      ) : (
        <div className="flex flex-col">
          {mc.map(s => <GlanceRow key={s.id} name={s.name} status={s.status} players={s.players} />)}
          {vs && <GlanceRow name="Vintage Story" status={vs.status} players={vs.players} />}
          {mc.length === 0 && !vs && (
            <Mono trace className="text-[0.75rem]">No game servers reported</Mono>
          )}
        </div>
      )}
    </Panel>
  );
}
