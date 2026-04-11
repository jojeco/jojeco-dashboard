import { useState, useEffect, useCallback } from 'react';
import { Tv, Film, RefreshCw, Clock, CheckCircle, AlertCircle, Disc } from 'lucide-react';
import { getToken } from '../services/api';

const API = '/api';

interface QueueItem {
  id: number; title: string; status: string; sizeleft: number; size: number;
  timeleft?: string; estimatedCompletionTime?: string;
  series?: { title: string }; episode?: { seasonNumber: number; episodeNumber: number; title: string };
  movie?: { title: string; year: number };
  trackedDownloadStatus?: string; trackedDownloadState?: string;
}
interface Stats {
  sonarr: { missing: number|null; queued: number|null };
  radarr: { missing: number|null; queued: number|null };
}

function fmt(b: number) {
  if (!b) return '—';
  const k=1024, s=['B','KB','MB','GB','TB'], i=Math.floor(Math.log(b)/Math.log(k));
  return (b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

function statusBadge(status: string) {
  const map: Record<string,string> = {
    downloading: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  };
  const lower = status.toLowerCase();
  const cls = map[lower] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function Progress({ item }: { item: QueueItem }) {
  if (!item.size) return null;
  const pct = Math.round(((item.size - item.sizeleft) / item.size) * 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{fmt(item.size - item.sizeleft)} / {fmt(item.size)}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-blue-500" style={{width:`${pct}%`}}/>
      </div>
    </div>
  );
}

interface RipStatus {
  status: 'idle'|'starting'|'ripping'|'importing'|'done'|'error';
  album: string; track: number; total: number; percent: number; trackName: string; updatedAt: string;
}

function RipCard({ rip }: { rip: RipStatus }) {
  if (rip.status === 'idle') return null;
  const colors: Record<string, string> = {
    ripping: 'bg-purple-500',
    importing: 'bg-blue-500',
    done: 'bg-green-500',
    starting: 'bg-yellow-500',
    error: 'bg-red-500',
  };
  const barColor = colors[rip.status] || 'bg-gray-400';
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <Disc className={`w-4 h-4 shrink-0 ${rip.status === 'ripping' ? 'text-purple-500 animate-spin' : 'text-gray-400'}`}/>
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {rip.album || 'CD Rip'}
        </span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium text-white ${barColor}`}>
          {rip.status}
        </span>
      </div>
      {rip.total > 0 && (
        <>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{rip.trackName || `Track ${rip.track}`}</span>
            <span>{rip.track}/{rip.total} — {rip.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`} style={{width:`${rip.percent}%`}}/>
          </div>
        </>
      )}
    </div>
  );
}

import { useAuth } from '../contexts/AuthContext';

export default function MediaPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [queue, setQueue] = useState<{sonarr:QueueItem[];radarr:QueueItem[]}>({sonarr:[],radarr:[]});
  const [stats, setStats] = useState<Stats|null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all'|'sonarr'|'radarr'>('all');
  const [rip, setRip] = useState<RipStatus>({ status: 'idle', album: '', track: 0, total: 0, percent: 0, trackName: '', updatedAt: '' });

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`${API}/media/queue`, { headers: h }),
        fetch(`${API}/media/stats`, { headers: h }),
      ]);
      if (qRes.ok) setQueue(await qRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  const pollRip = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`${API}/rip/status`, { headers: h });
      if (r.ok) setRip(await r.json());
    } catch {}
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { pollRip(); const id = setInterval(pollRip, 3000); return () => clearInterval(id); }, [pollRip]);

  const sonarrItems = queue.sonarr.map(item => ({ ...item, _type: 'sonarr' as const }));
  const radarrItems = queue.radarr.map(item => ({ ...item, _type: 'radarr' as const }));
  const allItems = [...sonarrItems, ...radarrItems];
  const rawItems = activeTab === 'sonarr' ? sonarrItems : activeTab === 'radarr' ? radarrItems : allItems;
  const displayItems = [...rawItems].sort((a, b) => {
    const pctA = a.size ? (a.size - a.sizeleft) / a.size : 0;
    const pctB = b.size ? (b.size - b.sizeleft) / b.size : 0;
    return pctB - pctA;
  });

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isGuest && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Media</span> — download queue from Sonarr and Radarr, plus CD ripping status. Shows what TV shows and movies are currently being fetched.
        </div>
      )}
      <RipCard rip={rip}/>
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Tv,   label: 'Shows queued',   val: stats.sonarr.queued,   color: 'text-blue-500' },
            { icon: Tv,   label: 'Episodes missing', val: stats.sonarr.missing, color: 'text-yellow-500' },
            { icon: Film, label: 'Movies queued',   val: stats.radarr.queued,  color: 'text-purple-500' },
            { icon: Film, label: 'Movies missing',  val: stats.radarr.missing, color: 'text-red-500' },
          ].map(({icon:Icon,label,val,color})=>(
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className={`flex items-center gap-2 ${color} mb-1`}><Icon className="w-4 h-4"/><span className="text-xs text-gray-500">{label}</span></div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{val ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(['all','sonarr','radarr'] as const).map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab===tab ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {tab === 'all' ? 'All' : tab === 'sonarr' ? '📺 Sonarr' : '🎬 Radarr'}
            <span className="ml-1.5 text-xs opacity-70">
              {tab === 'all' ? allItems.length : tab === 'sonarr' ? sonarrItems.length : radarrItems.length}
            </span>
          </button>
        ))}
        <button onClick={refresh} className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><RefreshCw className="w-4 h-4"/></button>
      </div>

      {/* Queue */}
      {displayItems.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30"/>
          <p>Queue is empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayItems.map(item => {
            const isShow = item._type === 'sonarr';
            const title = isShow
              ? `${item.series?.title || 'Unknown'} — S${String(item.episode?.seasonNumber||0).padStart(2,'0')}E${String(item.episode?.episodeNumber||0).padStart(2,'0')} ${item.episode?.title||''}`
              : `${item.movie?.title || item.title}${item.movie?.year ? ` (${item.movie.year})` : ''}`;
            return (
              <div key={`${item._type}-${item.id}`} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isShow ? <Tv className="w-4 h-4 text-blue-400 shrink-0"/> : <Film className="w-4 h-4 text-purple-400 shrink-0"/>}
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</div>
                  </div>
                  <div className="shrink-0">{statusBadge(item.status)}</div>
                </div>
                <Progress item={item}/>
                {item.timeleft && item.timeleft !== '00:00:00' && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3"/>
                    <span>{item.timeleft} remaining</span>
                  </div>
                )}
                {item.trackedDownloadStatus && item.trackedDownloadStatus !== 'Ok' && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-yellow-500">
                    <AlertCircle className="w-3 h-3"/>
                    <span>{item.trackedDownloadStatus}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
