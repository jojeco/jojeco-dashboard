import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

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
interface DockerSummary { running: number; stopped: number; unhealthy: number }
interface DockerContainer { name: string; state: string; health: string; status: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ label, pct, detail, warnAt = 65, critAt = 85 }: {
  label: string; pct: number; detail?: string; warnAt?: number; critAt?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5 gap-1">
        <span className="text-gray-500 dark:text-gray-400 truncate">{label}{detail && <span className="opacity-60 ml-1">{detail}</span>}</span>
        <span className={`shrink-0 font-medium ${pct >= critAt ? 'text-red-500' : pct >= warnAt ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${pctColor(pct, warnAt, critAt)}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function ServerCard({ machine }: { machine: Machine }) {
  const isOffline = !machine.online;
  return (
    <div className={`rounded-xl border p-3 transition-all ${
      isOffline
        ? 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 opacity-60'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${machine.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{machine.name}</span>
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 ml-4">{machine.role}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-600 ml-4 font-mono">{machine.host}</div>
        </div>
        {machine.temp != null && machine.online && (
          <span className={`text-[11px] shrink-0 font-mono ${machine.temp > 85 ? 'text-red-500' : machine.temp > 65 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
            {machine.temp.toFixed(0)}°C
          </span>
        )}
      </div>
      {isOffline ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-1">
          {machine.always_on ? 'Unreachable' : 'Offline'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {machine.cpu != null && <UsageBar label="CPU" pct={machine.cpu} />}
          {machine.mem && (
            <UsageBar label="RAM" pct={machine.mem.percent} detail={`${fmtBytes(machine.mem.used)} / ${fmtBytes(machine.mem.total)}`} />
          )}
          {(machine.disks ?? []).map(d => (
            <UsageBar key={d.label} label={d.label} pct={d.percent} detail={`${fmtBytes(d.used)} / ${fmtBytes(d.size)}`} warnAt={75} critAt={90} />
          ))}
          {machine.gpu && (
            <div className="pt-0.5">
              {machine.gpu.utilization != null && (
                <UsageBar label={`GPU ${machine.gpu.name.split(' ').slice(-2).join(' ')}`} pct={machine.gpu.utilization} warnAt={80} critAt={95} />
              )}
              {machine.gpu.mem_percent != null && (
                <UsageBar label="GPU mem" pct={machine.gpu.mem_percent} warnAt={80} critAt={95} />
              )}
              {machine.gpu.temp != null && (
                <div className={`text-[11px] mt-0.5 font-mono ${machine.gpu.temp > 80 ? 'text-red-500' : machine.gpu.temp > 65 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                  GPU {machine.gpu.temp}°C
                </div>
              )}
            </div>
          )}
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
      {/* ── Always-visible row ── */}
      <div
        className={`px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${hasDetails ? 'cursor-pointer select-none' : ''}`}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full shrink-0 ${cfg.dot} ${status === 'healthy' ? 'animate-pulse' : ''}`} />
          <div>
            <span className={`font-semibold text-base ${cfg.text}`}>{cfg.label}</span>
            {!hasDetails && <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">— all systems nominal</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(services).map(([id, up]) => (
              <span key={id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                up ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                   : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {svcLabels[id] ?? id}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasDetails && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              status === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            }`}>
              {criticals.length + degradeds.length + problemContainers.length} issue{(criticals.length + degradeds.length + problemContainers.length) !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">{lastRefresh.toLocaleTimeString()}</span>
          {hasDetails && (
            <span className={`text-gray-400 dark:text-gray-500 text-xs transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
          )}
        </div>
      </div>

      {/* ── Expandable details ── */}
      {expanded && hasDetails && (
        <div className="border-t border-black/5 dark:border-white/5 px-4 py-3 space-y-3">
          {/* Lab issues */}
          {(criticals.length > 0 || degradeds.length > 0) && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Lab Issues</div>
              <div className="flex flex-col gap-1">
                {criticals.map((iss, i) => (
                  <span key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" /> {iss.message}
                  </span>
                ))}
                {degradeds.map((iss, i) => (
                  <span key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {iss.message}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Problem containers */}
          {problemContainers.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Docker Problems</div>
              <div className="flex flex-col gap-1">
                {problemContainers.map(c => (
                  <span key={c.name} className="text-xs flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.health === 'unhealthy' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <span className="font-mono text-gray-700 dark:text-gray-300">{c.name}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                      c.health === 'unhealthy' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {c.health === 'unhealthy' ? 'unhealthy' : c.state}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{c.status}</span>
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

function OllamaCard({ node }: { node: OllamaNode }) {
  return (
    <div className={`p-3 rounded-xl border ${
      node.online
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 opacity-60'
    }`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${node.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{node.name}</span>
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 ml-3.5">{node.role}</div>
        </div>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          node.online
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
        }`}>
          {node.online ? 'Online' : 'Offline'}
        </span>
      </div>
      {node.online && node.models.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {node.models.map(m => (
            <span key={m.name} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-mono">
              {m.name.includes(':') ? m.name.split(':')[0] : m.name}
            </span>
          ))}
        </div>
      ) : node.online ? (
        <div className="text-xs text-gray-400 dark:text-gray-500">No models loaded</div>
      ) : null}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function readCache<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function LabPage() {
  const [data, setData]           = useState<LabOverview | null>(() => readCache('cache_lab_overview'));
  const [fleet, setFleet]         = useState<FleetData | null>(() => readCache('cache_lab_fleet'));
  const [docker, setDocker]       = useState<DockerSummary | null>(() => readCache('cache_lab_docker_summary'));
  const [containers, setContainers] = useState<DockerContainer[]>(() => readCache<DockerContainer[]>('cache_lab_containers') ?? []);
  const [loading, setLoading]     = useState(() => !readCache('cache_lab_overview'));
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAll = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    const [labRes, fleetRes, dockerRes] = await Promise.allSettled([
      fetch('/api/lab/overview', { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/ops/fleet',    { headers: h }).then(r => r.ok ? r.json() : null),
      fetch('/api/docker/containers?all=1', { headers: h }).then(r => r.ok ? r.json() : null),
    ]);
    if (labRes.status === 'fulfilled' && labRes.value)   { setData(labRes.value); writeCache('cache_lab_overview', labRes.value); }
    if (fleetRes.status === 'fulfilled' && fleetRes.value) { setFleet(fleetRes.value); writeCache('cache_lab_fleet', fleetRes.value); }
    if (dockerRes.status === 'fulfilled' && Array.isArray(dockerRes.value)) {
      const c = dockerRes.value as DockerContainer[];
      setContainers(c);
      writeCache('cache_lab_containers', c);
      const summary = {
        running:   c.filter(x => x.state === 'running').length,
        stopped:   c.filter(x => x.state !== 'running').length,
        unhealthy: c.filter(x => x.health === 'unhealthy').length,
      };
      setDocker(summary);
      writeCache('cache_lab_docker_summary', summary);
    }
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

  return (
    <div className="px-4 py-6 space-y-6">

      {/* ── Guest info ── */}
      {isGuest && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Lab Overview</span> — real-time status of all 5 machines, the AI fleet, and running containers. Internal IP addresses are hidden.
        </div>
      )}

      {/* ── Health Banner ── */}
      {data ? (
        <HealthBanner status={data.status} issues={data.issues} services={data.services} lastRefresh={lastRefresh} containers={containers} />
      ) : loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-800 animate-pulse">
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ) : null}

      {/* ── Quick Stats Row ── */}
      {(docker || fleet) && (
        <div className="grid grid-cols-3 gap-3">
          {/* Docker */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Docker</div>
            {docker ? (
              <div className="flex gap-4">
                <div>
                  <div className="text-xl font-bold text-emerald-500">{docker.running}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">running</div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${docker.stopped > 0 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-600'}`}>{docker.stopped}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">stopped</div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${docker.unhealthy > 0 ? 'text-red-500' : 'text-gray-300 dark:text-gray-700'}`}>{docker.unhealthy}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">unhealthy</div>
                </div>
              </div>
            ) : <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </div>

          {/* LiteLLM */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">LiteLLM</div>
            {fleet ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-sm font-semibold ${fleet.litellm.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {fleet.litellm.online ? 'Online' : 'Offline'}
                  </span>
                  {fleet.litellm.spend !== null && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">${fleet.litellm.spend.toFixed(4)} spent</div>
                  )}
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${fleet.litellm.online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              </div>
            ) : <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </div>

          {/* AI Fleet */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">AI Fleet</div>
            {fleet ? (
              <div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  <span className="text-emerald-500">{fleet.nodes.filter(n => n.online).length}</span>
                  <span className="text-gray-300 dark:text-gray-600 mx-0.5">/</span>
                  <span>{fleet.nodes.length}</span>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500">nodes online</div>
              </div>
            ) : <div className="h-6 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />}
          </div>
        </div>
      )}

      {/* ── Always-On Machines ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Always-On</h2>
        <div className="grid grid-cols-2 gap-3">
          {alwaysOn.map(m => <ServerCard key={m.id} machine={m} />)}
        </div>
      </div>

      {/* ── Burst Machines ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Burst Machines</h2>
        <div className="grid grid-cols-2 gap-3">
          {burst.map(m => <ServerCard key={m.id} machine={m} />)}
        </div>
        {burst.length === 0 && (
          <div className="text-xs text-gray-400 dark:text-gray-500">JoPc / MacBook not configured</div>
        )}
      </div>

      {/* ── AI Fleet ── */}
      {fleet && fleet.nodes.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Inference Fleet</h2>
          <div className="grid grid-cols-2 gap-3">
            {fleet.nodes.map(node => <OllamaCard key={node.id} node={node} />)}
          </div>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Quick Links</h2>
        <div className="space-y-3">
          {LINK_CATEGORIES.map(cat => {
            const links = QUICK_LINKS.filter(l => l.category === cat);
            if (!links.length) return null;
            return (
              <div key={cat}>
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-1.5">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {links.map(link => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                    >
                      <span>{link.icon}</span>
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
