import { useState, useEffect, useCallback } from 'react';
import { Play, Square, RotateCcw, Terminal, RefreshCw, ChevronUp, ChevronDown, Search, Layers, Box } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

interface Container {
  id: string; name: string; image: string; status: string; state: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  ports: string[]; created: number;
  compose_project?: string;
}

function stateDot(state: string): string {
  if (state === 'running') return 'j-dot-ok';
  if (state === 'exited') return 'j-dot-err';
  if (state === 'paused') return 'j-dot-warn';
  return 'j-dot-off';
}

function HealthBadge({ health }: { health: Container['health'] }) {
  if (health === 'none') return null;
  const styles: Record<string, { bg: string; color: string }> = {
    healthy:   { bg: 'rgba(16,185,129,0.10)',  color: 'var(--ok)'   },
    unhealthy: { bg: 'rgba(244,63,94,0.10)',    color: 'var(--err)'  },
    starting:  { bg: 'rgba(245,158,11,0.10)',   color: 'var(--warn)' },
  };
  const s = styles[health] ?? { bg: 'var(--raised)', color: 'var(--t3)' };
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: s.bg, color: s.color }}>
      {health}
    </span>
  );
}

function timeSince(ts: number) {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type SortKey = 'name' | 'state' | 'created';

function sortContainers(list: Container[], key: SortKey): Container[] {
  return [...list].sort((a, b) => {
    if (key === 'state') {
      const order = { running: 0, paused: 1, exited: 2 };
      const oa = order[a.state as keyof typeof order] ?? 3;
      const ob = order[b.state as keyof typeof order] ?? 3;
      if (oa !== ob) return oa - ob;
    }
    if (key === 'created') return b.created - a.created;
    return a.name.localeCompare(b.name);
  });
}

function groupByStack(containers: Container[]): Record<string, Container[]> {
  const groups: Record<string, Container[]> = {};
  for (const c of containers) {
    const key = c.compose_project || '__standalone__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return groups;
}

interface ContainerRowProps {
  c: Container;
  isGuest: boolean;
  acting: Record<string, boolean>;
  logsFor: string | null;
  logs: string;
  logsLoading: boolean;
  onAction: (id: string, act: 'start' | 'stop' | 'restart') => void;
  onFetchLogs: (id: string) => void;
}

function ContainerRow({ c, isGuest, acting, logsFor, logs, logsLoading, onAction, onFetchLogs }: ContainerRowProps) {
  return (
    <div className="j-panel" style={{ overflow: 'hidden', borderColor: c.health === 'unhealthy' ? 'rgba(244,63,94,0.3)' : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
        <span className={`j-dot ${stateDot(c.state)}`} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, color: 'var(--t1)', fontSize: 13 }}>{c.name}</span>
            <HealthBadge health={c.health} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.image}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {c.ports.slice(0, 3).map(p => (
            <span key={p} style={{ padding: '2px 5px', background: 'var(--raised)', color: 'var(--t2)', borderRadius: 4, fontSize: 10, border: '1px solid var(--line)', fontFamily: 'Geist Mono, monospace' }}>{p}</span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{timeSince(c.created)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {!isGuest && (c.state === 'running' ? (
            <>
              <button onClick={() => onAction(c.id, 'restart')} disabled={acting[c.id]} title="Restart"
                style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', opacity: acting[c.id] ? 0.4 : 1 }}>
                <RotateCcw size={13} />
              </button>
              <button onClick={() => onAction(c.id, 'stop')} disabled={acting[c.id]} title="Stop"
                style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)', opacity: acting[c.id] ? 0.4 : 1 }}>
                <Square size={13} />
              </button>
            </>
          ) : (
            <button onClick={() => onAction(c.id, 'start')} disabled={acting[c.id]} title="Start"
              style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ok)', opacity: acting[c.id] ? 0.4 : 1 }}>
              <Play size={13} />
            </button>
          ))}
          {!isGuest && (
            <button onClick={() => onFetchLogs(c.id)} title="Logs"
              style={{ padding: 5, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
              {logsFor === c.id ? <ChevronUp size={13} /> : <Terminal size={13} />}
            </button>
          )}
        </div>
      </div>
      {logsFor === c.id && (
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--canvas)', padding: 12 }}>
          {logsLoading
            ? <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>Fetching logs…</div>
            : <pre style={{ fontSize: 11, color: '#4ade80', fontFamily: 'Geist Mono, monospace', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 256, lineHeight: 1.5, margin: 0 }}>{logs}</pre>
          }
        </div>
      )}
    </div>
  );
}

interface StackGroupProps {
  name: string;
  containers: Container[];
  isGuest: boolean;
  acting: Record<string, boolean>;
  logsFor: string | null;
  logs: string;
  logsLoading: boolean;
  sortKey: SortKey;
  onAction: (id: string, act: 'start' | 'stop' | 'restart') => void;
  onFetchLogs: (id: string) => void;
}

function StackGroup({ name, containers, isGuest, acting, logsFor, logs, logsLoading, sortKey, onAction, onFetchLogs }: StackGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const running = containers.filter(c => c.state === 'running').length;
  const unhealthy = containers.filter(c => c.health === 'unhealthy').length;
  const sorted = sortContainers(containers, sortKey);
  const isStandalone = name === '__standalone__';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={() => setCollapsed(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'background 120ms' }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
        {collapsed ? <ChevronDown size={12} style={{ color: 'var(--t3)' }} /> : <ChevronDown size={12} style={{ color: 'var(--t3)', transform: 'rotate(180deg)' }} />}
        {isStandalone
          ? <Box size={12} style={{ color: 'var(--t3)' }} />
          : <Layers size={12} style={{ color: 'var(--accent)' }} />
        }
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)' }}>
          {isStandalone ? 'Standalone' : name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {unhealthy > 0 && <span style={{ fontSize: 11, color: 'var(--err)', fontWeight: 600 }}>⚠ {unhealthy}</span>}
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{running}/{containers.length} running</span>
        </div>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8 }}>
          {sorted.map(c => (
            <ContainerRow key={c.id} c={c} isGuest={isGuest} acting={acting} logsFor={logsFor} logs={logs} logsLoading={logsLoading} onAction={onAction} onFetchLogs={onFetchLogs} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DockerPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [containers, setContainers] = useState<Container[]>(() => {
    try { const v = localStorage.getItem('cache_docker_containers'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [groupByCompose, setGroupByCompose] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('state');
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [acting, setActing] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/docker/containers?all=${showAll ? '1' : '0'}`, { headers: h });
      if (r.ok) {
        const d = await r.json();
        setContainers(d);
        localStorage.setItem('cache_docker_containers', JSON.stringify(d));
        setError(null);
      } else setError('Docker API error');
    } catch { setError('Cannot reach Docker socket'); }
    finally { setLoading(false); }
  }, [showAll]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 8000); return () => clearInterval(id); }, [refresh]);

  const action = async (id: string, act: 'start' | 'stop' | 'restart') => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    setActing(p => ({ ...p, [id]: true }));
    try {
      await fetch(`${API}/docker/containers/${id}/${act}`, { method: 'POST', headers: h });
      setTimeout(refresh, 1000);
    } finally { setActing(p => ({ ...p, [id]: false })); }
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
    c.image.toLowerCase().includes(search.toLowerCase()) ||
    (c.compose_project || '').toLowerCase().includes(search.toLowerCase())
  );

  const runningCount = containers.filter(c => c.state === 'running').length;
  const stoppedCount = containers.filter(c => c.state !== 'running').length;
  const unhealthyCount = containers.filter(c => c.health === 'unhealthy').length;
  const stackCount = new Set(containers.map(c => c.compose_project).filter(Boolean)).size;
  const imageCount = new Set(containers.map(c => c.image.split(':')[0])).size;

  if (loading && containers.length === 0) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: 'var(--t3)', fontSize: 13 }}>Loading containers...</div>;
  if (error) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: 'var(--err)', fontSize: 13 }}>{error}</div>;

  const groups = groupByStack(filtered);
  const stackNames = Object.keys(groups).sort((a, b) => {
    if (a === '__standalone__') return 1;
    if (b === '__standalone__') return -1;
    return a.localeCompare(b);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isGuest && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', fontSize: 12, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Docker</strong> — live view of all containers. Management controls available to signed-in users.
        </div>
      )}

      {/* Stats */}
      <div className="j-grid-4 stagger">
        {[
          { label: 'Running', val: runningCount, color: 'var(--ok)' },
          { label: 'Stopped', val: stoppedCount, color: stoppedCount > 0 ? 'var(--err)' : 'var(--t3)' },
          { label: 'Stacks', val: stackCount, color: 'var(--accent)' },
          { label: 'Images', val: imageCount, color: 'var(--t2)' },
        ].map(({ label, val, color }) => (
          <div key={label} className="j-panel" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 24, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {unhealthyCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)', color: 'var(--err)', fontSize: 12 }}>
          <span className="j-dot j-dot-err" />
          <span style={{ fontWeight: 600 }}>{unhealthyCount} unhealthy container{unhealthyCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search containers, images, stacks…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 120ms' }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-border)'}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--line)'}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)', marginRight: 2 }}>Sort:</span>
          {(['state', 'name', 'created'] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSortKey(k)}
              style={{ padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${sortKey === k ? 'var(--accent-border)' : 'var(--line)'}`,
                background: sortKey === k ? 'var(--accent-dim)' : 'var(--raised)',
                color: sortKey === k ? 'var(--accent)' : 'var(--t2)' }}>
              {k}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={groupByCompose} onChange={e => setGroupByCompose(e.target.checked)} />
          Group by stack
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Show stopped
        </label>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>{filtered.length}</span>
        <button onClick={refresh} style={{ padding: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Container list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groupByCompose ? (
          stackNames.map(name => (
            <StackGroup key={name} name={name} containers={groups[name]} isGuest={isGuest} acting={acting} logsFor={logsFor} logs={logs} logsLoading={logsLoading} sortKey={sortKey} onAction={action} onFetchLogs={fetchLogs} />
          ))
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortContainers(filtered, sortKey).map(c => (
              <ContainerRow key={c.id} c={c} isGuest={isGuest} acting={acting} logsFor={logsFor} logs={logs} logsLoading={logsLoading} onAction={action} onFetchLogs={fetchLogs} />
            ))}
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)' }}>
            <Box size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ fontSize: 13 }}>No containers found</p>
          </div>
        )}
      </div>
    </div>
  );
}
