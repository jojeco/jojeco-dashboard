import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
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

function pctColor(pct: number, warn = 65, crit = 85) {
  if (pct >= crit) return 'bg-red-500';
  if (pct >= warn) return 'bg-amber-400';
  return 'bg-emerald-500';
}
function fmtBytes(bytes: number) {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(0) + ' MB';
  return bytes + ' B';
}
function tempColor(t: number) {
  if (t > 85) return 'text-red-500';
  if (t > 70) return 'text-amber-500';
  return 'text-gray-400 dark:text-gray-500';
}

const MODEL_DESC: Record<string, string> = {
  'jojeco-fast':      'Fast text · summaries',
  'jojeco-code':      'Code generation',
  'jojeco-smart':     'Complex reasoning',
  'jojeco-reason':    'Deep analysis · debug',
  'jojeco-assistant': 'General assistant',
};

const MODEL_CATEGORY: Record<string, { label: string; color: string }> = {
  'qwen2.5-coder':    { label: 'code',   color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  'deepseek-r1':      { label: 'reason', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' },
  'qwq':              { label: 'reason', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' },
  'llava':            { label: 'vision', color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
  'nomic-embed-text': { label: 'embed',  color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const MODEL_SPEED: Record<string, number> = {
  'gemma4:e4b': 125, 'gemma4:26b': 31.7, 'gemma4:31b': 1.6,
  'qwen2.5:7b': 17, 'qwen2.5:14b': 8, 'qwen2.5-coder:7b': 17,
  'deepseek-r1:14b': 4.9, 'deepseek-r1:7b': 9, 'llava:7b': 14,
};

function getModelCategory(name: string) {
  const base = name.includes(':') ? name.split(':')[0] : name;
  if (base.startsWith('jojeco-')) return { label: 'preset', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300' };
  return MODEL_CATEGORY[base] ?? { label: 'general', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
}

function getModelSpeed(name: string): number | null {
  if (MODEL_SPEED[name] != null) return MODEL_SPEED[name];
  const base = name.includes(':') ? name.split(':')[0] : name;
  return MODEL_SPEED[base] ?? null;
}

function speedColor(tps: number) {
  if (tps >= 80)  return 'text-emerald-600 dark:text-emerald-400';
  if (tps >= 20)  return 'text-yellow-600 dark:text-yellow-400';
  return 'text-orange-500 dark:text-orange-400';
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
  healthy:  { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'Healthy' },
  degraded: { bg: 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20',       text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-400',   label: 'Degraded' },
  critical: { bg: 'bg-red-500/10 dark:bg-red-500/15 border-red-500/20',             text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500',     label: 'Critical' },
};

function UsageBar({ label, pct, detail, warnAt = 65, critAt = 85 }: {
  label: string; pct: number; detail?: string; warnAt?: number; critAt?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5 gap-1">
        <span className="text-gray-500 dark:text-gray-400 truncate">{label}{detail && <span className="opacity-60 ml-1">{detail}</span>}</span>
        <span className={`shrink-0 font-medium ${pct >= critAt ? 'text-red-500' : pct >= warnAt ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${pctColor(pct, warnAt, critAt)}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

// Tiny inline sparkline SVG for temp history
function TempSparkline({ history, isMobile }: { history: TempPoint[]; isMobile: boolean }) {
  if (!history || history.length < 2) return <div className="text-[10px] text-gray-400">No history yet</div>;
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
       .filter(Boolean)
       .join(' ');
  const now = Date.now();
  const oldest = history[0].timestamp;
  const diffH = (now - oldest) / 3600000;
  const tickLabel = diffH < 1 ? `${Math.round(diffH * 60)}m` : `${diffH.toFixed(0)}h`;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span>{tickLabel} ago</span>
        <span className="flex gap-3">
          {cpuPts.length > 0 && <span className="text-blue-400">CPU {cpuPts[cpuPts.length-1]?.toFixed(0)}°C</span>}
          {gpuPts.length > 0 && <span className="text-orange-400">GPU {gpuPts[gpuPts.length-1]?.toFixed(0)}°C</span>}
        </span>
        <span>now</span>
      </div>
      <svg width={W} height={H} className="w-full overflow-visible">
        {/* Warning zone at 80°C */}
        {maxV > 80 && <rect x={0} y={toY(80)} width={W} height={H - toY(80)} fill="rgba(239,68,68,0.06)" />}
        {cpuPts.length > 1 && <polyline points={pts(history.map(p => p.cpu_temp))} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" />}
        {gpuPts.length > 1 && <polyline points={pts(history.map(p => p.gpu_temp))} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round" />}
        {/* Current value dots */}
        {cpuPts.length > 0 && <circle cx={toX(n-1)} cy={toY(cpuPts[cpuPts.length-1])} r="2.5" fill="#60a5fa" />}
        {gpuPts.length > 0 && <circle cx={toX(n-1)} cy={toY(gpuPts[gpuPts.length-1])} r="2.5" fill="#fb923c" />}
        <text x={0} y={H+10} fontSize="9" fill="#6b7280">{minV.toFixed(0)}°</text>
        <text x={0} y={8} fontSize="9" fill="#6b7280">{maxV.toFixed(0)}°</text>
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
    <div className={`rounded-xl border transition-all ${
      isOffline
        ? 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 opacity-60'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
    }`}>
      {/* Summary row — always visible */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${machine.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{machine.name}</span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 ml-4">{machine.role}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-600 ml-4 font-mono">{machine.host}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {machine.temp != null && machine.online && (
              <span className={`text-[11px] font-mono ${tempColor(machine.temp)}`}>{machine.temp.toFixed(0)}°C</span>
            )}
            {!isOffline && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
        {isOffline ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-1">{machine.always_on ? 'Unreachable' : 'Offline'}</div>
        ) : (
          <div className="space-y-1.5">
            {machine.cpu != null && <UsageBar label="CPU" pct={machine.cpu} />}
            {machine.mem && <UsageBar label="RAM" pct={machine.mem.percent} detail={`${fmtBytes(machine.mem.used)} / ${fmtBytes(machine.mem.total)}`} />}
            {totalStorage > 0 && (
              <UsageBar label="Storage" pct={Math.round(storePct * 10) / 10} detail={`${fmtBytes(usedStorage)} / ${fmtBytes(totalStorage)}`} warnAt={75} critAt={90} />
            )}
            {machine.gpu && !isIntegratedGpu(machine.gpu.name ?? '') && machine.gpu.utilization != null && (
              <UsageBar label={`GPU`} pct={machine.gpu.utilization} warnAt={80} critAt={95} />
            )}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && !isOffline && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 pb-3 pt-2 space-y-3">
          {/* Drives breakdown */}
          {(machine.disks ?? []).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Drives</div>
              <div className="space-y-1.5">
                {machine.disks.map(d => (
                  <UsageBar key={d.label} label={d.label} pct={d.percent} detail={`${fmtBytes(d.used)} / ${fmtBytes(d.size)}`} warnAt={75} critAt={90} />
                ))}
              </div>
            </div>
          )}
          {/* GPU detail */}
          {machine.gpu && !isIntegratedGpu(machine.gpu.name ?? '') && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">GPU — {machine.gpu.name}</div>
              <div className="space-y-1.5">
                {machine.gpu.utilization != null && <UsageBar label="Utilization" pct={machine.gpu.utilization} warnAt={80} critAt={95} />}
                {machine.gpu.mem_percent != null && <UsageBar label="VRAM" pct={machine.gpu.mem_percent} warnAt={80} critAt={95} />}
                {machine.gpu.temp != null && (
                  <div className={`text-[11px] font-mono ${tempColor(machine.gpu.temp)}`}>Temp: {machine.gpu.temp}°C</div>
                )}
              </div>
            </div>
          )}
          {/* Temp history graph */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
              Temperature History {isMobile ? '(3h)' : '(24h)'}
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
  const stoppedContainers  = containers.filter(c => c.state !== 'running');
  const unhealthyContainers = containers.filter(c => c.health === 'unhealthy');
  const problemContainers  = [...new Map([...unhealthyContainers, ...stoppedContainers].map(c => [c.name, c])).values()];
  const hasDetails = issues.length > 0 || problemContainers.length > 0;

  return (
    <div className={`rounded-xl border ${cfg.bg} overflow-hidden`}>
      <div className={`px-4 py-3 ${hasDetails ? 'cursor-pointer select-none' : ''}`}
        onClick={() => hasDetails && setExpanded(e => !e)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot} ${status === 'healthy' ? 'animate-pulse' : ''}`} />
            <span className={`font-semibold text-sm ${cfg.text}`}>{cfg.label}</span>
            {hasDetails && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                status === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>{criticals.length + degradeds.length + problemContainers.length} issue{(criticals.length + degradeds.length + problemContainers.length) !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{lastRefresh.toLocaleTimeString()}</span>
            {hasDetails && <span className={`text-gray-400 dark:text-gray-500 text-xs transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(services).map(([id, up]) => (
            <span key={id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              up ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                 : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>{svcLabels[id] ?? id}</span>
          ))}
        </div>
      </div>
      {expanded && hasDetails && (
        <div className="border-t border-black/5 dark:border-white/5 px-4 py-3 space-y-3">
          {(criticals.length > 0 || degradeds.length > 0) && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Lab Issues</div>
              <div className="flex flex-col gap-1">
                {criticals.map((iss, i) => <span key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" /> {iss.message}</span>)}
                {degradeds.map((iss, i) => <span key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {iss.message}</span>)}
              </div>
            </div>
          )}
          {problemContainers.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Docker Problems</div>
              <div className="flex flex-col gap-1">
                {problemContainers.map(c => (
                  <span key={c.name} className="text-xs flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.health === 'unhealthy' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <span className="font-mono text-gray-700 dark:text-gray-300">{c.name}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${c.health === 'unhealthy' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
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

function ModelRow({ m }: { m: { name: string; size: number } }) {
  return (
    <div className="py-0.5">
      <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 truncate block">{m.name}</span>
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
    <div className={`p-3 rounded-xl border ${
      node.online ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 opacity-60'
    }`}>
      <div className="flex items-start justify-between mb-1 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${node.online ? (inUse ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{node.name}</span>
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 ml-3.5">{node.role}</div>
        </div>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          node.online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
        }`}>{node.online ? 'Online' : 'Offline'}</span>
      </div>

      {node.online && sorted.length > 0 && (
        <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
          {top.map(m => <ModelRow key={m.name} m={m} />)}
          {rest.length > 0 && (
            <>
              {expanded && rest.map(m => <ModelRow key={m.name} m={m} />)}
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-1 flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {expanded ? 'show less' : `${rest.length} more…`}
              </button>
            </>
          )}
        </div>
      )}
      {node.online && inUse && (
        <div className="mt-1 text-[10px] text-blue-500 dark:text-blue-400">
          {active.map(m => m.name.split(':')[0]).join(', ')} ▶ in use
        </div>
      )}
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
    // type (default): presets → general → code/reason/vision → embed
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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Model Catalog · {entries.length} unique models
          </span>
          {!open && (
            <div className="flex flex-wrap gap-1 mt-1">
              {preview.map(n => (
                <span key={n} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">{n}</span>
              ))}
              {entries.length > 3 && <span className="text-[10px] text-gray-400 dark:text-gray-500 py-0.5">+{entries.length - 3} more</span>}
            </div>
          )}
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1.5 py-2 flex-wrap">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 mr-1">Sort:</span>
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                  sort === s.key
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="space-y-0.5">
            {sorted.map(({ name, size, nodeNames }) => {
              const cat = getModelCategory(name);
              const tps = getModelSpeed(name);
              const desc = MODEL_DESC[name];
              const sizeGB = size > 0 ? (size / 1073741824).toFixed(1) + ' GB' : null;
              return (
                <div key={name} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${cat.color}`}>
                    {cat.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-mono font-medium text-gray-900 dark:text-gray-100 truncate">{name}</div>
                    {desc && <div className="text-[10px] text-gray-400 dark:text-gray-500">{desc}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {nodeNames.map(n => (
                      <span key={n} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 font-medium">
                        {NODE_SHORT[n] ?? n.slice(0, 3)}
                      </span>
                    ))}
                    {sizeGB && <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono w-12 text-right">{sizeGB}</span>}
                    {tps != null && <span className={`text-[10px] font-semibold w-14 text-right ${speedColor(tps)}`}>{tps} t/s</span>}
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
  const [linksOpen, setLinksOpen]   = useState(false);
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
    <div className="px-4 py-6 space-y-6">
      {isGuest && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Lab Overview</span> — real-time status of all machines, AI fleet, and running containers. Internal IPs hidden.
        </div>
      )}

      {data ? (
        <HealthBanner status={data.status} issues={data.issues} services={data.services} lastRefresh={lastRefresh} containers={containers} />
      ) : loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-800 animate-pulse">
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ) : null}

      {/* Quick Stats */}
      {(docker || fleet) && (
        <div className="grid grid-cols-3 gap-3">
          <a href="/docker" className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              Docker <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </div>
            {docker ? (
              <div>
                <div className="text-xl font-bold text-emerald-500">{docker.running}</div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">running</div>
                <div className="flex flex-col gap-1">
                  {docker.stopped > 0
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium w-fit">{docker.stopped} stopped</span>
                    : <span className="text-[10px] text-gray-400 dark:text-gray-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />none stopped</span>
                  }
                  {docker.unhealthy > 0
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium w-fit">{docker.unhealthy} unhealthy</span>
                    : <span className="text-[10px] text-gray-400 dark:text-gray-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-600 inline-block" />all healthy</span>
                  }
                </div>
              </div>
            ) : <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </a>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">LiteLLM</div>
            {fleet ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-xl font-bold ${fleet.litellm.online ? 'text-emerald-500' : 'text-red-500'}`}>
                    {fleet.litellm.online ? 'Online' : 'Offline'}
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${fleet.litellm.online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />20 models routed
                  </span>
                  {fleet.litellm.spend !== null && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />${fleet.litellm.spend.toFixed(4)} spent
                    </span>
                  )}
                </div>
              </div>
            ) : <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">AI Fleet</div>
            {fleet ? (() => {
              const onlineNodes = fleet.nodes.filter(n => n.online);
              const totalModels = new Set(fleet.nodes.flatMap(n => n.models.map(m => m.name))).size;
              return (
                <div>
                  <div className="flex items-end gap-1 mb-2">
                    <span className="text-xl font-bold text-emerald-500">{onlineNodes.length}</span>
                    <span className="text-gray-300 dark:text-gray-600 text-lg font-light">/</span>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{fleet.nodes.length}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 ml-0.5">nodes</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {fleet.nodes.map(n => (
                      <span key={n.id} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        n.online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                 : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                      }`}>{NODE_SHORT[n.name] ?? n.name}</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">{totalModels} models total</div>
                </div>
              );
            })() : <div className="h-6 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </div>
        </div>
      )}

      {/* Always-On Machines */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Always-On</h2>
        <div className="grid grid-cols-2 gap-3">
          {alwaysOn.map(m => <ServerCard key={m.id} machine={m} tempHistory={tempHistory[m.id] ?? []} isMobile={isMobile} />)}
        </div>
      </div>

      {/* Inference Fleet */}
      {fleet && fleet.nodes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Inference Fleet</h2>
          <div className="grid grid-cols-2 gap-3">
            {fleet.nodes.map(node => <OllamaCard key={node.id} node={node} activeSessions={activeSessions} />)}
          </div>
          <ModelCatalog nodes={fleet.nodes} />
        </div>
      )}

      {/* Burst Machines */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Burst Machines</h2>
        <div className="grid grid-cols-2 gap-3">
          {burst.map(m => <ServerCard key={m.id} machine={m} tempHistory={tempHistory[m.id] ?? []} isMobile={isMobile} />)}
        </div>
        {burst.length === 0 && <div className="text-xs text-gray-400 dark:text-gray-500">JoPc / MacBook not configured</div>}
      </div>

      {/* Quick Links */}
      <div>
        <button
          onClick={() => setLinksOpen(o => !o)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full text-left mb-3"
        >
          <span className={`transition-transform duration-200 ${linksOpen ? 'rotate-90' : ''}`}>▶</span>
          Quick Links
          <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-gray-600 ml-1">({QUICK_LINKS.length})</span>
        </button>
        {linksOpen && (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-x-6 space-y-4">
            {LINK_CATEGORIES.map(cat => {
              const links = QUICK_LINKS.filter(l => l.category === cat);
              if (!links.length) return null;
              return (
                <div key={cat} className="break-inside-avoid">
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-1.5">{cat}</div>
                  <div className="flex flex-col gap-1">
                    {links.map(link => (
                      <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                        <span>{link.icon}</span><span>{link.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
