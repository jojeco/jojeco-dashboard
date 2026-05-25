import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Bell, CheckCircle, AlertTriangle, XCircle, Shield, HardDrive, Activity, X, Sword } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Disk { label: string; used: number; size: number; percent: number }
interface Gpu  { name: string; temp: number | null; utilization: number | null; mem_percent: number | null; nvenc_util: number | null }
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
interface Process { pid: number; name: string; cpu: number; mem: number }
interface ProcessList { machine_id: string; processes: Process[] }
interface LabOverview {
  machines: Machine[];
  status: 'healthy' | 'degraded' | 'critical';
  issues: Array<{ severity: string; message: string }>;
  services: Record<string, boolean>;
  lvmThinPool: number | null;
  claudeRunning: boolean | null;
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
interface NtfyAlert { id: string; time: number; title: string | null; message: string; priority: number; tags: string[] }
interface AutomationJob { id: string; label: string; schedule: string; status: string; lastRun: string | null; lastLines: string[] }
interface AdGuardStats { totalQueries: number; blockedQueries: number; blockedPercent: string; avgProcessingTime: string | null }
interface BackupStatus { lastRun: string | null; status: 'ok' | 'error' | 'unknown' | 'never'; message: string }
interface HealthSummary { up: number; down: number; total: number; overallStatus: 'healthy' | 'degraded' | 'critical' }
interface ServiceHealth { id: string; name: string; status: 'online' | 'offline' | 'unknown'; url?: string; response_time?: number; last_checked?: number }
interface McServer { id: string; name: string; port: number; status: 'running' | 'starting' | 'stopped'; players?: string[] }

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
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
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

// ─── Machine Card ─────────────────────────────────────────────────────────────
function MachineCard({ m, history, isMobile, processes, onExpand }: {
  m: Machine; history: TempPoint[]; isMobile: boolean;
  processes: Process[]; onExpand: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalDisk = (m.disks ?? []).reduce((s, d) => s + d.size, 0);
  const usedDisk  = (m.disks ?? []).reduce((s, d) => s + d.used, 0);
  const diskPct   = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;
  const isIntegrated = (n: string) => /intel|uhd|iris/i.test(n);

  return (
    <div className={machineCardClass(m)} style={{ opacity: m.online ? 1 : 0.5, animation: 'fadeUp 350ms cubic-bezier(0.16,1,0.3,1) both' }}>
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
            <button onClick={() => { const next = !open; setOpen(next); if (next) onExpand(m.id); }}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
      </div>

      {m.online && (
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 16px 16px', gap: 8 }}>
          {m.cpu != null && <RingGauge pct={m.cpu} label="CPU" size={isMobile ? 60 : 68} />}
          {m.mem && <RingGauge pct={m.mem.percent} label="RAM" sublabel={fmtBytes(m.mem.total)} size={isMobile ? 60 : 68} />}
          {totalDisk > 0 && <RingGauge pct={diskPct} label="Disk" sublabel={fmtBytes(totalDisk)} warn={75} crit={90} size={isMobile ? 60 : 68} />}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && m.gpu.utilization != null && (
            <RingGauge pct={m.gpu.utilization} label="GPU" warn={80} crit={95} size={isMobile ? 60 : 68} />
          )}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && m.gpu.nvenc_util != null && (
            <RingGauge pct={m.gpu.nvenc_util} label="NVENC" warn={70} crit={90} size={isMobile ? 60 : 68} />
          )}
        </div>
      )}

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
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {m.gpu.mem_percent != null && <RingGauge pct={m.gpu.mem_percent} label="VRAM" warn={80} crit={95} size={56} />}
                {m.gpu.utilization != null && <RingGauge pct={m.gpu.utilization} label="3D" warn={80} crit={95} size={56} />}
                {m.gpu.nvenc_util != null && <RingGauge pct={m.gpu.nvenc_util} label="NVENC" warn={70} crit={90} size={56} />}
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
          {processes && processes.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Top Processes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', gap: 4, fontSize: 9, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 4, borderBottom: '1px solid var(--line)' }}>
                  <span>Process</span><span style={{ textAlign: 'right' }}>CPU%</span><span style={{ textAlign: 'right' }}>MEM%</span>
                </div>
                {processes.slice(0, 8).map(p => (
                  <div key={p.pid} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', gap: 4, fontSize: 10 }}>
                    <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ fontFamily: 'Geist Mono, monospace', textAlign: 'right', color: p.cpu > 20 ? 'var(--warn)' : 'var(--t2)' }}>{p.cpu.toFixed(1)}</span>
                    <span style={{ fontFamily: 'Geist Mono, monospace', textAlign: 'right', color: p.mem > 20 ? 'var(--warn)' : 'var(--t2)' }}>{p.mem.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

// ─── Service Health Slide-Out Panel ──────────────────────────────────────────
function ServiceHealthPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/health/services', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const raw = d;
        if (Array.isArray(raw.services)) setServices(raw.services);
        else setServices(Object.values(raw as Record<string, ServiceHealth>));
      })
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, animation: 'fadeIn 150ms ease' }}
        />
      )}
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 360,
        background: 'var(--raised)', borderLeft: '1px solid var(--line)', zIndex: 201,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.16,1,0.3,1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Service Health</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{services.length} services tracked</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--canvas)', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '12px 20px', flex: 1 }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4,5,6].map(i => <div key={i} className="j-skeleton" style={{ height: 44, borderRadius: 8 }} />)}
            </div>
          )}
          {!loading && services.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--t3)', paddingTop: 16 }}>No service data</div>
          )}
          {!loading && services.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...services].sort((a, b) => {
                if (a.status === 'offline' && b.status !== 'offline') return -1;
                if (b.status === 'offline' && a.status !== 'offline') return 1;
                return (a.name || a.id).localeCompare(b.name || b.id);
              }).map(svc => {
                const isUp = svc.status === 'online';
                const isOff = svc.status === 'offline';
                const ago = svc.last_checked ? Math.floor((Date.now() - svc.last_checked) / 60000) : null;
                return (
                  <div key={svc.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 8, background: 'var(--canvas)',
                    border: `1px solid ${isOff ? 'rgba(244,63,94,0.2)' : 'var(--line)'}`,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: isUp ? 'var(--ok)' : isOff ? 'var(--err)' : 'var(--t3)',
                      boxShadow: isUp ? '0 0 0 2px var(--ok-dim)' : isOff ? '0 0 0 2px rgba(244,63,94,0.15)' : undefined,
                      animation: isUp ? 'pulseDot 2.5s ease-in-out infinite' : undefined,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {svc.name || svc.id}
                      </div>
                      {svc.url && <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{svc.url}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--ok)' : isOff ? 'var(--err)' : 'var(--t3)' }}>
                        {isUp ? 'Up' : isOff ? 'Down' : '?'}
                      </div>
                      {svc.response_time && <div style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>{svc.response_time}ms</div>}
                      {ago !== null && <div style={{ fontSize: 9, color: 'var(--t3)' }}>{ago}m ago</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Minecraft Mini-Card ─────────────────────────────────────────────────────
function MinecraftMiniCard() {
  const [servers, setServers] = useState<McServer[]>([]);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/minecraft/status', {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) { setApiDown(true); return; }
        const data = await r.json();
        setServers(Object.values(data as Record<string, McServer>));
        setApiDown(false);
      } catch {
        setApiDown(true);
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const running = servers.filter(s => s.status === 'running');
  const totalPlayers = running.reduce((s, sv) => s + (sv.players?.length ?? 0), 0);

  return (
    <Link to="/minecraft" className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', transition: 'box-shadow 150ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px var(--accent-border), 0 8px 24px rgba(0,0,0,0.5)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.35)'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sword size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="j-panel-title">Minecraft</span>
      </div>
      {apiDown ? (
        <>
          <div className="j-stat-num" style={{ color: 'var(--t3)', fontSize: 20 }}>—</div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>API unreachable</div>
        </>
      ) : servers.length === 0 ? (
        <div className="j-skeleton" style={{ height: 36 }} />
      ) : (
        <>
          <div className="j-stat-num" style={{ color: running.length > 0 ? 'var(--ok)' : 'var(--t3)', fontSize: 28 }}>
            {running.length}<span style={{ fontSize: 16, color: 'var(--t3)', fontWeight: 300 }}>/{servers.length}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>servers up</div>
          {totalPlayers > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--ok)', fontWeight: 600 }}>{totalPlayers} online</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {servers.map(s => (
              <span key={s.id} className={`j-chip ${s.status === 'running' ? 'j-chip-ok' : ''}`} style={s.status !== 'running' ? { color: 'var(--t3)' } : {}}>
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}
    </Link>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────
function rc<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function wc(k: string, v: unknown)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ─── LAN/WAN detection ───────────────────────────────────────────────────────
function isLan(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.');
}
const POLL_MS = isLan() ? 5000 : 20000;

// ─── LabPage ──────────────────────────────────────────────────────────────────
export default function LabPage() {
  const [data, setData]       = useState<LabOverview | null>(() => rc('cache_lab_overview'));
  const [fleet, setFleet]     = useState<FleetData | null>(() => rc('cache_lab_fleet'));
  const [docker, setDocker]   = useState<{ running: number; stopped: number; unhealthy: number } | null>(() => rc('cache_lab_docker_summary'));
  const [, setCont] = useState<DockerContainer[]>(() => rc<DockerContainer[]>('cache_lab_containers') ?? []);
  const [history, setHistory] = useState<Record<string, TempPoint[]>>({});
  const [sessions, setSess]   = useState<ActiveSession[]>([]);
  const [alerts, setAlerts]   = useState<NtfyAlert[]>(() => rc<NtfyAlert[]>('cache_lab_alerts') ?? []);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [automation, setAutomation] = useState<AutomationJob[]>([]);
  const [adguard, setAdguard] = useState<AdGuardStats | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(() => !rc('cache_lab_overview'));
  const [lastRefresh, setLR]  = useState(new Date());
  const [processes, setProcesses] = useState<Record<string, Process[]>>({});
  const [showHealthPanel, setShowHealthPanel] = useState(false);
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${getToken()}` };
    isMobileRef.current = window.innerWidth < 768;
    const hrs = isMobileRef.current ? '3' : '24';

    function af(url: string) {
      return fetch(url, { headers: h }).then(r => {
        if (r.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; }
        return r.ok ? r.json() : null;
      });
    }

    const [a, b, c, d, e, f, g, ag, bk, hs] = await Promise.allSettled([
      af('/api/lab/overview'),
      af('/api/ops/fleet'),
      af('/api/docker/containers?all=1'),
      af(`/api/lab/temps/history?hours=${hrs}`),
      af('/api/lab/ollama/ps'),
      af('/api/alerts/recent?limit=10'),
      af('/api/automation/status'),
      af('/api/adguard/stats'),
      af('/api/backup-status'),
      af('/api/health/services'),
    ]);

    if (a.status === 'fulfilled' && a.value) { setData(a.value); wc('cache_lab_overview', a.value); }
    if (b.status === 'fulfilled' && b.value) { setFleet(b.value); wc('cache_lab_fleet', b.value); }
    if (c.status === 'fulfilled' && Array.isArray(c.value)) {
      const arr = c.value as DockerContainer[];
      setCont(arr); wc('cache_lab_containers', arr);
      const summary = { running: arr.filter(x => x.state === 'running').length, stopped: arr.filter(x => x.state !== 'running').length, unhealthy: arr.filter(x => x.health === 'unhealthy').length };
      setDocker(summary); wc('cache_lab_docker_summary', summary);
    }
    if (d.status === 'fulfilled' && d.value) setHistory(d.value);
    if (e.status === 'fulfilled' && Array.isArray(e.value)) setSess(e.value);
    if (f.status === 'fulfilled' && Array.isArray(f.value)) { setAlerts(f.value); wc('cache_lab_alerts', f.value); }
    if (g.status === 'fulfilled' && Array.isArray(g.value)) setAutomation(g.value);
    if (ag.status === 'fulfilled' && ag.value) setAdguard(ag.value);
    if (bk.status === 'fulfilled' && bk.value) setBackup(bk.value);
    if (hs.status === 'fulfilled' && hs.value) {
      const raw = hs.value;
      const svcs: Array<{ status: string }> = Array.isArray(raw.services)
        ? raw.services
        : Object.values(raw as Record<string, { status: string }>);
      const up = svcs.filter(s => s.status === 'online').length;
      const total = svcs.length;
      const down = total - up;
      const overallStatus = down === 0 ? 'healthy' : down < Math.ceil(total / 2) ? 'degraded' : 'critical';
      setHealthSummary({ up, down, total, overallStatus });
    }
    setLR(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, POLL_MS); return () => clearInterval(id); }, [fetchAll]);

  const fetchProcesses = useCallback(async (machineId: string) => {
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      const r = await fetch(`/api/lab/processes/${machineId}`, { headers: h });
      if (r.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; return; }
      if (r.ok) {
        const d: ProcessList = await r.json();
        setProcesses(prev => ({ ...prev, [machineId]: d.processes }));
      }
    } catch {}
  }, []);

  useAuth();
  const ORDER = ['server1','server2','server3','macmini'];
  const alwaysOn = (data?.machines.filter(m => m.always_on) ?? []).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const burst    = data?.machines.filter(m => !m.always_on) ?? [];
  const isMobile = isMobileRef.current;

  const statusLabel = { healthy: '● Healthy', degraded: '⚠ Degraded', critical: '✕ Critical' };
  const statusColor = { healthy: 'var(--ok)', degraded: 'var(--warn)', critical: 'var(--err)' };
  const svcLabels: Record<string, string> = { plex: 'Plex', adguard: 'AdGuard', ollama: 'Ollama', prometheus: 'Prom', tailscale: 'Tail' };

  return (
    <div>
      {/* ── Service Health Slide-Out ── */}
      <ServiceHealthPanel open={showHealthPanel} onClose={() => setShowHealthPanel(false)} />

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
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

      {/* ── Hero stat row — top summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>

        {/* Lab Status */}
        <div className="j-stat-tile">
          <div className="j-panel-title" style={{ marginBottom: 6 }}>Status</div>
          {data ? (
            <>
              <div className="j-stat-num" style={{ fontSize: 18, color: statusColor[data.status] }}>
                {statusLabel[data.status]}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }}>
                {Object.entries(data.services).map(([id, up]) => (
                  <span key={id} className={`j-chip ${up ? 'j-chip-ok' : 'j-chip-err'}`}>{svcLabels[id] ?? id}</span>
                ))}
              </div>
              {data.issues.filter(i => i.severity === 'critical').map((iss, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--err)', marginTop: 5, display: 'flex', gap: 4 }}>
                  <span className="j-dot j-dot-err" style={{ marginTop: 3, flexShrink: 0 }} />
                  {iss.message}
                </div>
              ))}
            </>
          ) : <div className="j-skeleton" style={{ height: 24, width: 80 }} />}
        </div>

        {/* Service Health — clickable, opens slide-out */}
        <button
          onClick={() => setShowHealthPanel(true)}
          className="j-stat-tile"
          style={{ textAlign: 'left', cursor: 'pointer', transition: 'box-shadow 150ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 1px var(--accent-border), 0 8px 24px rgba(0,0,0,0.5)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.35)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Activity size={12} style={{ color: healthSummary?.overallStatus === 'healthy' ? 'var(--ok)' : healthSummary?.overallStatus === 'critical' ? 'var(--err)' : 'var(--warn)', flexShrink: 0 }} />
            <span className="j-panel-title">Services</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>View all →</span>
          </div>
          {healthSummary ? (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <div>
                  <span style={{ fontSize: 28, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--ok)', lineHeight: 1 }}>{healthSummary.up}</span>
                  {healthSummary.down > 0 && <span style={{ fontSize: 18, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--err)', marginLeft: 8 }}>-{healthSummary.down}</span>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{healthSummary.total} tracked</div>
              <div style={{ background: 'var(--canvas)', borderRadius: 3, height: 3, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${healthSummary.total > 0 ? (healthSummary.up / healthSummary.total) * 100 : 0}%`, background: healthSummary.overallStatus === 'healthy' ? 'var(--ok)' : healthSummary.overallStatus === 'critical' ? 'var(--err)' : 'var(--warn)', transition: 'width 0.5s' }} />
              </div>
            </>
          ) : <div className="j-skeleton" style={{ height: 40 }} />}
        </button>

        {/* Containers — links to /services */}
        <Link to="/services" className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', transition: 'box-shadow 150ms' }}
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
        </Link>

        {/* AI Fleet */}
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

        {/* Gateway */}
        <div className="j-stat-tile">
          <div className="j-panel-title">Gateway</div>
          {fleet ? (
            <>
              <div className="j-stat-num" style={{ color: fleet.litellm.online ? 'var(--ok)' : 'var(--err)', fontSize: 28 }}>
                {fleet.litellm.online ? 'Up' : 'Down'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>LiteLLM</div>
              {fleet.litellm.spend != null && (
                <div style={{ fontSize: 16, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t2)', marginTop: 8 }}>
                  ${fleet.litellm.spend.toFixed(4)}
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>spent</span>
                </div>
              )}
            </>
          ) : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </div>

        {/* LVM Thin Pool */}
        <div className="j-stat-tile">
          <div className="j-panel-title">LVM Pool</div>
          {data?.lvmThinPool !== undefined ? (
            <>
              <div className="j-stat-num" style={{ color: (data.lvmThinPool ?? 0) > 85 ? 'var(--err)' : (data.lvmThinPool ?? 0) > 70 ? 'var(--warn)' : 'var(--ok)' }}>
                {data.lvmThinPool !== null ? `${data.lvmThinPool.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>pve/data</div>
              {data.lvmThinPool !== null && (
                <div style={{ marginTop: 8, background: 'var(--canvas)', borderRadius: 3, height: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(data.lvmThinPool, 100)}%`, background: (data.lvmThinPool > 85) ? 'var(--err)' : (data.lvmThinPool > 70) ? 'var(--warn)' : 'var(--ok)', transition: 'width 0.5s' }} />
                </div>
              )}
            </>
          ) : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </div>

        {/* Claude Agent */}
        <div className="j-stat-tile">
          <div className="j-panel-title">Agent</div>
          {data?.claudeRunning !== undefined ? (
            <>
              <div className="j-stat-num" style={{ fontSize: 18, color: data.claudeRunning === true ? 'var(--ok)' : data.claudeRunning === false ? 'var(--err)' : 'var(--t3)' }}>
                {data.claudeRunning === true ? 'Running' : data.claudeRunning === false ? 'Down' : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>jojeco-agent</div>
            </>
          ) : <div className="j-skeleton" style={{ height: 40, width: 60 }} />}
        </div>

        {/* Minecraft mini-card */}
        <MinecraftMiniCard />
      </div>

      {/* ── Alerts / Automation / AdGuard row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
        {/* Recent Alerts */}
        <div className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={13} style={{ color: 'var(--accent)' }} />
            <span className="j-panel-title">Recent Alerts</span>
            <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{alerts.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>No recent alerts</div>
            ) : alerts.slice(0, 8).map(a => {
              const ago = Math.floor((Date.now() / 1000 - a.time) / 60);
              const agoStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.floor(ago / 60)}h` : `${Math.floor(ago / 1440)}d`;
              const prioColor = a.priority >= 4 ? 'var(--err)' : a.priority >= 3 ? 'var(--warn)' : 'var(--t3)';
              const isExpanded = expandedAlert === a.id;
              return (
                <div key={a.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <div
                    onClick={() => setExpandedAlert(isExpanded ? null : a.id)}
                    style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.5, padding: '3px 0', cursor: 'pointer', alignItems: 'flex-start' }}
                  >
                    <span style={{ color: prioColor, flexShrink: 0, marginTop: 3, fontSize: 8 }}>●</span>
                    <span style={{ color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap' }}>{a.message}</span>
                    <span style={{ color: 'var(--t3)', flexShrink: 0, fontSize: 10, fontFamily: 'Geist Mono, monospace', marginLeft: 4 }}>{agoStr}</span>
                    {isExpanded ? <ChevronDown size={10} style={{ color: 'var(--t3)', flexShrink: 0, marginTop: 2 }} /> : <ChevronRight size={10} style={{ color: 'var(--t3)', flexShrink: 0, marginTop: 2 }} />}
                  </div>
                  {isExpanded && (
                    <div style={{ fontSize: 10, color: 'var(--t2)', background: 'var(--canvas)', borderRadius: 5, padding: '6px 8px', marginBottom: 4, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {a.title && <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: 3 }}>{a.title}</div>}
                      {a.message}
                      {a.tags.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {a.tags.map(tag => <span key={tag} style={{ fontSize: 9, background: 'var(--raised)', padding: '1px 5px', borderRadius: 3, color: 'var(--t3)' }}>{tag}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Automation */}
        <div className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={13} style={{ color: 'var(--ok)' }} />
            <span className="j-panel-title">Automation</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {automation.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>Loading...</div>
            ) : automation.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                {job.status === 'ok' ? <CheckCircle size={11} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                  : job.status === 'error' ? <XCircle size={11} style={{ color: 'var(--err)', flexShrink: 0 }} />
                  : <AlertTriangle size={11} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--t1)', fontWeight: 500 }}>{job.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{job.schedule}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {job.lastRun ? (
                    <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: job.status === 'error' ? 'var(--err)' : 'var(--t3)' }}>
                      {new Date(job.lastRun).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : <span style={{ fontSize: 10, color: 'var(--t3)' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AdGuard */}
        <div className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={13} style={{ color: 'var(--accent)' }} />
            <span className="j-panel-title">AdGuard DNS</span>
          </div>
          {adguard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Geist Mono, monospace', color: 'var(--t1)', lineHeight: 1 }}>
                    {adguard.totalQueries >= 1000 ? `${(adguard.totalQueries / 1000).toFixed(1)}k` : adguard.totalQueries}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>queries (24h)</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Geist Mono, monospace', color: 'var(--err)', lineHeight: 1 }}>{adguard.blockedPercent}%</div>
                  <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>blocked</div>
                </div>
              </div>
              {adguard.avgProcessingTime && (
                <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>avg {adguard.avgProcessingTime}ms response</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>Connecting...</div>
          )}
        </div>

        {/* GDrive Backup */}
        <div className="j-stat-tile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HardDrive size={13} style={{ color: 'var(--accent)' }} />
            <span className="j-panel-title">GDrive Backup</span>
            {backup && (
              <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 4,
                background: backup.status === 'ok' ? 'var(--ok-dim)' : backup.status === 'error' ? 'rgba(244,63,94,0.1)' : 'var(--raised)',
                color: backup.status === 'ok' ? 'var(--ok)' : backup.status === 'error' ? 'var(--err)' : 'var(--t3)',
              }}>
                {backup.status === 'ok' ? '● OK' : backup.status === 'error' ? '✕ Error' : '— Unknown'}
              </span>
            )}
          </div>
          {backup ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                Last run: <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t1)' }}>{backup.lastRun ?? '—'}</span>
              </div>
              {backup.message && (
                <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', background: 'var(--canvas)', borderRadius: 6, padding: '6px 8px', maxHeight: 60, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {backup.message.split('\n').slice(-4).join('\n')}
                </div>
              )}
            </div>
          ) : (
            <div className="j-skeleton" style={{ height: 40 }} />
          )}
        </div>
      </div>

      {/* ── Hardware + AI side by side ── */}
      <div className="j-grid-half" style={{ marginBottom: 24 }}>
        {/* Servers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {alwaysOn.length > 0 && (
            <div>
              <div className="j-section-label">Always-On</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
                {alwaysOn.map(m => <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} processes={processes[m.id] ?? []} onExpand={fetchProcesses} />)}
              </div>
            </div>
          )}
          {(burst.length > 0 || loading) && (
            <div>
              <div className="j-section-label">Burst Nodes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
                {burst.length > 0
                  ? burst.map(m => <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} processes={processes[m.id] ?? []} onExpand={fetchProcesses} />)
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

      {/* ── Quick Links ── */}
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
