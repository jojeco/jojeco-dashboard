/**
 * v4 GamingPage — Server 1 game-server control room.
 *
 * Data:
 *  - `gaming` SSE section: { s1Online, minecraft:[{id,name,status,port,players?}], vintageStory }
 *  - `lab` SSE section: Server 1 machine → CPU/RAM resource strip (gaming rigs care).
 *
 * Controls (all confirm-gated via DetailModal, safety-first):
 *  - Per server: Start / Stop / Restart → POST /api/gaming/:server/:action
 *  - When S1 is offline: a single prominent "Wake Server 1" → POST /api/controls/server/server1/wake
 *
 * Status vocabulary (DESIGN.md stripes/chips — never color alone):
 *  RUNNING (nominal) · SLEEPING (standby, "wakes on join") · STOPPED (standby) ·
 *  STARTING (degraded) · S1 OFFLINE (fault)
 */
import { useState, useCallback } from 'react';
import { Gamepad2, Play, Square, RotateCcw, Power, Cpu, MemoryStick } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { getToken } from '../../services/api';
import { DetailModal } from '../components/DetailModal';
import { Panel, PanelTitle, PageTitle, Mono, StatusChip, Skeleton } from '../components/Primitives';
import { fmtBytes } from '../lib/utils';
import type { GamingMcServer, GamingVintageStory, Machine } from '../../hooks/useSnapshot';

// ── API ─────────────────────────────────────────────────────────────────────
const BASE = (import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api') as string;

async function authPost(path: string): Promise<{ ok: boolean; msg: string }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/v4/login'; return { ok: false, msg: 'Unauthorized' }; }
    const d = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, msg: String(d.message ?? d.error ?? (res.ok ? 'Done' : 'Failed')) };
  } catch { return { ok: false, msg: 'Network error' }; }
}

// ── Status → visual level/label ──────────────────────────────────────────────
type Level = 'nominal' | 'degraded' | 'fault' | 'standby';

function statusView(status: string, s1Online: boolean): { level: Level; label: string; note?: string } {
  if (!s1Online) return { level: 'fault', label: 'S1 OFFLINE' };
  switch (status?.toLowerCase()) {
    case 'running':  return { level: 'nominal', label: 'RUNNING' };
    case 'starting': return { level: 'degraded', label: 'STARTING' };
    case 'sleeping': return { level: 'standby', label: 'SLEEPING', note: 'wakes on join' };
    case 'stopped':  return { level: 'standby', label: 'STOPPED' };
    default:         return { level: 'standby', label: (status || 'UNKNOWN').toUpperCase() };
  }
}

// ── Confirm modal (DetailModal confirm pattern, matches ControlsPage) ─────────
interface ConfirmState { open: boolean; title: string; body: string; confirmLabel: string; destructive: boolean; fn: () => void }
const CONFIRM_DEFAULT: ConfirmState = { open: false, title: '', body: '', confirmLabel: 'Confirm', destructive: true, fn: () => {} };

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <DetailModal open={state.open} onClose={onCancel} title={state.title}>
      <div className="flex flex-col gap-5">
        <p className="text-[0.875rem] leading-relaxed" style={{ color: 'var(--v4-readout)' }}>{state.body}</p>
        <div className="flex gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-[0.5rem] text-[0.875rem] font-medium min-h-[44px]"
            style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: 'pointer' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-[0.5rem] text-[0.875rem] font-semibold min-h-[44px] active:-translate-y-px transition-transform"
            style={{
              background: state.destructive ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)',
              color: state.destructive ? 'var(--v4-fault)' : 'var(--v4-nominal)',
              border: `1px solid ${state.destructive ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
              cursor: 'pointer',
            }}
            onClick={() => { state.fn(); onCancel(); }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </DetailModal>
  );
}

// ── Toast banner (single, fades) ─────────────────────────────────────────────
function ToastBanner({ result, onDismiss }: { result: { ok: boolean; msg: string } | null; onDismiss: () => void }) {
  if (!result) return null;
  setTimeout(onDismiss, 4500);
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 v4-settle" style={{ maxWidth: 'calc(100vw - 2rem)', width: 360 }}>
      <div
        className="rounded-[0.75rem] px-4 py-3 text-[0.8125rem] font-medium"
        style={{
          background: result.ok ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
          border: `1px solid ${result.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
          color: result.ok ? 'var(--v4-nominal)' : 'var(--v4-fault)',
          fontFamily: "'Geist Mono', monospace",
        }}
      >
        {result.msg}
      </div>
    </div>
  );
}

// ── Game action button ───────────────────────────────────────────────────────
function GameBtn({ label, icon: Icon, variant, disabled, loading, onClick }: {
  label: string; icon: LucideIcon; variant: 'safe' | 'neutral' | 'destructive';
  disabled: boolean; loading: boolean; onClick: () => void;
}) {
  const styles: Record<typeof variant, React.CSSProperties> = {
    safe:        { background: 'rgba(63,185,80,0.10)', color: 'var(--v4-nominal)', border: '1px solid rgba(63,185,80,0.25)' },
    neutral:     { background: 'var(--v4-console)',    color: 'var(--v4-readout)', border: 'none' },
    destructive: { background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)',   border: '1px solid rgba(248,81,73,0.22)' },
  };
  return (
    <button
      className="flex items-center justify-center gap-1.5 rounded-[0.5rem] font-medium text-[0.75rem] min-h-[40px] flex-1 v4-tile active:-translate-y-px transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ ...styles[variant], padding: '9px 10px', cursor: disabled || loading ? 'default' : 'pointer' }}
      disabled={disabled || loading}
      onClick={onClick}
    >
      <Icon size={12} className="shrink-0" />
      {loading ? '…' : label}
    </button>
  );
}

// ── One server card ──────────────────────────────────────────────────────────
interface CardProps {
  name: string;
  serverKey: string;               // mc id or 'vs' for the control endpoint
  status: string;
  port: number | null;
  players?: number;
  s1Online: boolean;
  loading: Record<string, boolean>;
  onAction: (serverKey: string, name: string, action: 'start' | 'stop' | 'restart', running: boolean) => void;
}

function ServerCard({ name, serverKey, status, port, players, s1Online, loading, onAction }: CardProps) {
  const view = statusView(status, s1Online);
  const stripe = view.level === 'nominal' ? 'var(--v4-nominal)'
    : view.level === 'degraded' ? 'var(--v4-degraded)'
    : view.level === 'fault' ? 'var(--v4-fault)'
    : 'var(--v4-standby)';

  const running = s1Online && ['running', 'starting'].includes(status?.toLowerCase());
  const busy = loading[`${serverKey}-start`] || loading[`${serverKey}-stop`] || loading[`${serverKey}-restart`];

  return (
    <div
      className="flex flex-col gap-3 p-3.5 rounded-[0.75rem] min-w-0"
      style={{ background: 'var(--v4-raised)', boxShadow: `inset 2px 0 0 ${stripe}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-[0.875rem] font-semibold truncate tracking-tight" style={{ color: 'var(--v4-signal)' }}>
            {name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {port != null && <Mono trace className="text-[0.6875rem]">:{port}</Mono>}
            {players != null && (
              <Mono className="text-[0.6875rem]" style={{ color: players > 0 ? 'var(--v4-nominal)' : 'var(--v4-trace)' }}>
                {players} player{players === 1 ? '' : 's'}
              </Mono>
            )}
          </div>
        </div>
        <StatusChip level={view.level} label={view.label} className="shrink-0" />
      </div>

      {view.note && (
        <Mono trace className="text-[0.6875rem] -mt-1">{view.note}</Mono>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <GameBtn
          label="Start" icon={Play} variant="safe"
          disabled={!s1Online || running} loading={!!loading[`${serverKey}-start`]}
          onClick={() => onAction(serverKey, name, 'start', running)}
        />
        <GameBtn
          label="Stop" icon={Square} variant="destructive"
          disabled={!s1Online || !running} loading={!!loading[`${serverKey}-stop`]}
          onClick={() => onAction(serverKey, name, 'stop', running)}
        />
        <GameBtn
          label="Restart" icon={RotateCcw} variant="neutral"
          disabled={!s1Online || !running || busy} loading={!!loading[`${serverKey}-restart`]}
          onClick={() => onAction(serverKey, name, 'restart', running)}
        />
      </div>
    </div>
  );
}

// ── S1 resource strip ────────────────────────────────────────────────────────
function S1ResourceStrip({ machine }: { machine: Machine | null }) {
  if (!machine || !machine.online) return null;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      {machine.cpu != null && (
        <div className="flex items-center gap-1.5">
          <Cpu size={12} style={{ color: 'var(--v4-trace)' }} />
          <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>CPU</span>
          <Mono className="text-[0.75rem]" style={{ color: machine.cpu >= 90 ? 'var(--v4-fault)' : machine.cpu >= 75 ? 'var(--v4-degraded)' : 'var(--v4-signal)' }}>
            {machine.cpu.toFixed(0)}%
          </Mono>
        </div>
      )}
      {machine.mem && (
        <div className="flex items-center gap-1.5">
          <MemoryStick size={12} style={{ color: 'var(--v4-trace)' }} />
          <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>RAM</span>
          <Mono className="text-[0.75rem]" style={{ color: 'var(--v4-signal)' }}>
            {fmtBytes(machine.mem.used)} / {fmtBytes(machine.mem.total)}
          </Mono>
          <Mono trace className="text-[0.6875rem]">({machine.mem.percent.toFixed(0)}%)</Mono>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function GamingPage() {
  const { data: gaming, loading } = useSnapshot('gaming');
  const { data: lab } = useSnapshot('lab');

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_DEFAULT);

  const s1Online = gaming?.s1Online ?? false;
  const mc: GamingMcServer[] = gaming?.minecraft ?? [];
  const vs: GamingVintageStory | null = gaming?.vintageStory ?? null;

  // Server 1 machine from the lab section (match by id/name)
  const s1Machine = (lab?.machines ?? []).find(
    m => ['s1', 'server1'].includes(m.id.toLowerCase()) || m.name.toLowerCase().includes('server 1'),
  ) ?? null;

  const runningCount =
    mc.filter(s => s.status?.toLowerCase() === 'running').length +
    (vs?.status?.toLowerCase() === 'running' ? 1 : 0);
  const totalCount = mc.length + (vs ? 1 : 0);

  const setLoad = (key: string, v: boolean) => setLoadingMap(l => ({ ...l, [key]: v }));

  const runAction = useCallback(async (serverKey: string, action: 'start' | 'stop' | 'restart') => {
    setLoad(`${serverKey}-${action}`, true);
    const r = await authPost(`/gaming/${serverKey}/${action}`);
    setToast(r);
    setLoad(`${serverKey}-${action}`, false);
  }, []);

  const onAction = useCallback((serverKey: string, name: string, action: 'start' | 'stop' | 'restart') => {
    const destructive = action !== 'start';
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    setConfirm({
      open: true,
      title: `${verb} ${name}`,
      body: action === 'start'
        ? `Start "${name}" on Server 1?`
        : action === 'stop'
          ? `Stop "${name}"? Players online will be disconnected.`
          : `Restart "${name}"? Players will be briefly disconnected while it comes back.`,
      confirmLabel: verb,
      destructive,
      fn: () => runAction(serverKey, action),
    });
  }, [runAction]);

  const onWakeS1 = useCallback(() => {
    setConfirm({
      open: true,
      title: 'Wake Server 1',
      body: 'Send a Wake-on-LAN packet to Server 1 (192.168.50.10)? Game servers become available once it finishes booting.',
      confirmLabel: 'Wake',
      destructive: false,
      fn: async () => {
        setLoad('wake-s1', true);
        const r = await authPost('/controls/server/server1/wake');
        setToast(r);
        setLoad('wake-s1', false);
      },
    });
  }, []);

  const waiting = loading && gaming == null;

  return (
    <>
      <ConfirmModal state={confirm} onCancel={() => setConfirm(CONFIRM_DEFAULT)} />
      <ToastBanner result={toast} onDismiss={() => setToast(null)} />

      {/* Header + status line */}
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex items-center gap-2">
          <Gamepad2 size={18} style={{ color: 'var(--v4-amber)' }} />
          <PageTitle>Gaming</PageTitle>
        </div>
        {waiting ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full shrink-0"
              style={{ width: 6, height: 6, background: s1Online ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}
              aria-hidden
            />
            <Mono className="text-[0.8125rem]" style={{ color: s1Online ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}>
              {s1Online ? 'Server 1 up' : 'Server 1 offline'}
            </Mono>
            {s1Online && (
              <span className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
                · {runningCount}/{totalCount} running
              </span>
            )}
          </div>
        )}
      </div>

      {/* S1 offline → prominent wake action */}
      {!waiting && !s1Online && (
        <Panel className="p-4 mb-4" style={{ boxShadow: 'inset 2px 0 0 var(--v4-fault), 0 1px 0 rgba(0,0,0,0.4)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[0.875rem] font-semibold" style={{ color: 'var(--v4-signal)' }}>
                Server 1 is offline
              </div>
              <Mono trace className="text-[0.6875rem]">Game servers are unavailable until it boots</Mono>
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2.5 rounded-[0.5rem] text-[0.8125rem] font-semibold min-h-[44px] active:-translate-y-px transition-transform disabled:opacity-40"
              style={{ background: 'var(--v4-amber)', color: 'var(--v4-void)', border: 'none', cursor: loadingMap['wake-s1'] ? 'default' : 'pointer' }}
              disabled={!!loadingMap['wake-s1']}
              onClick={onWakeS1}
            >
              <Power size={14} className="shrink-0" />
              {loadingMap['wake-s1'] ? 'Waking…' : 'Wake Server 1'}
            </button>
          </div>
        </Panel>
      )}

      {/* S1 resource strip */}
      {s1Online && s1Machine && (
        <Panel className="p-3 mb-4">
          <S1ResourceStrip machine={s1Machine} />
        </Panel>
      )}

      {/* Server cards */}
      {waiting ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <>
          <PanelTitle className="mb-3">Minecraft</PanelTitle>
          <div className="grid gap-3 v4-stagger mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {mc.length === 0 ? (
              <Mono trace className="text-[0.75rem]">No Minecraft servers reported</Mono>
            ) : (
              mc.map(s => (
                <ServerCard
                  key={s.id}
                  name={s.name}
                  serverKey={s.id}
                  status={s.status}
                  port={s.port}
                  players={s.players}
                  s1Online={s1Online}
                  loading={loadingMap}
                  onAction={onAction}
                />
              ))
            )}
          </div>

          <PanelTitle className="mb-3">Vintage Story</PanelTitle>
          <div className="grid gap-3 v4-stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {vs ? (
              <ServerCard
                name="Vintage Story"
                serverKey="vs"
                status={vs.status}
                port={vs.port ?? null}
                players={vs.players}
                s1Online={s1Online}
                loading={loadingMap}
                onAction={onAction}
              />
            ) : (
              <Mono trace className="text-[0.75rem]">Vintage Story keeper not reporting</Mono>
            )}
          </div>
        </>
      )}
    </>
  );
}
