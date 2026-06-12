/**
 * StatTiles — the hero row of summary tiles at the top of LabPage.
 * Includes: Lab Status, Services (clickable → health panel), Containers,
 * AI Fleet, LiteLLM Gateway, LVM Pool, Claude Agent, Minecraft mini-tile.
 */
import { Link } from 'react-router-dom';
import { Activity, Sword } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LabSection, FleetSection, DockerContainer, McServer } from '@/hooks/useSnapshot';
import { NODE_SHORT } from './utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL = { healthy: '● Healthy', degraded: '⚠ Degraded', critical: '✕ Critical' };
const STATUS_COLOR = { healthy: 'var(--ok)', degraded: 'var(--warn)', critical: 'var(--err)' };
const SVC_LABELS: Record<string, string> = {
  plex: 'Plex', adguard: 'AdGuard', ollama: 'Ollama', prometheus: 'Prom', tailscale: 'Tail',
};

interface HealthSummary { up: number; down: number; total: number; overallStatus: 'healthy' | 'degraded' | 'critical' }

function deriveHealthSummary(servicesHealth: Record<string, { status: string }> | null): HealthSummary | null {
  if (!servicesHealth) return null;
  const entries = Object.values(servicesHealth);
  const up = entries.filter(s => s.status === 'online').length;
  const total = entries.length;
  const down = total - up;
  const overallStatus = down === 0 ? 'healthy' : down < Math.ceil(total / 2) ? 'degraded' : 'critical';
  return { up, down, total, overallStatus };
}

function deriveDockerSummary(containers: DockerContainer[] | null) {
  if (!containers) return null;
  return {
    running: containers.filter(x => x.state === 'running').length,
    stopped: containers.filter(x => x.state !== 'running').length,
    unhealthy: containers.filter(x => x.health === 'unhealthy').length,
  };
}

// ─── Tile wrapper ─────────────────────────────────────────────────────────────

function Tile({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={`j-stat-tile ${className}`} {...props}>
      {children}
    </Card>
  );
}

// ─── Individual tiles ─────────────────────────────────────────────────────────

function LabStatusTile({ lab }: { lab: LabSection | null }) {
  return (
    <Tile>
      <div className="j-panel-title mb-1.5">Status</div>
      {lab ? (
        <>
          <div className="j-stat-num text-[18px]" style={{ color: STATUS_COLOR[lab.status] }}>
            {STATUS_LABEL[lab.status]}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(lab.services).map(([id, up]) => (
              <span key={id} className={`j-chip ${up ? 'j-chip-ok' : 'j-chip-err'}`}>
                {SVC_LABELS[id] ?? id}
              </span>
            ))}
          </div>
          {lab.issues.filter(i => i.severity === 'critical').map((iss, i) => (
            <div key={i} className="text-[10px] mt-1.5 flex gap-1" style={{ color: 'var(--err)' }}>
              <span className="j-dot j-dot-err mt-0.5 shrink-0" />
              {iss.message}
            </div>
          ))}
        </>
      ) : <Skeleton className="h-6 w-20" />}
    </Tile>
  );
}

function ServicesTile({
  servicesHealth, onOpenPanel,
}: { servicesHealth: Record<string, { status: string }> | null; onOpenPanel: () => void }) {
  const summary = deriveHealthSummary(servicesHealth);
  return (
    <button
      onClick={onOpenPanel}
      className="j-stat-tile text-left cursor-pointer transition-shadow hover:shadow-[0_0_0_1px_var(--accent-border),0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ borderRadius: 'var(--radius)', background: 'var(--raised)', border: '1px solid rgba(255,255,255,0.05)', padding: 14 }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity size={12} style={{ color: summary?.overallStatus === 'healthy' ? 'var(--ok)' : summary?.overallStatus === 'critical' ? 'var(--err)' : 'var(--warn)', flexShrink: 0 }} />
        <span className="j-panel-title">Services</span>
        <span className="ml-auto text-[9px] text-[var(--accent)] font-semibold">View all →</span>
      </div>
      {summary ? (
        <>
          <div className="flex gap-3 items-baseline">
            <span className="j-stat-num text-[28px]" style={{ color: 'var(--ok)' }}>{summary.up}</span>
            {summary.down > 0 && <span className="text-[18px] font-mono font-bold" style={{ color: 'var(--err)' }}>-{summary.down}</span>}
          </div>
          <div className="text-[10px] text-[var(--t3)] mt-1">{summary.total} tracked</div>
          <div className="h-0.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--canvas)' }}>
            <div
              className="h-full transition-[width_.5s]"
              style={{
                width: `${summary.total > 0 ? (summary.up / summary.total) * 100 : 0}%`,
                background: summary.overallStatus === 'healthy' ? 'var(--ok)' : summary.overallStatus === 'critical' ? 'var(--err)' : 'var(--warn)',
              }}
            />
          </div>
        </>
      ) : <Skeleton className="h-10" />}
    </button>
  );
}

function ContainersTile({ docker }: { docker: ReturnType<typeof deriveDockerSummary> }) {
  return (
    <Link
      to="/services"
      className="j-stat-tile flex flex-col gap-1 no-underline transition-shadow hover:shadow-[0_0_0_1px_var(--accent-border),0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ borderRadius: 'var(--radius)', background: 'var(--raised)', border: '1px solid rgba(255,255,255,0.05)', padding: 14 }}
    >
      <div className="j-panel-title">Containers</div>
      {docker ? (
        <>
          <div className="j-stat-num" style={{ color: 'var(--ok)' }}>{docker.running}</div>
          <div className="text-[11px] text-[var(--t3)]">running</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {docker.stopped > 0
              ? <span className="j-chip j-chip-warn">{docker.stopped} stopped</span>
              : <span className="text-[10px] text-[var(--t3)]">all running</span>}
            {docker.unhealthy > 0 && <span className="j-chip j-chip-err">{docker.unhealthy} unhealthy</span>}
          </div>
        </>
      ) : <Skeleton className="h-10 w-14" />}
    </Link>
  );
}

function AIFleetTile({ fleet }: { fleet: FleetSection | null }) {
  return (
    <Tile>
      <div className="j-panel-title">AI Fleet</div>
      {fleet ? (() => {
        const online = fleet.nodes.filter(n => n.online).length;
        const total  = fleet.nodes.length;
        const models = new Set(fleet.nodes.flatMap(n => n.models.map(m => m.name))).size;
        return (
          <>
            <div className="j-stat-num" style={{ color: online === total ? 'var(--ok)' : online > 0 ? 'var(--warn)' : 'var(--err)' }}>
              {online}<span className="text-[20px] font-light text-[var(--t3)]">/{total}</span>
            </div>
            <div className="text-[11px] text-[var(--t3)]">nodes online</div>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {fleet.nodes.map(n => (
                <span key={n.id} className={`j-chip ${n.online ? 'j-chip-ok' : ''}`} style={!n.online ? { color: 'var(--t3)' } : {}}>
                  {NODE_SHORT[n.name] ?? n.name}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-[var(--t3)] mt-1.5 font-mono">{models} models</div>
          </>
        );
      })() : <Skeleton className="h-10 w-14" />}
    </Tile>
  );
}

function GatewayTile({ fleet }: { fleet: FleetSection | null }) {
  return (
    <Tile>
      <div className="j-panel-title">Gateway</div>
      {fleet ? (
        <>
          <div className="j-stat-num text-[28px]" style={{ color: fleet.litellm.online ? 'var(--ok)' : 'var(--err)' }}>
            {fleet.litellm.online ? 'Up' : 'Down'}
          </div>
          <div className="text-[11px] text-[var(--t3)]">LiteLLM</div>
          {fleet.litellm.spend != null && (
            <div className="text-[16px] font-mono font-bold text-[var(--t2)] mt-2">
              ${fleet.litellm.spend.toFixed(4)}
              <span className="text-[10px] font-normal text-[var(--t3)] ml-1">spent</span>
            </div>
          )}
        </>
      ) : <Skeleton className="h-10 w-14" />}
    </Tile>
  );
}

function ThinPoolTile({ lab }: { lab: LabSection | null }) {
  const pct = lab?.lvmThinPool;
  return (
    <Tile>
      <div className="j-panel-title">LVM Pool</div>
      {lab ? (
        <>
          <div className="j-stat-num" style={{ color: (pct ?? 0) > 85 ? 'var(--err)' : (pct ?? 0) > 70 ? 'var(--warn)' : 'var(--ok)' }}>
            {pct !== null && pct !== undefined ? `${pct.toFixed(1)}%` : '—'}
          </div>
          <div className="text-[11px] text-[var(--t3)]">pve/data</div>
          {pct !== null && pct !== undefined && (
            <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--canvas)' }}>
              <div
                className="h-full transition-[width_.5s]"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: pct > 85 ? 'var(--err)' : pct > 70 ? 'var(--warn)' : 'var(--ok)',
                }}
              />
            </div>
          )}
        </>
      ) : <Skeleton className="h-10 w-14" />}
    </Tile>
  );
}

function AgentTile({ lab }: { lab: LabSection | null }) {
  return (
    <Tile>
      <div className="j-panel-title">Agent</div>
      {lab ? (
        <>
          <div className="j-stat-num text-[18px]" style={{
            color: lab.claudeRunning === true ? 'var(--ok)' : lab.claudeRunning === false ? 'var(--err)' : 'var(--t3)',
          }}>
            {lab.claudeRunning === true ? 'Running' : lab.claudeRunning === false ? 'Down' : '—'}
          </div>
          <div className="text-[11px] text-[var(--t3)]">jojeco-agent</div>
        </>
      ) : <Skeleton className="h-10 w-14" />}
    </Tile>
  );
}

function MinecraftTile({ minecraft }: { minecraft: Record<string, McServer> | null }) {
  const servers = minecraft ? Object.values(minecraft) : null;
  const running = servers?.filter(s => s.status === 'running') ?? [];
  const totalPlayers = running.reduce((s, sv) => s + (sv.players?.length ?? 0), 0);

  return (
    <Link
      to="/minecraft"
      className="j-stat-tile flex flex-col gap-1 no-underline transition-shadow hover:shadow-[0_0_0_1px_var(--accent-border),0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ borderRadius: 'var(--radius)', background: 'var(--raised)', border: '1px solid rgba(255,255,255,0.05)', padding: 14 }}
    >
      <div className="flex items-center gap-1.5">
        <Sword size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="j-panel-title">Minecraft</span>
      </div>
      {!servers ? (
        <Skeleton className="h-9" />
      ) : (
        <>
          <div className="j-stat-num text-[28px]" style={{ color: running.length > 0 ? 'var(--ok)' : 'var(--t3)' }}>
            {running.length}<span className="text-[16px] font-light text-[var(--t3)]">/{servers.length}</span>
          </div>
          <div className="text-[11px] text-[var(--t3)]">servers up</div>
          {totalPlayers > 0 && (
            <div className="text-[10px] font-semibold mt-1" style={{ color: 'var(--ok)' }}>
              {totalPlayers} online
            </div>
          )}
          <div className="flex gap-1 flex-wrap mt-1">
            {servers.map(s => (
              <span key={s.id} className={`j-chip ${s.status === 'running' ? 'j-chip-ok' : ''}`}
                style={s.status !== 'running' ? { color: 'var(--t3)' } : {}}>
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}
    </Link>
  );
}

// ─── Exported composite ────────────────────────────────────────────────────────

interface StatTilesProps {
  lab: LabSection | null;
  fleet: FleetSection | null;
  docker: DockerContainer[] | null;
  servicesHealth: Record<string, { status: string }> | null;
  minecraft: Record<string, McServer> | null;
  onOpenServicesPanel: () => void;
}

export function StatTiles({ lab, fleet, docker, servicesHealth, minecraft, onOpenServicesPanel }: StatTilesProps) {
  const dockerSummary = deriveDockerSummary(docker);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
      <LabStatusTile lab={lab} />
      <ServicesTile servicesHealth={servicesHealth} onOpenPanel={onOpenServicesPanel} />
      <ContainersTile docker={dockerSummary} />
      <AIFleetTile fleet={fleet} />
      <GatewayTile fleet={fleet} />
      <ThinPoolTile lab={lab} />
      <AgentTile lab={lab} />
      <MinecraftTile minecraft={minecraft} />
    </div>
  );
}
