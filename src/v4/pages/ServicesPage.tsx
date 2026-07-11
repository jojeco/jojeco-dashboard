/**
 * v4 ServicesPage — slice 2: host-grouped service matrix + CT100 container list.
 *
 * Data:
 *  - labHostServices (SSE snapshot, 30s TTL): 22 services across CT100/S3/S1/MacMini
 *  - /api/docker/containers (local fetch, 15s poll): full container records for CT100
 *
 * DESIGN.md rules enforced:
 *  - Dense rows, 2px inset status stripe, no light borders, no 3-equal-card rows
 *  - Geist Mono for all numbers, ports, latencies, uptime values
 *  - Status colors (Nominal/Fault/Standby) only on live state — never decorative
 *  - Open-link accent uses Command Blue (#58a6ff = var(--v4-amber) in palette)
 *  - Click → DetailModal (bottom-sheet on mobile, mid-screen on desktop)
 *  - No fabricated data — missing fields render "—" in Dimmed Trace
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, RotateCcw, Square, Play, Shield } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { DetailModal } from '../components/DetailModal';
import { Panel, PanelTitle, PageTitle, Mono, Hairline, Skeleton, EmptyState, StatusChip } from '../components/Primitives';
import { ContainerLogTail } from '../components/ContainerLogTail';
import { AiFleetPanel } from '../components/AiFleetPanel';
import { getToken } from '../../services/api';
import type { LabHostService, LabHostServicesGroup } from '../../hooks/useSnapshot';

// ── Docker container types (full shape from /api/docker/containers) ──────────

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  ports: string[];
  created: number;
  compose_project?: string;
}

// Containers the API refuses to stop/restart — flagged visually here too.
const PROTECTED_CONTAINERS = new Set([
  'nginx-proxy-manager', 'portainer', 'cloudflared', 'jojeco-dashboard-api',
]);

const CONTROL_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') as string;

async function containerAction(name: string, action: 'restart' | 'stop' | 'start'): Promise<{ ok: boolean; msg: string }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${CONTROL_BASE}/controls/container/${name}/${action}`, { method: 'POST', headers });
    const d = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, msg: String(d.message ?? d.error ?? (res.ok ? 'Done' : 'Failed')) };
  } catch { return { ok: false, msg: 'Network error' }; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripeColor(online: boolean | undefined): string {
  if (online === true)  return 'var(--v4-nominal)';
  if (online === false) return 'var(--v4-fault)';
  return 'var(--v4-standby)';
}

function containerStripe(state: string): string {
  if (state === 'running') return 'var(--v4-nominal)';
  if (state === 'exited')  return 'var(--v4-fault)';
  if (state === 'paused')  return 'var(--v4-degraded)';
  return 'var(--v4-standby)';
}

function uptimeSince(created: number): string {
  const diff = Math.floor((Date.now() / 1000) - created);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Derive a web UI URL from hostIp + port. Returns null when port is unknown. */
function guessUrl(hostIp: string, port: number | undefined): string | null {
  if (!port || !hostIp) return null;
  return `http://${hostIp}:${port}`;
}

// ── Service detail modal body ─────────────────────────────────────────────────

interface ServiceDetailProps {
  service: LabHostService;
  group: LabHostServicesGroup;
  matchedContainer: DockerContainer | null;
}

function ServiceDetailBody({ service, group, matchedContainer }: ServiceDetailProps) {
  const url = guessUrl(group.hostIp, service.port);
  const stripe = stripeColor(service.online);

  return (
    <div className="flex flex-col gap-4">
      {/* URL / port row */}
      <div
        className="flex flex-col gap-2 px-3 py-3 rounded-[0.5rem]"
        style={{ background: 'var(--v4-well)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.75rem] uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>Host</span>
          <div className="flex items-center gap-1.5">
            <Mono dim className="text-[0.8125rem]">{group.host}</Mono>
            <Mono trace className="text-[0.75rem]">·</Mono>
            <Mono dim className="text-[0.75rem]">{group.hostIp}</Mono>
          </div>
        </div>
        {service.port != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.75rem] uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>Port</span>
            <Mono dim className="text-[0.8125rem]">:{service.port}</Mono>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.75rem] uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>Status</span>
          <span
            className="font-mono text-[0.75rem] font-semibold tabular-nums"
            style={{ color: stripe }}
          >
            {service.online ? 'UP' : service.online === false ? 'DOWN' : '—'}
          </span>
        </div>
        {service.online && service.responseTime != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.75rem] uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>Latency</span>
            <Mono className="text-[0.8125rem]" style={{ color: 'var(--v4-nominal)' }}>{service.responseTime}ms</Mono>
          </div>
        )}
      </div>

      {/* Docker container state — only if matched */}
      {matchedContainer && (
        <>
          <Hairline />
          <div>
            <div
              className="text-[0.6875rem] uppercase tracking-[0.06em] mb-2"
              style={{ color: 'var(--v4-readout)' }}
            >
              Container
            </div>
            <div
              className="flex flex-col gap-1.5 px-3 py-3 rounded-[0.5rem]"
              style={{
                background: 'var(--v4-well)',
                boxShadow: `inset 2px 0 0 ${containerStripe(matchedContainer.state)}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Name</span>
                <Mono dim className="text-[0.75rem] truncate max-w-[60%]">{matchedContainer.name}</Mono>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>State</span>
                <span
                  className="font-mono text-[0.75rem] font-semibold tabular-nums"
                  style={{ color: containerStripe(matchedContainer.state) }}
                >
                  {matchedContainer.state.toUpperCase()}
                </span>
              </div>
              {matchedContainer.health !== 'none' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Health</span>
                  <Mono
                    className="text-[0.75rem]"
                    style={{
                      color: matchedContainer.health === 'healthy' ? 'var(--v4-nominal)'
                        : matchedContainer.health === 'unhealthy' ? 'var(--v4-fault)'
                        : 'var(--v4-degraded)',
                    }}
                  >
                    {matchedContainer.health}
                  </Mono>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Uptime</span>
                <Mono dim className="text-[0.75rem]">{uptimeSince(matchedContainer.created)}</Mono>
              </div>
              {matchedContainer.image && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Image</span>
                  <Mono trace className="text-[0.6875rem] truncate max-w-[60%]">{matchedContainer.image.split(':')[0]}</Mono>
                </div>
              )}
              {matchedContainer.ports.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[0.75rem] shrink-0" style={{ color: 'var(--v4-readout)' }}>Ports</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {matchedContainer.ports.slice(0, 3).map(p => (
                      <Mono key={p} trace className="text-[0.6875rem]">{p}</Mono>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Container logs via Loki (only when a matched container exists) */}
      {matchedContainer && (
        <>
          <Hairline />
          <div>
            <div
              className="text-[0.6875rem] uppercase tracking-[0.06em] mb-2"
              style={{ color: 'var(--v4-readout)' }}
            >
              Logs
            </div>
            <ContainerLogTail containerName={matchedContainer.name} lines={100} />
          </div>
        </>
      )}

      {/* Quick launch */}
      {url && (
        <>
          <Hairline />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 rounded-[0.5rem] text-[0.875rem] font-medium transition-opacity hover:opacity-80 active:-translate-y-px"
            style={{
              background: 'color-mix(in srgb, var(--v4-amber) 12%, transparent)',
              color: 'var(--v4-amber)',
            }}
          >
            <ExternalLink size={14} aria-hidden />
            Open in browser
          </a>
        </>
      )}
    </div>
  );
}

// ── Service row tile ──────────────────────────────────────────────────────────

interface ServiceRowProps {
  service: LabHostService;
  group: LabHostServicesGroup;
  onSelect: (svc: LabHostService, grp: LabHostServicesGroup) => void;
}

function ServiceRow({ service, group, onSelect }: ServiceRowProps) {
  const stripe = stripeColor(service.online);

  return (
    <button
      onClick={() => onSelect(service, group)}
      className="v4-tile flex items-center justify-between gap-3 px-3 py-2.5 rounded-[0.5rem] w-full text-left v4-settle"
      style={{
        background: 'var(--v4-well)',
        boxShadow: `inset 2px 0 0 ${stripe}`,
        minHeight: 44,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {/* Name + down label */}
      <div className="flex flex-col min-w-0">
        <span
          className="text-[0.8125rem] font-medium truncate"
          style={{ color: 'var(--v4-signal)' }}
        >
          {service.label}
        </span>
        {service.online === false && (
          <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-fault)' }}>DOWN</Mono>
        )}
      </div>

      {/* Port + latency */}
      <div className="flex items-center gap-3 shrink-0">
        {service.port != null && (
          <Mono dim className="text-[0.75rem]">:{service.port}</Mono>
        )}
        {service.online && service.responseTime != null ? (
          <Mono className="text-[0.75rem]" style={{ color: 'var(--v4-nominal)' }}>
            {service.responseTime}ms
          </Mono>
        ) : service.online === false ? null : (
          <Mono trace className="text-[0.75rem]">—</Mono>
        )}
      </div>
    </button>
  );
}

// ── Host group section ────────────────────────────────────────────────────────

interface HostGroupSectionProps {
  group: LabHostServicesGroup;
  onSelect: (svc: LabHostService, grp: LabHostServicesGroup) => void;
}

function HostGroupSection({ group, onSelect }: HostGroupSectionProps) {
  const down    = group.services.filter(s => s.online === false);
  const hasDown = down.length > 0;
  const allDown = down.length === group.services.length;

  const headerStripe = allDown ? 'var(--v4-fault)'
    : hasDown ? 'var(--v4-degraded)'
    : 'var(--v4-nominal)';

  return (
    <div className="flex flex-col gap-2">
      {/* Host header */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-[0.5rem]"
        style={{
          background: 'var(--v4-console)',
          boxShadow: `inset 2px 0 0 ${headerStripe}, 0 1px 0 rgba(0,0,0,0.4)`,
        }}
      >
        <div className="flex flex-col min-w-0">
          <span
            className="text-[0.8125rem] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--v4-signal)' }}
          >
            {group.host}
          </span>
          <Mono trace className="text-[0.6875rem]">{group.hostIp}</Mono>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasDown && (
            <Mono className="text-[0.6875rem] font-semibold" style={{ color: 'var(--v4-fault)' }}>
              {down.length} DOWN
            </Mono>
          )}
          <Mono
            className="text-[0.8125rem]"
            style={{ color: hasDown ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
          >
            {group.services.length - down.length}/{group.services.length}
          </Mono>
        </div>
      </div>

      {/* Service rows grid — dense, auto-fill on desktop */}
      <div
        className="grid gap-1.5 v4-stagger"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {/* Down services first */}
        {[...down, ...group.services.filter(s => s.online !== false)].map(svc => (
          <ServiceRow
            key={svc.id}
            service={svc}
            group={group}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ── Docker container row ──────────────────────────────────────────────────────

interface ContainerRowProps {
  container: DockerContainer;
  onSelect: (c: DockerContainer) => void;
}

function ContainerRow({ container: c, onSelect }: ContainerRowProps) {
  const stripe = containerStripe(c.state);

  return (
    <button
      onClick={() => onSelect(c)}
      className="v4-tile flex items-center justify-between gap-3 px-3 py-2.5 rounded-[0.5rem] w-full text-left v4-settle"
      style={{
        background: 'var(--v4-well)',
        boxShadow: `inset 2px 0 0 ${stripe}`,
        minHeight: 44,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <div className="flex flex-col min-w-0">
        <span
          className="text-[0.8125rem] font-medium truncate"
          style={{ color: 'var(--v4-signal)' }}
        >
          {c.name}
        </span>
        {c.compose_project && (
          <span className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-trace)' }}>
            {c.compose_project}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {c.health !== 'none' && (
          <span
            className="font-mono text-[0.6875rem] tabular-nums"
            style={{
              color: c.health === 'healthy' ? 'var(--v4-nominal)'
                : c.health === 'unhealthy' ? 'var(--v4-fault)'
                : 'var(--v4-degraded)',
            }}
          >
            {c.health}
          </span>
        )}
        <Mono
          className="text-[0.75rem] font-semibold"
          style={{ color: stripe }}
        >
          {c.state}
        </Mono>
        <Mono trace className="text-[0.75rem]">{uptimeSince(c.created)}</Mono>
      </div>
    </button>
  );
}

// ── Container action controls (confirm-gated, ported from ControlsPage) ───────

function ContainerActions({ container: c }: { container: DockerContainer }) {
  const isProtected = PROTECTED_CONTAINERS.has(c.name);
  const running = c.state === 'running';

  const [pending, setPending] = useState<'restart' | 'stop' | 'start' | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function run(action: 'restart' | 'stop' | 'start') {
    setBusy(true);
    const r = await containerAction(c.name, action);
    setResult(r);
    setBusy(false);
    setPending(null);
  }

  const btnBase = 'flex items-center gap-1.5 px-4 py-2.5 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[44px] flex-1 justify-center disabled:opacity-40 active:-translate-y-px transition-transform';

  return (
    <div className="flex flex-col gap-3">
      {isProtected && (
        <div className="flex items-center gap-2">
          <Shield size={11} style={{ color: 'var(--v4-degraded)' }} />
          <span className="text-[0.7rem]" style={{ color: 'var(--v4-degraded)' }}>
            Protected — stop/restart blocked at API level
          </span>
        </div>
      )}

      {result && (
        <Mono
          className="text-[0.75rem] px-3 py-2 rounded-[0.5rem]"
          style={{
            color: result.ok ? 'var(--v4-nominal)' : 'var(--v4-fault)',
            background: result.ok ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
          }}
        >
          {result.msg}
        </Mono>
      )}

      {pending ? (
        /* Inline confirm step (names the target — DESIGN.md destructive rule) */
        <div className="flex flex-col gap-2 px-3 py-3 rounded-[0.5rem]" style={{ background: 'var(--v4-well)' }}>
          <span className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
            {pending === 'stop' ? `Stop "${c.name}"?` : pending === 'restart' ? `Restart "${c.name}"?` : `Start "${c.name}"?`}
          </span>
          <div className="flex gap-2 justify-end">
            <button
              className="px-4 py-2 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[40px]"
              style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: 'pointer' }}
              onClick={() => setPending(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-[0.5rem] text-[0.8125rem] font-semibold min-h-[40px] active:-translate-y-px transition-transform"
              style={{
                background: pending === 'start' ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                color: pending === 'start' ? 'var(--v4-nominal)' : 'var(--v4-fault)',
                border: `1px solid ${pending === 'start' ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
                cursor: busy ? 'default' : 'pointer',
              }}
              onClick={() => run(pending)}
              disabled={busy}
            >
              {busy ? '…' : pending.charAt(0).toUpperCase() + pending.slice(1)}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <button
            className={btnBase}
            style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: busy ? 'default' : 'pointer' }}
            disabled={busy}
            onClick={() => setPending('restart')}
          >
            <RotateCcw size={13} className="shrink-0" /> Restart
          </button>
          {running ? (
            <button
              className={btnBase}
              style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)', border: '1px solid rgba(248,81,73,0.25)', cursor: busy || isProtected ? 'default' : 'pointer' }}
              disabled={busy || isProtected}
              onClick={() => setPending('stop')}
              title={isProtected ? 'Protected container' : undefined}
            >
              <Square size={13} className="shrink-0" /> Stop
            </button>
          ) : (
            <button
              className={btnBase}
              style={{ background: 'rgba(63,185,80,0.08)', color: 'var(--v4-nominal)', border: '1px solid rgba(63,185,80,0.25)', cursor: busy ? 'default' : 'pointer' }}
              disabled={busy}
              onClick={() => setPending('start')}
            >
              <Play size={13} className="shrink-0" /> Start
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Container detail modal body ───────────────────────────────────────────────

function ContainerDetailBody({ container: c }: { container: DockerContainer }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-2 px-3 py-3 rounded-[0.5rem]"
        style={{
          background: 'var(--v4-well)',
          boxShadow: `inset 2px 0 0 ${containerStripe(c.state)}`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>State</span>
          <Mono
            className="text-[0.8125rem] font-semibold"
            style={{ color: containerStripe(c.state) }}
          >
            {c.state.toUpperCase()}
          </Mono>
        </div>
        {c.health !== 'none' && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Health</span>
            <Mono
              className="text-[0.75rem]"
              style={{
                color: c.health === 'healthy' ? 'var(--v4-nominal)'
                  : c.health === 'unhealthy' ? 'var(--v4-fault)'
                  : 'var(--v4-degraded)',
              }}
            >
              {c.health}
            </Mono>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Uptime</span>
          <Mono dim className="text-[0.75rem]">{uptimeSince(c.created)}</Mono>
        </div>
        {c.compose_project && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Stack</span>
            <Mono dim className="text-[0.75rem]">{c.compose_project}</Mono>
          </div>
        )}
        {c.image && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Image</span>
            <Mono trace className="text-[0.6875rem] truncate max-w-[60%]">{c.image}</Mono>
          </div>
        )}
        {c.ports.length > 0 && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[0.75rem] shrink-0" style={{ color: 'var(--v4-readout)' }}>Ports</span>
            <div className="flex flex-wrap gap-1 justify-end">
              {c.ports.map(p => (
                <Mono key={p} trace className="text-[0.6875rem]">{p}</Mono>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
        <Mono trace className="text-[0.6875rem]">{c.status}</Mono>
      </div>

      {/* Confirm-gated controls (ported from Controls page) */}
      <Hairline />
      <ContainerActions container={c} />

      {/* Log tail section */}
      <Hairline />
      <div>
        <div
          className="text-[0.6875rem] uppercase tracking-[0.06em] mb-2"
          style={{ color: 'var(--v4-readout)' }}
        >
          Logs
        </div>
        <ContainerLogTail containerName={c.name} lines={100} />
      </div>
    </div>
  );
}

// ── Docker containers section (CT100 host) ────────────────────────────────────

interface DockerSectionProps {
  containers: DockerContainer[];
  loading: boolean;
  error: string | null;
}

function DockerContainersSection({ containers, loading, error }: DockerSectionProps) {
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);
  const [showStopped, setShowStopped] = useState(false);

  const filtered = showStopped ? containers : containers.filter(c => c.state === 'running');
  const running   = containers.filter(c => c.state === 'running').length;
  const stopped   = containers.filter(c => c.state !== 'running').length;
  const unhealthy = containers.filter(c => c.health === 'unhealthy').length;

  // Sort: unhealthy → stopped → running; alphabetical within groups
  const sorted = [...filtered].sort((a, b) => {
    if (a.health === 'unhealthy' && b.health !== 'unhealthy') return -1;
    if (b.health === 'unhealthy' && a.health !== 'unhealthy') return 1;
    if (a.state !== 'running' && b.state === 'running') return -1;
    if (b.state !== 'running' && a.state === 'running') return 1;
    return a.name.localeCompare(b.name);
  });

  const statusLevel = unhealthy > 0 ? 'fault' : stopped > 0 ? 'degraded' : 'nominal';
  const statusLabel = unhealthy > 0 ? `${unhealthy} unhealthy`
    : stopped > 0 ? `${stopped} stopped`
    : `${running} running`;

  return (
    <>
      <Panel className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <PanelTitle>CT100 Containers</PanelTitle>
          </div>
          <div className="flex items-center gap-3">
            {!loading && !error && (
              <StatusChip level={statusLevel} label={statusLabel} />
            )}
            <button
              onClick={() => setShowStopped(v => !v)}
              className="text-[0.75rem] font-medium"
              style={{
                background: 'none',
                border: 'none',
                color: showStopped ? 'var(--v4-amber)' : 'var(--v4-trace)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showStopped ? 'Hide stopped' : `+${stopped} stopped`}
            </button>
          </div>
        </div>

        {loading && containers.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : error ? (
          <EmptyState message="Docker API unavailable" action="Check CT100 connectivity" />
        ) : sorted.length === 0 ? (
          <EmptyState
            message="No containers visible"
            action={showStopped ? 'No containers found' : 'Toggle "show stopped" to see all'}
          />
        ) : (
          /* Dense grid — auto-fill on desktop */
          <div
            className="grid gap-1.5 v4-stagger"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {sorted.map(c => (
              <ContainerRow key={c.id || c.name} container={c} onSelect={setSelectedContainer} />
            ))}
          </div>
        )}
      </Panel>

      {/* Container detail modal */}
      <DetailModal
        open={selectedContainer !== null}
        onClose={() => setSelectedContainer(null)}
        title={selectedContainer?.name ?? ''}
        statusLevel={
          selectedContainer?.health === 'unhealthy' ? 'fault'
          : selectedContainer?.state === 'running' ? 'nominal'
          : 'standby'
        }
        statusLabel={
          selectedContainer?.state === 'running'
            ? (selectedContainer?.health !== 'none' ? selectedContainer.health : 'running')
            : selectedContainer?.state ?? ''
        }
      >
        {selectedContainer && <ContainerDetailBody container={selectedContainer} />}
      </DetailModal>
    </>
  );
}

// ── Docker fetch hook ─────────────────────────────────────────────────────────

const DOCKER_POLL_MS = 15_000;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function useDockerContainers() {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const r = await fetch(`${API_BASE}/docker/containers?all=0`, { headers });
      if (r.ok) {
        const d: DockerContainer[] = await r.json();
        setContainers(d);
        setError(null);
      } else {
        setError('Docker API error');
      }
    } catch {
      setError('Cannot reach Docker API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    timerRef.current = setInterval(() => void fetch_(), DOCKER_POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch_]);

  return { containers, loading, error };
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const { data: hostsData, loading: hostsLoading } = useSnapshot('labHostServices');
  const { containers, loading: dockerLoading, error: dockerError } = useDockerContainers();

  // Selected service state for detail modal
  const [selectedService, setSelectedService] = useState<LabHostService | null>(null);
  const [selectedGroup,   setSelectedGroup]   = useState<LabHostServicesGroup | null>(null);

  const handleSelectService = useCallback((svc: LabHostService, grp: LabHostServicesGroup) => {
    setSelectedService(svc);
    setSelectedGroup(grp);
  }, []);

  const handleCloseServiceModal = useCallback(() => {
    setSelectedService(null);
    setSelectedGroup(null);
  }, []);

  const groups      = hostsData?.groups ?? [];
  const allServices = groups.flatMap(g => g.services);
  const totalUp     = allServices.filter(s => s.online === true).length;
  const totalDown   = allServices.filter(s => s.online === false).length;
  const totalSvcs   = allServices.length;
  const waiting     = hostsLoading || hostsData == null;

  // Match a service to a docker container by name similarity
  function matchContainer(svc: LabHostService): DockerContainer | null {
    if (!containers.length) return null;
    const needle = svc.id.replace(/^s\d+-/, '').toLowerCase();
    return containers.find(c => {
      const cname = c.name.replace(/^\//, '').toLowerCase();
      return cname === needle
        || cname.includes(needle)
        || needle.includes(cname.replace(/-/g, ''));
    }) ?? null;
  }

  // Summary status level
  const summaryLevel = totalDown === 0 ? 'nominal'
    : totalDown === totalSvcs ? 'fault'
    : 'degraded';

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <PageTitle>Services</PageTitle>
          {!waiting && totalSvcs > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <Mono
                className="text-[1rem] font-semibold"
                style={{ color: totalDown > 0 ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
              >
                {totalUp}/{totalSvcs}
              </Mono>
              <span className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
                {totalDown > 0
                  ? `${totalDown} down · ${groups.length} hosts reporting`
                  : `all up · ${groups.length} hosts`}
              </span>
            </div>
          )}
        </div>
        {!waiting && totalSvcs > 0 && (
          <StatusChip
            level={summaryLevel}
            label={totalDown > 0 ? `${totalDown} DOWN` : 'ALL UP'}
            className="mt-1 shrink-0"
          />
        )}
      </div>

      {/* ── Host-grouped service matrix ───────────────────────────────── */}
      <Panel className="p-4">
        <PanelTitle className="mb-4">Lab Services</PanelTitle>

        {waiting ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, gi) => (
              <div key={gi} className="flex flex-col gap-1.5">
                <Skeleton className="h-11 w-full" />
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
                >
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            message="No service data available"
            action="Check SSE connection and lab/host-services endpoint"
          />
        ) : (
          <div className="flex flex-col gap-5 v4-stagger">
            {groups.map(group => (
              <HostGroupSection
                key={group.host}
                group={group}
                onSelect={handleSelectService}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* ── CT100 Docker containers ───────────────────────────────────── */}
      <DockerContainersSection
        containers={containers}
        loading={dockerLoading}
        error={dockerError}
      />

      {/* ── AI fleet (moved from the retired System tab) ──────────────── */}
      <AiFleetPanel />

      {/* ── Service detail modal ──────────────────────────────────────── */}
      {selectedService && selectedGroup && (
        <DetailModal
          open={true}
          onClose={handleCloseServiceModal}
          title={selectedService.label}
          statusLevel={
            selectedService.online === true ? 'nominal'
            : selectedService.online === false ? 'fault'
            : 'standby'
          }
          statusLabel={
            selectedService.online === true ? 'UP'
            : selectedService.online === false ? 'DOWN'
            : 'UNKNOWN'
          }
        >
          <ServiceDetailBody
            service={selectedService}
            group={selectedGroup}
            matchedContainer={matchContainer(selectedService)}
          />
        </DetailModal>
      )}
    </div>
  );
}
