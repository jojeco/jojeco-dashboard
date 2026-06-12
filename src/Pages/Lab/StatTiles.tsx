/**
 * StatTiles — hero stat strip at the top of LabPage.
 * Dark-control-room aesthetic: surface elevation only, no light borders.
 * Mobile-first: 2-up tile grid on narrow viewports.
 */
import { Link } from 'react-router-dom';
import { Activity, Sword } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LabSection, FleetSection, DockerContainer, McServer } from '@/hooks/useSnapshot';
import { NODE_SHORT } from './utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical' };
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

// ─── Base tile — surface elevation only, zero border ──────────────────────────

const tileBase: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r-lg)',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  overflow: 'hidden',
  boxShadow: 'var(--shadow-ring), var(--shadow-card)',
  transition: 'box-shadow 200ms, transform 150ms',
};

const tileHoverClass = 'hover:shadow-[0_0_0_1px_var(--accent-border),0_8px_24px_rgba(0,0,0,0.55)]';

// ─── Section label inside tile ─────────────────────────────────────────────────

function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 2 }}>
      {children}
    </div>
  );
}

// ─── Individual tiles ─────────────────────────────────────────────────────────

function LabStatusTile({ lab }: { lab: LabSection | null }) {
  return (
    <div style={tileBase}>
      <TileLabel>Status</TileLabel>
      {lab ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: STATUS_COLOR[lab.status],
                boxShadow: `0 0 0 2px ${lab.status === 'healthy' ? 'rgba(34,197,94,0.2)' : lab.status === 'degraded' ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}
            />
            <span style={{ fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 700, color: STATUS_COLOR[lab.status], fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {STATUS_LABEL[lab.status]}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {Object.entries(lab.services).map(([id, up]) => (
              <span key={id} className={`j-chip ${up ? 'j-chip-ok' : 'j-chip-err'}`}>
                {SVC_LABELS[id] ?? id}
              </span>
            ))}
          </div>
          {lab.issues.filter(i => i.severity === 'critical').map((iss, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--err)', marginTop: 4, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              <span className="j-dot j-dot-err" style={{ marginTop: 2, flexShrink: 0 }} />
              {iss.message}
            </div>
          ))}
        </>
      ) : <Skeleton className="h-6 w-20 mt-1" />}
    </div>
  );
}

function ServicesTile({
  servicesHealth, onOpenPanel,
}: { servicesHealth: Record<string, { status: string }> | null; onOpenPanel: () => void }) {
  const summary = deriveHealthSummary(servicesHealth);
  const statusColor = summary?.overallStatus === 'healthy' ? 'var(--ok)' : summary?.overallStatus === 'critical' ? 'var(--err)' : 'var(--warn)';

  return (
    <button
      onClick={onOpenPanel}
      className={tileHoverClass}
      style={{ ...tileBase, cursor: 'pointer', textAlign: 'left', border: 'none', fontFamily: 'inherit', width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Activity size={11} style={{ color: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)' }}>Services</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>View all →</span>
      </div>
      {summary ? (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className="j-stat-num" style={{ color: 'var(--ok)', fontSize: 'clamp(28px, 4vw, 36px)' }}>{summary.up}</span>
            {summary.down > 0 && (
              <span style={{ fontSize: 20, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--err)', fontVariantNumeric: 'tabular-nums' }}>
                -{summary.down}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{summary.total} tracked</div>
          <div style={{ height: 2, borderRadius: 99, overflow: 'hidden', marginTop: 8, background: 'var(--canvas)' }}>
            <div
              style={{
                height: '100%',
                width: `${summary.total > 0 ? (summary.up / summary.total) * 100 : 0}%`,
                background: statusColor,
                transition: 'width 500ms cubic-bezier(0.16,1,0.3,1)',
                borderRadius: 99,
              }}
            />
          </div>
        </>
      ) : <Skeleton className="h-10 mt-1" />}
    </button>
  );
}

function ContainersTile({ docker }: { docker: ReturnType<typeof deriveDockerSummary> }) {
  return (
    <Link
      to="/services"
      className={tileHoverClass}
      style={{ ...tileBase, textDecoration: 'none', color: 'inherit' }}
    >
      <TileLabel>Containers</TileLabel>
      {docker ? (
        <>
          <span className="j-stat-num" style={{ color: 'var(--ok)', fontSize: 'clamp(28px, 4vw, 36px)' }}>{docker.running}</span>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>running</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {docker.stopped > 0
              ? <span className="j-chip j-chip-warn">{docker.stopped} stopped</span>
              : <span style={{ fontSize: 10, color: 'var(--t3)' }}>all running</span>}
            {docker.unhealthy > 0 && <span className="j-chip j-chip-err">{docker.unhealthy} unhealthy</span>}
          </div>
        </>
      ) : <Skeleton className="h-10 w-14 mt-1" />}
    </Link>
  );
}

function AIFleetTile({ fleet }: { fleet: FleetSection | null }) {
  return (
    <div style={tileBase}>
      <TileLabel>AI Fleet</TileLabel>
      {fleet ? (() => {
        const online = fleet.nodes.filter(n => n.online).length;
        const total  = fleet.nodes.length;
        const models = new Set(fleet.nodes.flatMap(n => n.models.map(m => m.name))).size;
        const statusColor = online === total ? 'var(--ok)' : online > 0 ? 'var(--warn)' : 'var(--err)';
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span className="j-stat-num" style={{ color: statusColor, fontSize: 'clamp(28px, 4vw, 36px)' }}>{online}</span>
              <span style={{ fontSize: 16, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)', fontWeight: 300, marginLeft: 1 }}>/{total}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>nodes online</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {fleet.nodes.map(n => (
                <span key={n.id} className={`j-chip ${n.online ? 'j-chip-ok' : ''}`} style={!n.online ? { color: 'var(--t3)' } : {}}>
                  {NODE_SHORT[n.name] ?? n.name}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, fontFamily: 'Geist Mono, monospace' }}>{models} models</div>
          </>
        );
      })() : <Skeleton className="h-10 w-14 mt-1" />}
    </div>
  );
}

function GatewayTile({ fleet }: { fleet: FleetSection | null }) {
  return (
    <div style={tileBase}>
      <TileLabel>Gateway</TileLabel>
      {fleet ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: fleet.litellm.online ? 'var(--ok)' : 'var(--err)',
              boxShadow: fleet.litellm.online ? '0 0 0 2px rgba(34,197,94,0.2)' : '0 0 0 2px rgba(239,68,68,0.2)',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: fleet.litellm.online ? 'var(--ok)' : 'var(--err)', lineHeight: 1 }}>
              {fleet.litellm.online ? 'Up' : 'Down'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>LiteLLM</div>
          {fleet.litellm.spend != null && (
            <div style={{ fontSize: 15, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t2)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              ${fleet.litellm.spend.toFixed(4)}
              <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>spent</span>
            </div>
          )}
        </>
      ) : <Skeleton className="h-10 w-14 mt-1" />}
    </div>
  );
}

function ThinPoolTile({ lab }: { lab: LabSection | null }) {
  const pct = lab?.lvmThinPool;
  const color = (pct ?? 0) > 85 ? 'var(--err)' : (pct ?? 0) > 70 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div style={tileBase}>
      <TileLabel>LVM Pool</TileLabel>
      {lab ? (
        <>
          <span className="j-stat-num" style={{ color, fontSize: 'clamp(22px, 3.5vw, 32px)', marginTop: 2 }}>
            {pct !== null && pct !== undefined ? `${pct.toFixed(1)}%` : '—'}
          </span>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>pve/data</div>
          {pct !== null && pct !== undefined && (
            <div style={{ marginTop: 8, height: 2, borderRadius: 99, overflow: 'hidden', background: 'var(--canvas)' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: 'width 500ms cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
          )}
        </>
      ) : <Skeleton className="h-10 w-14 mt-1" />}
    </div>
  );
}

function AgentTile({ lab }: { lab: LabSection | null }) {
  const color = lab?.claudeRunning === true ? 'var(--ok)' : lab?.claudeRunning === false ? 'var(--err)' : 'var(--t3)';
  const label = lab?.claudeRunning === true ? 'Active' : lab?.claudeRunning === false ? 'Down' : '—';
  return (
    <div style={tileBase}>
      <TileLabel>Agent</TileLabel>
      {lab ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {lab.claudeRunning !== undefined && lab.claudeRunning !== null && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: color,
                boxShadow: lab.claudeRunning ? '0 0 0 2px rgba(34,197,94,0.2)' : '0 0 0 2px rgba(239,68,68,0.2)',
                flexShrink: 0,
                animation: lab.claudeRunning ? 'pulseDot 2.5s ease-in-out infinite' : 'none',
              }} />
            )}
            <span style={{ fontSize: 'clamp(16px, 3vw, 22px)', fontWeight: 700, color, lineHeight: 1 }}>{label}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>jojeco-agent</div>
        </>
      ) : <Skeleton className="h-10 w-14 mt-1" />}
    </div>
  );
}

function MinecraftTile({ minecraft }: { minecraft: Record<string, McServer> | null }) {
  const servers = minecraft ? Object.values(minecraft) : null;
  const running = servers?.filter(s => s.status === 'running') ?? [];
  const totalPlayers = running.reduce((s, sv) => s + (sv.players?.length ?? 0), 0);

  return (
    <Link
      to="/minecraft"
      className={tileHoverClass}
      style={{ ...tileBase, textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <Sword size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <TileLabel>Minecraft</TileLabel>
      </div>
      {!servers ? (
        <Skeleton className="h-9 mt-1" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span className="j-stat-num" style={{ color: running.length > 0 ? 'var(--ok)' : 'var(--t3)', fontSize: 'clamp(24px, 3.5vw, 32px)' }}>
              {running.length}
            </span>
            <span style={{ fontSize: 14, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)', fontWeight: 300 }}>/{servers.length}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>servers up</div>
          {totalPlayers > 0 && (
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ok)', marginTop: 4 }}>{totalPlayers} online</div>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8, marginBottom: 12 }}>
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
