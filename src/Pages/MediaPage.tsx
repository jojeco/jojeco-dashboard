import { useState, useEffect, useCallback } from 'react';
import { Tv, Film, RefreshCw, Clock, CheckCircle, AlertCircle, Disc, Calendar, Cpu, Zap } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

interface QueueItem {
  id: number; title: string; status: string; sizeleft: number; size: number;
  timeleft?: string; estimatedCompletionTime?: string;
  series?: { title: string }; episode?: { seasonNumber: number; episodeNumber: number; title: string };
  movie?: { title: string; year: number };
  trackedDownloadStatus?: string; trackedDownloadState?: string;
}

interface UpcomingEpisode {
  type: 'episode';
  id: number; title: string; episode: string; episodeTitle: string;
  airDate: string; hasFile: boolean; network: string;
}
interface UpcomingMovie {
  type: 'movie';
  id: number; title: string; year: number;
  digitalRelease?: string; physicalRelease?: string; inCinemas?: string;
  studio?: string;
}
type UpcomingItem = UpcomingEpisode | UpcomingMovie;

function fmt(b: number) {
  if (!b) return '—';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    downloading: { bg: 'rgba(20,184,166,0.10)',  color: 'var(--accent)' },
    completed:   { bg: 'rgba(16,185,129,0.10)',   color: 'var(--ok)'    },
    failed:      { bg: 'rgba(244,63,94,0.10)',     color: 'var(--err)'   },
    warning:     { bg: 'rgba(245,158,11,0.10)',    color: 'var(--warn)'  },
  };
  const s = map[status.toLowerCase()] ?? { bg: 'var(--raised)', color: 'var(--t3)' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
  );
}

function Progress({ item }: { item: QueueItem }) {
  if (!item.size) return null;
  const pct = Math.round(((item.size - item.sizeleft) / item.size) * 100);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 4, fontFamily: 'Geist Mono, monospace' }}>
        <span>{fmt(item.size - item.sizeleft)} / {fmt(item.size)}</span>
        <span>{pct}%</span>
      </div>
      <div className="j-bar-track">
        <div className="j-bar-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

interface TdarrWorker {
  node: string; type: string; status: string;
  file: string; percentage: number; fps: number;
}
interface TdarrStatus {
  total: number; transcoded: number; transcodeQueue: number;
  noAction: number; transcodeErrors: number; healthErrors: number; healthOk: number;
  tdarrScore: number; sizeDiffGB: number; workers: TdarrWorker[];
}

function workerTypeLabel(type: string) {
  if (type === 'transcodegpu') return { label: 'GPU Transcode', color: '#a78bfa' };
  if (type === 'transcodecpu') return { label: 'CPU Transcode', color: 'var(--warn)' };
  if (type === 'healthcheckgpu') return { label: 'GPU Health', color: 'var(--accent)' };
  return { label: 'CPU Health', color: 'var(--t3)' };
}

function TdarrPanel({ tdarr }: { tdarr: TdarrStatus | null }) {
  if (!tdarr) return (
    <div className="j-panel" style={{ padding: 16, opacity: 0.5, fontSize: 12, color: 'var(--t3)', textAlign: 'center' }}>
      Tdarr unavailable
    </div>
  );

  const score = tdarr.tdarrScore ?? 0;
  const activeWorkers = tdarr.workers.filter(w => w.status === 'Execute' || w.status === 'Processing' || w.status === 'Scanning');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { label: 'Library Score', value: `${score.toFixed(1)}%`, color: score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--err)' },
          { label: 'Transcoded', value: tdarr.transcoded.toLocaleString(), color: 'var(--ok)' },
          { label: tdarr.transcodeQueue > 0 ? 'In Queue' : 'Errors', value: tdarr.transcodeQueue > 0 ? tdarr.transcodeQueue.toLocaleString() : tdarr.transcodeErrors.toLocaleString(), color: tdarr.transcodeQueue > 0 ? 'var(--accent)' : tdarr.transcodeErrors > 0 ? 'var(--err)' : 'var(--t3)' },
          { label: 'Space Saved', value: tdarr.sizeDiffGB > 0 ? `${tdarr.sizeDiffGB.toFixed(0)} GB` : '—', color: tdarr.sizeDiffGB > 0 ? 'var(--ok)' : 'var(--t3)' },
        ].map(s => (
          <div key={s.label} className="j-panel" style={{ padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: 'Geist Mono, monospace' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="j-panel" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 6, fontFamily: 'Geist Mono, monospace' }}>
          <span>HEVC Coverage</span>
          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{tdarr.noAction.toLocaleString()} / {tdarr.total.toLocaleString()} — {score.toFixed(1)}%</span>
        </div>
        <div className="j-bar-track">
          <div className="j-bar-fill" style={{ width: `${score}%`, background: score >= 90 ? 'var(--ok)' : 'var(--warn)', transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Already HEVC', value: tdarr.noAction, color: 'var(--t3)' },
            { label: 'Transcoded by Tdarr', value: tdarr.transcoded, color: 'var(--ok)' },
            { label: 'Errors', value: tdarr.transcodeErrors, color: tdarr.transcodeErrors > 0 ? 'var(--err)' : 'var(--t3)' },
            { label: 'Health errors', value: tdarr.healthErrors, color: tdarr.healthErrors > 0 ? 'var(--warn)' : 'var(--t3)' },
          ].map(s => (
            <div key={s.label} style={{ fontSize: 10, color: s.color }}>
              <span style={{ fontWeight: 600, fontFamily: 'Geist Mono, monospace' }}>{s.value.toLocaleString()}</span>
              <span style={{ color: 'var(--t3)', marginLeft: 3 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active workers */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={11} style={{ color: 'var(--t3)' }} />
          Workers
          <span style={{ fontWeight: 400, color: 'var(--t3)' }}>({activeWorkers.length} active)</span>
        </div>
        {activeWorkers.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '8px 0' }}>No active workers</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeWorkers.map((w, i) => {
              const { label, color } = workerTypeLabel(w.type);
              return (
                <div key={i} className="j-panel" style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color, padding: '1px 6px', borderRadius: 4, background: `${color}18` }}>{label}</span>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>{w.node}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Zap size={9} />{w.fps} fps
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{w.file || '—'}</div>
                  <div className="j-bar-track" style={{ height: 3 }}>
                    <div className="j-bar-fill" style={{ width: `${w.percentage}%`, background: color, transition: 'width 1s linear' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, textAlign: 'right', fontFamily: 'Geist Mono, monospace' }}>{w.percentage}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface RipStatus {
  status: 'idle' | 'starting' | 'ripping' | 'importing' | 'done' | 'error';
  album: string; track: number; total: number; percent: number; trackName: string; updatedAt: string;
}

function RipCard({ rip }: { rip: RipStatus }) {
  if (rip.status === 'idle') return null;
  const colorMap: Record<string, string> = {
    ripping: '#a78bfa', importing: 'var(--accent)',
    done: 'var(--ok)', starting: 'var(--warn)', error: 'var(--err)',
  };
  const color = colorMap[rip.status] || 'var(--t3)';
  return (
    <div className="j-panel" style={{ padding: 14, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Disc size={14} style={{ flexShrink: 0, color: rip.status === 'ripping' ? '#a78bfa' : 'var(--t3)', animation: rip.status === 'ripping' ? 'spin 1s linear infinite' : 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rip.album || 'CD Rip'}</span>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${color}18`, color }}>{rip.status}</span>
      </div>
      {rip.total > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 4, fontFamily: 'Geist Mono, monospace' }}>
            <span>{rip.trackName || `Track ${rip.track}`}</span>
            <span>{rip.track}/{rip.total} — {rip.percent}%</span>
          </div>
          <div className="j-bar-track">
            <div className="j-bar-fill" style={{ width: `${rip.percent}%`, background: color, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const abs = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diff === 0) return { label: abs, note: 'Today',    color: 'var(--ok)'    };
  if (diff === 1) return { label: abs, note: 'Tomorrow', color: 'var(--accent)' };
  if (diff < 0)  return { label: abs, note: `${Math.abs(diff)}d ago`, color: 'var(--t3)' };
  if (diff < 7)  return { label: abs, note: `in ${diff}d`,  color: 'var(--warn)'  };
  return          { label: abs, note: `in ${diff}d`,  color: 'var(--t3)'   };
}

function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${active === t.key ? 'var(--accent-border)' : 'var(--line)'}`,
            background: active === t.key ? 'var(--accent-dim)' : 'var(--raised)',
            color: active === t.key ? 'var(--accent)' : 'var(--t2)' }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function UpcomingCard({ item }: { item: UpcomingItem }) {
  if (item.type === 'episode') {
    const date = formatDate(item.airDate);
    return (
      <div className="j-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tv size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.episode}{item.episodeTitle ? ` — ${item.episodeTitle}` : ''}</div>
          {item.network && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{item.network}</div>}
        </div>
        {date && (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t2)' }}>{date.label}</div>
            <div style={{ fontSize: 11, color: date.color }}>{date.note}</div>
          </div>
        )}
      </div>
    );
  }
  const releaseDate = item.digitalRelease || item.physicalRelease || item.inCinemas;
  const date = formatDate(releaseDate);
  const releaseType = item.digitalRelease ? 'Digital' : item.physicalRelease ? 'Physical' : item.inCinemas ? 'In Cinemas' : '';
  return (
    <div className="j-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Film size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title} {item.year ? `(${item.year})` : ''}</div>
        {item.studio && <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.studio}</div>}
        {releaseType && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{releaseType}</div>}
      </div>
      {date && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t2)' }}>{date.label}</div>
          <div style={{ fontSize: 11, color: date.color }}>{date.note}</div>
        </div>
      )}
    </div>
  );
}

function Paginator({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8 }}>
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: page === 1 ? 'var(--t3)' : 'var(--t2)', cursor: page === 1 ? 'default' : 'pointer' }}>
        ‹
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onPage(p)}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: `1px solid ${p === page ? 'var(--accent-border)' : 'var(--line)'}`, background: p === page ? 'var(--accent-dim)' : 'var(--raised)', color: p === page ? 'var(--accent)' : 'var(--t2)', cursor: 'pointer' }}>
          {p}
        </button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: page === pages ? 'var(--t3)' : 'var(--t2)', cursor: page === pages ? 'default' : 'pointer' }}>
        ›
      </button>
    </div>
  );
}

function PerPageSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t2)', cursor: 'pointer' }}>
      <option value={5}>5</option>
      <option value={10}>10</option>
      <option value={25}>25</option>
    </select>
  );
}

export default function MediaPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [queue, setQueue] = useState<{ sonarr: QueueItem[]; radarr: QueueItem[] }>({ sonarr: [], radarr: [] });
  const [upcoming, setUpcoming] = useState<{ episodes: UpcomingEpisode[]; movies: UpcomingMovie[] }>({ episodes: [], movies: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'sonarr' | 'radarr'>('all');
  const [upcomingTab, setUpcomingTab] = useState<'all' | 'episodes' | 'movies'>('all');
  const [rip, setRip] = useState<RipStatus>({ status: 'idle', album: '', track: 0, total: 0, percent: 0, trackName: '', updatedAt: '' });
  const [tdarr, setTdarr] = useState<TdarrStatus | null>(null);
  const [queuePage, setQueuePage] = useState(1);
  const [queuePerPage, setQueuePerPage] = useState(5);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingPerPage, setUpcomingPerPage] = useState(5);

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const [qRes, uRes] = await Promise.all([
        fetch(`${API}/media/queue`, { headers: h }),
        fetch(`${API}/media/upcoming`, { headers: h }),
      ]);
      if (qRes.ok) setQueue(await qRes.json());
      if (uRes.ok) setUpcoming(await uRes.json());
    } catch { }
    finally { setLoading(false); }
  }, []);

  const pollRip = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`${API}/rip/status`, { headers: h });
      if (r.ok) setRip(await r.json());
    } catch { }
  }, []);

  const pollTdarr = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`${API}/tdarr/status`, { headers: h });
      if (r.ok) setTdarr(await r.json());
    } catch { }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { pollRip(); const id = setInterval(pollRip, 3000); return () => clearInterval(id); }, [pollRip]);
  useEffect(() => { pollTdarr(); const id = setInterval(pollTdarr, 15000); return () => clearInterval(id); }, [pollTdarr]);

  const sonarrItems = queue.sonarr.map(item => ({ ...item, _type: 'sonarr' as const }));
  const radarrItems = queue.radarr.map(item => ({ ...item, _type: 'radarr' as const }));
  const allItems = [...sonarrItems, ...radarrItems];
  const rawItems = activeTab === 'sonarr' ? sonarrItems : activeTab === 'radarr' ? radarrItems : allItems;
  const sortedItems = [...rawItems].sort((a, b) => {
    const pctA = a.size ? (a.size - a.sizeleft) / a.size : 0;
    const pctB = b.size ? (b.size - b.sizeleft) / b.size : 0;
    return pctB - pctA;
  });
  const queueStart = (queuePage - 1) * queuePerPage;
  const displayItems = sortedItems.slice(queueStart, queueStart + queuePerPage);

  const sortedEpisodes = [...upcoming.episodes].sort((a, b) => new Date(a.airDate).getTime() - new Date(b.airDate).getTime());
  const sortedMovies = [...upcoming.movies].sort((a, b) => {
    const da = a.digitalRelease || a.physicalRelease || a.inCinemas || '';
    const db = b.digitalRelease || b.physicalRelease || b.inCinemas || '';
    return new Date(da).getTime() - new Date(db).getTime();
  });
  const allUpcomingItems: UpcomingItem[] = upcomingTab === 'episodes'
    ? sortedEpisodes
    : upcomingTab === 'movies'
      ? sortedMovies
      : [...sortedEpisodes.map(e => e as UpcomingItem), ...sortedMovies.map(m => m as UpcomingItem)]
          .sort((a, b) => {
            const da = a.type === 'episode' ? a.airDate : (a.digitalRelease || a.physicalRelease || a.inCinemas || '');
            const db = b.type === 'episode' ? b.airDate : (b.digitalRelease || b.physicalRelease || b.inCinemas || '');
            return new Date(da).getTime() - new Date(db).getTime();
          });
  const upcomingStart = (upcomingPage - 1) * upcomingPerPage;
  const upcomingItems = allUpcomingItems.slice(upcomingStart, upcomingStart + upcomingPerPage);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: 'var(--t3)', fontSize: 13 }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isGuest && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', fontSize: 12, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Media</strong> — download queue and upcoming releases from Sonarr and Radarr.
        </div>
      )}

      {/* Top row: Rip/Torrents | Transcoder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Rip Station
          </div>
          <RipCard rip={rip} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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

      {/* Bottom row: Download Queue | Upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Download Queue */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Download Queue</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <PerPageSelect value={queuePerPage} onChange={n => { setQueuePerPage(n); setQueuePage(1); }} />
              <TabBar
                tabs={[
                  { key: 'all' as const,    label: `All (${sortedItems.length})` },
                  { key: 'sonarr' as const, label: `📺 ${sonarrItems.length}` },
                  { key: 'radarr' as const, label: `🎬 ${radarrItems.length}` },
                ]}
                active={activeTab}
                onChange={t => { setActiveTab(t); setQueuePage(1); }}
              />
              <button onClick={refresh} style={{ padding: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
          {sortedItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)' }}>
              <CheckCircle size={36} style={{ margin: '0 auto 8px', opacity: 0.2 }} />
              <p style={{ fontSize: 12 }}>Queue is empty</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayItems.map(item => {
                  const isShow = item._type === 'sonarr';
                  const title = isShow
                    ? `${item.series?.title || 'Unknown'} — S${String(item.episode?.seasonNumber || 0).padStart(2, '0')}E${String(item.episode?.episodeNumber || 0).padStart(2, '0')} ${item.episode?.title || ''}`
                    : `${item.movie?.title || item.title}${item.movie?.year ? ` (${item.movie.year})` : ''}`;
                  return (
                    <div key={`${item._type}-${item.id}`} className="j-panel" style={{ padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {isShow ? <Tv size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <Film size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                        </div>
                        <div style={{ flexShrink: 0 }}>{statusBadge(item.status)}</div>
                      </div>
                      <Progress item={item} />
                      {item.timeleft && item.timeleft !== '00:00:00' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--t3)' }}>
                          <Clock size={11} /><span>{item.timeleft} remaining</span>
                        </div>
                      )}
                      {item.trackedDownloadStatus && item.trackedDownloadStatus !== 'Ok' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--warn)' }}>
                          <AlertCircle size={11} /><span>{item.trackedDownloadStatus}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Paginator page={queuePage} total={sortedItems.length} perPage={queuePerPage} onPage={setQueuePage} />
            </>
          )}
        </div>

        {/* Upcoming */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Calendar size={13} style={{ color: 'var(--t3)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Upcoming</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <PerPageSelect value={upcomingPerPage} onChange={n => { setUpcomingPerPage(n); setUpcomingPage(1); }} />
              <TabBar
                tabs={[
                  { key: 'all' as const,      label: `All (${sortedEpisodes.length + sortedMovies.length})` },
                  { key: 'episodes' as const, label: `📺 ${sortedEpisodes.length}` },
                  { key: 'movies' as const,   label: `🎬 ${sortedMovies.length}` },
                ]}
                active={upcomingTab}
                onChange={t => { setUpcomingTab(t); setUpcomingPage(1); }}
              />
            </div>
          </div>
          {allUpcomingItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--t3)' }}>Nothing upcoming in the next 45 days</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcomingItems.map(item => (
                  <UpcomingCard key={`${item.type}-${item.id}`} item={item} />
                ))}
              </div>
              <Paginator page={upcomingPage} total={allUpcomingItems.length} perPage={upcomingPerPage} onPage={setUpcomingPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
