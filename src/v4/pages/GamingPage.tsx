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
 * Log viewer (MC only — VS keeper has no log endpoint):
 *  - Logs / Errors toggle → GET /api/gaming/:server/logs|errors
 *  - Expandable dark Well surface, mono, fetch-on-expand, refresh button.
 *
 * Layout:
 *  - All game servers (3 MC + VS) in ONE unified "GAME SERVERS" grid.
 *  - auto-fill minmax(300px, 1fr) — fills the width, no void, single-col on mobile.
 *  - Per-card type chip (MC · VS) instead of separate section headers.
 *
 * Status vocabulary (DESIGN.md stripes/chips — never color alone):
 *  RUNNING (nominal) · SLEEPING (standby, "wakes on join") · STOPPED (standby) ·
 *  STARTING (degraded) · S1 OFFLINE (fault)
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Gamepad2, Play, Square, RotateCcw, Power, Cpu, MemoryStick, FileText, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
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

async function fetchGameLogs(serverKey: string, type: 'logs' | 'errors'): Promise<{ lines: string[]; unavailable?: boolean; reason?: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}/gaming/${serverKey}/${type}`, { headers, signal: AbortSignal.timeout(8000) });
    const d = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (d.unavailable) return { lines: [], unavailable: true, reason: String(d.reason ?? 'unavailable') };
    const raw = (d[type] ?? []) as string[];
    // Keep last 100 lines so the viewer stays manageable
    return { lines: raw.slice(-100) };
  } catch (e) {
    return { lines: [], unavailable: true, reason: e instanceof Error ? e.message : 'fetch error' };
  }
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

// ── Confirm modal ─────────────────────────────────────────────────────────────
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

// ── Toast banner ─────────────────────────────────────────────────────────────
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

// ── Per-card log viewer (MC only) ────────────────────────────────────────────
type LogType = 'logs' | 'errors';

interface LogState {
  lines: string[];
  unavailable?: boolean;
  reason?: string;
}

function GameLogViewer({ serverKey, hasLogs }: { serverKey: string; hasLogs: boolean }) {
  const [activeLog, setActiveLog] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<LogType, LogState | null>>({ logs: null, errors: null });
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (type: LogType) => {
    setLoading(true);
    const result = await fetchGameLogs(serverKey, type);
    setData(prev => ({ ...prev, [type]: { lines: result.lines, unavailable: result.unavailable, reason: result.reason } }));
    setLoading(false);
  }, [serverKey]);

  const toggle = (type: LogType) => {
    if (activeLog === type) { setActiveLog(null); return; }
    setActiveLog(type);
    if (!data[type]) void load(type);
  };

  const refresh = () => {
    if (activeLog) {
      setData(prev => ({ ...prev, [activeLog]: null }));
      void load(activeLog);
    }
  };

  useEffect(() => {
    if (bottomRef.current && activeLog && data[activeLog] && !loading) {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [data, activeLog, loading]);

  if (!hasLogs) {
    return (
      <Mono trace className="text-[0.6875rem]">no log endpoint (VS keeper)</Mono>
    );
  }

  const current = activeLog ? data[activeLog] : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Log / Errors toggle row */}
      <div className="flex gap-2">
        {(['logs', 'errors'] as LogType[]).map(type => {
          const isActive = activeLog === type;
          const isErr = type === 'errors';
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className="flex items-center gap-1.5 flex-1 min-h-[36px] rounded-[0.5rem] text-[0.75rem] font-medium transition-colors"
              style={{
                background: isActive
                  ? isErr ? 'rgba(248,81,73,0.10)' : 'rgba(88,166,255,0.10)'
                  : 'var(--v4-console)',
                color: isActive
                  ? isErr ? 'var(--v4-fault)' : 'var(--v4-accent)'
                  : 'var(--v4-readout)',
                border: isActive
                  ? `1px solid ${isErr ? 'rgba(248,81,73,0.3)' : 'rgba(88,166,255,0.25)'}`
                  : 'none',
                cursor: 'pointer',
                padding: '7px 10px',
                justifyContent: 'center',
              }}
            >
              {isErr
                ? <AlertTriangle size={11} className="shrink-0" />
                : <FileText size={11} className="shrink-0" />
              }
              {isActive ? (type === 'logs' ? 'Hide Logs' : 'Hide Errors') : (type === 'logs' ? 'Logs' : 'Errors')}
              {isActive ? <ChevronUp size={10} className="shrink-0 ml-auto" /> : <ChevronDown size={10} className="shrink-0 ml-auto" />}
            </button>
          );
        })}
      </div>

      {/* Log body */}
      {activeLog && (
        <div className="relative rounded-[0.5rem] overflow-hidden" style={{ background: 'var(--v4-well)' }}>
          {/* Refresh button */}
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh"
            className="absolute top-2 right-2 z-10 flex items-center justify-center rounded transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'rgba(88,166,255,0.10)', border: 'none', cursor: loading ? 'default' : 'pointer', width: 22, height: 22, color: 'var(--v4-amber)' }}
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>

          {loading ? (
            <div className="flex flex-col gap-1 p-3 pr-8">
              {(['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3'] as const).map((w, i) => (
                <Skeleton key={i} className={`h-4 ${w}`} />
              ))}
            </div>
          ) : current?.unavailable ? (
            <p className="px-3 py-2.5 text-[0.6875rem]" style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}>
              {current.reason ?? 'unavailable'}
            </p>
          ) : current && current.lines.length === 0 ? (
            <p className="px-3 py-2.5 text-[0.6875rem]" style={{ color: activeLog === 'errors' ? 'var(--v4-nominal)' : 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}>
              {activeLog === 'errors' ? 'no errors found' : 'no log output'}
            </p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 260 }}>
              <div className="flex flex-col p-3 pr-8 min-w-max">
                {(current?.lines ?? []).map((line, i) => (
                  <span
                    key={i}
                    className="text-[0.6875rem] leading-5 whitespace-pre break-normal"
                    style={{ color: activeLog === 'errors' ? 'var(--v4-fault)' : 'var(--v4-signal)', fontFamily: "'Geist Mono', monospace" }}
                  >
                    {line}
                  </span>
                ))}
                <div ref={bottomRef} aria-hidden />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── One server card ──────────────────────────────────────────────────────────
interface CardProps {
  name: string;
  serverKey: string;
  type: 'MC' | 'VS';
  status: string;
  port: number | null;
  players?: number;
  uptime_s?: number;
  s1Online: boolean;
  loading: Record<string, boolean>;
  onAction: (serverKey: string, name: string, action: 'start' | 'stop' | 'restart', running: boolean) => void;
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ServerCard({ name, serverKey, type, status, port, players, uptime_s, s1Online, loading, onAction }: CardProps) {
  const view = statusView(status, s1Online);
  const stripe = view.level === 'nominal' ? 'var(--v4-nominal)'
    : view.level === 'degraded' ? 'var(--v4-degraded)'
    : view.level === 'fault' ? 'var(--v4-fault)'
    : 'var(--v4-standby)';

  const running = s1Online && ['running', 'starting'].includes(status?.toLowerCase());
  const busy = loading[`${serverKey}-start`] || loading[`${serverKey}-stop`] || loading[`${serverKey}-restart`];
  const hasLogs = type === 'MC';

  return (
    <div
      className="flex flex-col gap-3 p-3.5 rounded-[0.75rem] min-w-0"
      style={{ background: 'var(--v4-raised)', boxShadow: `inset 2px 0 0 ${stripe}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[0.875rem] font-semibold truncate tracking-tight" style={{ color: 'var(--v4-signal)' }}>
              {name}
            </div>
            {/* Type chip */}
            <span
              className="text-[0.6rem] font-bold uppercase tracking-widest shrink-0 px-1.5 py-0.5 rounded"
              style={{
                background: type === 'MC' ? 'rgba(63,185,80,0.12)' : 'rgba(88,166,255,0.12)',
                color: type === 'MC' ? 'var(--v4-nominal)' : 'var(--v4-accent)',
              }}
            >
              {type}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {port != null && <Mono trace className="text-[0.6875rem]">:{port}</Mono>}
            {players != null && (
              <Mono className="text-[0.6875rem]" style={{ color: players > 0 ? 'var(--v4-nominal)' : 'var(--v4-trace)' }}>
                {players} player{players === 1 ? '' : 's'}
              </Mono>
            )}
            {uptime_s != null && uptime_s > 0 && (
              <Mono trace className="text-[0.6875rem]">up {fmtUptime(uptime_s)}</Mono>
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
          disabled={!s1Online || !running || !!busy} loading={!!loading[`${serverKey}-restart`]}
          onClick={() => onAction(serverKey, name, 'restart', running)}
        />
      </div>

      {/* Log viewer — separator */}
      <div style={{ borderTop: '1px solid rgba(48,54,61,0.6)', paddingTop: '0.5rem' }}>
        <GameLogViewer serverKey={serverKey} hasLogs={hasLogs} />
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

  // Server 1 machine from the lab section
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

      {/* Unified GAME SERVERS grid — all 4 servers, no section split, no void */}
      {waiting ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : totalCount === 0 ? (
        <Mono trace className="text-[0.75rem]">No game servers reported</Mono>
      ) : (
        <>
          <PanelTitle className="mb-3">Game Servers</PanelTitle>
          <div
            className="grid gap-3 v4-stagger"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
          >
            {mc.map(s => (
              <ServerCard
                key={s.id}
                name={s.name}
                serverKey={s.id}
                type="MC"
                status={s.status}
                port={s.port}
                players={s.players}
                s1Online={s1Online}
                loading={loadingMap}
                onAction={onAction}
              />
            ))}
            {vs && (
              <ServerCard
                name="Vintage Story"
                serverKey="vs"
                type="VS"
                status={vs.status}
                port={vs.port ?? null}
                players={vs.players}
                uptime_s={vs.uptime_s}
                s1Online={s1Online}
                loading={loadingMap}
                onAction={onAction}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
