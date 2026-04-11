import { useState, useEffect, useCallback } from 'react';
import { Play, Square, RotateCcw, Terminal, RefreshCw, ChevronUp, Search } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

interface Container {
  id: string; name: string; image: string; status: string; state: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  ports: string[]; created: number;
}

function stateColor(state: string) {
  if (state === 'running') return 'bg-green-500';
  if (state === 'exited') return 'bg-red-500';
  if (state === 'paused') return 'bg-yellow-500';
  return 'bg-gray-400';
}

function HealthBadge({ health }: { health: Container['health'] }) {
  if (health === 'none') return null;
  const styles: Record<string, string> = {
    healthy:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    unhealthy: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    starting:  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[health]}`}>
      {health}
    </span>
  );
}

function timeSince(ts: number) {
  const diff = Math.floor((Date.now()/1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function DockerPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [containers, setContainers] = useState<Container[]>(() => {
    try { const v = localStorage.getItem('cache_docker_containers'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [logsFor, setLogsFor] = useState<string|null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [acting, setActing] = useState<Record<string,boolean>>({});

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/docker/containers?all=${showAll ? '1' : '0'}`, { headers: h });
      if (r.ok) { const d = await r.json(); setContainers(d); localStorage.setItem('cache_docker_containers', JSON.stringify(d)); setError(null); }
      else setError('Docker API error');
    } catch { setError('Cannot reach Docker socket'); }
    finally { setLoading(false); }
  }, [showAll]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 8000); return () => clearInterval(id); }, [refresh]);

  const action = async (id: string, act: 'start'|'stop'|'restart') => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    setActing(p => ({...p, [id]: true}));
    try {
      await fetch(`${API}/docker/containers/${id}/${act}`, { method: 'POST', headers: h });
      setTimeout(refresh, 1000);
    } finally { setActing(p => ({...p, [id]: false})); }
  };

  const fetchLogs = async (id: string) => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    if (logsFor === id) { setLogsFor(null); return; }
    setLogsFor(id); setLogsLoading(true); setLogs('');
    try {
      const r = await fetch(`${API}/docker/containers/${id}/logs?lines=150`, { headers: h });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || '(no logs)'); }
      else setLogs('Failed to fetch logs');
    } catch { setLogs('Error fetching logs'); }
    finally { setLogsLoading(false); }
  };

  const filtered = containers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.image.toLowerCase().includes(search.toLowerCase())
  );

  const unhealthyCount = containers.filter(c => c.health === 'unhealthy').length;
  const stoppedCount = containers.filter(c => c.state !== 'running').length;
  const runningCount = containers.filter(c => c.state === 'running').length;

  if (loading && containers.length === 0) return <div className="flex items-center justify-center h-64 text-gray-400">Loading containers...</div>;
  if (error) return <div className="flex items-center justify-center h-64 text-red-400">{error}</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Guest info */}
      {isGuest && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Docker</span> — live view of all containers running across the lab. Container management controls are available to signed-in users only.
        </div>
      )}
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block"/> {runningCount} running
        </span>
        {stoppedCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> {stoppedCount} stopped
          </span>
        )}
        {unhealthyCount > 0 && (
          <span className="flex items-center gap-1.5 text-red-500 font-medium">
            ⚠ {unhealthyCount} unhealthy
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter containers…"
            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"/>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="rounded"
          />
          Show stopped
        </label>
        <span className="text-sm text-gray-500">{filtered.length}</span>
        <button onClick={refresh} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><RefreshCw className="w-4 h-4"/></button>
      </div>

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.id} className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden ${
            c.health === 'unhealthy'
              ? 'border-red-300 dark:border-red-800'
              : 'border-gray-200 dark:border-gray-700'
          }`}>
            <div className="flex items-center gap-3 p-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${stateColor(c.state)}`}/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{c.name}</span>
                  <HealthBadge health={c.health} />
                </div>
                <div className="text-xs text-gray-500 truncate">{c.image}</div>
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
                {c.ports.slice(0,3).map(p=>(
                  <span key={p} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[11px]">{p}</span>
                ))}
                <span>{timeSince(c.created)}</span>
              </div>
              <div className="flex items-center gap-1">
                {!isGuest && (c.state === 'running' ? (
                  <>
                    <button onClick={()=>action(c.id,'restart')} disabled={acting[c.id]} title="Restart"
                      className="p-1.5 text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg disabled:opacity-50">
                      <RotateCcw className="w-3.5 h-3.5"/>
                    </button>
                    <button onClick={()=>action(c.id,'stop')} disabled={acting[c.id]} title="Stop"
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50">
                      <Square className="w-3.5 h-3.5"/>
                    </button>
                  </>
                ) : (
                  <button onClick={()=>action(c.id,'start')} disabled={acting[c.id]} title="Start"
                    className="p-1.5 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg disabled:opacity-50">
                    <Play className="w-3.5 h-3.5"/>
                  </button>
                ))}
                {!isGuest && (
                  <button onClick={()=>fetchLogs(c.id)} title="Logs"
                    className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                    {logsFor===c.id ? <ChevronUp className="w-3.5 h-3.5"/> : <Terminal className="w-3.5 h-3.5"/>}
                  </button>
                )}
              </div>
            </div>
            {logsFor===c.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-950 p-3">
                {logsLoading
                  ? <div className="text-gray-400 text-xs animate-pulse">Fetching logs…</div>
                  : <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">{logs}</pre>
                }
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
