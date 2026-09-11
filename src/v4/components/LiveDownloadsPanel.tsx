/**
 * LiveDownloadsPanel — real-time combined SABnzbd + qBittorrent download list.
 * Polls both endpoints every 5 seconds. Source-labeled: NZB (usenet) | TRK (torrent).
 */
import { useEffect, useState } from 'react';
import { PanelTitle, Mono } from './Primitives';
import { api } from '../../services/api';

const POLL_MS = 5000;

// ── Types ────────────────────────────────────────────────────────────────────

interface SabSlot {
  nzo_id: string;
  filename: string;
  status: string;
  percentage: number;
  mb: number;
  mbleft: number;
  timeleft: string;
  cat: string;
}

interface SabQueue {
  status: string;
  speed: string;
  kbpersec: number;
  sizeleft: string;
  timeleft: string;
  paused: boolean;
  slots: SabSlot[];
}

interface QbitTorrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  dlspeed: number;
  upspeed: number;
  size: number;
  eta: number;
  num_seeds: number;
  category: string;
}

interface DownloadRow {
  id: string;
  source: 'usenet' | 'torrent';
  name: string;
  status: string;
  progress: number;
  speedLabel: string;
  eta: string;
  sizeLabel: string;
  active: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
  return bytes + ' B';
}

function fmtEta(seconds: number): string {
  if (!seconds || seconds < 0 || seconds > 86400 * 7) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function sabEtaToSecs(timeleft: string): number {
  const parts = timeleft.split(':').map(Number);
  if (parts.length !== 3) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

const ACTIVE_QBIT_STATES = new Set(['downloading', 'metaDL', 'checkingDL', 'forcedDL', 'allocating', 'queuedDL']);
const DONE_QBIT_STATES   = new Set(['uploading', 'stalledUP', 'queuedUP', 'forcedUP', 'checkingUP', 'pausedUP', 'moving', 'seeding']);

function qbitToRow(t: QbitTorrent): DownloadRow {
  const active = ACTIVE_QBIT_STATES.has(t.state);
  const isDone = DONE_QBIT_STATES.has(t.state) || t.progress >= 1;
  const speedLabel = active && t.dlspeed > 0 ? `↓ ${fmtBytes(t.dlspeed)}/s` : '';
  return {
    id: t.hash,
    source: 'torrent',
    name: t.name,
    status: t.state,
    progress: Math.min(t.progress * 100, 100),
    speedLabel,
    eta: active ? fmtEta(t.eta) : '',
    sizeLabel: fmtBytes(t.size),
    active: active && !isDone,
  };
}

function sabToRow(s: SabSlot, kbpersec: number): DownloadRow {
  const isDownloading = s.status === 'Downloading';
  const sizeBytes = s.mb * 1e6;
  return {
    id: s.nzo_id,
    source: 'usenet',
    name: s.filename,
    status: s.status,
    progress: s.percentage,
    speedLabel: isDownloading && kbpersec > 0 ? `↓ ${fmtBytes(kbpersec * 1024)}/s` : '',
    eta: isDownloading ? fmtEta(sabEtaToSecs(s.timeleft)) : '',
    sizeLabel: fmtBytes(sizeBytes),
    active: isDownloading || s.status === 'Queued',
  };
}

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'usenet' | 'torrent' }) {
  const isUsenet = source === 'usenet';
  return (
    <span
      className="shrink-0 text-[0.5rem] font-bold tracking-widest uppercase px-1 py-0.5 rounded-sm"
      style={{
        background: isUsenet ? 'rgba(88,166,255,0.14)' : 'rgba(63,185,80,0.11)',
        color: isUsenet ? 'var(--v4-amber)' : 'var(--v4-nominal)',
        border: `1px solid ${isUsenet ? 'rgba(88,166,255,0.28)' : 'rgba(63,185,80,0.22)'}`,
        letterSpacing: '0.07em',
      }}
    >
      {isUsenet ? 'NZB' : 'TRK'}
    </span>
  );
}

// ── Single download row ───────────────────────────────────────────────────────

function DlRow({ row, last }: { row: DownloadRow; last: boolean }) {
  const prog = Math.round(row.progress);
  const barColor = prog >= 100
    ? 'var(--v4-nominal)'
    : row.source === 'usenet'
      ? 'var(--v4-amber)'
      : 'var(--v4-nominal)';

  return (
    <div
      className="px-3 py-2"
      style={{
        borderBottom: last ? undefined : '1px solid var(--v4-hairline)',
        opacity: row.active ? 1 : 0.55,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <SourceBadge source={row.source} />
        <span
          className="flex-1 text-[0.75rem] font-medium truncate leading-tight"
          style={{ color: 'var(--v4-signal)' }}
          title={row.name}
        >
          {row.name}
        </span>
        {row.speedLabel && (
          <Mono className="shrink-0 text-[0.625rem]" style={{ color: 'var(--v4-amber)' }}>
            {row.speedLabel}
          </Mono>
        )}
      </div>

      <div
        className="w-full rounded-full overflow-hidden mb-1"
        style={{ height: 3, background: 'var(--v4-well)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${prog}%`, background: barColor }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Mono trace className="text-[0.5625rem]">
          {prog}%{row.sizeLabel ? ` · ${row.sizeLabel}` : ''}
        </Mono>
        {row.eta && (
          <Mono trace className="text-[0.5625rem]">{row.eta}</Mono>
        )}
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function LiveDownloadsPanel() {
  const [sabQueue, setSabQueue] = useState<SabQueue | null>(null);
  const [qbitList, setQbitList] = useState<QbitTorrent[]>([]);
  const [sabError, setSabError] = useState(false);
  const [qbitError, setQbitError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSab = () =>
      api.get<SabQueue>('/sabnzbd/queue')
        .then(d => { if (!cancelled) { setSabQueue(d); setSabError(false); } })
        .catch(() => { if (!cancelled) setSabError(true); });

    const fetchQbit = () =>
      api.get<QbitTorrent[]>('/torrents/list')
        .then(d => { if (!cancelled) { setQbitList(d); setQbitError(false); } })
        .catch(() => { if (!cancelled) setQbitError(true); });

    fetchSab();
    fetchQbit();
    const id = setInterval(() => { fetchSab(); fetchQbit(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Separate active vs idle/queued qbit torrents (skip pure seeders)
  const qbitActive = qbitList.filter(t => ACTIVE_QBIT_STATES.has(t.state));
  const qbitQueued = qbitList.filter(t => t.state === 'queuedDL' || t.state === 'checkingDL');

  const sabRows = (sabQueue?.slots ?? []).map(s => sabToRow(s, sabQueue?.kbpersec ?? 0));
  const qbitRows = [...qbitActive, ...qbitQueued].map(qbitToRow);

  const active = [...sabRows.filter(r => r.active), ...qbitRows.filter(r => r.active)];
  const rest   = [...sabRows.filter(r => !r.active), ...qbitRows.filter(r => !r.active)];
  const rows   = [...active, ...rest];

  const sabKBps = sabQueue?.kbpersec ?? 0;
  const qbitBps = qbitList.reduce((s, t) => s + (t.dlspeed ?? 0), 0);
  const totalBps = sabKBps * 1024 + qbitBps;

  return (
    <div
      className="flex flex-col h-full rounded-[var(--v4-tile-r)] overflow-hidden"
      style={{ background: 'var(--v4-console)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5 shrink-0">
        <PanelTitle>Downloads</PanelTitle>
        <div className="flex items-center gap-2">
          {totalBps > 0 && (
            <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-amber)' }}>
              ↓ {fmtBytes(totalBps)}/s
            </Mono>
          )}
          <span
            className="w-1.5 h-1.5 rounded-full v4-dot-pulse"
            style={{ background: 'var(--v4-nominal)', animationDuration: '3s' }}
          />
        </div>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0 flex-wrap">
        {!sabError ? (
          <span
            className="text-[0.5rem] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded-sm"
            style={{ background: 'rgba(88,166,255,0.1)', color: 'var(--v4-amber)' }}
          >
            SABnzbd {sabQueue?.paused ? 'paused' : (sabQueue?.status ?? '').toLowerCase() || 'idle'}
          </span>
        ) : (
          <Mono trace className="text-[0.5625rem]">sabnzbd offline</Mono>
        )}
        {qbitError && <Mono trace className="text-[0.5625rem]">qbit offline</Mono>}
      </div>

      {/* Download list */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1" style={{ color: 'var(--v4-trace)' }}>
            <Mono className="text-[0.8125rem]">idle</Mono>
            <Mono trace className="text-[0.625rem]">no active downloads</Mono>
          </div>
        ) : (
          rows.map((row, i) => (
            <DlRow key={row.id} row={row} last={i === rows.length - 1} />
          ))
        )}
      </div>
    </div>
  );
}
