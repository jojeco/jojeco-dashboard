import { useState, useEffect, useCallback } from 'react';
import { Power, RotateCcw, Wifi, RefreshCw, ShieldCheck, Database, Play, Square } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001';

const SERVERS = [
  { id: 'server1', label: 'Server 1', sub: 'i7-4790 · Windows · 192.168.50.10',  canWake: true,  warnRestart: false },
  { id: 'server2', label: 'Server 2', sub: 'Proxmox · i5-10505 · 192.168.50.11',  canWake: true,  warnRestart: true  },
  { id: 'server3', label: 'Server 3', sub: 'Ubuntu · i7-8750H · 192.168.50.12',  canWake: true,  warnRestart: false },
  { id: 'macmini', label: 'Mac Mini', sub: 'macOS · i5 · 192.168.50.30',         canWake: true,  warnRestart: false },
];

const TRIGGERS = [
  { id: 'health',   label: 'Run Health Check',    icon: ShieldCheck, desc: 'Check all service chains, restart any down containers' },
  { id: 'backup',   label: 'Run GDrive Backup',   icon: Database,    desc: 'Dump databases and sync to Google Drive now' },
  { id: 'snapshot', label: 'Run Update Check',    icon: RefreshCw,   desc: 'Pull latest images for safe containers, report critical updates' },
];

function useToken() {
  return localStorage.getItem('jojeco_token') || '';
}

function authFetch(url: string, opts: RequestInit = {}, token: string) {
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

type Toast = { id: number; msg: string; ok: boolean };

export default function ControlsPage() {
  const token = useToken();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<any[]>([]);
  const [containerSearch, setContainerSearch] = useState('');
  const [confirm, setConfirm] = useState<{ action: string; label: string; fn: () => void } | null>(null);
  const [containerFilter, setContainerFilter] = useState<'all' | 'running' | 'stopped'>('all');

  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const setLoad = (key: string, val: boolean) => setLoading(l => ({ ...l, [key]: val }));

  async function apiPost(path: string, label: string) {
    setLoad(label, true);
    try {
      const r = await authFetch(`${API}${path}`, { method: 'POST' }, token);
      const data = await r.json();
      if (r.ok) toast(data.message || 'Done', true);
      else toast(data.error || 'Failed', false);
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad(label, false);
    }
  }

  function withConfirm(action: string, label: string, fn: () => void) {
    setConfirm({ action, label, fn });
  }

  async function loadContainers() {
    try {
      const r = await authFetch(`${API}/api/controls/containers`, {}, token);
      if (r.ok) setContainers(await r.json());
    } catch {}
  }

  useEffect(() => { loadContainers(); }, []);

  const filteredContainers = containers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(containerSearch.toLowerCase());
    const matchFilter = containerFilter === 'all' ? true : containerFilter === 'running' ? c.running : !c.running;
    return matchSearch && matchFilter;
  });

  return (
    <div className="j-content" style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, letterSpacing: '-0.02em' }}>Controls</h1>
      <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 28 }}>Server power, container management, and manual triggers.</p>

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: t.ok ? 'var(--surface)' : 'var(--err-dim)',
            border: `1px solid ${t.ok ? 'var(--accent-border)' : 'rgba(239,68,68,0.30)'}`,
            color: t.ok ? 'var(--t1)' : 'var(--err)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: 320,
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="j-panel" style={{ padding: 24, maxWidth: 360, width: '90%' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Confirm: {confirm.action}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>{confirm.label}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="j-chip" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="j-chip" style={{ background: 'var(--err)', color: '#fff', border: 'none' }}
                onClick={() => { confirm.fn(); setConfirm(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Server Power Controls */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">Server Power</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {SERVERS.map(srv => (
            <div key={srv.id} className="j-panel" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{srv.label}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.4 }}>{srv.sub}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  disabled={loading[`restart-${srv.id}`]}
                  onClick={() => {
                    const go = () => apiPost(`/api/controls/server/${srv.id}/restart`, `restart-${srv.id}`);
                    srv.warnRestart
                      ? withConfirm('Restart Proxmox host', 'This will restart the entire Proxmox host and take CT 100 offline for ~60s.', go)
                      : go();
                  }}>
                  <RotateCcw size={13} /> {loading[`restart-${srv.id}`] ? '...' : 'Restart'}
                </button>
                <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--err)' }}
                  disabled={loading[`shutdown-${srv.id}`]}
                  onClick={() => withConfirm(`Shutdown ${srv.label}`, `Are you sure you want to shut down ${srv.label}?`,
                    () => apiPost(`/api/controls/server/${srv.id}/shutdown`, `shutdown-${srv.id}`))}>
                  <Power size={13} /> {loading[`shutdown-${srv.id}`] ? '...' : 'Shutdown'}
                </button>
                {srv.canWake && (
                  <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--accent)' }}
                    disabled={loading[`wake-${srv.id}`]}
                    onClick={() => apiPost(`/api/controls/server/${srv.id}/wake`, `wake-${srv.id}`)}>
                    <Wifi size={13} /> {loading[`wake-${srv.id}`] ? '...' : 'Wake'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Manual Triggers */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">Manual Triggers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {TRIGGERS.map(trig => {
            const Icon = trig.icon;
            return (
              <div key={trig.id} className="j-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{trig.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>{trig.desc}</div>
                <button className="j-chip" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  disabled={loading[`trigger-${trig.id}`]}
                  onClick={() => apiPost(`/api/controls/trigger/${trig.id}`, `trigger-${trig.id}`)}>
                  <Play size={12} /> {loading[`trigger-${trig.id}`] ? 'Triggered...' : 'Run now'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Container Controls */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <span className="j-panel-title">Containers ({filteredContainers.length})</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={containerFilter} onChange={e => setContainerFilter(e.target.value as any)}
              style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--t2)', borderRadius: 6, padding: '4px 8px' }}>
              <option value="all">All</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
            </select>
            <input placeholder="Search containers…" value={containerSearch} onChange={e => setContainerSearch(e.target.value)}
              style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--t1)', borderRadius: 6, padding: '4px 10px', width: 160 }} />
            <button className="j-chip" onClick={loadContainers} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredContainers.map(c => (
            <div key={c.name} className="j-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={`j-dot ${c.healthy === 'unhealthy' ? 'j-dot-err' : c.running ? 'j-dot-ok' : 'j-dot-warn'}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', fontFamily: "'Geist Mono', monospace" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  disabled={loading[`restart-c-${c.name}`]}
                  onClick={() => apiPost(`/api/controls/container/${c.name}/restart`, `restart-c-${c.name}`)}>
                  <RotateCcw size={10} /> Restart
                </button>
                {c.running ? (
                  <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--err)', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={loading[`stop-c-${c.name}`]}
                    onClick={() => withConfirm(`Stop ${c.name}`, `Stop container "${c.name}"?`,
                      () => apiPost(`/api/controls/container/${c.name}/stop`, `stop-c-${c.name}`))}>
                    <Square size={10} /> Stop
                  </button>
                ) : (
                  <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={loading[`start-c-${c.name}`]}
                    onClick={() => apiPost(`/api/controls/container/${c.name}/start`, `start-c-${c.name}`)}>
                    <Play size={10} /> Start
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
