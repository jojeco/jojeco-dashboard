import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Activity } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Disk { label: string; used: number; size: number; percent: number }
interface Gpu  { name: string; temp: number | null; utilization: number | null; mem_percent: number | null }
interface Machine {
  id: string; name: string; host: string; role: string; os: string;
  always_on: boolean; gpu_label: string | null;
  online: boolean;
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
interface DockerSummary { running: number; stopped: number; unhealthy: number }
interface DockerContainer { name: string; state: string; health: string; status: string }

function pctFill(pct: number, warn = 65, crit = 85): string {
  if (pct >= crit) return 'var(--err)';
  if (pct >= warn) return 'var(--warn)';
  return 'var(--ok)';
}
function fmtBytes(bytes: number) {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(0) + ' MB';
  return bytes + ' B';
}
function tempColor(t: number): string {
  if (t > 85) return 'var(--err)';
  if (t > 70) return 'var(--warn)';
  return 'var(--t3)';
}

const MODEL_DESC: Record<string, string> = {
  'jojeco-fast':      'Fast text · summaries',
  'jojeco-code':      'Code generation',
  'jojeco-smart':     'Complex reasoning',
  'jojeco-reason':    'Deep analysis · debug',
  'jojeco-assistant': 'General assistant',
};

const MODEL_CATEGORY: Record<string, { label: string }> = {
  'qwen2.5-coder':    { label: 'code'   },
  'deepseek-r1':      { label: 'reason' },
  'qwq':              { label: 'reason' },
  'llava':            { label: 'vision' },
  'nomic-embed-text': { label: 'embed'  },
};

const CAT_STYLE: Record<string, { bg: string; color: string }> = {
  preset:  { bg: 'var(--accent-dim)',              color: 'var(--accent)'  },
  code:    { bg: 'rgba(96,165,250,0.10)',           color: '#60a5fa'        },
  reason:  { bg: 'rgba(167,139,250,0.10)',          color: '#a78bfa'        },
  vision:  { bg: 'rgba(52,211,153,0.10)',           color: '#34d399'        },
  embed:   { bg: 'rgba(156,163,175,0.10)',          color: 'var(--t3)'      },
  general: { bg: 'rgba(156,163,175,0.08)',          color: 'var(--t3)'      },
};

const MODEL_SPEED: Record<string, number> = {
  'gemma4:e4b': 125, 'gemma4:26b': 31.7, 'gemma4:31b': 1.6,
  'qwen2.5:7b': 17, 'qwen2.5:14b': 8, 'qwen2.5-coder:7b': 17,
  'deepseek-r1:14b': 4.9, 'deepseek-r1:7b': 9, 'llava:7b': 14,
};

function getModelCategory(name: string) {
  const base = name.includes(':') ? name.split(':')[0] : name;
  if (base.startsWith('jojeco-')) return { label: 'preset' };
  return MODEL_CATEGORY[base] ?? { label: 'general' };
}

function getModelSpeed(name: string): number | null {
  if (MODEL_SPEED[name] != null) return MODEL_SPEED[name];
  const base = name.includes(':') ? name.split(':')[0] : name;
  return MODEL_SPEED[base] ?? null;
}

function speedColor(tps: number): string {
  if (tps >= 80)  return 'var(--ok)';
  if (tps >= 20)  return 'var(--warn)';
  return '#f97316';
}

const NODE_SHORT: Record<string, string> = { 'Server 3': 'S3', 'Server 1': 'S1', 'MacBook M4': 'MBP', 'JoPc': 'JoPc' };

const QUICK_LINKS = [
  { label: 'Plex',          href: 'https://plex.jojeco.ca',           category: 'Media',        icon: '🎥' },
  { label: 'Overseerr',     href: 'https://seerr.jojeco.ca',          category: 'Media',        icon: '🎬' },
  { label: 'Navidrome',     href: 'https://navidrome.jojeco.ca',      category: 'Media',        icon: '🎵' },
  { label: 'Nextcloud',     href: 'https://cloud.jojeco.ca',          category: 'Files',        icon: '☁️' },
  { label: 'Paperless',     href: 'http://192.168.50.13:8010',        category: 'Files',        icon: '📄' },
  { label: 'qBittorrent',   href: 'http://192.168.50.13:9091',        category: 'Downloads',    icon: '⬇️' },
  { label: 'Radarr',        href: 'http://192.168.50.13:7878',        category: 'Downloads',    icon: '🎞️' },
  { label: 'Sonarr',        href: 'http://192.168.50.13:8989',        category: 'Downloads',    icon: '📺' },
  { label: 'Lidarr',        href: 'http://192.168.50.13:8686',        category: 'Downloads',    icon: '🎧' },
  { label: 'Prowlarr',      href: 'http://192.168.50.13:9696',        category: 'Downloads',    icon: '🔍' },
  { label: 'LibreChat',     href: 'https://ai.jojeco.ca',             category: 'AI',           icon: '🤖' },
  { label: 'LiteLLM',       href: 'http://192.168.50.13:4000/ui',     category: 'AI',           icon: '🧠' },
  { label: 'Grafana',       href: 'http://192.168.50.13:3000',        category: 'Infra',        icon: '📊' },
  { label: 'Proxmox',       href: 'https://192.168.50.11:8006',       category: 'Infra',        icon: '🖥️' },
  { label: 'Portainer',     href: 'http://192.168.50.13:9000',        category: 'Infra',        icon: '🐳' },
  { label: 'Tdarr',         href: 'http://192.168.50.13:8265',        category: 'Infra',        icon: '⚙️' },
  { label: 'ntfy',          href: 'https://ntfy.jojeco.ca',           category: 'Comms',        icon: '🔔' },
  { label: 'Vikunja',       href: 'http://192.168.50.13:3456',        category: 'Productivity', icon: '✅' },
  { label: 'Actual Budget', href: 'http://192.168.50.13:5006',        category: 'Productivity', icon: '💰' },
];
const LINK_CATEGORIES = ['Media', 'Downloads', 'AI', 'Infra', 'Files', 'Comms', 'Productivity'];

const STATUS_CONFIG = {
  healthy:  { border: 'rgba(16,185,129,0.20)', bg: 'rgba(16,185,129,0.06)', dot: 'var(--ok)',   text: 'var(--ok)',   label: 'Healthy'  },
  degraded: { border: 'rgba(245,158,11,0.20)',  bg: 'rgba(245,158,11,0.06)',  dot: 'var(--warn)', text: 'var(--warn)', label: 'Degraded' },
  critical: { border: 'rgba(244,63,94,0.20)',   bg: 'rgba(244,63,94,0.06)',   dot: 'var(--err)',  text: 'var(--err)',  label: 'Critical' },
};

function UsageBar({ label, pct, detail, warnAt = 65, critAt = 85 }: {
  label: string; pct: number; detail?: string; warnAt?: number; critAt?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = pctFill(pct, warnAt, critAt);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, gap: 4 }}>
        <span style={{ color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{detail && <span style={{ opacity: 0.55, marginLeft: 4 }}>{detail}</span>}
        </span>
        <span style={{ flexShrink: 0, fontFamily: 'Geist Mono, monospace', fontWeight: 600, fontSize: 10, color: fill }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="j-bar-track">
        <div className="j-bar-fill" style={{ width: `${clamped}%`, background: fill }} />
      </div>
    </div>
  );
}

function TempSparkline({ history, isMobile }: { history: TempPoint[]; isMobile: boolean }) {
  if (!history || history.length < 2) return <div style={{ fontSize: 10, color: 'var(--t3)' }}>No history yet</div>;
  const W = isMobile ? 200 : 320, H = 48;
  const cpuPts = history.map(p => p.cpu_temp).filter(v => v != null) as number[];
  const gpuPts = history.map(p => p.gpu_temp).filter(v => v != null) as number[];
  const allVals = [...cpuPts, ...gpuPts];
  if (allVals.length === 0) return null;
  const minV = Math.max(0, Math.min(...allVals) - 5);
  const maxV = Math.max(...allVals) + 5;
  const n = history.length;
  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / (maxV - minV)) * H;
  const pts = (arr: (number|null)[]) =>
    arr.map((v, i) => v != null ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null)
       .filter(Boolean).join(' ');
  const now = Date.now();
  const oldest = history[0].timestamp;
  const diffH = (now - oldest) / 3600000;
  const tickLabel = diffH < 1 ? `${Math.round(diffH * 60)}m` : `${diffH.toFixed(0)}h`;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>
        <span>{tickLabel} ago</span>
        <span style={{ display: 'flex', gap: 12 }}>
          {cpuPts.length > 0 && <span style={{ color: '#60a5fa' }}>CPU {cpuPts[cpuPts.length-1]?.toFixed(0)}°C</span>}
          {gpuPts.length > 0 && <span style={{ color: '#fb923c' }}>GPU {gpuPts[gpuPts.length-1]?.toFixed(0)}°C</span>}
        </span>
        <span>now</span>
      </div>
      <svg width={W} height={H} style={{ width: '100%', overflow: 'visible' }}>
        {maxV > 80 && <rect x={0} y={toY(80)} width={W} height={H - toY(80)} fill="rgba(244,63,94,0.06)" />}
        {cpuPts.length > 1 && <polyline points={pts(history.map(p => p.cpu_temp))} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" />}
        {gpuPts.length > 1 && <polyline points={pts(history.map(p => p.gpu_temp))} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round" />}
        {cpuPts.length > 0 && <circle cx={toX(n-1)} cy={toY(cpuPts[cpuPts.length-1])} r="2.5" fill="#60a5fa" />}
        {gpuPts.length > 0 && <circle cx={toX(n-1)} cy={toY(gpuPts[gpuPts.length-1])} r="2.5" fill="#fb923c" />}
        <text x={0} y={H+10} fontSize="9" fill="var(--t3)">{minV.toFixed(0)}°</text>
        <text x={0} y={8} fontSize="9" fill="var(--t3)">{maxV.toFixed(0)}°</text>
      </svg>
    </div>
  );
}

function ServerCard({ machine, tempHistory, isMobile }: { machine: Machine; tempHistory: TempPoint[]; isMobile: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOffline = !machine.online;
  const totalStorage = (machine.disks ?? []).reduce((s, d) => s + d.size, 0);
  const usedStorage  = (machine.disks ?? []).reduce((s, d) => s + d.used, 0);
  const storePct     = totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;
  const isIntegratedGpu = (name: string) => /intel|uhd|iris/i.test(name);

  return (
    <div className="j-panel" style={{ opacity: isOffline ? 0.55 : 1, animation: 'fadeUp 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span className={`j-dot ${machine.online ? 'j-dot-ok' : 'j-dot-off'}`} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{machine.name}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)', paddingLeft: 15 }}>{machine.role}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', paddingLeft: 15, fontFamily: 'Geist Mono, monospace' }}>{machine.host}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {machine.temp != null && machine.online && (
              <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 600, color: tempColor(machine.temp) }}>{machine.temp.toFixed(0)}°C</span>
            )}
            {!isOffline && (
              <button onClick={() => setExpanded(e => !e)} style={{ padding: 2, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            )}
          </div>
        </div>
        {isOffline ? (
          <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '4px 0' }}>{machine.always_on ? 'Unreachable' : 'Offline'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {machine.cpu != null && <UsageBar label="CPU" pct={machine.cpu} />}
            {machine.mem && <UsageBar label="RAM" pct={machine.mem.percent} detail={`${fmtBytes(machine.mem.used)} / ${fmtBytes(machine.mem.total)}`} />}
            {totalStorage > 0 && <UsageBar label="Storage" pct={Math.round(storePct * 10) / 10} detail={`${fmtBytes(usedStorage)} / ${fmtBytes(totalStorage)}`} warnAt={75} critAt={90} />}
            {machine.gpu && !isIntegratedGpu(machine.gpu.name ?? '') && machine.gpu.utilization != null && (
              <UsageBar label="GPU" pct={machine.gpu.utilization} warnAt={80} critAt={95} />
            )}
          </div>
        )}
      </div>

      {expanded && !isOffline && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(machine.disks ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Drives</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {machine.disks.map(d => (
                  <UsageBar key={d.label} label={d.label} pct={d.percent} detail={`${fmtBytes(d.used)} / ${fmtBytes(d.size)}`} warnAt={75} critAt={90} />
                ))}
              </div>
            </div>
          )}
          {machine.gpu && !isIntegratedGpu(machine.gpu.name ?? '') && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>GPU — {machine.gpu.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {machine.gpu.utilization != null && <UsageBar label="Utilization" pct={machine.gpu.utilization} warnAt={80} critAt={95} />}
                {machine.gpu.mem_percent != null && <UsageBar label="VRAM" pct={machine.gpu.mem_percent} warnAt={80} critAt={95} />}
                {machine.gpu.temp != null && (
                  <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: tempColor(machine.gpu.temp) }}>Temp: {machine.gpu.temp}°C</span>
                )}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Temperature {isMobile ? '(3h)' : '(24h)'}
            </div>
            <TempSparkline history={tempHistory} isMobile={isMobile} />
          </div>
        </div>
      )}
    </div>
  );
}

function HealthBanner({ status, issues, services, lastRefresh, containers }: {
  status: LabOverview['status'];
  issues: LabOverview['issues'];
  services: Record<string, boolean>;
  lastRefresh: Date;
  containers: DockerContainer[];
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[status];
  const criticals = issues.filter(i => i.severity === 'critical');
  const degradeds  = issues.filter(i => i.severity === 'degraded');
  const svcLabels: Record<string, string> = { plex: 'Plex', adguard: 'AdGuard', ollama: 'Ollama', prometheus: 'Prometheus', tailscale: 'Tailscale' };
  const stoppedContainers   = containers.filter(c => c.state !== 'running');
  const unhealthyContainers = containers.filter(c => c.health === 'unhealthy');
  const problemContainers   = [...new Map([...unhealthyContainers, ...stoppedContainers].map(c => [c.name, c])).values()];
  const totalIssues = criticals.length + degradeds.length + problemContainers.length;
  const hasDetails = totalIssues > 0;

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${cfg.border}`, background: cfg.bg, overflow: 'hidden' }}>
      <div
        style={{ padding: '12px 16px', cursor: hasDetails ? 'pointer' : 'default' }}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`j-dot ${status === 'healthy' ? 'j-dot-ok' : status === 'degraded' ? 'j-dot-warn' : 'j-dot-err'}`}
              style={status === 'healthy' ? { animation: 'pulseDot 2s ease-in-out infinite' } : {}} />
            <span style={{ fontWeight: 600, fontSize: 13, color: cfg.text }}>{cfg.label}</span>
            {hasDetails && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>
                {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)' }}>{lastRefresh.toLocaleTimeString()}</span>
            {hasDetails && <span style={{ color: 'var(--t3)', fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', display: 'inline-block' }}>▾</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(services).map(([id, up]) => (
            <span key={id} className={`j-chip ${up ? 'j-chip-ok' : ''}`} style={!up ? { color: 'var(--err)', background: 'rgba(244,63,94,0.08)', borderColor: 'rgba(244,63,94,0.20)' } : {}}>
              {svcLabels[id] ?? id}
            </span>
          ))}
        </div>
      </div>
      {expanded && hasDetails && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(criticals.length > 0 || degradeds.length > 0) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Lab Issues</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {criticals.map((iss, i) => <span key={i} style={{ fontSize: 12, color: 'var(--err)', display: 'flex', alignItems: 'center', gap: 6 }}><span className="j-dot j-dot-err" />{iss.message}</span>)}
                {degradeds.map((iss, i)  => <span key={i} style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}><span className="j-dot j-dot-warn" />{iss.message}</span>)}
              </div>
            </div>
          )}
          {problemContainers.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Docker Problems</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {problemContainers.map(c => (
                  <span key={c.name} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`j-dot ${c.health === 'unhealthy' ? 'j-dot-err' : 'j-dot-warn'}`} />
                    <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t2)', fontSize: 11 }}>{c.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                      background: c.health === 'unhealthy' ? 'rgba(244,63,94,0.10)' : 'rgba(245,158,11,0.10)',
                      color: c.health === 'unhealthy' ? 'var(--err)' : 'var(--warn)' }}>
                      {c.health === 'unhealthy' ? 'unhealthy' : c.state}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OllamaCard({ node, activeSessions }: { node: OllamaNode; activeSessions: ActiveSession[] }) {
  const [expanded, setExpanded] = useState(false);
  const active = activeSessions.find(s => s.id === node.id)?.active ?? [];
  const inUse = active.length > 0;

  const sorted = [...node.models].sort((a, b) => {
    const aP = a.name.startsWith('jojeco-'), bP = b.name.startsWith('jojeco-');
    if (aP !== bP) return aP ? -1 : 1;
    return b.size - a.size;
  });
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="j-panel" style={{ opacity: !node.online ? 0.55 : 1 }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span className={`j-dot ${!node.online ? 'j-dot-off' : inUse ? '' : 'j-dot-ok'}`}
                style={inUse && node.online ? { background: '#60a5fa', boxShadow: '0 0 0 3px rgba(96,165,250,0.15)', animation: 'pulseDot 2s ease-in-out infinite' } : {}} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)', paddingLeft: 15 }}>{node.role}</div>
          </div>
          <span className={`j-chip ${node.online ? 'j-chip-ok' : ''}`} style={!node.online ? { color: 'var(--t3)', background: 'var(--raised)', borderColor: 'var(--line)' } : {}}>
            {node.online ? 'Online' : 'Offline'}
          </span>
        </div>

        {node.online && sorted.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 4 }}>
            {top.map(m => (
              <div key={m.name} style={{ padding: '2px 0' }}>
                <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--accent)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              </div>
            ))}
            {rest.length > 0 && (
              <>
                {expanded && rest.map(m => (
                  <div key={m.name} style={{ padding: '2px 0' }}>
                    <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--accent)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                ))}
                <button onClick={() => setExpanded(e => !e)}
                  style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {expanded ? 'show less' : `${rest.length} more…`}
                </button>
              </>
            )}
          </div>
        )}
        {node.online && inUse && (
          <div style={{ marginTop: 6, fontSize: 10, color: '#60a5fa' }}>
            {active.map(m => m.name.split(':')[0]).join(', ')} ▶ in use
          </div>
        )}
      </div>
    </div>
  );
}

type CatalogSort = 'type' | 'size' | 'speed' | 'server' | 'name';

function ModelCatalog({ nodes }: { nodes: OllamaNode[] }) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<CatalogSort>('type');

  const catalog = new Map<string, { size: number; nodeNames: string[] }>();
  nodes.filter(n => n.online).forEach(node => {
    node.models.forEach(m => {
      const existing = catalog.get(m.name);
      if (existing) { existing.nodeNames.push(node.name); }
      else { catalog.set(m.name, { size: m.size, nodeNames: [node.name] }); }
    });
  });

  const entries = Array.from(catalog.entries()).map(([name, d]) => ({ name, ...d }));
  const sorted = [...entries].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'size') return b.size - a.size;
    if (sort === 'speed') return (getModelSpeed(b.name) ?? -1) - (getModelSpeed(a.name) ?? -1);
    if (sort === 'server') return (a.nodeNames[0] ?? '').localeCompare(b.nodeNames[0] ?? '');
    const catOrder = { preset: 0, general: 1, code: 2, reason: 3, vision: 4, embed: 9 };
    const ac = catOrder[getModelCategory(a.name).label as keyof typeof catOrder] ?? 5;
    const bc = catOrder[getModelCategory(b.name).label as keyof typeof catOrder] ?? 5;
    if (ac !== bc) return ac - bc;
    return b.size - a.size;
  });

  if (entries.length === 0) return null;

  const SORTS: { key: CatalogSort; label: string }[] = [
    { key: 'type', label: 'Type' }, { key: 'size', label: 'Size' },
    { key: 'speed', label: 'Speed' }, { key: 'server', label: 'Server' }, { key: 'name', label: 'Name' },
  ];

  const preview = sorted.slice(0, 3).map(e => e.name);

  return (
    <div className="j-panel">
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="j-panel-title">Model Catalog · {entries.length} unique models</span>
          {!open && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {preview.map(n => (
                <span key={n} className="j-chip" style={{ fontFamily: 'Geist Mono, monospace' }}>{n}</span>
              ))}
              {entries.length > 3 && <span style={{ fontSize: 10, color: 'var(--t3)', padding: '2px 0' }}>+{entries.length - 3} more</span>}
            </div>
          )}
        </div>
        <ChevronDown size={13} style={{ color: 'var(--t3)', flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--t3)', marginRight: 2 }}>Sort:</span>
            {SORTS.map(s => (
              <button key={s.key} onClick={() => setSort(s.key)}
                style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid',
                  background: sort === s.key ? 'var(--accent-dim)' : 'var(--raised)',
                  color: sort === s.key ? 'var(--accent)' : 'var(--t2)',
                  borderColor: sort === s.key ? 'var(--accent-border)' : 'var(--line)',
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sorted.map(({ name, size, nodeNames }) => {
              const cat = getModelCategory(name);
              const catStyle = CAT_STYLE[cat.label] ?? CAT_STYLE.general;
              const tps = getModelSpeed(name);
              const desc = MODEL_DESC[name];
              const sizeGB = size > 0 ? (size / 1073741824).toFixed(1) + ' GB' : null;
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, transition: 'background 120ms' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--raised)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}>
                  <span style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: catStyle.bg, color: catStyle.color }}>
                    {cat.label}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {desc && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{desc}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {nodeNames.map(n => (
                      <span key={n} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--raised)', color: 'var(--t2)', fontWeight: 600, border: '1px solid var(--line)' }}>
                        {NODE_SHORT[n] ?? n.slice(0, 3)}
                      </span>
                    ))}
                    {sizeGB && <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', width: 48, textAlign: 'right' }}>{sizeGB}</span>}
                    {tps != null && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Geist Mono, monospace', color: speedColor(tps), width: 52, textAlign: 'right' }}>{tps} t/s</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function readCache<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function LabPage() {
  const [data, setData]             = useState<LabOverview | null>(() => readCache('cache_lab_overview'));
  const [fleet, setFleet]           = useState<FleetData | null>(() => readCache('cache_lab_fleet'));
  const [docker, setDocker]         = useState<DockerSummary | null>(() => readCache('cache_lab_docker_summary'));
  const [containers, setContainers] = useState<DockerContainer[]>(() => readCache<DockerContainer[]>('cache_lab_containers') ?? []);
  const [tempHistory, setTempHistory] = useState<Record<string, TempPoint[]>>({});
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading]       = useState(() => !readCache('cache_lab_overview'));
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);

  const fetchAll = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    const isMobile = window.innerWidth < 768;
    isMobileRef.current = isMobile;
    const histHours = isMobile ? '3' : '24';

    const [labRes, fleetRes, dockerRes, histRes, psRes] = await Promise.allSettled([
      fetch('/api/lab/overview',    { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/ops/fleet',       { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/docker/containers?all=1', { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`/api/lab/temps/history?hours=${histHours}`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/lab/ollama/ps',   { headers: h }).then(r => r.ok ? r.json() : null),
    ]);

    if (labRes.status === 'fulfilled' && labRes.value)   { setData(labRes.value); writeCache('cache_lab_overview', labRes.value); }
    if (fleetRes.status === 'fulfilled' && fleetRes.value) { setFleet(fleetRes.value); writeCache('cache_lab_fleet', fleetRes.value); }
    if (dockerRes.status === 'fulfilled' && Array.isArray(dockerRes.value)) {
      const c = dockerRes.value as DockerContainer[];
      setContainers(c);
      writeCache('cache_lab_containers', c);
      setDocker({ running: c.filter(x => x.state === 'running').length, stopped: c.filter(x => x.state !== 'running').length, unhealthy: c.filter(x => x.health === 'unhealthy').length });
    }
    if (histRes.status === 'fulfilled' && histRes.value) setTempHistory(histRes.value);
    if (psRes.status === 'fulfilled' && Array.isArray(psRes.value)) setActiveSessions(psRes.value);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const alwaysOn = data?.machines.filter(m => m.always_on) ?? [];
  const burst    = data?.machines.filter(m => !m.always_on) ?? [];
  const isMobile = isMobileRef.current;

  return (
    <div className="j-content">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>Lab Overview</h1>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Real-time infrastructure status</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)' }}>10s refresh</span>
        </div>
      </div>

      {isGuest && (
        <div style={{ borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', padding: '10px 14px', fontSize: 12, color: 'var(--t2)', marginBottom: 20 }}>
          <strong style={{ color: 'var(--t1)' }}>Guest view</strong> — real-time status visible. Internal IPs hidden.
        </div>
      )}

      {/* Health banner */}
      {data ? (
        <div style={{ marginBottom: 20 }}>
          <HealthBanner status={data.status} issues={data.issues} services={data.services} lastRefresh={lastRefresh} containers={containers} />
        </div>
      ) : loading ? (
        <div className="j-panel" style={{ padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ height: 14, width: 192, background: 'var(--raised)', borderRadius: 4, animation: 'pulse 2s infinite' }} />
        </div>
      ) : null}

      {/* Quick stats row */}
      {(docker || fleet) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }} className="stagger">
          {/* Docker */}
          <a href="/docker" className="j-panel" style={{ padding: '14px 16px', textDecoration: 'none', display: 'block', transition: 'border-color 120ms' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-border)'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--line)'}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="j-panel-title">Docker</span>
              <ExternalLink size={10} style={{ color: 'var(--t3)' }} />
            </div>
            {docker ? (
              <>
                <div style={{ fontSize: 28, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--ok)', lineHeight: 1, marginBottom: 4 }}>{docker.running}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 10 }}>running</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {docker.stopped > 0
                    ? <span className="j-chip" style={{ color: 'var(--warn)', background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.20)', width: 'fit-content' }}>{docker.stopped} stopped</span>
                    : <span style={{ fontSize: 10, color: 'var(--t3)' }}>none stopped</span>}
                  {docker.unhealthy > 0
                    ? <span className="j-chip" style={{ color: 'var(--err)', background: 'rgba(244,63,94,0.08)', borderColor: 'rgba(244,63,94,0.18)', width: 'fit-content' }}>{docker.unhealthy} unhealthy</span>
                    : <span style={{ fontSize: 10, color: 'var(--ok)' }}>all healthy</span>}
                </div>
              </>
            ) : <div style={{ height: 20, width: 80, background: 'var(--raised)', borderRadius: 4 }} />}
          </a>

          {/* LiteLLM */}
          <div className="j-panel" style={{ padding: '14px 16px' }}>
            <div className="j-panel-title" style={{ marginBottom: 10 }}>LiteLLM</div>
            {fleet ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 28, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: fleet.litellm.online ? 'var(--ok)' : 'var(--err)', lineHeight: 1 }}>
                    {fleet.litellm.online ? 'Up' : 'Down'}
                  </div>
                  <span className={`j-dot ${fleet.litellm.online ? 'j-dot-ok' : 'j-dot-err'}`}
                    style={fleet.litellm.online ? { animation: 'pulseDot 2s ease-in-out infinite' } : {}} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>20 models routed</span>
                  {fleet.litellm.spend !== null && (
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>${fleet.litellm.spend.toFixed(4)} spent</span>
                  )}
                </div>
              </>
            ) : <div style={{ height: 20, width: 80, background: 'var(--raised)', borderRadius: 4 }} />}
          </div>

          {/* AI Fleet */}
          <div className="j-panel" style={{ padding: '14px 16px' }}>
            <div className="j-panel-title" style={{ marginBottom: 10 }}>AI Fleet</div>
            {fleet ? (() => {
              const onlineNodes = fleet.nodes.filter(n => n.online);
              const totalModels = new Set(fleet.nodes.flatMap(n => n.models.map(m => m.name))).size;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 28, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--ok)', lineHeight: 1 }}>{onlineNodes.length}</span>
                    <span style={{ fontSize: 16, color: 'var(--t3)', fontWeight: 300 }}>/</span>
                    <span style={{ fontSize: 20, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>{fleet.nodes.length}</span>
                    <span style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 1 }}>nodes</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {fleet.nodes.map(n => (
                      <span key={n.id} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600, border: '1px solid var(--line)',
                        background: n.online ? 'rgba(16,185,129,0.08)' : 'var(--raised)',
                        color: n.online ? 'var(--ok)' : 'var(--t3)' }}>
                        {NODE_SHORT[n.name] ?? n.name}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>{totalModels} models total</div>
                </>
              );
            })() : <div style={{ height: 20, width: 80, background: 'var(--raised)', borderRadius: 4 }} />}
          </div>
        </div>
      )}

      {/* Main two-column layout: hardware left, AI fleet right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 28 }}>

        {/* Left: Hardware */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              Always-On
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
              {alwaysOn.length > 0
                ? alwaysOn.map(m => <ServerCard key={m.id} machine={m} tempHistory={tempHistory[m.id] ?? []} isMobile={isMobile} />)
                : <div style={{ fontSize: 12, color: 'var(--t3)' }}>No data</div>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              Burst Machines
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
              {burst.length > 0
                ? burst.map(m => <ServerCard key={m.id} machine={m} tempHistory={tempHistory[m.id] ?? []} isMobile={isMobile} />)
                : <div style={{ fontSize: 12, color: 'var(--t3)' }}>No burst nodes configured</div>}
            </div>
          </div>
        </div>

        {/* Right: AI Fleet */}
        <div>
          {fleet && fleet.nodes.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                Inference Fleet
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }} className="stagger">
                {fleet.nodes.map(node => <OllamaCard key={node.id} node={node} activeSessions={activeSessions} />)}
              </div>
              <ModelCatalog nodes={fleet.nodes} />
            </>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          Quick Links
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>{QUICK_LINKS.length}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
          {LINK_CATEGORIES.flatMap(cat => {
            const links = QUICK_LINKS.filter(l => l.category === cat);
            return links.map(link => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                className="j-panel"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', textDecoration: 'none', transition: 'border-color 120ms, background 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-border)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--raised)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface)'; }}>
                <span style={{ fontSize: 14 }}>{link.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{link.category}</div>
                </div>
              </a>
            ));
          })}
        </div>
      </div>
    </div>
  );
}
