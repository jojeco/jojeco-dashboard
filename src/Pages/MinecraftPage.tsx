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
          <h1 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1 }}>Minecraft</h1>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>Server 1 · 192.168.50.10</div>
        </div>
        {apiDown && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--err)', fontSize: 12, fontWeight: 500 }}>
            <WifiOff size={14} /> API offline
          </div>
        )}
        {!apiDown && serverList.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ok)', fontSize: 12, fontWeight: 500 }}>
            <Wifi size={14} /> Connected
          </div>
        )}
      </div>

      {/* Server Cards */}
      {apiDown && serverList.length === 0 ? (
        <div className="j-card" style={{ padding: 48, textAlign: 'center' }}>
          <WifiOff size={32} style={{ marginBottom: 12, opacity: 0.3, color: 'var(--t3)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 500 }}>mc_manager API unreachable</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>Make sure mc_manager.py is running on Server 1 (port 8765)</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {serverList.map(srv => {
            const isLoading = (act: string) => !!loading[`${srv.id}_${act}`];
            const btnBase: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t2)', cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 120ms' };
            return (
              <div key={srv.id} className="j-card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{srv.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, fontFamily: 'Geist Mono, monospace' }}>:{srv.port}</div>
                  </div>
                  <StatusBadge status={srv.status} />
                </div>

                {/* Players */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t3)', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <Users size={13} style={{ flexShrink: 0 }} />
                  {srv.players && srv.players.length > 0
                    ? <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{srv.players.join(', ')}</span>
                    : <span>No players online</span>
                  }
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btnBase, color: srv.status !== 'stopped' || isLoading('start') ? 'var(--t3)' : 'var(--ok)', borderColor: srv.status !== 'stopped' || isLoading('start') ? 'var(--line)' : 'rgba(16,185,129,0.3)', opacity: srv.status !== 'stopped' || isLoading('start') ? 0.5 : 1 }}
                    disabled={srv.status !== 'stopped' || isLoading('start')}
                    onClick={() => action(srv.id, 'start')}>
                    {isLoading('start') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
                    Start
                  </button>
                  <button style={{ ...btnBase, color: srv.status === 'stopped' || isLoading('stop') ? 'var(--t3)' : 'var(--err)', borderColor: srv.status === 'stopped' || isLoading('stop') ? 'var(--line)' : 'rgba(244,63,94,0.3)', opacity: srv.status === 'stopped' || isLoading('stop') ? 0.5 : 1 }}
                    disabled={srv.status === 'stopped' || isLoading('stop')}
                    onClick={() => action(srv.id, 'stop')}>
                    {isLoading('stop') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={13} />}
                    Stop
                  </button>
                  <button style={{ ...btnBase, color: srv.status === 'stopped' || isLoading('restart') ? 'var(--t3)' : 'var(--warn)', opacity: srv.status === 'stopped' || isLoading('restart') ? 0.5 : 1 }}
                    disabled={srv.status === 'stopped' || isLoading('restart')}
                    onClick={() => action(srv.id, 'restart')}>
                    {isLoading('restart') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={13} />}
                    Restart
                  </button>
                </div>

                {/* Log / Error buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btnBase, background: activeLog === srv.id ? 'var(--accent-dim)' : 'var(--raised)', borderColor: activeLog === srv.id ? 'var(--accent-border)' : 'var(--line)', color: activeLog === srv.id ? 'var(--accent)' : 'var(--t3)' }}
                    onClick={() => activeLog === srv.id ? setActiveLog(null) : fetchLogs(srv.id)}>
                    <FileText size={12} />
                    {activeLog === srv.id ? 'Hide Logs' : 'Logs'}
                  </button>
                  <button style={{ ...btnBase, background: activeErrors === srv.id ? 'rgba(244,63,94,0.08)' : 'var(--raised)', borderColor: activeErrors === srv.id ? 'rgba(244,63,94,0.3)' : 'var(--line)', color: activeErrors === srv.id ? 'var(--err)' : 'var(--t3)' }}
                    onClick={() => activeErrors === srv.id ? setActiveErrors(null) : fetchErrors(srv.id)}>
                    <AlertTriangle size={12} />
                    {activeErrors === srv.id ? 'Hide Errors' : 'Errors'}
                  </button>
                </div>

                {/* Log viewer */}
                {(activeLog === srv.id || activeErrors === srv.id) && (
                  <div style={{ background: 'var(--canvas)', borderRadius: 8, padding: 12, maxHeight: 280, overflowY: 'auto', fontSize: 11, fontFamily: 'Geist Mono, monospace', lineHeight: 1.6, color: 'var(--t2)', border: '1px solid var(--line)' }}>
                    {activeLog === srv.id && (
                      logs[srv.id]
                        ? logs[srv.id]!.length > 0
                          ? logs[srv.id]!.map((line, i) => <div key={i}>{line}</div>)
                          : <div style={{ color: 'var(--t3)' }}>No log output</div>
                        : <div style={{ color: 'var(--t3)' }}>Loading...</div>
                    )}
                    {activeErrors === srv.id && (
                      errors[srv.id]
                        ? errors[srv.id]!.length > 0
                          ? errors[srv.id]!.map((line, i) => <div key={i} style={{ color: 'var(--err)' }}>{line}</div>)
                          : <div style={{ color: 'var(--ok)' }}>No errors found</div>
                        : <div style={{ color: 'var(--t3)' }}>Loading...</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {serverList.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['running', 'starting', 'stopped'] as const).map(s => {
            const count = serverList.filter(x => x.status === s).length;
            if (!count) return null;
            const colors = { running: 'var(--ok)', starting: 'var(--warn)', stopped: 'var(--t3)' };
            return (
              <span key={s} style={{ fontSize: 11, color: colors[s], fontWeight: 600 }}>
                {count} {s}
              </span>
            );
          })}
          <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>Refreshes every 15s</span>
        </div>
      )}
    </div>
  );
}
