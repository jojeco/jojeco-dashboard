import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Disk { label: string; used: number; size: number; percent: number }
interface Gpu  { name: string; temp: number | null; utilization: number | null; mem_percent: number | null }
interface Machine {
  id: string; name: string; host: string; role: string; os: string;
  always_on: boolean; gpu_label: string | null; online: boolean;
  cpu: number | null;
  mem: { used: number; total: number; percent: number } | null;
  disks: Disk[];
  gpu: Gpu | null;
  temp: number | null;
}
interface TempPoint { timestamp: number; cpu_temp: number | null; gpu_temp: number | null }
interface LabOverview {
  machines: Machine[];
  status: 'healthy' | 'degraded' | 'critical';
  issues: Array<{ severity: string; message: string }>;
  services: Record<string, boolean>;
}
interface OllamaNode {
  id: string; name: string; host: string; role: string; online: boolean;
  models: Array<{ name: string; size: number }>;
}
interface FleetData {
  nodes: OllamaNode[];
  litellm: { online: boolean; spend: number | null };
}
interface ActiveSession { id: string; active: Array<{ name: string; size_vram?: number }> }
interface DockerContainer { name: string; state: string; health: string; status: string }

function fmtBytes(bytes: number) {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + 'T';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + 'G';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(0) + 'M';
  return bytes + 'B';
}
function pctColor(pct: number, warn = 65, crit = 85) {
  if (pct >= crit) return 'var(--err)';
  if (pct >= warn) return 'var(--warn)';
  return 'var(--ok)';
}
function tempColor(t: number) {
  if (t > 85) return 'var(--err)';
  if (t > 70) return 'var(--warn)';
  return 'var(--t2)';
}
function machineCardClass(m: Machine) {
  if (!m.online) return 'j-card j-card-off';
  const pcts = [m.cpu, m.mem?.percent].filter(v => v != null) as number[];
  if (pcts.some(p => p >= 85)) return 'j-card j-card-warn';
  return 'j-card j-card-ok';
}

const MODEL_SPEED: Record<string, number> = {
  'gemma4:e4b': 125, 'gemma4:26b': 31.7, 'deepseek-r1:14b': 4.9,
  'qwen2.5:7b': 17, 'qwen2.5:14b': 8, 'llava:7b': 14,
};
function getSpeed(name: string) {
  if (MODEL_SPEED[name] != null) return MODEL_SPEED[name];
  const base = name.split(':')[0];
  return MODEL_SPEED[base] ?? null;
}
const NODE_SHORT: Record<string, string> = { 'Server 3': 'S3', 'MacBook M4': 'MBP', 'JoPc': 'JoPc' };

const QUICK_LINKS = [
  { label: 'Plex',      href: 'https://plex.jojeco.ca',      cat: 'Media',    icon: '🎥' },
  { label: 'Overseerr', href: 'https://seerr.jojeco.ca',     cat: 'Media',    icon: '🎬' },
  { label: 'Navidrome', href: 'https://navidrome.jojeco.ca', cat: 'Media',    icon: '🎵' },
  { label: 'Nextcloud', href: 'https://cloud.jojeco.ca',     cat: 'Files',    icon: '☁️' },
  { label: 'Paperless', href: 'http://192.168.50.13:8010',   cat: 'Files',    icon: '📄' },
  { label: 'qBit',      href: 'http://192.168.50.13:9091',   cat: 'Downloads',icon: '⬇️' },
  { label: 'Radarr',    href: 'http://192.168.50.13:7878',   cat: 'Downloads',icon: '🎞️' },
  { label: 'Sonarr',    href: 'http://192.168.50.13:8989',   cat: 'Downloads',icon: '📺' },
  { label: 'Prowlarr',  href: 'http://192.168.50.13:9696',   cat: 'Downloads',icon: '🔍' },
  { label: 'LibreChat', href: 'https://ai.jojeco.ca',        cat: 'AI',       icon: '🤖' },
  { label: 'LiteLLM',   href: 'http://192.168.50.13:4000/ui',cat: 'AI',       icon: '🧠' },
  { label: 'Grafana',   href: 'http://192.168.50.13:3002',   cat: 'Infra',    icon: '📊' },
  { label: 'Proxmox',   href: 'https://192.168.50.11:8006',  cat: 'Infra',    icon: '🖥️' },
  { label: 'Portainer', href: 'http://192.168.50.13:9000',   cat: 'Infra',    icon: '🐳' },
  { label: 'ntfy',      href: 'https://ntfy.jojeco.ca',      cat: 'Comms',    icon: '🔔' },
  { label: 'Vikunja',   href: 'http://192.168.50.13:3456',   cat: 'Tools',    icon: '✅' },
  { label: 'Actual',    href: 'http://192.168.50.13:5006',   cat: 'Tools',    icon: '💰' },
  { label: 'Tdarr',     href: 'http://192.168.50.13:8265',   cat: 'Infra',    icon: '⚙️' },
];

// ─── Ring Gauge ──────────────────────────────────────────────────────────────
function RingGauge({ pct, warn = 65, crit = 85, label, sublabel, size = 68 }: {
  pct: number; warn?: number; crit?: number; label: string; sublabel?: string; size?: number;
}) {
  const sw = 5;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = (clamped / 100) * circ;
  const color = pctColor(pct, warn, crit);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={sw}
            strokeDasharray={`${fill.toFixed(2)} ${(circ - fill).toFixed(2)}`}
            strokeLinecap="round"
            style={{ animation: 'ringFill 800ms cubic-bezier(0.16,1,0.3,1)', transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1), stroke 400ms' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.195, fontFamily: 'Geist Mono, monospace', fontWeight: 700, lineHeight: 1, color: 'var(--t1)' }}>
            {Math.round(clamped)}
          </span>
          <span style={{ fontSize: size * 0.14, color: 'var(--t3)', lineHeight: 1, marginTop: 1 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.04em' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

// ─── TempSparkline ───────────────────────────────────────────────────────────
function TempSparkline({ history }: { history: TempPoint[] }) {
  if (!history || history.length < 2) return <div style={{ fontSize: 10, color: 'var(--t3)' }}>No history</div>;
  const W = 280, H = 40;
  const cpu = history.map(p => p.cpu_temp).filter(Boolean) as number[];
  const gpu = history.map(p => p.gpu_temp).filter(Boolean) as number[];
  const all = [...cpu, ...gpu];
  if (!all.length) return null;
  const minV = Math.max(0, Math.min(...all) - 5);
  const maxV = Math.max(...all) + 5;
  const n = history.length;
  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / (maxV - minV)) * H;
  const pts = (arr: (number|null)[]) => arr.map((v, i) => v ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null).filter(Boolean).join(' ');
  const diffH = (Date.now() - history[0].timestamp) / 3600000;
  const ago = diffH < 1 ? `${Math.round(diffH * 60)}m` : `${diffH.toFixed(0)}h`;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--t3)', marginBottom: 4 }}>
        <span>{ago} ago</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {cpu.length > 0 && <span style={{ color: '#60a5fa' }}>CPU {cpu[cpu.length-1]?.toFixed(0)}°</span>}
          {gpu.length > 0 && <span style={{ color: '#fb923c' }}>GPU {gpu[gpu.length-1]?.toFixed(0)}°</span>}
        </span>
        <span>now</span>
      </div>
      <svg width={W} height={H} style={{ width: '100%', overflow: 'visible' }}>
        {maxV > 80 && <rect x={0} y={toY(80)} width={W} height={H - toY(80)} fill="rgba(239,68,68,0.05)" />}
        {cpu.length > 1 && <polyline points={pts(history.map(p => p.cpu_temp))} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" />}
        {gpu.length > 1 && <polyline points={pts(history.map(p => p.gpu_temp))} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round" />}
        {cpu.length > 0 && <circle cx={toX(n-1)} cy={toY(cpu[cpu.length-1])} r="2.5" fill="#60a5fa" />}
        {gpu.length > 0 && <circle cx={toX(n-1)} cy={toY(gpu[gpu.length-1])} r="2.5" fill="#fb923c" />}
      </svg>
    </div>
  );
}

// ─── Machine Card (ring gauge layout) ────────────────────────────────────────
function MachineCard({ m, history, isMobile }: { m: Machine; history: TempPoint[]; isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const totalDisk = (m.disks ?? []).reduce((s, d) => s + d.size, 0);
  const usedDisk  = (m.disks ?? []).reduce((s, d) => s + d.used, 0);
  const diskPct   = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;
  const isIntegrated = (n: string) => /intel|uhd|iris/i.test(n);

  return (
    <div className={machineCardClass(m)} style={{ opacity: m.online ? 1 : 0.5, animation: 'fadeUp 350ms cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span className={`j-dot ${m.online ? 'j-dot-ok' : 'j-dot-off'}`}
              style={m.online ? { animation: 'pulseDot 2.5s ease-in-out infinite' } : {}} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>{m.name}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', paddingLeft: 15 }}>{m.role}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', paddingLeft: 15, fontFamily: 'Geist Mono, monospace', marginTop: 1 }}>{m.host}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {m.temp != null && m.online && (
            <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: tempColor(m.temp), background: 'var(--raised-2)', padding: '3px 7px', borderRadius: 6 }}>
              CPU {m.temp.toFixed(0)}°
            </span>
          )}
          {m.gpu?.temp != null && m.online && !isIntegrated(m.gpu.name ?? '') && (
            <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: tempColor(m.gpu.temp), background: 'var(--raised-2)', padding: '3px 7px', borderRadius: 6 }}>
              GPU {m.gpu.temp}°
            </span>
          )}
          {!m.online && <span className="j-chip">Offline</span>}
          {m.online && (
            <button onClick={() => setOpen(o => !o)}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Ring gauges row */}
      {m.online && (
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 16px 16px', gap: 8 }}>
          {m.cpu != null && (
            <RingGauge pct={m.cpu} label="CPU" size={isMobile ? 60 : 68} />
          )}
          {m.mem && (
            <RingGauge pct={m.mem.percent} label="RAM" sublabel={fmtBytes(m.mem.total)} size={isMobile ? 60 : 68} />
          )}
          {totalDisk > 0 && (
            <RingGauge pct={diskPct} label="Disk" sublabel={fmtBytes(totalDisk)} warn={75} crit={90} size={isMobile ? 60 : 68} />
          )}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && m.gpu.utilization != null && (
            <RingGauge pct={m.gpu.utilization} label="GPU" warn={80} crit={95} size={isMobile ? 60 : 68} />
          )}
        </div>
      )}

      {/* Expanded detail */}
      {open && m.online && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {m.disks.length > 1 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Drives</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {m.disks.map(d => (
                  <div key={d.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: 'var(--t2)' }}>{d.label}</span>
                      <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 700, color: pctColor(d.percent, 75, 90) }}>{d.percent.toFixed(0)}%</span>
                    </div>
                    <div className="j-bar-track"><div className="j-bar-fill" style={{ width: `${d.percent}%`, background: pctColor(d.percent, 75, 90) }} /></div>
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2, fontFamily: 'Geist Mono, monospace' }}>{fmtBytes(d.used)} / {fmtBytes(d.size)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>GPU · {m.gpu.name}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {m.gpu.mem_percent != null && <RingGauge pct={m.gpu.mem_percent} label="VRAM" warn={80} crit={95} size={56} />}
                {m.gpu.temp != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 24, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: tempColor(m.gpu.temp) }}>{m.gpu.temp}°</span>
                    <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Temp</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Temperature (24h)</div>
            <TempSparkline history={history} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Node Card ─────────────────────────────────────────────────────────────
function AINodeCard({ node, sessions }: { node: OllamaNode; sessions: ActiveSession[] }) {
  const active = sessions.find(s => s.id === node.id)?.active ?? [];
  const inUse = active.length > 0;
  const sorted = [...node.models].sort((a, b) => {
    if (a.name.startsWith('jojeco-') !== b.name.startsWith('jojeco-'))
      return a.name.startsWith('jojeco-') ? -1 : 1;
    return b.size - a.size;
  });
  return (
    <div className="j-card" style={{ opacity: node.online ? 1 : 0.5, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span className="j-dot"
              style={!node.online ? { background: 'var(--t3)' }
                : inUse ? { background: '#60a5fa', boxShadow: '0 0 0 2px rgba(96,165,250,0.15)', animation: 'pulseDot 2s ease-in-out infinite' }
                : { background: 'var(--ok)', boxShadow: '0 0 0 2px var(--ok-dim)', animation: 'pulseDot 2.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{node.name}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t2)', paddingLeft: 15 }}>{node.role}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {node.online && (
            <div style={{ fontSize: 28, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--ok)', lineHeight: 1 }}>
              {node.models.length}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {node.online ? 'models' : 'offline'}
          </div>
        </div>
      </div>
      {node.online && sorted.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sorted.slice(0, 4).map(m => {
            const tps = getSpeed(m.name);
            return (
              <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: m.name.startsWith('jojeco-') ? 'var(--accent)' : 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.name}</span>
                {tps != null && <span style={{ fontSize: 9, fontFamily: 'Geist Mono, monospace', color: tps >= 80 ? 'var(--ok)' : tps >= 20 ? 'var(--warn)' : '#f97316', flexShrink: 0, marginLeft: 6 }}>{tps}t/s</span>}
              </div>
            );
          })}
          {sorted.length > 4 && <span style={{ fontSize: 9, color: 'var(--t3)', paddingTop: 2 }}>+{sorted.length - 4} more</span>}
        </div>
      )}
      {inUse && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', animation: 'pulseDot 1.5s ease-in-out infinite', display: 'inline-block' }} />
          {active.map(m => m.name.split(':')[0]).join(', ')} running
        </div>
      )}
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────
function rc<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function wc(k: string, v: unknown)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ─── LabPage ──────────────────────────────────────────────────────────────────
export default function LabPage() {
  const [data, setData]       = useState<LabOverview | null>(() => rc('cache_lab_overview'));
  const [fleet, setFleet]     = useState<FleetData | null>(() => rc('cache_lab_fleet'));
  const [docker, setDocker]   = useState<{ running: number; stopped: number; unhealthy: number } | null>(() => rc('cache_lab_docker_summary'));
  const [, setCont] = useState<DockerContainer[]>(() => rc<DockerContainer[]>('cache_lab_containers') ?? []);
  const [history, setHistory] = useState<Record<string, TempPoint[]>>({});
  const [sessions, setSess]   = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(() => !rc('cache_lab_overview'));
  const [lastRefresh, setLR]  = useState(new Date());
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${getToken()}` };
    isMobileRef.current = window.innerWidth < 768;
    const hrs = isMobileRef.current ? '3' : '24';

    const [a, b, c, d, e] = await Promise.allSettled([
      fetch('/api/lab/overview',    { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/ops/fleet',       { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/docker/containers?all=1', { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`/api/lab/temps/history?hours=${hrs}`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/lab/ollama/ps',   { headers: h }).then(r => r.ok ? r.json() : null),
    ]);

    if (a.status === 'fulfilled' && a.value) { setData(a.value); wc('cache_lab_overview', a.value); }
    if (b.status === 'fulfilled' && b.value) { setFleet(b.value); wc('cache_lab_fleet', b.value); }
    if (c.status === 'fulfilled' && Array.isArray(c.value)) {
      const arr = c.value as DockerContainer[];
      setCont(arr); wc('cache_lab_containers', arr);
      setDocker({ running: arr.filter(x => x.state === 'running').length, stopped: arr.filter(x => x.state !== 'running').length, unhealthy: arr.filter(x => x.health === 'unhealthy').length });
      wc('cache_lab_docker_summary', { running: arr.filter(x => x.state === 'running').length, stopped: arr.filter(x => x.state !== 'running').length, unhealthy: arr.filter(x => x.health === 'unhealthy').length });
    }
    if (d.status === 'fulfilled' && d.value) setHistory(d.value);
    if (e.status === 'fulfilled' && Array.isArray(e.value)) setSess(e.value);
    setLR(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 10000); return () => clearInterval(id); }, [fetchAll]);

  useAuth();
  const ORDER = ['server1','server2','server3','macmini'];
  const alwaysOn = (data?.machines.filter(m => m.always_on) ?? []).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const burst    = data?.machines.filter(m => !m.always_on) ?? [];
  const isMobile = isMobileRef.current;

  // Status pill
  const statusLabel = { healthy: '● Healthy', degraded: '⚠ Degraded', critical: '✕ Critical' };
  const statusColor = { healthy: 'var(--ok)', degraded: 'var(--warn)', critical: 'var(--err)' };
  const svcLabels: Record<string, string> = { plex: 'Plex', adguard: 'AdGuard', ollama: 'Ollama', prometheus: 'Prom', tailscale: 'Tail' };

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1 }}>Lab Overview</h1>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 5 }}>JojeCo Home Lab · {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        </div>
        <button onClick={fetchAll}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t3)', fontSize: 11, fontWeight: 500, transition: 'all 120ms' }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--t1)'; b.style.borderColor = 'var(--line-2)'; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--t3)'; b.style.borderColor = 'var(--line)'; }}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          {lastRefresh.toLocaleTimeString()}
        </button>
      </div>

      {/* ── Hero stat row ── */}
      <div className="j-grid-4 stagger" style={{ marginBottom: 24 }}>
        {/* Health */}
        <div className="j-stat-tile">
          <div className="j-panel-title" style={{ marginBottom: 8 }}>Status</div>
          {data ? (
            <>
              <div className="j-stat-num" style={{ fontSize: 20, color: statusColor[data.status] }}>
                {statusLabel[data.status]}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {Object.entries(data.services).map(([id, up]) => (
                  <span key={id} className={`j-chip ${up ? 'j-chip-ok' : 'j-chip-err'}`}>{svcLabels[id] ?? id}</span>
                ))}
              </div>
              {data.issues.filter(i => i.severity === 'critical').map((iss, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--err)', marginTop: 6, display: 'flex', gap: 5 }}>
                  <span className="j-dot j-dot-err" style={{ marginTop: 3 }} />
                  {iss.message}
                </div>
              ))}
            </>
          ) : <div className="j-skeleton" style={{ height: 24, width: 80 }} />}
        </div>

        {/* Docker */}
        <a href="/docker" className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 4, transition: 'box-shadow 150ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px var(--accent-border), 0 8px 24px rgba(0,0,0,0.5)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.35)'; }}>
          <div className="j-panel-title">Containers</div>
          {docker ? (
            <>
              <div className="j-stat-num" style={{ color: 'var(--ok)' }}>{docker.running}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>running</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                {docker.stopped > 0 ? <span className="j-chip j-chip-warn">{docker.stopped} stopped</span> : <span style={{ fontSize: 10, color: 'var(--t3)' }}>all running</span>}
                {docker.unhealthy > 0 && <span className="j-chip j-chip-err">{docker.unhealthy} unhealthy</span>}
              </div>
            </>
          ) : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </a>

        {/* AI Nodes */}
        <div className="j-stat-tile">
          <div className="j-panel-title">AI Fleet</div>
          {fleet ? (() => {
            const online = fleet.nodes.filter(n => n.online).length;
            const total  = fleet.nodes.length;
            const models = new Set(fleet.nodes.flatMap(n => n.models.map(m => m.name))).size;
            return (
              <>
                <div className="j-stat-num" style={{ color: online === total ? 'var(--ok)' : online > 0 ? 'var(--warn)' : 'var(--err)' }}>
                  {online}<span style={{ fontSize: 20, color: 'var(--t3)', fontWeight: 300 }}>/{total}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>nodes online</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {fleet.nodes.map(n => (
                    <span key={n.id} className={`j-chip ${n.online ? 'j-chip-ok' : ''}`} style={!n.online ? { color: 'var(--t3)' } : {}}>
                      {NODE_SHORT[n.name] ?? n.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6, fontFamily: 'Geist Mono, monospace' }}>{models} models</div>
              </>
            );
          })() : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </div>

        {/* LiteLLM spend */}
        <div className="j-stat-tile">
          <div className="j-panel-title">Gateway</div>
          {fleet ? (
            <>
              <div className="j-stat-num" style={{ color: fleet.litellm.online ? 'var(--ok)' : 'var(--err)', fontSize: 32 }}>
                {fleet.litellm.online ? 'Up' : 'Down'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>LiteLLM</div>
              {fleet.litellm.spend != null && (
                <div style={{ fontSize: 18, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t2)', marginTop: 10 }}>
                  ${fleet.litellm.spend.toFixed(4)}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>spent</span>
                </div>
              )}
            </>
          ) : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </div>
      </div>

      {/* ── Hardware + AI side by side ── */}
      <div className="j-grid-half" style={{ marginBottom: 28 }}>
        {/* Servers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {alwaysOn.length > 0 && (
            <div>
              <div className="j-section-label">Always-On</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
                {alwaysOn.map(m => <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} />)}
              </div>
            </div>
          )}
          {(burst.length > 0 || loading) && (
            <div>
              <div className="j-section-label">Burst Nodes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
                {burst.length > 0
                  ? burst.map(m => <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} />)
                  : loading ? [1, 2].map(i => <div key={i} className="j-skeleton" style={{ height: 140 }} />) : null}
              </div>
            </div>
          )}
          {loading && alwaysOn.length === 0 && (
            <>
              <div className="j-section-label">Always-On</div>
              {[1,2,3].map(i => <div key={i} className="j-skeleton" style={{ height: 160, borderRadius: 14, marginBottom: 8 }} />)}
            </>
          )}
        </div>

        {/* AI Fleet */}
        <div>
          {(fleet || loading) && (
            <>
              <div className="j-section-label">Inference Fleet</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
                {fleet
                  ? fleet.nodes.map(n => <AINodeCard key={n.id} node={n} sessions={sessions} />)
                  : [1,2,3,4].map(i => <div key={i} className="j-skeleton" style={{ height: 120, borderRadius: 14 }} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Quick Links (app tile grid) ── */}
      <div>
        <div className="j-section-label">Quick Access</div>
        <div className="j-grid-auto">
          {QUICK_LINKS.map(link => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="j-app-tile">
              <span className="j-app-tile-icon">{link.icon}</span>
              <span className="j-app-tile-label">{link.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
