import { useState, useEffect, useCallback } from 'react';
import { Download, Upload, Plus, Play, Pause, Trash2, RotateCcw, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

interface Torrent {
  hash: string; name: string; state: string; progress: number;
  dlspeed: number; upspeed: number; size: number; eta: number;
  num_seeds: number; num_leechs: number;
}
interface TransferInfo {
  connection_status: string; dl_info_speed: number; up_info_speed: number; dl_info_data: number; up_info_data: number;
}

function fmt(b: number) {
  if (!b) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}
function fmtEta(s: number) {
  if (s < 0 || s > 604800) return '∞';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function stateColor(s: string) {
  if (['downloading', 'metaDL', 'allocating'].includes(s)) return 'text-blue-400';
  if (['uploading', 'stalledUP', 'queuedUP', 'forcedUP'].includes(s)) return 'text-green-400';
  if (s.startsWith('paused')) return 'text-yellow-400';
  if (['error', 'missingFiles'].includes(s)) return 'text-red-400';
  return 'text-gray-400';
}
const STATE_LABELS: Record<string, string> = {
  downloading: 'Downloading', uploading: 'Seeding', pausedDL: 'Paused', pausedUP: 'Done (seeding paused)',
  stalledDL: 'Stalled', stalledUP: 'Seeding (idle)', queuedDL: 'Queued', checkingDL: 'Checking',
  error: 'Error', missingFiles: 'Missing files', allocating: 'Allocating', metaDL: 'Fetching metadata',
  forcedUP: 'Force seeding',
};

type Tab = 'active' | 'done' | 'error';

function classifyTab(t: Torrent): Tab {
  if (['error', 'missingFiles'].includes(t.state)) return 'error';
  if (['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state) || t.progress >= 1) return 'done';
  return 'active';
}

export default function TorrentsPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addUrl, setAddUrl] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    try {
      const [tRes, xRes] = await Promise.all([
        fetch(`${API}/torrents/list`, { headers: h }),
        fetch(`${API}/torrents/transfer`, { headers: h }),
      ]);
      if (tRes.ok) setTorrents(await tRes.json());
      if (xRes.ok) setTransfer(await xRes.json());
      setError(null);
    } catch { setError('Cannot reach API'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);

  // Clear selection when switching tabs
  const switchTab = (t: Tab) => { setTab(t); setSelected(new Set()); };

  const act = async (action: string, hashes: string[], extra?: Record<string, unknown>) => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/${action}`, { method: 'POST', headers: h, body: JSON.stringify({ hashes, ...extra }) });
    setTimeout(refresh, 800);
  };

  const addTorrent = async () => {
    if (!addUrl.trim()) return;
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/add`, { method: 'POST', headers: h, body: JSON.stringify({ urls: addUrl.trim() }) });
    setAddUrl(''); setShowAdd(false); setTimeout(refresh, 1500);
  };

  const toggle = (hash: string) => setSelected(p => { const n = new Set(p); n.has(hash) ? n.delete(hash) : n.add(hash); return n; });
  const toggleAll = (hashes: string[]) => {
    const allSelected = hashes.every(h => selected.has(h));
    setSelected(new Set(allSelected ? [] : hashes));
  };

  const activeTorrents = torrents.filter(t => classifyTab(t) === 'active')
    .sort((a, b) => { const ga = a.state === 'downloading' ? 0 : 1, gb = b.state === 'downloading' ? 0 : 1; return ga !== gb ? ga - gb : b.progress - a.progress; });
  const doneTorrents = torrents.filter(t => classifyTab(t) === 'done')
    .sort((a, b) => b.progress - a.progress);
  const errorTorrents = torrents.filter(t => classifyTab(t) === 'error');

  const tabData: Record<Tab, Torrent[]> = { active: activeTorrents, done: doneTorrents, error: errorTorrents };
  const current = tabData[tab];
  const sel = Array.from(selected).filter(h => current.some(t => t.hash === h));

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  if (error) return <div className="flex items-center justify-center h-64 text-red-400">{error}</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isGuest && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Torrents</span> — active download queue managed by qBittorrent. Queue management is available to signed-in users.
        </div>
      )}

      {/* Transfer stats */}
      {transfer && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Download, label: 'Download', val: fmt(transfer.dl_info_speed) + '/s', color: 'text-blue-500' },
            { icon: Upload, label: 'Upload', val: fmt(transfer.up_info_speed) + '/s', color: 'text-green-500' },
            { icon: Download, label: 'Session DL', val: fmt(transfer.dl_info_data), color: 'text-gray-500' },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className={`flex items-center gap-2 ${color} mb-1`}><Icon className="w-4 h-4" /><span className="text-xs text-gray-500">{label}</span></div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">{val}</div>
            </div>
          ))}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              {transfer.connection_status === 'connected' ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-yellow-500" />}
              <span className="text-xs text-gray-500">VPN</span>
            </div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{transfer.connection_status}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
        {([
          { key: 'active' as Tab, label: 'In Progress', count: activeTorrents.length },
          { key: 'done' as Tab, label: 'Completed', count: doneTorrents.length },
          { key: 'error' as Tab, label: 'Errors', count: errorTorrents.length },
        ]).map(({ key, label, count }) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
            {count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === key ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {!isGuest && (
            <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
          {current.length > 0 && !isGuest && (
            <button onClick={() => toggleAll(current.map(t => t.hash))}
              className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
              {current.every(t => selected.has(t.hash)) ? 'Deselect all' : 'Select all'}
            </button>
          )}
          {sel.length > 0 && (
            <>
              {tab === 'active' && (
                <>
                  <button onClick={() => act('resume', sel)} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"><Play className="w-4 h-4" /> Resume</button>
                  <button onClick={() => act('pause', sel)} className="flex items-center gap-1.5 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm"><Pause className="w-4 h-4" /> Pause</button>
                </>
              )}
              {tab === 'done' && (
                <button onClick={() => act('resume', sel)} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"><Play className="w-4 h-4" /> Re-seed</button>
              )}
              <button onClick={() => act('recheck', sel)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"><RotateCcw className="w-4 h-4" /> Recheck</button>
              <button onClick={() => { if (confirm(`Remove ${sel.length} torrent(s)?`)) { act('delete', sel, { deleteFiles: false }); setSelected(new Set()); } }}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"><Trash2 className="w-4 h-4" /> Remove</button>
              <span className="text-sm text-gray-500">{sel.length} selected</span>
            </>
          )}
          <button onClick={refresh} className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {showAdd && (
        <div className="flex gap-2">
          <input value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTorrent()}
            placeholder="Magnet link or .torrent URL…"
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          <button onClick={addTorrent} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Add</button>
          <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">Cancel</button>
        </div>
      )}

      {/* Torrent list */}
      {current.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{tab === 'active' ? 'No active downloads' : tab === 'done' ? 'No completed torrents' : 'No errors'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {current.map(t => (
            <div key={t.hash} onClick={() => toggle(t.hash)}
              className={`bg-white dark:bg-gray-800 border rounded-xl p-4 cursor-pointer transition-all ${selected.has(t.hash) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white text-sm truncate">{t.name}</div>
                  <div className={`text-xs mt-0.5 ${stateColor(t.state)}`}>{STATE_LABELS[t.state] || t.state}</div>
                </div>
                <div className="text-right shrink-0 text-xs text-gray-500">
                  <div>{fmt(t.size)}</div>
                  {t.state === 'downloading' && <div className="text-blue-400">{fmtEta(t.eta)}</div>}
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                <div className={`h-1.5 rounded-full ${tab === 'done' ? 'bg-green-500' : tab === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${(t.progress * 100).toFixed(1)}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{(t.progress * 100).toFixed(1)}%</span>
                <div className="flex gap-3">
                  {t.dlspeed > 0 && <span className="text-blue-400">↓ {fmt(t.dlspeed)}/s</span>}
                  {t.upspeed > 0 && <span className="text-green-400">↑ {fmt(t.upspeed)}/s</span>}
                  <span>🌱 {t.num_seeds}/{t.num_leechs}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                {tab === 'active' && (
                  t.state.startsWith('paused') || t.state === 'stalledDL'
                    ? <button onClick={() => act('resume', [t.hash])} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md"><Play className="w-3 h-3" /> Resume</button>
                    : <button onClick={() => act('pause', [t.hash])} className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-md"><Pause className="w-3 h-3" /> Pause</button>
                )}
                <button onClick={() => act('recheck', [t.hash])} className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md"><RotateCcw className="w-3 h-3" /> Recheck</button>
                <button onClick={() => { if (confirm('Remove torrent?')) act('delete', [t.hash], { deleteFiles: false }); }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md ml-auto"><Trash2 className="w-3 h-3" /> Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
