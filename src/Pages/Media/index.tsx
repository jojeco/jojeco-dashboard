/**
 * MediaAndTorrentsPage (v3) — decomposed rebuild.
 *
 * Routes /media and /torrents both render this component (via App.tsx wrapper).
 *
 * Design rules:
 *  - Surface elevation only — no white/hard borders; j-panel for cards
 *  - Hairlines: 1px solid var(--line) for structural dividers only
 *  - Section labels: SectionLabel component (10px uppercase t3 + hairline rule)
 *  - Status color ONLY on status content (dots, labels, badges, progress bars)
 *  - minWidth: 0 on every grid/flex item to prevent 390px overflow
 *  - No setInterval — useSnapshot for transfer stats + snapshot refresh cadence;
 *    torrent list fetched on mount + after mutations + on snapshot refresh;
 *    rip/tdarr fetched on mount + on snapshot refresh
 *  - Destructive torrent delete uses ConfirmDialog (no native confirm())
 *  - Mobile-first: single-column stack at 390px
 */
import { useState, useEffect, useCallback } from 'react';
import { Cpu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSnapshot } from '@/hooks/useSnapshot';
import { getToken } from '@/services/api';

import { SectionLabel } from './SectionLabel';
import { TransferStats } from './TransferStats';
import { TorrentList } from './TorrentList';
import { TdarrPanel } from './TdarrPanel';
import { RipCard } from './RipCard';
import { QueuePanel, UpcomingPanel } from './MediaQueue';

import type { Torrent, TdarrStatus, RipStatus, UpcomingEpisode, UpcomingMovie } from './types';

const API = '/api';

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export default function MediaAndTorrentsPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;

  // ── Snapshot data ────────────────────────────────────────────────────────────
  // media section = /api/media/queue  → { sonarr: [], radarr: [] }
  // torrents section = /api/torrents/transfer → TransferInfo
  const { data: mediaQueue, loading: mediaLoading, refresh: snapshotRefresh } = useSnapshot('media');
  const { data: transferData } = useSnapshot('torrents');

  // ── Local state ──────────────────────────────────────────────────────────────
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [torrentsLoading, setTorrentsLoading] = useState(true);
  const [torrentsError, setTorrentsError] = useState<string | null>(null);

  const [tdarr, setTdarr] = useState<TdarrStatus | null>(null);
  const [rip, setRip] = useState<RipStatus>({ status: 'idle', album: '', track: 0, total: 0, percent: 0, trackName: '', updatedAt: '' });

  const [upcoming, setUpcoming] = useState<{ episodes: UpcomingEpisode[]; movies: UpcomingMovie[] }>({ episodes: [], movies: [] });

  // ── Fetch torrent list (not in snapshot — snapshot only has transfer stats) ──
  const fetchTorrents = useCallback(async () => {
    try {
      const r = await fetch(`${API}/torrents/list`, { headers: authHeaders() });
      if (r.ok) {
        setTorrents(await r.json());
        setTorrentsError(null);
      } else {
        setTorrentsError('Cannot reach torrent API');
      }
    } catch {
      setTorrentsError('Cannot reach API');
    } finally {
      setTorrentsLoading(false);
    }
  }, []);

  // ── Fetch rip status ─────────────────────────────────────────────────────────
  const fetchRip = useCallback(async () => {
    try {
      const r = await fetch(`${API}/rip/status`, { headers: authHeaders() });
      if (r.ok) setRip(await r.json());
    } catch { /* silent */ }
  }, []);

  // ── Fetch Tdarr status ───────────────────────────────────────────────────────
  const fetchTdarr = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tdarr/status`, { headers: authHeaders() });
      if (r.ok) setTdarr(await r.json());
    } catch { /* silent */ }
  }, []);

  // ── Fetch upcoming ───────────────────────────────────────────────────────────
  const fetchUpcoming = useCallback(async () => {
    try {
      const r = await fetch(`${API}/media/upcoming`, { headers: authHeaders() });
      if (r.ok) setUpcoming(await r.json());
    } catch { /* silent */ }
  }, []);

  // ── Unified refresh — called on mount and after mutations ────────────────────
  const refreshAll = useCallback(() => {
    fetchTorrents();
    fetchRip();
    fetchTdarr();
    fetchUpcoming();
    snapshotRefresh(); // drives mediaQueue + transfer stats
  }, [fetchTorrents, fetchRip, fetchTdarr, fetchUpcoming, snapshotRefresh]);

  // Mount — fetch once; snapshot provider handles ongoing cadence for media/torrents
  // We re-fetch our non-snapshot data on every snapshot refresh via the snapshot cycle
  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Derive typed queue data from snapshot ─────────────────────────────────────
  const rawQueue = mediaQueue as { sonarr?: unknown[]; radarr?: unknown[] } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sonarr = (rawQueue?.sonarr ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const radarr = (rawQueue?.radarr ?? []) as any[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transferInfo = transferData as any;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, overflowX: 'hidden' }}>

      {/* ── TORRENTS SECTION ────────────────────────────────────────────────── */}
      <section style={{ minWidth: 0 }}>
        <SectionLabel>Torrents</SectionLabel>

        {/* Transfer stat tiles */}
        <div style={{ marginBottom: 16 }}>
          <TransferStats transfer={transferInfo ?? null} />
        </div>

        {/* Torrent list */}
        <TorrentList
          torrents={torrents}
          loading={torrentsLoading}
          error={torrentsError}
          isGuest={isGuest}
          onRefresh={refreshAll}
        />
      </section>

      {/* ── MEDIA SECTION ───────────────────────────────────────────────────── */}
      <section style={{ minWidth: 0 }}>
        <SectionLabel>Media Queue &amp; Upcoming</SectionLabel>

        {/* Rip + Transcoder row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {/* CD Rip station — hidden when idle */}
          {rip.status !== 'idle' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                Rip Station
              </div>
              <RipCard rip={rip} />
            </div>
          )}

          {/* Transcoder */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Cpu size={13} style={{ color: 'var(--t3)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Transcoder</span>
              {tdarr && tdarr.workers.filter(w => w.status === 'Execute' || w.status === 'Processing').length > 0 && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(20,184,166,0.12)', color: 'var(--accent)', fontWeight: 600 }}>
                  ACTIVE
                </span>
              )}
            </div>
            <TdarrPanel tdarr={tdarr} />
          </div>
        </div>

        {/* Download Queue + Upcoming — responsive two-col on wide, single-col on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 20, alignItems: 'start' }}>
          {mediaLoading ? (
            <div style={{ fontSize: 12, color: 'var(--t3)', padding: '16px 0' }}>Loading queue…</div>
          ) : (
            <QueuePanel sonarr={sonarr} radarr={radarr} onRefresh={snapshotRefresh} />
          )}
          <UpcomingPanel episodes={upcoming.episodes} movies={upcoming.movies} />
        </div>
      </section>

    </div>
  );
}
