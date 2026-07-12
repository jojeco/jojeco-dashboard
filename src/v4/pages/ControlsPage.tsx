/**
 * v4 ControlsPage — ACT layer (restructured 2026-07-11).
 *
 * Panels (mobile: top-to-bottom; desktop: 8/4 command-center grid):
 *  1. Server Power — per-machine card; consistent Wake / Restart / Shutdown, each
 *     state-aware (Wake dimmed when ON; Restart/Shutdown dimmed when OFF/RESTARTING).
 *     Status indicator top-right: ON / OFF / UNRESPONSIVE / RESTARTING (local, pulse).
 *  2. Claude       — CT100 Claude Stop/Restart, Claude→S3 / Claude→S1 transfer triggers,
 *     and a read-only terminal viewer (GET /api/claude/terminal).
 *  3. Automation   — SSE-backed jobs; status chips; click → detail modal; Run now (confirm-gated).
 *  4. Failover     — S2→S3 failover activate/deactivate/sync (confirm-gated).
 *
 * Container controls were removed here — the confirm-gated restart/stop/start now
 * live in the Services page container detail modal (single source).
 *
 * Endpoint inventory:
 *  POST /api/controls/server/:id/wake | restart | shutdown
 *  POST /api/controls/claude/ct100/stop | restart
 *  POST /api/controls/trigger/:action  (health|backup|snapshot|sync-context|claude-server3|claude-server1)
 *  POST /api/controls/trigger/:action/abort
 *  GET  /api/controls/trigger-status
 *  GET  /api/controls/server-status
 *  GET  /api/claude/terminal
 *  POST /api/failover/activate | deactivate | sync-now   ·   GET /api/failover/status
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Power, RotateCcw, Wifi, Bot, Square, Play,
  RefreshCw, Activity, Zap, ZapOff,
  RotateCw, ShieldCheck, Database, GitBranch,
  AlertTriangle, Wrench, KeyRound, Gamepad2, Film, FolderSync,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useSnapshot } from '../../hooks/useSnapshot';
import type { AutomationJob } from '../../hooks/useSnapshot';
import { getToken } from '../../services/api';

import { DetailModal } from '../components/DetailModal';
import { AutomationJobDetailModal } from '../components/AutomationJobDetailModal';
import { ClaudeTerminalViewer } from '../components/ClaudeTerminalViewer';
import {
  Panel, PanelTitle, PageTitle, Mono, Well, Hairline,
  StatusChip, Skeleton, EmptyState,
} from '../components/Primitives';
import { fmtDate } from '../lib/utils';

// ── API helpers ───────────────────────────────────────────────────────────────

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

async function authGet<T>(path: string): Promise<{ ok: boolean; data: T | null }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/v4/login'; return { ok: false, data: null }; }
    const data = await res.json().catch(() => null) as T;
    return { ok: res.ok, data };
  } catch { return { ok: false, data: null }; }
}

// ── Static data ───────────────────────────────────────────────────────────────

interface ServerDef {
  id: string;
  label: string;
  sub: string;
  ip: string;
  canWake: boolean;
  warnRestart: boolean;   // S2/Proxmox — takes CT100 offline
  isSelf: boolean;        // CT100 — restart/shutdown would kill this dashboard host
}

const SERVERS: ServerDef[] = [
  { id: 'ct100',   label: 'CT100',     sub: 'LXC · .13 · Main agent',         ip: '192.168.50.13', canWake: false, warnRestart: false, isSelf: true  },
  { id: 'server1', label: 'Server 1',  sub: 'i7-4790 · Windows · .10',          ip: '192.168.50.10', canWake: true,  warnRestart: false, isSelf: false },
  { id: 'server2', label: 'Server 2',  sub: 'Proxmox · i5-10505 · .11',         ip: '192.168.50.11', canWake: true,  warnRestart: true,  isSelf: false },
  { id: 'server3', label: 'Server 3',  sub: 'Ubuntu · i7-8750H · .12',          ip: '192.168.50.12', canWake: true,  warnRestart: false, isSelf: false },
  { id: 'macmini', label: 'Mac Mini',  sub: 'macOS · Intel i5 · .30',           ip: '192.168.50.30', canWake: true,  warnRestart: false, isSelf: false },
  { id: 'jopc',    label: 'JoPc',      sub: 'Windows · RTX 3080 Ti · .20',      ip: '192.168.50.20', canWake: true,  warnRestart: false, isSelf: false },
];

interface TriggerDef {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}

// Automation triggers shown in the Automation panel. Claude→S3 / Claude→S1
// transfers live in the Claude panel (CLAUDE_TRANSFERS), not here.
const TRIGGERS: TriggerDef[] = [
  { id: 'health',         label: 'Health Check',  desc: 'Run dep-watcher: restart any down containers',        icon: ShieldCheck },
  { id: 'backup',         label: 'GDrive Backup', desc: 'Dump databases and sync to Google Drive',             icon: Database    },
  { id: 'snapshot',       label: 'Update Check',  desc: 'Pull latest images, report critical updates',         icon: RefreshCw   },
  { id: 'sync-context',   label: 'Sync Context',  desc: 'Push memory, stacks & context to GitHub',             icon: GitBranch   },
  // ── Runbooks: one-button fixes for known failure modes ──
  { id: 'rb-sshuser-lockout', label: 'Fix sshuser Lockout', desc: 'Restart CIFS re-locker containers, wait for S1 sshuser to unlock', icon: KeyRound   },
  { id: 'rb-mcmanager',       label: 'Fix McManager',       desc: 'Re-run the McManager task on S1 if its API is down',              icon: Gamepad2   },
  { id: 'rb-qbit-iface',      label: 'Fix qBit VPN Bind',   desc: 'Clear stale qBittorrent interface binding and cycle it',          icon: Wrench     },
  { id: 'rb-restart-plex',    label: 'Restart Plex',        desc: 'Trigger PlexWatchdog on S1 and verify Plex comes back',           icon: Film       },
  { id: 'rb-remount-media',   label: 'Remount S1 Media',    desc: 'Cycle server1-media consumers to re-establish the CIFS mount',    icon: FolderSync },
];

// ── Local types ───────────────────────────────────────────────────────────────

interface TriggerJob { status: 'running' | 'done' | 'error' | 'aborted'; startedAt: number; finishedAt: number | null; output: string | null; error: string | null; canAbort?: boolean }
interface FailoverStatus { s2_online: boolean; s3_online: boolean; failover_active: boolean; watchdog_status: string; last_sync: string | null }
interface InlineResult { ok: boolean; msg: string }

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <PanelTitle>{children}</PanelTitle>
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

interface ConfirmState {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
  fn: () => void;
}

const CONFIRM_DEFAULT: ConfirmState = { open: false, title: '', body: '', confirmLabel: 'Confirm', destructive: true, fn: () => {} };

interface ConfirmModalProps {
  state: ConfirmState;
  onCancel: () => void;
}

function ConfirmModal({ state, onCancel }: ConfirmModalProps) {
  return (
    <DetailModal
      open={state.open}
      onClose={onCancel}
      title={state.title}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[0.875rem] leading-relaxed" style={{ color: 'var(--v4-readout)' }}>
          {state.body}
        </p>
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

// ── Toast banner (single, fades) ──────────────────────────────────────────────

interface ToastBannerProps {
  result: InlineResult | null;
  onDismiss: () => void;
}

function ToastBanner({ result, onDismiss }: ToastBannerProps) {
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [result, onDismiss]);

  if (!result) return null;

  return (
    <div
      className="fixed top-14 left-1/2 -translate-x-1/2 z-50 v4-settle"
      style={{ maxWidth: 'calc(100vw - 2rem)', width: 360 }}
    >
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

// ── Elapsed timer helper ──────────────────────────────────────────────────────

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ControlsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ControlsPage() {
  // ── SSE data ─────────────────────────────────────────────────────────────────
  const { data: snapData } = useSnapshot();
  const snapServerStatus = snapData?.serverStatus as Record<string, boolean> | null;
  const snapAutomation   = snapData?.automation ?? null;

  // ── Local state ───────────────────────────────────────────────────────────────
  const [loading,       setLoading]       = useState<Record<string, boolean>>({});
  const [toast,         setToast]         = useState<InlineResult | null>(null);
  const [confirm,       setConfirm]       = useState<ConfirmState>(CONFIRM_DEFAULT);

  // Servers
  const [serverResults, setServerResults] = useState<Record<string, InlineResult>>({});
  // Per-server "restarting" flag (local, set when a restart is fired this session).
  // { [id]: firedAt } — cleared when the machine's online state flips or after 3 min.
  const [restarting, setRestarting] = useState<Record<string, number>>({});

  // Claude (CT100)
  const [claudeResult, setClaudeResult] = useState<InlineResult | null>(null);

  // Triggers
  const [triggerJobs,   setTriggerJobs]   = useState<Record<string, TriggerJob>>({});
  const triggerPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Automation modal
  const [selectedJob,   setSelectedJob]   = useState<AutomationJob | null>(null);

  // Failover
  const [failover,      setFailover]      = useState<FailoverStatus | null>(null);
  const [failoverOut,   setFailoverOut]   = useState<string | null>(null);

  // Tick for elapsed times
  const [now,           setNow]           = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const setLoad = (key: string, val: boolean) =>
    setLoading(l => ({ ...l, [key]: val }));

  function showToast(result: InlineResult) { setToast(result); }

  function withConfirm(title: string, body: string, fn: () => void, label = 'Confirm', destructive = true) {
    setConfirm({ open: true, title, body, fn, confirmLabel: label, destructive });
  }

  // ── Load failover status ──────────────────────────────────────────────────────
  const loadFailover = useCallback(async () => {
    const { ok, data } = await authGet<FailoverStatus>('/failover/status');
    if (ok && data) setFailover(data);
  }, []);

  // ── Load trigger status ───────────────────────────────────────────────────────
  const loadTriggerStatus = useCallback(async () => {
    const { ok, data } = await authGet<Record<string, TriggerJob>>('/controls/trigger-status');
    if (ok && data) setTriggerJobs(data);
  }, []);

  // ── Mount: load all ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadTriggerStatus();
    loadFailover();
    const fo = setInterval(loadFailover, 30000);
    return () => clearInterval(fo);
  }, [loadTriggerStatus, loadFailover]);

  // ── Trigger polling (only when a job is running) ──────────────────────────────
  useEffect(() => {
    const anyRunning = Object.values(triggerJobs).some(j => j.status === 'running');
    if (anyRunning && !triggerPollRef.current) {
      triggerPollRef.current = setInterval(loadTriggerStatus, 3000);
    } else if (!anyRunning && triggerPollRef.current) {
      clearInterval(triggerPollRef.current);
      triggerPollRef.current = null;
    }
    return () => { if (triggerPollRef.current) { clearInterval(triggerPollRef.current); triggerPollRef.current = null; } };
  }, [triggerJobs, loadTriggerStatus]);

  // ── Server actions ────────────────────────────────────────────────────────────
  async function doServerAction(path: string, loadKey: string, serverId: string) {
    setLoad(loadKey, true);
    const r = await authPost(path);
    setServerResults(prev => ({ ...prev, [serverId]: r }));
    showToast(r);
    setLoad(loadKey, false);
  }

  function handleWake(srv: ServerDef) {
    doServerAction(`/controls/server/${srv.id}/wake`, `wake-${srv.id}`, srv.id);
  }

  function handleRestart(srv: ServerDef) {
    const go = () => {
      setRestarting(r => ({ ...r, [srv.id]: Date.now() }));
      doServerAction(`/controls/server/${srv.id}/restart`, `restart-${srv.id}`, srv.id);
    };
    if (srv.warnRestart) {
      withConfirm(
        `Restart ${srv.label} (Proxmox host)`,
        `This restarts the entire Proxmox host and will take CT 100 — and this dashboard — offline for ~60 seconds.`,
        go, 'Restart host',
      );
    } else {
      withConfirm(`Restart ${srv.label}`, `Send restart command to ${srv.label} (${srv.ip})?`, go, 'Restart');
    }
  }

  function handleShutdown(srv: ServerDef) {
    withConfirm(
      `Shutdown ${srv.label}`,
      `Shut down ${srv.label} (${srv.ip})? It cannot be turned back on remotely unless Wake-on-LAN is available.`,
      () => doServerAction(`/controls/server/${srv.id}/shutdown`, `shutdown-${srv.id}`, srv.id),
      'Shutdown',
    );
  }

  // ── Claude (CT100) ────────────────────────────────────────────────────────────
  function handleClaudeStop() {
    withConfirm(
      'Stop Claude on CT100',
      'Stop the Claude agent on CT100? It can be restarted from this panel.',
      async () => {
        setLoad('claude-stop', true);
        const r = await authPost('/controls/claude/ct100/stop');
        setClaudeResult(r);
        showToast(r);
        setLoad('claude-stop', false);
      },
      'Stop Claude',
    );
  }

  function handleClaudeRestart() {
    withConfirm(
      'Restart Claude on CT100',
      'Restart the Claude agent on CT100? It resumes automatically in ~5s.',
      async () => {
        setLoad('claude-restart', true);
        const r = await authPost('/controls/claude/ct100/restart');
        setClaudeResult(r);
        showToast(r);
        setLoad('claude-restart', false);
      },
      'Restart Claude', false,
    );
  }

  // ── Trigger actions ───────────────────────────────────────────────────────────
  function handleFireTrigger(id: string, label: string) {
    withConfirm(
      `Run ${label}`,
      `Manually trigger "${label}"? This runs the automation script immediately.`,
      async () => {
        setLoad(`trigger-${id}`, true);
        const { ok, data } = await authGet<{ error?: string }>(`/controls/trigger-status`);
        void ok; void data; // just ensure it's fresh before firing
        const r = await authPost(`/controls/trigger/${id}`);
        if (r.ok) {
          setTriggerJobs(prev => ({
            ...prev,
            [id]: { status: 'running', startedAt: Date.now(), finishedAt: null, output: null, error: null, canAbort: true },
          }));
        } else {
          showToast(r);
        }
        setLoad(`trigger-${id}`, false);
      },
      'Run now', false,
    );
  }

  async function handleAbortTrigger(id: string) {
    setLoad(`abort-${id}`, true);
    const r = await authPost(`/controls/trigger/${id}/abort`);
    if (r.ok) {
      setTriggerJobs(prev => ({ ...prev, [id]: { ...prev[id], status: 'aborted', finishedAt: Date.now(), output: 'Aborted by user', canAbort: false } }));
    }
    showToast(r);
    setLoad(`abort-${id}`, false);
  }

  // ── Failover actions ──────────────────────────────────────────────────────────
  function handleActivateFailover() {
    withConfirm(
      'Activate S2→S3 Failover',
      'Start lab services on Server 3? This activates the failover stack and may affect running workloads.',
      async () => {
        setLoad('fo-activate', true);
        setFailoverOut(null);
        const res = await fetch(`${BASE}/failover/activate`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' } });
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (d.output) setFailoverOut(String(d.output));
        showToast({ ok: res.ok, msg: String(d.message ?? d.error ?? (res.ok ? 'Activated' : 'Failed')) });
        loadFailover();
        setLoad('fo-activate', false);
      },
      'Activate',
    );
  }

  function handleDeactivateFailover() {
    withConfirm(
      'Deactivate Failover',
      'Stop failover services on Server 3 and return to normal operation?',
      async () => {
        setLoad('fo-deactivate', true);
        setFailoverOut(null);
        const res = await fetch(`${BASE}/failover/deactivate`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' } });
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (d.output) setFailoverOut(String(d.output));
        showToast({ ok: res.ok, msg: String(d.message ?? d.error ?? (res.ok ? 'Deactivated' : 'Failed')) });
        loadFailover();
        setLoad('fo-deactivate', false);
      },
      'Deactivate',
    );
  }

  async function handleSyncNow() {
    setLoad('fo-sync', true);
    const r = await authPost('/failover/sync-now');
    showToast(r);
    setLoad('fo-sync', false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────────
  const serverStatusMap: Record<string, boolean> = (snapServerStatus as Record<string, boolean>) ?? {};

  // Clear a server's RESTARTING flag once its online state flips (came back up after
  // going down, or reported down) or after a 3-min safety timeout.
  useEffect(() => {
    if (Object.keys(restarting).length === 0) return;
    setRestarting(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [id, firedAt] of Object.entries(prev)) {
        const online = serverStatusMap[id];
        // A restart takes the box down then back up. Once we observe it OFFLINE
        // (the reboot dip) or 3 min elapse, we consider the transient state over.
        if (online === false || now - firedAt > 180000) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverStatusMap, now, restarting]);

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Global confirm modal ─────────────────────────────────────────── */}
      <ConfirmModal state={confirm} onCancel={() => setConfirm(CONFIRM_DEFAULT)} />

      {/* ── Automation detail modal ───────────────────────────────────────── */}
      <AutomationJobDetailModal
        job={selectedJob}
        open={selectedJob !== null}
        onClose={() => setSelectedJob(null)}
      />

      {/* ── Toast banner ──────────────────────────────────────────────────── */}
      <ToastBanner result={toast} onDismiss={() => setToast(null)} />

      {/* ── Mobile layout (single column) ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        <PageHeader />
        <ServersPanel
          servers={SERVERS}
          statusMap={serverStatusMap}
          restarting={restarting}
          loading={loading}
          results={serverResults}
          onWake={handleWake}
          onRestart={handleRestart}
          onShutdown={handleShutdown}
        />
        <ClaudePanel
          loading={loading}
          result={claudeResult}
          triggerJobs={triggerJobs}
          now={now}
          onStop={handleClaudeStop}
          onRestart={handleClaudeRestart}
          onFireTrigger={handleFireTrigger}
          onAbortTrigger={handleAbortTrigger}
        />
        <AutomationPanel
          jobs={snapAutomation}
          triggerJobs={triggerJobs}
          loading={loading}
          now={now}
          onJobClick={setSelectedJob}
          onFireTrigger={handleFireTrigger}
          onAbortTrigger={handleAbortTrigger}
        />
        <FailoverPanel
          failover={failover}
          output={failoverOut}
          loading={loading}
          onActivate={handleActivateFailover}
          onDeactivate={handleDeactivateFailover}
          onSync={handleSyncNow}
          onRefresh={loadFailover}
        />
      </div>

      {/* ── Desktop layout (8/4 command-center grid) ──────────────────────── */}
      <div
        className="hidden xl:grid gap-6"
        style={{ gridTemplateColumns: '8fr 4fr', alignItems: 'start' }}
      >
        {/* Lead column (8): header + servers + Claude */}
        <div className="flex flex-col gap-4">
          <PageHeader />
          <ServersPanel
            servers={SERVERS}
            statusMap={serverStatusMap}
            restarting={restarting}
            loading={loading}
            results={serverResults}
            onWake={handleWake}
            onRestart={handleRestart}
            onShutdown={handleShutdown}
          />
          <ClaudePanel
            loading={loading}
            result={claudeResult}
            triggerJobs={triggerJobs}
            now={now}
            onStop={handleClaudeStop}
            onRestart={handleClaudeRestart}
            onFireTrigger={handleFireTrigger}
            onAbortTrigger={handleAbortTrigger}
          />
        </div>

        {/* Rail (4): automation + failover */}
        <div className="flex flex-col gap-4">
          <AutomationPanel
            jobs={snapAutomation}
            triggerJobs={triggerJobs}
            loading={loading}
            now={now}
            onJobClick={setSelectedJob}
            onFireTrigger={handleFireTrigger}
            onAbortTrigger={handleAbortTrigger}
          />
          <FailoverPanel
            failover={failover}
            output={failoverOut}
            loading={loading}
            onActivate={handleActivateFailover}
            onDeactivate={handleDeactivateFailover}
            onSync={handleSyncNow}
            onRefresh={loadFailover}
          />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex flex-col gap-1">
      <PageTitle>Controls</PageTitle>
      <p className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
        Server power, Claude agent, automation triggers, and failover — all actions require confirmation.
      </p>
    </div>
  );
}

// ── Servers panel ─────────────────────────────────────────────────────────────

interface ServersPanelProps {
  servers: ServerDef[];
  statusMap: Record<string, boolean>;
  restarting: Record<string, number>;
  loading: Record<string, boolean>;
  results: Record<string, InlineResult>;
  onWake: (srv: ServerDef) => void;
  onRestart: (srv: ServerDef) => void;
  onShutdown: (srv: ServerDef) => void;
}

function ServersPanel({ servers, statusMap, restarting, loading, results, onWake, onRestart, onShutdown }: ServersPanelProps) {
  return (
    <Panel className="p-4">
      <SectionLabel>Server Power</SectionLabel>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {servers.map(srv => (
          <ServerCard
            key={srv.id}
            srv={srv}
            online={statusMap[srv.id]}
            statusKnown={srv.id in statusMap}
            restarting={srv.id in restarting}
            loading={loading}
            result={results[srv.id] ?? null}
            onWake={onWake}
            onRestart={onRestart}
            onShutdown={onShutdown}
          />
        ))}
      </div>
    </Panel>
  );
}

// ── Server card ───────────────────────────────────────────────────────────────
// Power state: ON (green) / OFF (gray) / UNRESPONSIVE (red) / RESTARTING (amber, pulse).
// UNRESPONSIVE vs OFF: server-status TCP ping says down while the lab section still
// reports the machine (was recently seen) → treat as unresponsive rather than clean off.
// Buttons are consistent across every machine; state-aware disabling instead.

type PowerState = 'on' | 'off' | 'unresponsive' | 'restarting' | 'unknown';

interface ServerCardProps {
  srv: ServerDef;
  online: boolean | undefined;
  statusKnown: boolean;
  restarting: boolean;
  loading: Record<string, boolean>;
  result: InlineResult | null;
  onWake: (srv: ServerDef) => void;
  onRestart: (srv: ServerDef) => void;
  onShutdown: (srv: ServerDef) => void;
}

const POWER_META: Record<PowerState, { label: string; color: string }> = {
  on:           { label: 'ON',           color: 'var(--v4-nominal)'  },
  off:          { label: 'OFF',          color: 'var(--v4-standby)'  },
  unresponsive: { label: 'UNRESPONSIVE', color: 'var(--v4-fault)'    },
  restarting:   { label: 'RESTARTING',   color: 'var(--v4-degraded)' },
  unknown:      { label: '—',            color: 'var(--v4-standby)'  },
};

function ServerCard({ srv, online, statusKnown, restarting, loading, result, onWake, onRestart, onShutdown }: ServerCardProps) {
  const power: PowerState = restarting ? 'restarting'
    : !statusKnown ? 'unknown'
    : online ? 'on'
    : 'off';
  const meta = POWER_META[power];
  const stripeColor = meta.color;

  const isOn  = power === 'on';
  const isOff = power === 'off' || power === 'unknown';
  const isRestarting = power === 'restarting';

  // State-aware gating (consistent buttons everywhere):
  //  Wake      → disabled when ON (or box has no MAC to wake)
  //  Restart   → disabled when OFF or RESTARTING (or CT100 self-host)
  //  Shutdown  → disabled when OFF or RESTARTING (or CT100 self-host)
  const wakeDisabled     = isOn || !srv.canWake || !!loading[`wake-${srv.id}`];
  const restartDisabled  = isOff || isRestarting || srv.isSelf || !!loading[`restart-${srv.id}`];
  const shutdownDisabled = isOff || isRestarting || srv.isSelf || !!loading[`shutdown-${srv.id}`];

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-[0.75rem] min-w-0 relative"
      style={{
        background: 'var(--v4-raised)',
        boxShadow: `inset 2px 0 0 ${stripeColor}`,
      }}
    >
      {/* Header + top-right power indicator */}
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div
            className="text-[0.875rem] font-semibold truncate tracking-tight"
            style={{ color: 'var(--v4-signal)' }}
          >
            {srv.label}
          </div>
          <Mono trace className="text-[0.6875rem] block truncate">{srv.sub}</Mono>
        </div>
        {/* Power status indicator — top-right corner */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={isRestarting ? 'v4-breathe' : undefined}
            style={{ width: 7, height: 7, borderRadius: 999, background: meta.color, display: 'inline-block' }}
            aria-hidden
          />
          <Mono className="text-[0.625rem] font-semibold tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </Mono>
        </div>
      </div>

      {/* Inline result */}
      {result && (
        <Mono
          className="text-[0.7rem] leading-relaxed"
          style={{ color: result.ok ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}
        >
          {result.msg}
        </Mono>
      )}

      {/* Action buttons — same three on every card */}
      <div className="flex flex-col gap-2">
        <ActionBtn
          label={loading[`wake-${srv.id}`] ? 'Waking…' : 'Wake'}
          icon={Wifi}
          variant="safe"
          loading={!!loading[`wake-${srv.id}`]}
          disabled={wakeDisabled}
          onClick={() => onWake(srv)}
        />
        <ActionBtn
          label={loading[`restart-${srv.id}`] || isRestarting ? 'Restarting…' : 'Restart'}
          icon={RotateCcw}
          variant="neutral"
          loading={!!loading[`restart-${srv.id}`]}
          disabled={restartDisabled}
          onClick={() => onRestart(srv)}
        />
        <ActionBtn
          label={loading[`shutdown-${srv.id}`] ? 'Shutting down…' : 'Shutdown'}
          icon={Power}
          variant="destructive"
          loading={!!loading[`shutdown-${srv.id}`]}
          disabled={shutdownDisabled}
          onClick={() => onShutdown(srv)}
        />
        {srv.isSelf && (
          <Mono trace className="text-[0.625rem]">dashboard host — power controls disabled</Mono>
        )}
      </div>
    </div>
  );
}

// ── Claude panel (CT100 agent controls + transfers + terminal) ──────────────────

interface ClaudePanelProps {
  loading: Record<string, boolean>;
  result: InlineResult | null;
  triggerJobs: Record<string, TriggerJob>;
  now: number;
  onStop: () => void;
  onRestart: () => void;
  onFireTrigger: (id: string, label: string) => void;
  onAbortTrigger: (id: string) => void;
}

// Claude→S3 / Claude→S1 transfer triggers (moved out of Additional Triggers).
const CLAUDE_TRANSFERS: TriggerDef[] = [
  { id: 'claude-server3', label: 'Claude → S3', desc: 'Start Claude Code on Server 3 (fallback agent)',   icon: Bot },
  { id: 'claude-server1', label: 'Claude → S1', desc: 'Start Claude Code on Server 1 WSL2 (last resort)', icon: Bot },
];

function ClaudePanel({ loading, result, triggerJobs, now, onStop, onRestart, onFireTrigger, onAbortTrigger }: ClaudePanelProps) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <SectionLabel>Claude</SectionLabel>
        <ClaudeTerminalViewer />
      </div>

      {/* CT100 agent status + stop/restart */}
      <div
        className="flex flex-col gap-3 p-3 rounded-[0.75rem]"
        style={{ background: 'var(--v4-raised)', boxShadow: 'inset 2px 0 0 var(--v4-nominal)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={15} className="shrink-0" style={{ color: 'var(--v4-amber)' }} />
          <div className="flex-1 min-w-0">
            <div className="text-[0.875rem] font-semibold" style={{ color: 'var(--v4-signal)' }}>Claude on CT100</div>
            <Mono trace className="text-[0.6875rem]">Main agent · .13</Mono>
          </div>
        </div>

        {result && (
          <Mono className="text-[0.7rem]" style={{ color: result.ok ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}>
            {result.msg}
          </Mono>
        )}

        <div className="flex gap-2">
          <ActionBtn
            label={loading['claude-stop'] ? '…' : 'Stop Claude'}
            icon={Square}
            variant="destructive"
            loading={!!loading['claude-stop']}
            onClick={onStop}
            compact
          />
          <ActionBtn
            label={loading['claude-restart'] ? '…' : 'Restart Claude'}
            icon={RotateCcw}
            variant="safe"
            loading={!!loading['claude-restart']}
            onClick={onRestart}
            compact
          />
        </div>
      </div>

      {/* Claude transfers */}
      <div className="mt-4">
        <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: 'var(--v4-trace)' }}>
          Transfer agent
        </div>
        <div className="flex flex-col gap-2">
          {CLAUDE_TRANSFERS.map(trig => {
            const Icon = trig.icon;
            const tjob = triggerJobs[trig.id];
            const isRunning = tjob?.status === 'running';
            return (
              <div
                key={trig.id}
                className="flex items-center gap-3 py-2.5 px-3 rounded-[0.5rem] min-w-0"
                style={{ background: 'var(--v4-well)' }}
              >
                <Icon size={14} className="shrink-0" style={{ color: 'var(--v4-readout)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8125rem] font-medium" style={{ color: 'var(--v4-signal)' }}>{trig.label}</div>
                  <div className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>{trig.desc}</div>
                  {tjob && (
                    <Mono
                      className="text-[0.6875rem] mt-0.5"
                      style={{ color: tjob.status === 'done' ? 'var(--v4-nominal)' : tjob.status === 'error' ? 'var(--v4-fault)' : 'var(--v4-readout)' }}
                    >
                      {isRunning ? `Running… ${elapsed(now - tjob.startedAt)}` : tjob.status === 'done' ? `Done in ${elapsed((tjob.finishedAt ?? now) - tjob.startedAt)}` : tjob.status}
                    </Mono>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px] disabled:opacity-40"
                    style={{ background: 'rgba(88,166,255,0.10)', color: 'var(--v4-amber)', border: '1px solid rgba(88,166,255,0.2)', cursor: isRunning || loading[`trigger-${trig.id}`] ? 'default' : 'pointer' }}
                    disabled={isRunning || !!loading[`trigger-${trig.id}`]}
                    onClick={() => onFireTrigger(trig.id, trig.label)}
                  >
                    <Play size={10} className="shrink-0" />
                    {isRunning ? 'Running…' : 'Run now'}
                  </button>
                  {isRunning && (
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px] disabled:opacity-40"
                      style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)', border: '1px solid rgba(248,81,73,0.2)', cursor: 'pointer' }}
                      onClick={() => onAbortTrigger(trig.id)}
                    >
                      <Square size={10} /> Abort
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  label: string;
  icon: LucideIcon;
  variant: 'safe' | 'neutral' | 'destructive';
  loading: boolean;
  onClick: () => void;
  compact?: boolean;
  disabled?: boolean;
}

function ActionBtn({ label, icon: Icon, variant, loading, onClick, compact, disabled }: ActionBtnProps) {
  const styles: Record<ActionBtnProps['variant'], React.CSSProperties> = {
    safe:        { background: 'rgba(63,185,80,0.10)',  color: 'var(--v4-nominal)',  border: '1px solid rgba(63,185,80,0.25)'  },
    neutral:     { background: 'var(--v4-console)',     color: 'var(--v4-readout)', border: 'none' },
    destructive: { background: 'rgba(248,81,73,0.08)',  color: 'var(--v4-fault)',    border: '1px solid rgba(248,81,73,0.22)'  },
  };

  return (
    <button
      className="flex items-center justify-center gap-1.5 rounded-[0.5rem] font-medium text-[0.75rem] min-h-[40px] v4-tile active:-translate-y-px transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        ...styles[variant],
        width: compact ? undefined : '100%',
        flex: compact ? 1 : undefined,
        cursor: loading || disabled ? 'default' : 'pointer',
        padding: compact ? '8px 10px' : '9px 12px',
      }}
      disabled={loading || disabled}
      onClick={onClick}
    >
      <Icon size={12} className="shrink-0" />
      {label}
    </button>
  );
}

// ── Automation panel ──────────────────────────────────────────────────────────

interface AutomationPanelProps {
  jobs: AutomationJob[] | null;
  triggerJobs: Record<string, TriggerJob>;
  loading: Record<string, boolean>;
  now: number;
  onJobClick: (job: AutomationJob) => void;
  onFireTrigger: (id: string, label: string) => void;
  onAbortTrigger: (id: string) => void;
}

function AutomationPanel({ jobs, triggerJobs, loading, now, onJobClick, onFireTrigger, onAbortTrigger }: AutomationPanelProps) {
  const waiting = jobs == null;

  // Map automation job id → matching trigger definition (for "Run now" button)
  const triggerById = new Map(TRIGGERS.map(t => [t.id, t]));

  return (
    <Panel className="p-4">
      <SectionLabel>Automation</SectionLabel>

      {waiting ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState message="No automation jobs found" action="Trigger one below" />
      ) : (
        <div className="flex flex-col">
          {jobs.map((job, i) => {
            const trig = triggerById.get(job.id);
            const trigJob = triggerJobs[job.id];
            const isRunning = trigJob?.status === 'running';
            return (
              <div key={job.id}>
                {i > 0 && <Hairline />}
                <AutomationRow
                  job={job}
                  isRunning={isRunning}
                  trigJob={trigJob}
                  hasTrigger={!!trig}
                  loading={loading}
                  now={now}
                  onJobClick={onJobClick}
                  onFire={() => trig && onFireTrigger(trig.id, trig.label)}
                  onAbort={() => onAbortTrigger(job.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Manual triggers for actions not mapped to automation jobs */}
      <div className="mt-4">
        <div
          className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] mb-2"
          style={{ color: 'var(--v4-trace)' }}
        >
          Additional Triggers
        </div>
        <div className="flex flex-col gap-2">
          {TRIGGERS.filter(t => !jobs?.find(j => j.id === t.id)).map(trig => {
            const Icon = trig.icon;
            const tjob = triggerJobs[trig.id];
            const isRunning = tjob?.status === 'running';
            return (
              <div
                key={trig.id}
                className="flex items-center gap-3 py-2.5 px-3 rounded-[0.5rem] min-w-0"
                style={{ background: 'var(--v4-well)' }}
              >
                <Icon size={14} className="shrink-0" style={{ color: 'var(--v4-readout)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8125rem] font-medium" style={{ color: 'var(--v4-signal)' }}>{trig.label}</div>
                  <div className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>{trig.desc}</div>
                  {tjob && (
                    <Mono
                      className="text-[0.6875rem] mt-0.5"
                      style={{ color: tjob.status === 'done' ? 'var(--v4-nominal)' : tjob.status === 'error' ? 'var(--v4-fault)' : 'var(--v4-readout)' }}
                    >
                      {isRunning ? `Running… ${elapsed(now - tjob.startedAt)}` : tjob.status === 'done' ? `Done in ${elapsed((tjob.finishedAt ?? now) - tjob.startedAt)}` : tjob.status}
                    </Mono>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px] disabled:opacity-40"
                    style={{ background: 'rgba(88,166,255,0.10)', color: 'var(--v4-amber)', border: '1px solid rgba(88,166,255,0.2)', cursor: isRunning || loading[`trigger-${trig.id}`] ? 'default' : 'pointer' }}
                    disabled={isRunning || !!loading[`trigger-${trig.id}`]}
                    onClick={() => onFireTrigger(trig.id, trig.label)}
                  >
                    <Play size={10} className="shrink-0" />
                    {isRunning ? 'Running…' : 'Run now'}
                  </button>
                  {isRunning && (
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px] disabled:opacity-40"
                      style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)', border: '1px solid rgba(248,81,73,0.2)', cursor: 'pointer' }}
                      onClick={() => onAbortTrigger(trig.id)}
                    >
                      <Square size={10} /> Abort
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ── Automation row ─────────────────────────────────────────────────────────────

interface AutomationRowProps {
  job: AutomationJob;
  isRunning: boolean;
  trigJob: TriggerJob | undefined;
  hasTrigger: boolean;
  loading: Record<string, boolean>;
  now: number;
  onJobClick: (job: AutomationJob) => void;
  onFire: () => void;
  onAbort: () => void;
}

function AutomationRow({ job, isRunning, trigJob, hasTrigger, loading, now, onJobClick, onFire, onAbort }: AutomationRowProps) {
  function statusLevel(s: string): 'nominal' | 'degraded' | 'fault' | 'standby' {
    switch (s?.toLowerCase()) {
      case 'ok': case 'success': return 'nominal';
      case 'running': case 'pending': return 'degraded';
      case 'failed': case 'error': return 'fault';
      default: return 'standby';
    }
  }

  const level = isRunning ? 'degraded' : statusLevel(job.status);
  const displayStatus = isRunning ? 'running' : job.status || 'unknown';

  return (
    <div className="flex items-center gap-3 py-2.5 px-1 min-w-0 min-h-[44px]">
      {/* Clickable status + label area */}
      <button
        className="flex items-center gap-2 flex-1 min-w-0 text-left v4-tile rounded-[0.5rem]"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        onClick={() => onJobClick(job)}
      >
        <StatusChip level={level} label={displayStatus} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div
            className="text-[0.8125rem] truncate"
            style={{ color: 'var(--v4-signal)' }}
          >
            {job.label}
          </div>
          <Mono trace className="text-[0.6875rem]">
            {isRunning && trigJob
              ? `Running… ${elapsed(now - trigJob.startedAt)}`
              : job.lastRun ? fmtDate(job.lastRun) : '—'
            }
          </Mono>
        </div>
      </button>

      {/* Run now / abort */}
      {hasTrigger && (
        <div className="flex gap-1.5 shrink-0">
          {!isRunning ? (
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px] disabled:opacity-40"
              style={{ background: 'rgba(88,166,255,0.10)', color: 'var(--v4-amber)', border: '1px solid rgba(88,166,255,0.2)', cursor: loading[`trigger-${job.id}`] ? 'default' : 'pointer' }}
              disabled={!!loading[`trigger-${job.id}`]}
              onClick={onFire}
            >
              <Play size={10} className="shrink-0" />
              Run
            </button>
          ) : (
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-[0.375rem] text-[0.6875rem] font-medium min-h-[36px]"
              style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)', border: '1px solid rgba(248,81,73,0.2)', cursor: 'pointer' }}
              disabled={!!loading[`abort-${job.id}`]}
              onClick={onAbort}
            >
              <Square size={10} /> Abort
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Failover panel ─────────────────────────────────────────────────────────────

interface FailoverPanelProps {
  failover: FailoverStatus | null;
  output: string | null;
  loading: Record<string, boolean>;
  onActivate: () => void;
  onDeactivate: () => void;
  onSync: () => void;
  onRefresh: () => void;
}

function FailoverPanel({ failover, output, loading, onActivate, onDeactivate, onSync, onRefresh }: FailoverPanelProps) {
  return (
    <Panel className="p-4">
      <SectionLabel>S2 → S3 Failover</SectionLabel>

      {/* Status row */}
      <div className="flex items-center flex-wrap gap-3 mb-3">
        <HostStatusPill label="S2" online={failover?.s2_online} />
        <span className="text-[0.875rem]" style={{ color: 'var(--v4-trace)' }}>→</span>
        <HostStatusPill label="S3" online={failover?.s3_online} />

        {/* Watchdog */}
        <div className="flex items-center gap-1.5">
          <Activity size={12} style={{ color: failover?.watchdog_status === 'active' ? 'var(--v4-nominal)' : 'var(--v4-standby)' }} />
          <Mono trace className="text-[0.6875rem]">Watchdog:</Mono>
          <StatusChip
            level={failover?.watchdog_status === 'active' ? 'nominal' : 'standby'}
            label={failover?.watchdog_status ?? '…'}
          />
        </div>

        {/* Failover active badge */}
        {failover?.failover_active ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[0.5rem]"
            style={{ background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.3)' }}
          >
            <Zap size={12} style={{ color: 'var(--v4-degraded)' }} />
            <span className="text-[0.75rem] font-semibold" style={{ color: 'var(--v4-degraded)' }}>FAILOVER ACTIVE</span>
          </div>
        ) : failover !== null ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[0.5rem]"
            style={{ background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)' }}
          >
            <ZapOff size={12} style={{ color: 'var(--v4-nominal)' }} />
            <span className="text-[0.75rem] font-medium" style={{ color: 'var(--v4-nominal)' }}>Normal</span>
          </div>
        ) : null}
      </div>

      {/* Last sync */}
      <div className="mb-3">
        <Mono trace className="text-[0.75rem]">
          Last volume sync: {failover?.last_sync ?? '—'}
        </Mono>
      </div>

      {/* Output log */}
      {output !== null && (
        <Well className="px-3 py-2.5 mb-3 overflow-auto" style={{ maxHeight: '8rem' }}>
          <pre className="text-[0.6875rem] m-0 whitespace-pre-wrap break-words" style={{ fontFamily: "'Geist Mono', monospace", color: 'var(--v4-readout)' }}>
            {output || '(no output)'}
          </pre>
        </Well>
      )}

      {/* Danger context note */}
      <div
        className="flex items-start gap-2 px-3 py-2 rounded-[0.5rem] mb-3"
        style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.15)' }}
      >
        <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--v4-fault)' }} />
        <p className="text-[0.7rem] leading-relaxed" style={{ color: 'var(--v4-readout)' }}>
          Activating failover starts lab services on S3 and may affect running workloads. Confirm step required.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[40px] disabled:opacity-40"
          style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--v4-fault)', border: '1px solid rgba(248,81,73,0.25)', cursor: loading['fo-activate'] ? 'default' : 'pointer' }}
          disabled={!!loading['fo-activate']}
          onClick={onActivate}
        >
          <Zap size={13} className="shrink-0" />
          {loading['fo-activate'] ? 'Activating…' : 'Activate Failover'}
        </button>

        {failover?.failover_active && (
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[40px] disabled:opacity-40"
            style={{ background: 'rgba(63,185,80,0.08)', color: 'var(--v4-nominal)', border: '1px solid rgba(63,185,80,0.2)', cursor: loading['fo-deactivate'] ? 'default' : 'pointer' }}
            disabled={!!loading['fo-deactivate']}
            onClick={onDeactivate}
          >
            <ZapOff size={13} className="shrink-0" />
            {loading['fo-deactivate'] ? 'Deactivating…' : 'Deactivate'}
          </button>
        )}

        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[40px] disabled:opacity-40"
          style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: loading['fo-sync'] ? 'default' : 'pointer' }}
          disabled={!!loading['fo-sync']}
          onClick={onSync}
        >
          <RotateCw size={13} className="shrink-0" />
          {loading['fo-sync'] ? 'Syncing…' : 'Sync Volumes'}
        </button>

        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[40px] ml-auto"
          style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: 'pointer' }}
          onClick={onRefresh}
        >
          <RefreshCw size={13} className="shrink-0" /> Refresh
        </button>
      </div>
    </Panel>
  );
}

// ── Host status pill ──────────────────────────────────────────────────────────

function HostStatusPill({ label, online }: { label: string; online: boolean | undefined }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: online == null ? 'var(--v4-standby)' : online ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}
        aria-hidden
      />
      <Mono className="text-[0.8125rem] font-semibold" style={{ color: 'var(--v4-signal)' }}>{label}</Mono>
      <Mono dim className="text-[0.75rem]">{online == null ? '…' : online ? 'online' : 'offline'}</Mono>
    </div>
  );
}
