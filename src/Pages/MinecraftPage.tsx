import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Users, AlertTriangle, FileText, Loader, Server, Wifi, WifiOff } from 'lucide-react';

const MC_API = 'http://192.168.50.10:8765';

type ServerStatus = {
  id: string;
  name: string;
  port: number;
  status: 'running' | 'starting' | 'stopped';
  players?: string[];
};

type Toast = { id: number; msg: string; ok: boolean };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: '#22c55e',
    starting: '#f59e0b',
    stopped: '#6b7280',
  };
  const labels: Record<string, string> = {
    running: 'Running',
    starting: 'Starting',
    stopped: 'Stopped',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
      background: colors[status] + '22', color: colors[status], border: `1px solid ${colors[status]}44`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[status], display: 'inline-block' }} />
      {labels[status] || status}
    </span>
  );
}

export default function MinecraftPage() {
  const [servers, setServers] = useState<Record<string, ServerStatus>>({});
  const [loading, setLoading] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logs, setLogs] = useState<Record<string, string[] | null>>({});
  const [errors, setErrors] = useState<Record<string, string[] | null>>({});
  const [activeLog, setActiveLog] = useState<string | null>(null);
  const [activeErrors, setActiveErrors] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${MC_API}/status`, { signal: AbortSignal.timeout(4000) });
      const data = await r.json();
      setServers(data);
      setApiDown(false);
      // also fetch per-server detail for player counts
      Object.keys(data).forEach(async (id) => {
        try {
          const detail = await fetch(`${MC_API}/status/${id}`, { signal: AbortSignal.timeout(4000) });
          const d = await detail.json();
          setServers(prev => ({ ...prev, [id]: { ...prev[id], players: d.players || [] } }));
        } catch { /* ignore */ }
      });
    } catch {
      setApiDown(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const action = useCallback(async (id: string, act: string) => {
    setLoading(l => ({ ...l, [`${id}_${act}`]: 'loading' }));
    try {
      const r = await fetch(`${MC_API}/${id}/${act}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      if (data.ok) {
        toast(`${act.charAt(0).toUpperCase() + act.slice(1)}ed ${id}`);
        setTimeout(fetchStatus, 3000);
      } else {
        toast(data.error || `${act} failed`, false);
      }
    } catch (e) {
      toast(`Request failed: ${e}`, false);
    } finally {
      setLoading(l => { const n = { ...l }; delete n[`${id}_${act}`]; return n; });
    }
  }, [toast, fetchStatus]);

  const fetchLogs = useCallback(async (id: string) => {
    setActiveLog(id);
    setActiveErrors(null);
    try {
      const r = await fetch(`${MC_API}/logs/${id}`, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      setLogs(l => ({ ...l, [id]: data.logs || [] }));
    } catch {
      setLogs(l => ({ ...l, [id]: ['Failed to fetch logs'] }));
    }
  }, []);

  const fetchErrors = useCallback(async (id: string) => {
    setActiveErrors(id);
    setActiveLog(null);
    try {
      const r = await fetch(`${MC_API}/errors/${id}`, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      setErrors(e => ({ ...e, [id]: data.errors || [] }));
    } catch {
      setErrors(e => ({ ...e, [id]: ['Failed to fetch errors'] }));
    }
  }, []);

  const serverList = Object.values(servers);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.ok ? '#16a34a' : '#dc2626', color: '#fff',
            padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'fadeIn .2s ease',
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Server size={20} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Minecraft Servers</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>S1 · XPS 8700 · 192.168.50.10</div>
        </div>
        {apiDown && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 12 }}>
            <WifiOff size={14} /> API offline
          </div>
        )}
        {!apiDown && serverList.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 12 }}>
            <Wifi size={14} /> API connected
          </div>
        )}
      </div>

      {/* Server Cards */}
      {apiDown && serverList.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          <WifiOff size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div>mc_manager API unreachable at {MC_API}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Make sure mc_manager.py is running on Server 1</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {serverList.map(srv => {
            const isLoading = (act: string) => !!loading[`${srv.id}_${act}`];
            return (
              <div key={srv.id} className="j-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{srv.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Port {srv.port}</div>
                  </div>
                  <StatusBadge status={srv.status} />
                </div>

                {/* Players */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  <Users size={14} />
                  {srv.players && srv.players.length > 0
                    ? <span style={{ color: 'var(--text)' }}>{srv.players.join(', ')}</span>
                    : <span>No players online</span>
                  }
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="j-btn j-btn-primary"
                    style={{ flex: 1, gap: 6, fontSize: 13 }}
                    disabled={srv.status !== 'stopped' || isLoading('start')}
                    onClick={() => action(srv.id, 'start')}
                  >
                    {isLoading('start') ? <Loader size={14} className="spin" /> : <Play size={14} />}
                    Start
                  </button>
                  <button
                    className="j-btn"
                    style={{ flex: 1, gap: 6, fontSize: 13 }}
                    disabled={srv.status === 'stopped' || isLoading('stop')}
                    onClick={() => action(srv.id, 'stop')}
                  >
                    {isLoading('stop') ? <Loader size={14} className="spin" /> : <Square size={14} />}
                    Stop
                  </button>
                  <button
                    className="j-btn"
                    style={{ flex: 1, gap: 6, fontSize: 13 }}
                    disabled={srv.status === 'stopped' || isLoading('restart')}
                    onClick={() => action(srv.id, 'restart')}
                  >
                    {isLoading('restart') ? <Loader size={14} className="spin" /> : <RotateCcw size={14} />}
                    Restart
                  </button>
                </div>

                {/* Log / Error buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="j-btn"
                    style={{ flex: 1, gap: 6, fontSize: 12 }}
                    onClick={() => activeLog === srv.id ? setActiveLog(null) : fetchLogs(srv.id)}
                  >
                    <FileText size={13} />
                    {activeLog === srv.id ? 'Hide Logs' : 'Logs'}
                  </button>
                  <button
                    className="j-btn"
                    style={{ flex: 1, gap: 6, fontSize: 12, color: activeErrors === srv.id ? '#ef4444' : undefined }}
                    onClick={() => activeErrors === srv.id ? setActiveErrors(null) : fetchErrors(srv.id)}
                  >
                    <AlertTriangle size={13} />
                    {activeErrors === srv.id ? 'Hide Errors' : 'Errors'}
                  </button>
                </div>

                {/* Log viewer */}
                {(activeLog === srv.id || activeErrors === srv.id) && (
                  <div style={{
                    background: 'var(--surface-2, rgba(0,0,0,0.3))', borderRadius: 8,
                    padding: 12, maxHeight: 300, overflowY: 'auto', fontSize: 11,
                    fontFamily: 'monospace', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)',
                    border: '1px solid var(--border)',
                  }}>
                    {activeLog === srv.id && (
                      logs[srv.id]
                        ? logs[srv.id]!.length > 0
                          ? logs[srv.id]!.map((line, i) => <div key={i}>{line}</div>)
                          : <div style={{ color: 'var(--text-muted)' }}>No log output</div>
                        : <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
                    )}
                    {activeErrors === srv.id && (
                      errors[srv.id]
                        ? errors[srv.id]!.length > 0
                          ? errors[srv.id]!.map((line, i) => <div key={i} style={{ color: '#fca5a5' }}>{line}</div>)
                          : <div style={{ color: '#22c55e' }}>No errors found</div>
                        : <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick status summary */}
      {serverList.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(['running', 'starting', 'stopped'] as const).map(s => {
            const count = serverList.filter(x => x.status === s).length;
            if (!count) return null;
            const colors = { running: '#22c55e', starting: '#f59e0b', stopped: '#6b7280' };
            return (
              <div key={s} style={{ fontSize: 12, color: colors[s] }}>
                {count} {s}
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Auto-refreshes every 15s
          </div>
        </div>
      )}
    </div>
  );
}
