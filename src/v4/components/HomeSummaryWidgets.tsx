/**
 * HomeSummaryWidgets — compact, read-only summary cards the owner can ADD to the
 * Home board from other tabs (via the Edit-Layout "+ Add widget" picker).
 *
 * Every card here reads ONLY from the shared SSE snapshot (useSnapshot) — no REST
 * calls, no fabricated data. If a value isn't in the snapshot it renders "—" in
 * Dimmed Trace, per DESIGN.md. Cards that would require REST-only data (Plex
 * now-playing via Tautulli, Tdarr worker stats) are intentionally NOT built here —
 * see HomePage widget registry notes.
 *
 * All cards tap through to their source tab (like GamingGlance does) and follow
 * the instrument aesthetic: Panel surface, PanelTitle, mono readouts, status dots.
 */
import { useNavigate } from 'react-router-dom';
import {
  Clapperboard, ChevronRight, Server, Gamepad2, DownloadCloud,
} from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono } from './Primitives';
import { fmtBytes } from '../lib/utils';
import type {
  LabHostServicesGroup, GamingMcServer, GamingVintageStory,
} from '../../hooks/useSnapshot';

// ── shared clickable-panel shell ─────────────────────────────────────────────

function TapPanel({
  title, icon, to, children,
}: {
  title: string;
  icon: React.ReactNode;
  to: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const go = () => navigate(to);
  return (
    <Panel
      as="section"
      className="p-4 v4-tile h-full"
      style={{ cursor: 'pointer' }}
      onClick={go}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--v4-trace)', display: 'inline-flex' }}>{icon}</span>
          <PanelTitle>{title}</PanelTitle>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--v4-trace)' }} />
      </div>
      {children}
    </Panel>
  );
}

// ── a labelled mono stat cell ────────────────────────────────────────────────

function StatCell({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[0.625rem] uppercase tracking-[0.05em]" style={{ color: 'var(--v4-trace)' }}>
        {label}
      </span>
      <Mono className="text-[0.9375rem] leading-none truncate" style={{ color: tone ?? 'var(--v4-signal)' }}>
        {value}
      </Mono>
    </div>
  );
}

// ─── Media summary — qBit speeds + arr queue counts (all from snapshot) ───────

export function MediaSummaryWidget() {
  const { data: transferRaw } = useSnapshot('torrents');
  const { data: mediaRaw } = useSnapshot('media');

  const t = transferRaw as { dl_info_speed?: number; up_info_speed?: number } | null;
  const q = mediaRaw as { sonarr?: unknown[]; radarr?: unknown[] } | null;

  const dl = t?.dl_info_speed;
  const up = t?.up_info_speed;
  const sonarrN = q?.sonarr?.length;
  const radarrN = q?.radarr?.length;

  return (
    <TapPanel title="Media" icon={<Clapperboard size={13} />} to="/v4/media">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <StatCell
          label="DL"
          value={dl != null ? `${fmtBytes(dl)}/s` : '—'}
          tone={dl ? 'var(--v4-amber)' : 'var(--v4-trace)'}
        />
        <StatCell
          label="UL"
          value={up != null ? `${fmtBytes(up)}/s` : '—'}
          tone="var(--v4-readout)"
        />
        <StatCell
          label="Sonarr Q"
          value={sonarrN != null ? String(sonarrN) : '—'}
          tone={sonarrN ? 'var(--v4-signal)' : 'var(--v4-trace)'}
        />
        <StatCell
          label="Radarr Q"
          value={radarrN != null ? String(radarrN) : '—'}
          tone={radarrN ? 'var(--v4-signal)' : 'var(--v4-trace)'}
        />
      </div>
    </TapPanel>
  );
}

// ─── Services status matrix (mini) — per-host up/down counts as dots ──────────

function groupState(g: LabHostServicesGroup): { up: number; total: number } {
  const total = g.services.length;
  const up = g.services.filter(s => s.online).length;
  return { up, total };
}

export function ServicesMatrixWidget() {
  const { data } = useSnapshot('labHostServices');
  const groups = data?.groups ?? [];

  return (
    <TapPanel title="Service Matrix" icon={<Server size={13} />} to="/v4/services">
      {groups.length === 0 ? (
        <Mono trace className="text-[0.75rem]">Awaiting service health…</Mono>
      ) : (
        <div className="flex flex-col gap-1.5">
          {groups.map(g => {
            const { up, total } = groupState(g);
            const down = total - up;
            const color = down === 0 ? 'var(--v4-nominal)' : up === 0 ? 'var(--v4-fault)' : 'var(--v4-degraded)';
            return (
              <div key={g.host} className="flex items-center gap-2 min-w-0">
                <span className="inline-block rounded-full shrink-0" style={{ width: 6, height: 6, background: color }} aria-hidden />
                <span className="flex-1 text-[0.8125rem] truncate" style={{ color: 'var(--v4-signal)' }}>{g.host}</span>
                <Mono
                  className="text-[0.6875rem] shrink-0"
                  style={{ color: down === 0 ? 'var(--v4-nominal)' : 'var(--v4-degraded)' }}
                >
                  {up}/{total}
                </Mono>
              </div>
            );
          })}
        </div>
      )}
    </TapPanel>
  );
}

// ─── Per-game-server status (mini) — same data as GamingGlance, own widget ────

function gDot(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':  return 'var(--v4-nominal)';
    case 'starting': return 'var(--v4-degraded)';
    default:         return 'var(--v4-standby)';
  }
}

export function GameServersWidget() {
  const navigate = useNavigate();
  const { data: gaming } = useSnapshot('gaming');
  if (gaming == null) {
    return (
      <TapPanel title="Game Servers" icon={<Gamepad2 size={13} />} to="/v4/gaming">
        <Mono trace className="text-[0.75rem]">Awaiting gaming data…</Mono>
      </TapPanel>
    );
  }
  const mc: GamingMcServer[] = gaming.minecraft ?? [];
  const vs: GamingVintageStory | null = gaming.vintageStory ?? null;

  const rows: Array<{ key: string; name: string; status: string; players?: number }> = [
    ...mc.map(s => ({ key: s.id, name: s.name, status: s.status, players: s.players })),
    ...(vs ? [{ key: 'vs', name: 'Vintage Story', status: vs.status, players: vs.players }] : []),
  ];

  return (
    <Panel
      as="section"
      className="p-4 v4-tile h-full"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate('/v4/gaming')}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gamepad2 size={13} style={{ color: 'var(--v4-trace)' }} />
          <PanelTitle>Game Servers</PanelTitle>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--v4-trace)' }} />
      </div>
      {!gaming.s1Online ? (
        <Mono trace className="text-[0.75rem]">Server 1 offline — servers unavailable</Mono>
      ) : rows.length === 0 ? (
        <Mono trace className="text-[0.75rem]">No game servers reported</Mono>
      ) : (
        <div className="flex flex-col">
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-2.5 py-1.5 min-w-0">
              <span className="inline-block rounded-full shrink-0" style={{ width: 6, height: 6, background: gDot(r.status) }} aria-hidden />
              <span className="flex-1 text-[0.8125rem] truncate" style={{ color: 'var(--v4-signal)' }}>{r.name}</span>
              {r.players != null && r.players > 0 && (
                <Mono className="text-[0.6875rem] shrink-0" style={{ color: 'var(--v4-nominal)' }}>{r.players}p</Mono>
              )}
              <Mono trace className="text-[0.6875rem] shrink-0">{r.status?.toLowerCase() || 'unknown'}</Mono>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Downloads mini — compact qBit glance distinct from full TorrentsPanel ────
// (registry uses the existing TorrentsPanel for the default "Downloads" widget;
//  this compact variant is offered as an addable alt with the same data.)

export function DownloadsMiniWidget() {
  const { data } = useSnapshot('torrents');
  const t = data as { dl_info_speed?: number; up_info_speed?: number; connection_status?: string } | null;
  const conn = t?.connection_status ?? 'unknown';
  const connColor = conn === 'connected' ? 'var(--v4-nominal)' : conn === 'firewalled' ? 'var(--v4-degraded)' : 'var(--v4-standby)';

  return (
    <TapPanel title="Downloads" icon={<DownloadCloud size={13} />} to="/v4/media">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatCell
          label="Down"
          value={t?.dl_info_speed != null ? `${fmtBytes(t.dl_info_speed)}/s` : '—'}
          tone={t?.dl_info_speed ? 'var(--v4-amber)' : 'var(--v4-trace)'}
        />
        <StatCell
          label="Up"
          value={t?.up_info_speed != null ? `${fmtBytes(t.up_info_speed)}/s` : '—'}
          tone="var(--v4-readout)"
        />
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="inline-block rounded-full shrink-0" style={{ width: 5, height: 5, background: connColor }} aria-hidden />
        <Mono trace className="text-[0.625rem] uppercase tracking-wide">{conn}</Mono>
      </div>
    </TapPanel>
  );
}
