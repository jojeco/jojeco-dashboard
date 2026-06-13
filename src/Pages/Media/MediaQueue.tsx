import { Tv, Film, Clock, AlertCircle, CheckCircle, Calendar, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { QueueItem, UpcomingItem, UpcomingEpisode, UpcomingMovie } from './types';
import { fmt, formatDate } from './utils';

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    downloading: { bg: 'rgba(20,184,166,0.10)',  color: 'var(--accent)' },
    completed:   { bg: 'rgba(16,185,129,0.10)',  color: 'var(--ok)'    },
    failed:      { bg: 'rgba(244,63,94,0.10)',   color: 'var(--err)'   },
    warning:     { bg: 'rgba(245,158,11,0.10)',  color: 'var(--warn)'  },
  };
  const s = map[status.toLowerCase()] ?? { bg: 'var(--raised)', color: 'var(--t3)' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, flexShrink: 0 }}>
      {status}
    </span>
  );
}

// ─── Progress bar for queue items ─────────────────────────────────────────────

function QueueProgress({ item }: { item: QueueItem }) {
  if (!item.size) return null;
  const pct = Math.round(((item.size - item.sizeleft) / item.size) * 100);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 4, fontFamily: 'Geist Mono, monospace', flexWrap: 'wrap', gap: 2, minWidth: 0 }}>
        <span>{fmt(item.size - item.sizeleft)} / {fmt(item.size)}</span>
        <span>{pct}%</span>
      </div>
      <div className="j-bar-track">
        <div className="j-bar-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            border: 'none',
            boxShadow: active === t.key ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-ring)',
            background: active === t.key ? 'var(--accent-dim)' : 'var(--raised)',
            color: active === t.key ? 'var(--accent)' : 'var(--t2)',
            fontFamily: 'inherit',
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Upcoming card ────────────────────────────────────────────────────────────

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

  const releaseDate = (item as UpcomingMovie).digitalRelease || (item as UpcomingMovie).physicalRelease || (item as UpcomingMovie).inCinemas;
  const date = formatDate(releaseDate);
  const releaseType = (item as UpcomingMovie).digitalRelease ? 'Digital' : (item as UpcomingMovie).physicalRelease ? 'Physical' : (item as UpcomingMovie).inCinemas ? 'In Cinemas' : '';
  return (
    <div className="j-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Film size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}{(item as UpcomingMovie).year ? ` (${(item as UpcomingMovie).year})` : ''}</div>
        {(item as UpcomingMovie).studio && <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(item as UpcomingMovie).studio}</div>}
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

// ─── Paginator (windowed — max 5 page buttons) ───────────────────────────────

function Paginator({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  const WINDOW = 5;
  let start = Math.max(1, page - Math.floor(WINDOW / 2));
  const end = Math.min(pages, start + WINDOW - 1);
  if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
  const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btnBase = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', cursor: 'pointer' as const };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ ...btnBase, color: page === 1 ? 'var(--t3)' : 'var(--t2)', cursor: page === 1 ? 'default' : 'pointer' }}>‹</button>
      {start > 1 && <span style={{ fontSize: 11, color: 'var(--t3)', padding: '0 2px' }}>…</span>}
      {pageNums.map(p => (
        <button key={p} onClick={() => onPage(p)}
          style={{ ...btnBase, border: `1px solid ${p === page ? 'var(--accent-border)' : 'var(--line)'}`, background: p === page ? 'var(--accent-dim)' : 'var(--raised)', color: p === page ? 'var(--accent)' : 'var(--t2)' }}>
          {p}
        </button>
      ))}
      {end < pages && <span style={{ fontSize: 11, color: 'var(--t3)', padding: '0 2px' }}>…</span>}
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        style={{ ...btnBase, color: page === pages ? 'var(--t3)' : 'var(--t2)', cursor: page === pages ? 'default' : 'pointer' }}>›</button>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

interface QueuePanelProps {
  sonarr: QueueItem[];
  radarr: QueueItem[];
  onRefresh: () => void;
}

export function QueuePanel({ sonarr, radarr, onRefresh }: QueuePanelProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'sonarr' | 'radarr'>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const sonarrItems = sonarr.map(item => ({ ...item, _type: 'sonarr' as const }));
  const radarrItems = radarr.map(item => ({ ...item, _type: 'radarr' as const }));
  const allItems = [...sonarrItems, ...radarrItems];
  const rawItems = activeTab === 'sonarr' ? sonarrItems : activeTab === 'radarr' ? radarrItems : allItems;
  const sortedItems = [...rawItems].sort((a, b) => {
    const pctA = a.size ? (a.size - a.sizeleft) / a.size : 0;
    const pctB = b.size ? (b.size - b.sizeleft) / b.size : 0;
    return pctB - pctA;
  });
  const displayItems = sortedItems.slice((page - 1) * perPage, page * perPage);

  return (
    <div style={{ minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Download Queue</span>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
          <TabBar
            tabs={[
              { key: 'all' as const,    label: `All (${sortedItems.length})` },
              { key: 'sonarr' as const, label: `📺 ${sonarrItems.length}` },
              { key: 'radarr' as const, label: `🎬 ${radarrItems.length}` },
            ]}
            active={activeTab}
            onChange={t => { setActiveTab(t); setPage(1); }}
          />
          <button onClick={onRefresh} style={{ padding: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      {isShow
                        ? <Tv size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        : <Film size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</div>
                    </div>
                    {statusBadge(item.status)}
                  </div>
                  <QueueProgress item={item} />
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
          <Paginator page={page} total={sortedItems.length} perPage={perPage} onPage={p => { setPage(p); }} />
        </>
      )}
    </div>
  );
}

interface UpcomingPanelProps {
  episodes: UpcomingEpisode[];
  movies: UpcomingMovie[];
}

export function UpcomingPanel({ episodes, movies }: UpcomingPanelProps) {
  const [upcomingTab, setUpcomingTab] = useState<'all' | 'episodes' | 'movies'>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const sortedEpisodes = [...episodes].sort((a, b) => new Date(a.airDate).getTime() - new Date(b.airDate).getTime());
  const sortedMovies = [...movies].sort((a, b) => {
    const da = a.digitalRelease || a.physicalRelease || a.inCinemas || '';
    const db = b.digitalRelease || b.physicalRelease || b.inCinemas || '';
    return new Date(da).getTime() - new Date(db).getTime();
  });

  const allUpcomingItems: UpcomingItem[] = upcomingTab === 'episodes'
    ? sortedEpisodes
    : upcomingTab === 'movies'
      ? sortedMovies
      : [...sortedEpisodes, ...sortedMovies].sort((a, b) => {
          const da = a.type === 'episode' ? a.airDate : (a.digitalRelease || a.physicalRelease || a.inCinemas || '');
          const db = b.type === 'episode' ? b.airDate : (b.digitalRelease || b.physicalRelease || b.inCinemas || '');
          return new Date(da).getTime() - new Date(db).getTime();
        });

  const pageItems = allUpcomingItems.slice((page - 1) * perPage, page * perPage);

  return (
    <div style={{ minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Calendar size={13} style={{ color: 'var(--t3)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Upcoming</span>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
          <TabBar
            tabs={[
              { key: 'all' as const,      label: `All (${sortedEpisodes.length + sortedMovies.length})` },
              { key: 'episodes' as const, label: `📺 ${sortedEpisodes.length}` },
              { key: 'movies' as const,   label: `🎬 ${sortedMovies.length}` },
            ]}
            active={upcomingTab}
            onChange={t => { setUpcomingTab(t); setPage(1); }}
          />
        </div>
      </div>

      {/* Content */}
      {allUpcomingItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--t3)' }}>Nothing upcoming in the next 45 days</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pageItems.map(item => (
              <UpcomingCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
          <Paginator page={page} total={allUpcomingItems.length} perPage={perPage} onPage={p => { setPage(p); }} />
        </>
      )}
    </div>
  );
}
