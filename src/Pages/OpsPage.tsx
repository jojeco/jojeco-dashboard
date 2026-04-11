import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../services/api';

const API = '/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlancesNode {
  id: string; name: string; host: string; role: string; online: boolean;
  cpu?: number | null;
  mem?: { used: number; total: number; percent: number } | null;
  fs?: Array<{ mnt_point: string; used: number; size: number; percent: number }>;
  sensors?: Array<{ label: string; value: number }>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pctColor(pct: number) {
  if (pct > 85) return 'bg-red-500';
  if (pct > 65) return 'bg-yellow-400';
  return 'bg-emerald-500';
}

function fmtGB(bytes: number) {
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function maxTemp(sensors: Array<{ label: string; value: number }> = []) {
  return sensors.reduce((m, s) => (s.value > m ? s.value : m), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
        <span>{label}{detail ? <span className="ml-1 opacity-70">{detail}</span> : null}</span>
        <span className={pct > 85 ? 'text-red-500 font-semibold' : ''}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${pctColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function ServerCard({ node }: { node: GlancesNode }) {
  const mainDisk = node.fs?.find(f => f.mnt_point === '/' || f.mnt_point === 'C:') ?? node.fs?.[0];
  const temp = maxTemp(node.sensors);
  const tempColor = temp > 80 ? 'text-red-500' : temp > 60 ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500';

  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      node.online
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'
    }`}>
      <div className="flex items-start justify-between mb-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{node.name}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{node.role}</div>
        </div>
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ml-2 ${node.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      </div>

      {node.online ? (
        <div className="space-y-1.5">
          {node.cpu != null && <UsageBar label="CPU" pct={node.cpu} />}
          {node.mem && (
            <UsageBar
              label="RAM"
              pct={node.mem.percent}
              detail={`${fmtGB(node.mem.used)}/${fmtGB(node.mem.total)}`}
            />
          )}
          {mainDisk && (
            <UsageBar
              label="Disk"
              pct={mainDisk.percent}
              detail={`${(mainDisk.used / 1e9).toFixed(0)}/${(mainDisk.size / 1e9).toFixed(0)} GB`}
            />
          )}
          {temp > 0 && (
            <div className={`text-[11px] mt-1 ${tempColor}`}>🌡 {temp.toFixed(0)}°C</div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Offline / unreachable</div>
      )}
    </div>
  );
}

function OllamaCard({ node }: { node: OllamaNode }) {
  return (
    <div className={`p-3 rounded-xl border ${
      node.online
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{node.name}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{node.role}</div>
        </div>
        <span className={`shrink-0 ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
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
            <span
              key={m.name}
              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-mono"
            >
              {m.name.includes(':') ? m.name.split(':')[0] : m.name}
            </span>
          ))}
        </div>
      ) : node.online ? (
        <div className="text-xs text-gray-400">No models loaded</div>
      ) : null}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpsPage() {
  const [glances, setGlances] = useState<GlancesNode[] | null>(null);
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [docker, setDocker] = useState<DockerSummary | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    const [g, f, d] = await Promise.allSettled([
      fetch(`${API}/ops/glances`, { headers: h }).then(r => r.json()),
      fetch(`${API}/ops/fleet`, { headers: h }).then(r => r.json()),
      fetch(`${API}/docker/containers?all=1`, { headers: h }).then(r => r.json()),
    ]);
    if (g.status === 'fulfilled') setGlances(g.value);
    if (f.status === 'fulfilled') setFleet(f.value);
    if (d.status === 'fulfilled' && Array.isArray(d.value)) {
      const containers = d.value as Array<{ state: string; health: string }>;
      setDocker({
        running: containers.filter(c => c.state === 'running').length,
        stopped: containers.filter(c => c.state !== 'running').length,
        unhealthy: containers.filter(c => c.health === 'unhealthy').length,
      });
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const onlineCount = glances?.filter(n => n.online).length ?? 0;
  const totalNodes = glances?.length ?? 0;
  const fleetOnline = fleet?.nodes.filter(n => n.online).length ?? 0;
  const fleetTotal = fleet?.nodes.length ?? 0;

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Ops Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Live lab + AI fleet · auto-refresh every 8s</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          {!loading && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {onlineCount}/{totalNodes} machines up
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                {fleetOnline}/{fleetTotal} inference nodes
              </span>
            </>
          )}
          <span>{lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-600">
          <div className="text-center">
            <div className="text-2xl mb-2 animate-pulse">⚡</div>
            <div className="text-sm">Loading lab data…</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Lab ── */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Lab Infrastructure
            </h2>

            {/* Docker summary */}
            {docker && (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
                  🐳 Docker — Server 2
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-500">{docker.running}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Running</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400 dark:text-gray-500">{docker.stopped}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Stopped</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${docker.unhealthy > 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-600'}`}>
                      {docker.unhealthy}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Unhealthy</div>
                  </div>
                </div>
              </div>
            )}

            {/* Server vitals grid */}
            <div className="grid grid-cols-2 gap-3">
              {(glances ?? []).map(node => (
                <ServerCard key={node.id} node={node} />
              ))}
            </div>
          </div>

          {/* ── AI Fleet ── */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              AI Fleet
            </h2>

            {/* LiteLLM */}
            {fleet && (
              <div className={`p-4 rounded-xl border ${
                fleet.litellm.online
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  : 'border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">LiteLLM Gateway</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">192.168.50.13:4000 · 20+ models</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      fleet.litellm.online
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {fleet.litellm.online ? 'Online' : 'Offline'}
                    </span>
                    {fleet.litellm.spend !== null && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${fleet.litellm.spend.toFixed(4)} total spend
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Ollama nodes */}
            <div className="grid grid-cols-2 gap-3">
              {(fleet?.nodes ?? []).map(node => (
                <OllamaCard key={node.id} node={node} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
