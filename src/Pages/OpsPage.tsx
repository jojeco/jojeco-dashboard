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

// ─── Model metadata ───────────────────────────────────────────────────────────

const MODEL_DESC: Record<string, string> = {
  'jojeco-fast':      'Fast text · summaries',
  'jojeco-code':      'Code generation',
  'jojeco-smart':     'Complex reasoning',
  'jojeco-reason':    'Deep analysis · debug',
  'jojeco-assistant': 'General assistant',
};

const MODEL_CATEGORY: Record<string, { label: string; color: string }> = {
  'gemma4':           { label: 'fast',   color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
  'phi4':             { label: 'fast',   color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
  'deepseek-r1':      { label: 'reason', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' },
  'qwen2.5-coder':    { label: 'code',   color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  'qwen2.5':          { label: 'general', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  'llava':            { label: 'vision', color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
  'nomic-embed-text': { label: 'embed',  color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

function getCategory(name: string) {
  const base = name.includes(':') ? name.split(':')[0] : name;
  if (base.startsWith('jojeco-')) return { label: 'preset', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300' };
  return MODEL_CATEGORY[base] ?? { label: 'general', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
}

function nodeShort(name: string) {
  const map: Record<string, string> = { 'Server 3': 'S3', 'Server 1': 'S1', 'MacBook M4': 'MBP', 'JoPc': 'JoPc' };
  return map[name] ?? name.slice(0, 3);
}

// tok/s benchmarks — fleet benchmark 2026-04-11
const MODEL_SPEED: Record<string, number> = {
  'gemma4:e4b':    125,
  'gemma4:26b':    31.7,
  'gemma4:31b':    1.6,
  'qwen2.5:7b':    17,
  'qwen2.5:14b':   8,
  'qwen2.5-coder:7b': 17,
  'deepseek-r1:14b':  4.9,
  'deepseek-r1:7b':   9,
  'llava:7b':      14,
};

function modelSpeed(name: string): number | null {
  if (MODEL_SPEED[name] != null) return MODEL_SPEED[name];
  // strip tag for alias lookup
  const base = name.includes(':') ? name.split(':')[0] : name;
  return MODEL_SPEED[base] ?? null;
}

function speedColor(tps: number) {
  if (tps >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (tps >= 20) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-orange-500 dark:text-orange-400';
}

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
      <div className="flex items-start justify-between mb-1">
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
      {node.online && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500">
          {node.models.length} model{node.models.length !== 1 ? 's' : ''} loaded
        </div>
      )}
    </div>
  );
}

function ModelCatalog({ nodes }: { nodes: OllamaNode[] }) {
  const catalog = new Map<string, { size: number; nodeNames: string[] }>();
  nodes.filter(n => n.online).forEach(node => {
    node.models.forEach(m => {
      const existing = catalog.get(m.name);
      if (existing) {
        existing.nodeNames.push(node.name);
      } else {
        catalog.set(m.name, { size: m.size, nodeNames: [node.name] });
      }
    });
  });

  const entries = Array.from(catalog.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => {
      const aPreset = a.name.startsWith('jojeco-');
      const bPreset = b.name.startsWith('jojeco-');
      if (aPreset !== bPreset) return aPreset ? -1 : 1;
      const aEmbed = a.name.includes('embed');
      const bEmbed = b.name.includes('embed');
      if (aEmbed !== bEmbed) return aEmbed ? 1 : -1;
      return b.size - a.size;
    });

  if (entries.length === 0) return null;

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
        Model Catalog · {entries.length} unique models
      </div>
      <div className="space-y-1">
        {entries.map(({ name, size, nodeNames }) => {
          const cat = getCategory(name);
          const tps = modelSpeed(name);
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
                    {nodeShort(n)}
                  </span>
                ))}
                {sizeGB && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono w-12 text-right">{sizeGB}</span>
                )}
                {tps != null && (
                  <span className={`text-[10px] font-semibold w-14 text-right ${speedColor(tps)}`}>{tps} t/s</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
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

            {/* Ollama node status */}
            <div className="grid grid-cols-2 gap-3">
              {(fleet?.nodes ?? []).map(node => (
                <OllamaCard key={node.id} node={node} />
              ))}
            </div>

            {/* Unified model catalog */}
            {fleet && <ModelCatalog nodes={fleet.nodes} />}
          </div>
        </div>
      )}
    </div>
  );
}
