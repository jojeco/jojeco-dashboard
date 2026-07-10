/**
 * v4 Media page — slice 2.
 *
 * Sections (mobile-first, single column; desktop 8/4 grid):
 *  1. At-a-glance status bar — Plex up/down, qBit active/total, Sonarr queue, Tdarr state
 *  2. Downloads — full torrent list (name, progress, speed, state; stalled/errored first)
 *     Click → TorrentDetailModal
 *  3. Arr queue + upcoming — Sonarr/Radarr queue items + calendar
 *     Click item → ArrDetailModal
 *  4. Tdarr strip — score, queue, errors, active workers
 *
 * Data sources:
 *  SSE:  useSnapshot('torrents') → qBit transfer info
 *        useSnapshot('media')    → { sonarr[], radarr[] } queue records
 *        useSnapshot('labHostServices') → Plex online state
 *  REST: /api/torrents/list     → full torrent list (not in snapshot)
 *        /api/tdarr/status      → Tdarr stats + workers
 *        /api/media/upcoming    → upcoming episodes + movies
 *        /api/media/stats       → Sonarr/Radarr missing counts
 *
 * NOTE — Plex now-playing / recently-added: no Tautulli/Plex API
 * endpoint exists in the server; those sections are omitted rather
 * than fabricated. Plex status is derived from labHostServices online flag.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Tv, Film, Cpu, Zap, Clock, AlertCircle,
  Calendar, ChevronRight,
} from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import {
  Panel, PanelTitle, Mono, StatusChip, StatusDot, Skeleton, Hairline,
} from '../components/Primitives';
import { DetailModal } from '../components/DetailModal';
import { fmtBytes, cn } from '../lib/utils';
import { getToken } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Torrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  dlspeed: number;
  upspeed: number;
  size: number;
  eta: number;
  num_seeds: number;
  num_leechs: number;
}

interface ArrQueueItem {
  id: number;
  title: string;
  status: string;
  sizeleft: number;
  size: number;
  timeleft?: string;
  series?: { title: string };
  episode?: { seasonNumber: number; episodeNumber: number; title: string };
  movie?: { title: string; year: number };
  trackedDownloadStatus?: string;
}

interface UpcomingEpisode {
  type: 'episode';
  id: number;
  title: string;
  episode: string;
  episodeTitle: string;
  airDate: string;
  hasFile: boolean;
  network: string;
}

interface UpcomingMovie {
  type: 'movie';
  id: number;
  title: string;
  year: number;
  digitalRelease?: string;
  physicalRelease?: string;
  inCinemas?: string;
  studio?: string;
}

type UpcomingItem = UpcomingEpisode | UpcomingMovie;

interface TdarrWorker {
  node: string;
  type: string;
  status: string;
  file: string;
  percentage: number;
  fps: number;
}

interface TdarrStatus {
  total: number;
  transcoded: number;
  transcodeQueue: number;
  noAction: number;
  transcodeErrors: number;
  healthErrors: number;
  tdarrScore: number;
  sizeDiffGB: number;
  workers: TdarrWorker[];
}

interface ArrStats {
  sonarr: { missing: number | null; queued: number | null };
  radarr: { missing: number | null; queued: number | null };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function fmtEta(s: number): string {
  if (s < 0 || s > 604800) return '∞';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtSize(b: number): string {
  if (!b) return '—';
  return fmtBytes(b);
}

const STATE_LABELS: Record<string, string> = {
  downloading: 'Downloading', uploading: 'Seeding', pausedDL: 'Paused',
  pausedUP: 'Done (paused)', stalledDL: 'Stalled', stalledUP: 'Seeding idle',
  queuedDL: 'Queued', checkingDL: 'Checking', error: 'Error',
  missingFiles: 'Missing files', allocating: 'Allocating', metaDL: 'Fetching metadata',
  forcedUP: 'Force seeding',
};

type TorrentBucket = 'active' | 'done' | 'error';

function classifyTorrent(t: Torrent): TorrentBucket {
  if (['error', 'missingFiles'].includes(t.state)) return 'error';
  if (['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state) || t.progress >= 1) return 'done';
  return 'active';
}

function torrentStateLevel(state: string): 'nominal' | 'degraded' | 'fault' | 'standby' {
  if (['downloading', 'metaDL', 'allocating'].includes(state)) return 'nominal';
  if (['uploading', 'stalledUP', 'queuedUP', 'forcedUP'].includes(state)) return 'standby';
  if (state.startsWith('paused') || state === 'stalledDL') return 'degraded';
  if (['error', 'missingFiles'].includes(state)) return 'fault';
  return 'standby';
}

function relativeDate(dateStr?: string): { label: string; note: string; color: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const abs = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diff === 0) return { label: abs, note: 'Today', color: 'var(--v4-nominal)' };
  if (diff === 1) return { label: abs, note: 'Tomorrow', color: 'var(--v4-amber)' };
  if (diff < 0) return { label: abs, note: `${Math.abs(diff)}d ago`, color: 'var(--v4-trace)' };
  if (diff < 7) return { label: abs, note: `in ${diff}d`, color: 'var(--v4-degraded)' };
  return { label: abs, note: `in ${diff}d`, color: 'var(--v4-trace)' };
}

function workerTypeLabel(type: string): { label: string; color: string } {
  if (type === 'transcodegpu') return { label: 'GPU Transcode', color: '#a78bfa' };
  if (type === 'transcodecpu') return { label: 'CPU Transcode', color: 'var(--v4-degraded)' };
  if (type === 'healthcheckgpu') return { label: 'GPU Health', color: 'var(--v4-amber)' };
  return { label: 'CPU Health', color: 'var(--v4-trace)' };
}

// ─── At-a-glance status bar ───────────────────────────────────────────────────

interface StatusBarProps {
  plexOnline: boolean | null;
  torrents: { active: number; total: number; dlSpeed: number } | null;
  arrQueue: number | null;
  tdarr: TdarrStatus | null;
}

function MediaStatusBar({ plexOnline, torrents, arrQueue, tdarr }: StatusBarProps) {
  const items: Array<{ label: string; value: string; level: 'nominal' | 'degraded' | 'fault' | 'standby' }> = [];

  // Plex
  if (plexOnline != null) {
    items.push({
      label: 'Plex',
      value: plexOnline ? 'UP' : 'DOWN',
      level: plexOnline ? 'nominal' : 'fault',
    });
  }

  // qBit active/total
  if (torrents != null) {
    items.push({
      label: 'Downloads',
      value: `${torrents.active}/${torrents.total} active`,
      level: torrents.active > 0 ? 'nominal' : 'standby',
    });
    if (torrents.dlSpeed > 0) {
      items.push({
        label: 'Speed',
        value: `${fmtBytes(torrents.dlSpeed)}/s`,
        level: 'standby',
      });
    }
  }

  // Sonarr/Radarr queue
  if (arrQueue != null) {
    items.push({
      label: 'Arr queue',
      value: `${arrQueue}`,
      level: arrQueue > 0 ? 'nominal' : 'standby',
    });
  }

  // Tdarr
  if (tdarr) {
    const activeWorkers = tdarr.workers.filter(
      w => w.status === 'Execute' || w.status === 'Processing' || w.status === 'Scanning'
    ).length;
    items.push({
      label: 'Tdarr',
      value: activeWorkers > 0 ? `${activeWorkers} working` : tdarr.transcodeQueue > 0 ? `${tdarr.transcodeQueue} queued` : 'idle',
      level: activeWorkers > 0 ? 'nominal' : tdarr.transcodeErrors > 0 ? 'degraded' : 'standby',
    });
  }

  if (items.length === 0) return null;

  return (
    <Panel className="px-4 py-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span className="text-[0.6875rem] uppercase tracking-wide" style={{ color: 'var(--v4-trace)' }}>
              {item.label}
            </span>
            <StatusDot level={item.level} label={item.value} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Torrent detail modal ─────────────────────────────────────────────────────

function TorrentDetailModal({ torrent, onClose }: { torrent: Torrent | null; onClose: () => void }) {
  if (!torrent) return null;
  const pct = (torrent.progress * 100).toFixed(1);
  const stateLevel = torrentStateLevel(torrent.state);
  const stateLabel = STATE_LABELS[torrent.state] || torrent.state;

  return (
    <DetailModal
      open={torrent !== null}
      onClose={onClose}
      title={torrent.name}
      statusLevel={stateLevel}
      statusLabel={stateLabel}
    >
      <div className="flex flex-col gap-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Progress</span>
            <Mono className="text-[0.75rem]">{pct}%</Mono>
          </div>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'var(--v4-well)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: stateLevel === 'fault' ? 'var(--v4-fault)' : stateLevel === 'degraded' ? 'var(--v4-degraded)' : 'var(--v4-amber)',
              }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Size', value: fmtSize(torrent.size) },
            { label: 'ETA', value: torrent.state === 'downloading' ? fmtEta(torrent.eta) : '—' },
            { label: 'DL speed', value: torrent.dlspeed > 0 ? `${fmtBytes(torrent.dlspeed)}/s` : '—' },
            { label: 'UL speed', value: torrent.upspeed > 0 ? `${fmtBytes(torrent.upspeed)}/s` : '—' },
            { label: 'Seeds', value: String(torrent.num_seeds) },
            { label: 'Peers', value: String(torrent.num_leechs) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[0.6875rem] uppercase tracking-wide" style={{ color: 'var(--v4-trace)' }}>{label}</span>
              <Mono className="text-[0.875rem]">{value}</Mono>
            </div>
          ))}
        </div>

        <Hairline />
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.6875rem] uppercase tracking-wide" style={{ color: 'var(--v4-trace)' }}>Hash</span>
          <Mono className="text-[0.6875rem] break-all" trace>{torrent.hash}</Mono>
        </div>
      </div>
    </DetailModal>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'var(--v4-well)' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color, transition: 'width 600ms ease-out' }}
      />
    </div>
  );
}

// ─── Downloads panel ──────────────────────────────────────────────────────────

interface DownloadsPanelProps {
  torrents: Torrent[];
  loading: boolean;
  error: string | null;
  transferInfo: { dl_info_speed?: number; up_info_speed?: number; connection_status?: string } | null;
}

function DownloadsPanel({ torrents, loading, error, transferInfo }: DownloadsPanelProps) {
  const [selected, setSelected] = useState<Torrent | null>(null);
  const [tab, setTab] = useState<TorrentBucket>('active');

  const active = torrents.filter(t => classifyTorrent(t) === 'active');
  const done = torrents.filter(t => classifyTorrent(t) === 'done');
  const errored = torrents.filter(t => classifyTorrent(t) === 'error');

  const tabItems = tab === 'active' ? active : tab === 'done' ? done : errored;

  // Sort: errored first within active, stalled before paused before downloading
  const sorted = [...tabItems].sort((a, b) => {
    const pri = (t: Torrent) => {
      if (t.state === 'error' || t.state === 'missingFiles') return 0;
      if (t.state === 'stalledDL') return 1;
      if (t.state.startsWith('paused')) return 2;
      return 3;
    };
    return pri(a) - pri(b);
  });

  const conn = transferInfo?.connection_status ?? 'unknown';
  const connLevel = conn === 'connected' ? 'nominal' : conn === 'firewalled' ? 'degraded' : 'standby';

  const TABS: Array<{ key: TorrentBucket; label: string; count: number }> = [
    { key: 'active', label: 'Active', count: active.length },
    { key: 'done', label: 'Done', count: done.length },
    { key: 'error', label: 'Errors', count: errored.length },
  ];

  return (
    <>
      <Panel className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <PanelTitle>Downloads</PanelTitle>
          {!loading && transferInfo && (
            <div className="flex items-center gap-2">
              {(transferInfo.dl_info_speed ?? 0) > 0 && (
                <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-amber)' }}>
                  ↓ {fmtBytes(transferInfo.dl_info_speed ?? 0)}/s
                </Mono>
              )}
              {(transferInfo.up_info_speed ?? 0) > 0 && (
                <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-nominal)' }}>
                  ↑ {fmtBytes(transferInfo.up_info_speed ?? 0)}/s
                </Mono>
              )}
              <StatusChip level={connLevel as never} label={conn} />
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-0 mb-3"
          style={{ borderBottom: '1px solid var(--v4-hairline)' }}
        >
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 text-[0.75rem] font-medium transition-colors"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--v4-amber)' : 'transparent'}`,
                marginBottom: -1,
                cursor: 'pointer',
                color: tab === t.key ? 'var(--v4-amber)' : 'var(--v4-trace)',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className="font-mono text-[0.6875rem] px-1.5 py-0.5 rounded"
                  style={{
                    background: tab === t.key
                      ? 'color-mix(in srgb, var(--v4-amber) 15%, transparent)'
                      : 'var(--v4-well)',
                    color: tab === t.key ? 'var(--v4-amber)' : 'var(--v4-readout)',
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <div className="py-4 text-[0.875rem]" style={{ color: 'var(--v4-fault)' }}>
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-4 text-center text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
            {tab === 'active' ? 'No active downloads' : tab === 'done' ? 'No completed torrents' : 'No errors'}
          </div>
        ) : (
          <div className="flex flex-col v4-stagger">
            {sorted.map(t => {
              const pct = t.progress * 100;
              const stateLevel = torrentStateLevel(t.state);
              const barColor = stateLevel === 'fault' ? 'var(--v4-fault)' : stateLevel === 'degraded' ? 'var(--v4-degraded)' : tab === 'done' ? 'var(--v4-nominal)' : 'var(--v4-amber)';
              const stateLabel = STATE_LABELS[t.state] || t.state;

              return (
                <button
                  key={t.hash}
                  onClick={() => setSelected(t)}
                  className="flex flex-col gap-2 px-3 py-3 text-left w-full v4-tile"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: `inset 2px 0 0 ${stateLevel === 'fault' ? 'var(--v4-fault)' : stateLevel === 'degraded' ? 'var(--v4-degraded)' : 'var(--v4-hairline)'}`,
                    borderBottom: '1px solid var(--v4-hairline)',
                    borderRadius: 0,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-[0.8125rem] font-medium truncate"
                        style={{ color: 'var(--v4-signal)' }}
                      >
                        {t.name}
                      </span>
                      <span className="text-[0.6875rem] mt-0.5" style={{ color: `var(--v4-${stateLevel})` }}>
                        {stateLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Mono className="text-[0.6875rem]" dim>{fmtSize(t.size)}</Mono>
                      <ChevronRight size={12} style={{ color: 'var(--v4-trace)' }} />
                    </div>
                  </div>

                  <ProgressBar pct={pct} color={barColor} />

                  <div className="flex items-center justify-between">
                    <Mono className="text-[0.6875rem]" trace>{pct.toFixed(1)}%</Mono>
                    <div className="flex items-center gap-3">
                      {t.dlspeed > 0 && (
                        <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-amber)' }}>
                          ↓ {fmtBytes(t.dlspeed)}/s
                        </Mono>
                      )}
                      {t.upspeed > 0 && (
                        <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-nominal)' }}>
                          ↑ {fmtBytes(t.upspeed)}/s
                        </Mono>
                      )}
                      {t.state === 'downloading' && t.eta > 0 && t.eta < 604800 && (
                        <Mono className="text-[0.6875rem]" trace>{fmtEta(t.eta)}</Mono>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <TorrentDetailModal torrent={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// ─── Arr queue item detail modal ──────────────────────────────────────────────

function ArrDetailModal({
  item,
  kind,
  onClose,
}: {
  item: ArrQueueItem | null;
  kind: 'sonarr' | 'radarr';
  onClose: () => void;
}) {
  if (!item) return null;

  const isShow = kind === 'sonarr';
  const title = isShow
    ? `${item.series?.title || 'Unknown'} — S${String(item.episode?.seasonNumber || 0).padStart(2, '0')}E${String(item.episode?.episodeNumber || 0).padStart(2, '0')}`
    : `${item.movie?.title || item.title}${item.movie?.year ? ` (${item.movie.year})` : ''}`;

  const pct = item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
  const statusLevel = item.status.toLowerCase() === 'failed'
    ? 'fault'
    : item.trackedDownloadStatus && item.trackedDownloadStatus !== 'Ok'
    ? 'degraded'
    : item.status.toLowerCase() === 'completed'
    ? 'nominal'
    : 'standby';

  return (
    <DetailModal
      open={item !== null}
      onClose={onClose}
      title={title}
      statusLevel={statusLevel}
      statusLabel={item.status}
    >
      <div className="flex flex-col gap-4">
        {isShow && item.episode?.title && (
          <div className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
            {item.episode.title}
          </div>
        )}

        {item.size > 0 && (
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Progress</span>
              <Mono className="text-[0.75rem]">{pct}%</Mono>
            </div>
            <ProgressBar pct={pct} color="var(--v4-amber)" />
            <div className="flex justify-between mt-1">
              <Mono className="text-[0.6875rem]" trace>{fmtSize(item.size - item.sizeleft)} of {fmtSize(item.size)}</Mono>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Status', value: item.status },
            { label: 'Time left', value: item.timeleft && item.timeleft !== '00:00:00' ? item.timeleft : '—' },
            { label: 'Tracked state', value: item.trackedDownloadStatus || '—' },
            { label: 'App', value: isShow ? 'Sonarr' : 'Radarr' },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[0.6875rem] uppercase tracking-wide" style={{ color: 'var(--v4-trace)' }}>{label}</span>
              <Mono className="text-[0.8125rem]">{value}</Mono>
            </div>
          ))}
        </div>
      </div>
    </DetailModal>
  );
}

// ─── Arr queue panel ──────────────────────────────────────────────────────────

interface ArrPanelProps {
  sonarr: ArrQueueItem[];
  radarr: ArrQueueItem[];
  arrStats: ArrStats | null;
  upcoming: { episodes: UpcomingEpisode[]; movies: UpcomingMovie[] };
  loading: boolean;
}

function ArrPanel({ sonarr, radarr, arrStats, upcoming, loading }: ArrPanelProps) {
  const [selected, setSelected] = useState<{ item: ArrQueueItem; kind: 'sonarr' | 'radarr' } | null>(null);
  const [upcomingTab, setUpcomingTab] = useState<'all' | 'episodes' | 'movies'>('all');

  const sonarrItems = sonarr.map(i => ({ ...i, _kind: 'sonarr' as const }));
  const radarrItems = radarr.map(i => ({ ...i, _kind: 'radarr' as const }));
  const queueAll = [...sonarrItems, ...radarrItems].sort((a, b) => {
    // Progress descending
    const pa = a.size > 0 ? (a.size - a.sizeleft) / a.size : 0;
    const pb = b.size > 0 ? (b.size - b.sizeleft) / b.size : 0;
    return pb - pa;
  });

  const sortedEpisodes = [...upcoming.episodes].sort(
    (a, b) => new Date(a.airDate).getTime() - new Date(b.airDate).getTime()
  );
  const sortedMovies = [...upcoming.movies].sort((a, b) => {
    const da = a.digitalRelease || a.physicalRelease || a.inCinemas || '';
    const db = b.digitalRelease || b.physicalRelease || b.inCinemas || '';
    return new Date(da).getTime() - new Date(db).getTime();
  });
  const upcomingItems: UpcomingItem[] =
    upcomingTab === 'episodes' ? sortedEpisodes
    : upcomingTab === 'movies' ? sortedMovies
    : [...sortedEpisodes, ...sortedMovies].sort((a, b) => {
        const da = a.type === 'episode' ? a.airDate : ((a as UpcomingMovie).digitalRelease || (a as UpcomingMovie).physicalRelease || (a as UpcomingMovie).inCinemas || '');
        const db = b.type === 'episode' ? b.airDate : ((b as UpcomingMovie).digitalRelease || (b as UpcomingMovie).physicalRelease || (b as UpcomingMovie).inCinemas || '');
        return new Date(da).getTime() - new Date(db).getTime();
      });

  return (
    <>
      <Panel className="p-4">
        <div className="flex items-center justify-between mb-3">
          <PanelTitle>Arr Queue</PanelTitle>
          {/* Missing counts */}
          {arrStats && (
            <div className="flex items-center gap-3">
              {arrStats.sonarr.missing != null && (
                <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>
                  TV missing: <Mono className="text-[0.6875rem]">{arrStats.sonarr.missing}</Mono>
                </span>
              )}
              {arrStats.radarr.missing != null && (
                <span className="text-[0.6875rem]" style={{ color: 'var(--v4-readout)' }}>
                  Film missing: <Mono className="text-[0.6875rem]">{arrStats.radarr.missing}</Mono>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Queue */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : queueAll.length === 0 ? (
          <div className="py-3 text-center text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
            Queue empty — Sonarr and Radarr are idle
          </div>
        ) : (
          <div className="flex flex-col v4-stagger">
            {queueAll.map(item => {
              const isShow = item._kind === 'sonarr';
              const title = isShow
                ? `${item.series?.title || 'Unknown'} — S${String(item.episode?.seasonNumber || 0).padStart(2, '0')}E${String(item.episode?.episodeNumber || 0).padStart(2, '0')}`
                : `${item.movie?.title || item.title}${item.movie?.year ? ` (${item.movie.year})` : ''}`;

              const pct = item.size > 0 ? (item.size - item.sizeleft) / item.size * 100 : 0;
              const hasWarning = item.trackedDownloadStatus && item.trackedDownloadStatus !== 'Ok';

              return (
                <button
                  key={`${item._kind}-${item.id}`}
                  onClick={() => setSelected({ item, kind: item._kind })}
                  className="flex flex-col gap-2 px-3 py-3 text-left w-full v4-tile"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--v4-hairline)',
                    borderRadius: 0,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isShow
                      ? <Tv size={12} style={{ color: 'var(--v4-amber)', flexShrink: 0 }} />
                      : <Film size={12} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                    <span className="text-[0.8125rem] font-medium truncate flex-1" style={{ color: 'var(--v4-signal)' }}>
                      {title}
                    </span>
                    <span
                      className="text-[0.6875rem] font-mono shrink-0"
                      style={{
                        color: item.status.toLowerCase() === 'failed' ? 'var(--v4-fault)'
                          : item.status.toLowerCase() === 'completed' ? 'var(--v4-nominal)'
                          : 'var(--v4-readout)',
                      }}
                    >
                      {item.status}
                    </span>
                  </div>

                  {item.size > 0 && <ProgressBar pct={pct} color="var(--v4-amber)" />}

                  <div className="flex items-center gap-3">
                    {item.size > 0 && (
                      <Mono className="text-[0.6875rem]" trace>{pct.toFixed(0)}%</Mono>
                    )}
                    {item.timeleft && item.timeleft !== '00:00:00' && (
                      <span className="flex items-center gap-1 text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
                        <Clock size={10} />{item.timeleft}
                      </span>
                    )}
                    {hasWarning && (
                      <span className="flex items-center gap-1 text-[0.6875rem]" style={{ color: 'var(--v4-degraded)' }}>
                        <AlertCircle size={10} />{item.trackedDownloadStatus}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Upcoming section */}
        {upcomingItems.length > 0 && (
          <>
            <Hairline className="my-4" />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={13} style={{ color: 'var(--v4-trace)' }} />
                <span className="text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>
                  Upcoming
                </span>
              </div>
              {/* Mini tab bar */}
              <div className="flex gap-1">
                {([
                  { key: 'all', label: `All (${sortedEpisodes.length + sortedMovies.length})` },
                  { key: 'episodes', label: `TV (${sortedEpisodes.length})` },
                  { key: 'movies', label: `Film (${sortedMovies.length})` },
                ] as Array<{ key: typeof upcomingTab; label: string }>).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setUpcomingTab(t.key)}
                    className="text-[0.6875rem] px-2 py-0.5 rounded"
                    style={{
                      background: upcomingTab === t.key
                        ? 'color-mix(in srgb, var(--v4-amber) 12%, transparent)'
                        : 'var(--v4-well)',
                      color: upcomingTab === t.key ? 'var(--v4-amber)' : 'var(--v4-trace)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1 v4-stagger">
              {upcomingItems.slice(0, 10).map(item => {
                const isEp = item.type === 'episode';
                const dateStr = isEp
                  ? (item as UpcomingEpisode).airDate
                  : ((item as UpcomingMovie).digitalRelease || (item as UpcomingMovie).physicalRelease || (item as UpcomingMovie).inCinemas);
                const date = relativeDate(dateStr);

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-[0.5rem]"
                    style={{ background: 'var(--v4-well)' }}
                  >
                    {isEp
                      ? <Tv size={12} style={{ color: 'var(--v4-amber)', flexShrink: 0 }} />
                      : <Film size={12} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.8125rem] truncate" style={{ color: 'var(--v4-signal)' }}>
                        {item.title}
                      </div>
                      {isEp && (item as UpcomingEpisode).episode && (
                        <div className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-trace)' }}>
                          {(item as UpcomingEpisode).episode}
                          {(item as UpcomingEpisode).episodeTitle
                            ? ` — ${(item as UpcomingEpisode).episodeTitle}`
                            : ''}
                        </div>
                      )}
                    </div>
                    {date && (
                      <div className="shrink-0 text-right">
                        <Mono className="text-[0.6875rem] block" style={{ color: 'var(--v4-readout)' }}>
                          {date.label}
                        </Mono>
                        <span className="text-[0.6875rem] block" style={{ color: date.color }}>
                          {date.note}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {upcomingItems.length > 10 && (
                <div className="text-center text-[0.6875rem] py-1" style={{ color: 'var(--v4-trace)' }}>
                  +{upcomingItems.length - 10} more
                </div>
              )}
            </div>
          </>
        )}
      </Panel>

      {selected && (
        <ArrDetailModal
          item={selected.item}
          kind={selected.kind}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

// ─── Tdarr strip ──────────────────────────────────────────────────────────────

function TdarrStrip({ tdarr }: { tdarr: TdarrStatus | null }) {
  if (!tdarr) {
    return (
      <Panel className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={13} style={{ color: 'var(--v4-trace)' }} />
            <PanelTitle>Tdarr Transcoder</PanelTitle>
          </div>
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>Unavailable</span>
        </div>
      </Panel>
    );
  }

  const score = tdarr.tdarrScore ?? 0;
  const activeWorkers = tdarr.workers.filter(
    w => w.status === 'Execute' || w.status === 'Processing' || w.status === 'Scanning'
  );
  const scoreLevel = score >= 90 ? 'nominal' : score >= 70 ? 'degraded' : 'fault';

  return (
    <Panel className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={13} style={{ color: 'var(--v4-trace)' }} />
          <PanelTitle>Tdarr Transcoder</PanelTitle>
        </div>
        {activeWorkers.length > 0 && (
          <StatusChip level="nominal" label={`${activeWorkers.length} working`} />
        )}
      </div>

      {/* Score + stat row */}
      <div className={cn('grid gap-3 mb-3', activeWorkers.length > 0 ? 'grid-cols-4' : 'grid-cols-4')}>
        {[
          {
            label: 'Score',
            value: `${score.toFixed(1)}%`,
            color: `var(--v4-${scoreLevel})`,
          },
          {
            label: 'Queue',
            value: tdarr.transcodeQueue > 0 ? String(tdarr.transcodeQueue) : '—',
            color: tdarr.transcodeQueue > 0 ? 'var(--v4-amber)' : 'var(--v4-trace)',
          },
          {
            label: 'Errors',
            value: tdarr.transcodeErrors > 0 ? String(tdarr.transcodeErrors) : '—',
            color: tdarr.transcodeErrors > 0 ? 'var(--v4-fault)' : 'var(--v4-trace)',
          },
          {
            label: 'Saved',
            value: tdarr.sizeDiffGB > 0 ? `${tdarr.sizeDiffGB.toFixed(0)} GB` : '—',
            color: tdarr.sizeDiffGB > 0 ? 'var(--v4-nominal)' : 'var(--v4-trace)',
          },
        ].map(s => (
          <div key={s.label} className="flex flex-col gap-0.5 text-center">
            <Mono className="text-[1rem] font-semibold" style={{ color: s.color }}>{s.value}</Mono>
            <span className="text-[0.625rem] uppercase tracking-wide" style={{ color: 'var(--v4-trace)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* HEVC progress bar */}
      <div className="mb-3">
        <ProgressBar pct={score} color={`var(--v4-${scoreLevel})`} />
        <div className="flex justify-between mt-1">
          <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
            HEVC coverage
          </span>
          <Mono className="text-[0.6875rem]" trace>
            {tdarr.noAction.toLocaleString()} / {tdarr.total.toLocaleString()}
          </Mono>
        </div>
      </div>

      {/* Active workers */}
      {activeWorkers.length > 0 && (
        <>
          <Hairline className="mb-3" />
          <div className="flex flex-col gap-2 v4-stagger">
            {activeWorkers.map((w, i) => {
              const { label, color } = workerTypeLabel(w.type);
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[0.6875rem] font-medium px-1.5 py-0.5 rounded"
                      style={{
                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        color,
                      }}
                    >
                      {label}
                    </span>
                    <span className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-trace)' }}>{w.node}</span>
                    <span className="ml-auto flex items-center gap-1 text-[0.6875rem] shrink-0" style={{ color: 'var(--v4-trace)' }}>
                      <Zap size={9} />{w.fps} fps
                    </span>
                  </div>
                  {w.file && (
                    <span className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-readout)' }}>{w.file}</span>
                  )}
                  <ProgressBar pct={w.percentage} color={color} />
                  <Mono className="text-[0.6875rem] text-right" trace>{w.percentage}%</Mono>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function MediaPage() {
  // ── SSE data ────────────────────────────────────────────────────────────────
  const { data: mediaQueueRaw, loading: mediaLoading } = useSnapshot('media');
  const { data: transferRaw } = useSnapshot('torrents');
  const { data: labHostServices } = useSnapshot('labHostServices');

  // ── REST state ────────────────────────────────────────────────────────────
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [torrentsLoading, setTorrentsLoading] = useState(true);
  const [torrentsError, setTorrentsError] = useState<string | null>(null);
  const [tdarr, setTdarr] = useState<TdarrStatus | null>(null);
  const [upcoming, setUpcoming] = useState<{ episodes: UpcomingEpisode[]; movies: UpcomingMovie[] }>({ episodes: [], movies: [] });
  const [arrStats, setArrStats] = useState<ArrStats | null>(null);

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchTorrents = useCallback(async () => {
    try {
      const r = await fetch('/api/torrents/list', { headers: authHeaders() });
      if (r.ok) {
        setTorrents(await r.json());
        setTorrentsError(null);
      } else {
        setTorrentsError('Cannot reach qBittorrent');
      }
    } catch {
      setTorrentsError('Cannot reach API');
    } finally {
      setTorrentsLoading(false);
    }
  }, []);

  const fetchTdarr = useCallback(async () => {
    try {
      const r = await fetch('/api/tdarr/status', { headers: authHeaders() });
      if (r.ok) setTdarr(await r.json());
    } catch { /* silent — shown as unavailable */ }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const r = await fetch('/api/media/upcoming', { headers: authHeaders() });
      if (r.ok) setUpcoming(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchArrStats = useCallback(async () => {
    try {
      const r = await fetch('/api/media/stats', { headers: authHeaders() });
      if (r.ok) setArrStats(await r.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchTorrents();
    fetchTdarr();
    fetchUpcoming();
    fetchArrStats();
  }, [fetchTorrents, fetchTdarr, fetchUpcoming, fetchArrStats]);

  // ── Derive typed data ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawQueue = mediaQueueRaw as { sonarr?: any[]; radarr?: any[] } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sonarr = (rawQueue?.sonarr ?? []) as ArrQueueItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const radarr = (rawQueue?.radarr ?? []) as ArrQueueItem[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transferInfo = transferRaw as { dl_info_speed?: number; up_info_speed?: number; connection_status?: string } | null;

  // Plex online state from labHostServices
  const plexService = labHostServices?.groups
    ?.flatMap(g => g.services)
    ?.find(s => s.id === 's1-plex' || s.label.toLowerCase() === 'plex');
  const plexOnline: boolean | null = plexService ? plexService.online : null;

  // Status bar derived counts
  const activeTorrents = torrents.filter(t => classifyTorrent(t) === 'active');
  const torrentsStatus = torrentsLoading ? null : {
    active: activeTorrents.length,
    total: torrents.length,
    dlSpeed: transferInfo?.dl_info_speed ?? 0,
  };
  const arrQueueCount = mediaLoading ? null : sonarr.length + radarr.length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── At-a-glance bar ─────────────────────────────────────────────── */}
      <MediaStatusBar
        plexOnline={plexOnline}
        torrents={torrentsStatus}
        arrQueue={arrQueueCount}
        tdarr={tdarr}
      />

      {/* ── Mobile layout: single column ───────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        <DownloadsPanel
          torrents={torrents}
          loading={torrentsLoading}
          error={torrentsError}
          transferInfo={transferInfo}
        />
        <ArrPanel
          sonarr={sonarr}
          radarr={radarr}
          arrStats={arrStats}
          upcoming={upcoming}
          loading={mediaLoading}
        />
        <TdarrStrip tdarr={tdarr} />
      </div>

      {/* ── Desktop 8/4 command-center grid ────────────────────────────── */}
      <div
        className="hidden xl:grid gap-6"
        style={{ gridTemplateColumns: '8fr 4fr', alignItems: 'start' }}
      >
        {/* Lead (8): Downloads + Arr queue */}
        <div className="flex flex-col gap-4">
          <DownloadsPanel
            torrents={torrents}
            loading={torrentsLoading}
            error={torrentsError}
            transferInfo={transferInfo}
          />
          <ArrPanel
            sonarr={sonarr}
            radarr={radarr}
            arrStats={arrStats}
            upcoming={upcoming}
            loading={mediaLoading}
          />
        </div>

        {/* Rail (4): Tdarr */}
        <div className="flex flex-col gap-4">
          <TdarrStrip tdarr={tdarr} />
        </div>
      </div>
    </div>
  );
}
