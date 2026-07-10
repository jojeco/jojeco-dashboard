/**
 * v4 ControlsPage — slice 2: ACT layer.
 *
 * Panels (mobile: top-to-bottom; desktop: 8/4 command-center grid):
 *  1. Server Power — per-machine card; Wake / Restart / Shutdown (confirm-gated)
 *  2. Containers   — searchable CT100 container list; restart/stop/start (confirm-gated)
 *  3. Automation   — 9 SSE-backed jobs; status chips; click → detail modal; Run now (confirm-gated)
 *  4. Failover     — S2→S3 failover activate/deactivate/sync (confirm-gated)
 *
 * Safety:
 *  - Every mutating action is gated behind an explicit confirm step (DetailModal pattern).
 *  - Protected containers (nginx-proxy-manager, portainer, cloudflared,
 *    jojeco-dashboard-api) are flagged and blocked at the API layer; here we
 *    flag them visually so the user knows why.
 *  - Claude stop (CT100/S1/S3) requires confirm.
 *  - Server restart for S2/Proxmox requires confirm with extra warning.
 *  - All destructive buttons use Fault-text ghost styling (no red fill wash).
 *
 * Endpoint inventory:
 *  POST /api/controls/server/:id/wake
 *  POST /api/controls/server/:id/restart
 *  POST /api/controls/server/:id/shutdown
 *  POST /api/controls/claude/:id/stop
 *  POST /api/controls/claude/:id/restart
 *  POST /api/controls/container/:name/restart
 *  POST /api/controls/container/:name/stop
 *  POST /api/controls/container/:name/start
 *  POST /api/docker/prune
 *  POST /api/controls/trigger/:action  (health|backup|snapshot|sync-context|claude-server3|claude-server1)
 *  POST /api/controls/trigger/:action/abort
 *  GET  /api/controls/trigger-status
 *  GET  /api/controls/containers
 *  POST /api/failover/activate
 *  POST /api/failover/deactivate
 *  POST /api/failover/sync-now
 *  GET  /api/failover/status
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Power, RotateCcw, Wifi, Bot, Square, Play,
  Search, RefreshCw, Activity, Zap, ZapOff,
  RotateCw, ShieldCheck, Database, GitBranch,
  AlertTriangle, Shield, ChevronRight, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useSnapshot } from '../../hooks/useSnapshot';
import type { AutomationJob } from '../../hooks/useSnapshot';
import { getToken } from '../../services/api';

import { DetailModal } from '../components/DetailModal';
import { AutomationJobDetailModal } from '../components/AutomationJobDetailModal';
import {
  Panel, PanelTitle, PageTitle, Mono, Well, Hairline,
  StatusChip, Skeleton, EmptyState,
} from '../components/Primitives';
import { ContainerLogTail } from '../components/ContainerLogTail';
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
  hasClaude: boolean;
  isSelf: boolean;        // CT100 — no restart/shutdown
}

const SERVERS: ServerDef[] = [
  { id: 'ct100',   label: 'CT100',     sub: 'LXC · .13 · Main agent',         ip: '192.168.50.13', canWake: false, warnRestart: false, hasClaude: true,  isSelf: true  },
  { id: 'server1', label: 'Server 1',  sub: 'i7-4790 · Windows · .10',          ip: '192.168.50.10', canWake: true,  warnRestart: false, hasClaude: true,  isSelf: false },
  { id: 'server2', label: 'Server 2',  sub: 'Proxmox · i5-10505 · .11',         ip: '192.168.50.11', canWake: true,  warnRestart: true,  hasClaude: false, isSelf: false },
  { id: 'server3', label: 'Server 3',  sub: 'Ubuntu · i7-8750H · .12',          ip: '192.168.50.12', canWake: true,  warnRestart: false, hasClaude: true,  isSelf: false },
  { id: 'macmini', label: 'Mac Mini',  sub: 'macOS · Intel i5 · .30',           ip: '192.168.50.30', canWake: true,  warnRestart: false, hasClaude: false, isSelf: false },
  { id: 'jopc',    label: 'JoPc',      sub: 'Windows · RTX 3080 Ti · .20',      ip: '192.168.50.20', canWake: true,  warnRestart: false, hasClaude: false, isSelf: false },
];

interface TriggerDef {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}

const TRIGGERS: TriggerDef[] = [
  { id: 'health',         label: 'Health Check',  desc: 'Run dep-watcher: restart any down containers',        icon: ShieldCheck },
  { id: 'backup',         label: 'GDrive Backup', desc: 'Dump databases and sync to Google Drive',             icon: Database    },
  { id: 'snapshot',       label: 'Update Check',  desc: 'Pull latest images, report critical updates',         icon: RefreshCw   },
  { id: 'sync-context',   label: 'Sync Context',  desc: 'Push memory, stacks & context to GitHub',             icon: GitBranch   },
  { id: 'claude-server3', label: 'Claude → S3',   desc: 'Start Claude Code on Server 3 (fallback agent)',      icon: Bot         },
  { id: 'claude-server1', label: 'Claude → S1',   desc: 'Start Claude Code on Server 1 WSL2 (last resort)',    icon: Bot         },
];

// Containers that the server blocks — show visually protected
const PROTECTED_CONTAINERS = new Set([
  'nginx-proxy-manager', 'portainer', 'cloudflared', 'jojeco-dashboard-api',
]);

// ── Local types ───────────────────────────────────────────────────────────────

interface Container { name: string; status: string; running: boolean; healthy: string | null; image: string; compose_project?: string }
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

  // Containers
  const [containers,       setContainers]       = useState<Container[]>([]);
  const [containerSearch,  setContainerSearch]  = useState('');
  const [containerResults, setContainerResults] = useState<Record<string, InlineResult>>({});
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);

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

  // ── Load containers ───────────────────────────────────────────────────────────
  const loadContainers = useCallback(async () => {
    const { ok, data } = await authGet<Container[]>('/controls/containers');
    if (ok && Array.isArray(data)) setContainers(data);
  }, []);

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
    loadContainers();
    loadTriggerStatus();
    loadFailover();
    const fo = setInterval(loadFailover, 30000);
    return () => clearInterval(fo);
  }, [loadContainers, loadTriggerStatus, loadFailover]);

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
    const go = () => doServerAction(`/controls/server/${srv.id}/restart`, `restart-${srv.id}`, srv.id);
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

  function handleClaudeStop(srv: ServerDef) {
    withConfirm(
      `Stop Claude on ${srv.label}`,
      `Kill the Claude process on ${srv.label}? It can be restarted from this panel.`,
      async () => {
        setLoad(`claude-stop-${srv.id}`, true);
        const r = await authPost(`/controls/claude/${srv.id}/stop`);
        setServerResults(prev => ({ ...prev, [`claude-${srv.id}`]: r }));
        showToast(r);
        setLoad(`claude-stop-${srv.id}`, false);
      },
      'Stop Claude',
    );
  }

  function handleClaudeRestart(srv: ServerDef) {
    withConfirm(
      `Restart Claude on ${srv.label}`,
      `Kill and restart the Claude process on ${srv.label}?`,
      async () => {
        setLoad(`claude-restart-${srv.id}`, true);
        const r = await authPost(`/controls/claude/${srv.id}/restart`);
        setServerResults(prev => ({ ...prev, [`claude-${srv.id}`]: r }));
        showToast(r);
        setLoad(`claude-restart-${srv.id}`, false);
      },
      'Restart Claude', false,
    );
  }

  // ── Container actions ─────────────────────────────────────────────────────────
  async function doContainerAction(name: string, action: 'restart' | 'stop' | 'start') {
    const key = `c-${action}-${name}`;
    setLoad(key, true);
    const r = await authPost(`/controls/container/${name}/${action}`);
    setContainerResults(prev => ({ ...prev, [name]: r }));
    showToast(r);
    if (r.ok) await loadContainers();
    setLoad(key, false);
  }

  function handleContainerStop(name: string) {
    withConfirm(
      `Stop ${name}`,
      `Stop container "${name}"? It can be started again from this panel.`,
      () => doContainerAction(name, 'stop'),
      'Stop',
    );
  }

  function handleContainerRestart(name: string) {
    withConfirm(
      `Restart ${name}`,
      `Restart container "${name}"?`,
      () => doContainerAction(name, 'restart'),
      'Restart',
    );
  }

  function handleContainerStart(name: string) {
    withConfirm(
      `Start ${name}`,
      `Start container "${name}"?`,
      () => doContainerAction(name, 'start'),
      'Start', false,
    );
  }

  function handlePrune() {
    withConfirm(
      'Prune Docker',
      'Remove unused Docker data (stopped containers, dangling images, build cache) and run fstrim to reclaim LVM thin pool space?',
      async () => {
        setLoad('prune', true);
        const r = await authPost('/docker/prune');
        showToast(r);
        if (r.ok) await loadContainers();
        setLoad('prune', false);
      },
      'Prune',
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

      {/* ── Container detail modal ────────────────────────────────────────── */}
      <ContainerDetailModal
        container={selectedContainer}
        open={selectedContainer !== null}
        onClose={() => setSelectedContainer(null)}
        loading={loading}
        result={selectedContainer ? (containerResults[selectedContainer.name] ?? null) : null}
        onRestart={handleContainerRestart}
        onStop={handleContainerStop}
        onStart={handleContainerStart}
      />

      {/* ── Toast banner ──────────────────────────────────────────────────── */}
      <ToastBanner result={toast} onDismiss={() => setToast(null)} />

      {/* ── Mobile layout (single column) ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        <PageHeader />
        <ServersPanel
          servers={SERVERS}
          statusMap={serverStatusMap}
          loading={loading}
          results={serverResults}
          onWake={handleWake}
          onRestart={handleRestart}
          onShutdown={handleShutdown}
          onClaudeStop={handleClaudeStop}
          onClaudeRestart={handleClaudeRestart}
        />
        <ContainersPanel
          containers={containers}
          search={containerSearch}
          loading={loading}
          onSearchChange={setContainerSearch}
          onRefresh={loadContainers}
          onPrune={handlePrune}
          onSelectContainer={setSelectedContainer}
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
        {/* Lead column (8): header + servers + containers */}
        <div className="flex flex-col gap-4">
          <PageHeader />
          <ServersPanel
            servers={SERVERS}
            statusMap={serverStatusMap}
            loading={loading}
            results={serverResults}
            onWake={handleWake}
            onRestart={handleRestart}
            onShutdown={handleShutdown}
            onClaudeStop={handleClaudeStop}
            onClaudeRestart={handleClaudeRestart}
          />
          <ContainersPanel
            containers={containers}
            search={containerSearch}
            loading={loading}
            onSearchChange={setContainerSearch}
            onRefresh={loadContainers}
            onPrune={handlePrune}
            onSelectContainer={setSelectedContainer}
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
        Server power, container management, automation triggers, and failover — all actions require confirmation.
      </p>
    </div>
  );
}

// ── Servers panel ─────────────────────────────────────────────────────────────

interface ServersPanelProps {
  servers: ServerDef[];
  statusMap: Record<string, boolean>;
  loading: Record<string, boolean>;
  results: Record<string, InlineResult>;
  onWake: (srv: ServerDef) => void;
  onRestart: (srv: ServerDef) => void;
  onShutdown: (srv: ServerDef) => void;
  onClaudeStop: (srv: ServerDef) => void;
  onClaudeRestart: (srv: ServerDef) => void;
}

function ServersPanel({ servers, statusMap, loading, results, onWake, onRestart, onShutdown, onClaudeStop, onClaudeRestart }: ServersPanelProps) {
  return (
    <Panel className="p-4">
      <SectionLabel>Server Power</SectionLabel>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        {servers.map(srv => (
          <ServerCard
            key={srv.id}
            srv={srv}
            online={statusMap[srv.id]}
            statusKnown={srv.id in statusMap}
            loading={loading}
            result={results[srv.id] ?? null}
            claudeResult={results[`claude-${srv.id}`] ?? null}
            onWake={onWake}
            onRestart={onRestart}
            onShutdown={onShutdown}
            onClaudeStop={onClaudeStop}
            onClaudeRestart={onClaudeRestart}
          />
        ))}
      </div>
    </Panel>
  );
}

// ── Server card ───────────────────────────────────────────────────────────────

interface ServerCardProps {
  srv: ServerDef;
  online: boolean | undefined;
  statusKnown: boolean;
  loading: Record<string, boolean>;
  result: InlineResult | null;
  claudeResult: InlineResult | null;
  onWake: (srv: ServerDef) => void;
  onRestart: (srv: ServerDef) => void;
  onShutdown: (srv: ServerDef) => void;
  onClaudeStop: (srv: ServerDef) => void;
  onClaudeRestart: (srv: ServerDef) => void;
}

function ServerCard({ srv, online, statusKnown, loading, result, claudeResult, onWake, onRestart, onShutdown, onClaudeStop, onClaudeRestart }: ServerCardProps) {
  const stripeColor = !statusKnown ? 'var(--v4-standby)' : online ? 'var(--v4-nominal)' : 'var(--v4-fault)';

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-[0.75rem] min-w-0"
      style={{
        background: 'var(--v4-raised)',
        boxShadow: `inset 2px 0 0 ${stripeColor}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div
            className="text-[0.875rem] font-semibold truncate tracking-tight"
            style={{ color: 'var(--v4-signal)' }}
          >
            {srv.label}
          </div>
          <Mono trace className="text-[0.6875rem] block truncate">{srv.sub}</Mono>
        </div>
        {statusKnown && (
          <StatusChip
            level={online ? 'nominal' : 'fault'}
            label={online ? 'up' : 'down'}
            className="shrink-0"
          />
        )}
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

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {/* Wake (always show if canWake, no confirm needed) */}
        {srv.canWake && (
          <ActionBtn
            label={loading[`wake-${srv.id}`] ? 'Waking…' : 'Wake'}
            icon={Wifi}
            variant="safe"
            loading={!!loading[`wake-${srv.id}`]}
            onClick={() => onWake(srv)}
          />
        )}

        {/* Restart + Shutdown (not for CT100 — isSelf) */}
        {!srv.isSelf && (
          <>
            <ActionBtn
              label={loading[`restart-${srv.id}`] ? 'Restarting…' : 'Restart'}
              icon={RotateCcw}
              variant="neutral"
              loading={!!loading[`restart-${srv.id}`]}
              onClick={() => onRestart(srv)}
            />
            <ActionBtn
              label={loading[`shutdown-${srv.id}`] ? 'Shutting down…' : 'Shutdown'}
              icon={Power}
              variant="destructive"
              loading={!!loading[`shutdown-${srv.id}`]}
              onClick={() => onShutdown(srv)}
            />
          </>
        )}

        {/* Claude controls */}
        {srv.hasClaude && (
          <div className="flex gap-2 mt-1">
            <ActionBtn
              label={loading[`claude-stop-${srv.id}`] ? '…' : 'Stop Claude'}
              icon={Square}
              variant="destructive"
              loading={!!loading[`claude-stop-${srv.id}`]}
              onClick={() => onClaudeStop(srv)}
              compact
            />
            <ActionBtn
              label={loading[`claude-restart-${srv.id}`] ? '…' : 'Restart Claude'}
              icon={Bot}
              variant="safe"
              loading={!!loading[`claude-restart-${srv.id}`]}
              onClick={() => onClaudeRestart(srv)}
              compact
            />
          </div>
        )}

        {claudeResult && (
          <Mono
            className="text-[0.7rem]"
            style={{ color: claudeResult.ok ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}
          >
            {claudeResult.msg}
          </Mono>
        )}
      </div>
    </div>
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
}

function ActionBtn({ label, icon: Icon, variant, loading, onClick, compact }: ActionBtnProps) {
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
        cursor: loading ? 'default' : 'pointer',
        padding: compact ? '8px 10px' : '9px 12px',
      }}
      disabled={loading}
      onClick={onClick}
    >
      <Icon size={12} className="shrink-0" />
      {label}
    </button>
  );
}

// ── Containers: grouping helper ───────────────────────────────────────────────

/**
 * Derive a stack group from a container name.
 * Docker Compose v2 names containers as "<project>-<service>-<N>".
 * Single-word names with no separator → standalone.
 * Also handles explicit compose_project field if the server ever adds it.
 */
function deriveGroup(c: Container): string {
  if (c.compose_project) return c.compose_project;
  // Match "prefix-..." where prefix is 2+ chars and there's a hyphen
  const m = c.name.match(/^([a-z][a-z0-9]+(?:[_-][a-z0-9]+)*?)[-_][a-z]/i);
  if (m) {
    // Only treat as grouped if the prefix is a known multi-container project
    // i.e. there are other containers sharing the same prefix
    return m[1].toLowerCase();
  }
  return 'standalone';
}

function containerStatusLevel(c: Container): 'nominal' | 'degraded' | 'fault' | 'standby' {
  if (c.healthy === 'unhealthy') return 'fault';
  if (!c.running) return 'standby';
  return 'nominal';
}

function isAttentionContainer(c: Container): boolean {
  if (c.healthy === 'unhealthy') return true;
  if (!c.running) return true;
  // "restarting" in status text
  if (c.status?.toLowerCase().includes('restarting')) return true;
  return false;
}

// ── Containers panel ──────────────────────────────────────────────────────────

interface ContainersPanelProps {
  containers: Container[];
  search: string;
  loading: Record<string, boolean>;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onPrune: () => void;
  onSelectContainer: (c: Container) => void;
}

function ContainersPanel({ containers, search, loading, onSearchChange, onRefresh, onPrune, onSelectContainer }: ContainersPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const total    = containers.length;
  const running  = containers.filter(c => c.running).length;
  const unhealthy = containers.filter(c => c.healthy === 'unhealthy').length;
  const stopped  = containers.filter(c => !c.running).length;

  const attentionList = containers.filter(isAttentionContainer);
  const hasAttention  = attentionList.length > 0;

  const searchActive = search.trim().length > 0;
  const searchResults = searchActive
    ? containers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  // Build stack groups (exclude attention containers from stacks to avoid duplication)
  const normalContainers = containers.filter(c => !isAttentionContainer(c));

  // First pass: collect all derived groups to know which prefixes are truly multi-container
  const groupCounts: Record<string, number> = {};
  normalContainers.forEach(c => {
    const g = deriveGroup(c);
    groupCounts[g] = (groupCounts[g] ?? 0) + 1;
  });

  // Second pass: finalize groups (single-container "groups" go to standalone)
  const groupMap: Record<string, Container[]> = {};
  normalContainers.forEach(c => {
    let g = deriveGroup(c);
    // If derived prefix only matches this container, it's standalone
    if (g !== 'standalone' && groupCounts[g] === 1) g = 'standalone';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(c);
  });

  const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => {
    if (a === 'standalone') return 1;
    if (b === 'standalone') return -1;
    return a.localeCompare(b);
  });

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Panel className="p-4">
      {/* Header row: title + prune ghost button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <SectionLabel>Container Controls</SectionLabel>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[0.5rem] text-[0.6875rem] min-h-[32px] transition-colors disabled:opacity-40"
            style={{ background: 'transparent', color: 'var(--v4-trace)', border: 'none', cursor: loading['prune'] ? 'default' : 'pointer' }}
            disabled={!!loading['prune']}
            onClick={onPrune}
            title="Prune stopped containers and dangling images"
          >
            <Trash2 size={11} className="shrink-0" />
            {loading['prune'] ? 'Pruning…' : 'Prune'}
          </button>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[0.5rem] text-[0.6875rem] min-h-[32px] transition-colors"
            style={{ background: 'transparent', color: 'var(--v4-trace)', border: 'none', cursor: 'pointer' }}
            onClick={onRefresh}
          >
            <RefreshCw size={11} className="shrink-0" />
          </button>
        </div>
      </div>

      {/* ── Summary line ──────────────────────────────────────────────────── */}
      {total === 0 ? (
        <EmptyState message="Loading containers…" />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Mono trace className="text-[0.75rem]">
              <span style={{ color: 'var(--v4-signal)' }}>{total}</span> containers
            </Mono>
            <span
              className="inline-flex items-center gap-1.5 text-[0.75rem] font-mono"
              style={{ color: 'var(--v4-nominal)' }}
            >
              <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: 'var(--v4-nominal)', flexShrink: 0 }} aria-hidden />
              {running} running
            </span>
            {unhealthy > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-[0.75rem] font-mono"
                style={{ color: 'var(--v4-fault)' }}
              >
                <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: 'var(--v4-fault)', flexShrink: 0 }} aria-hidden />
                {unhealthy} unhealthy
              </span>
            )}
            {stopped > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-[0.75rem] font-mono"
                style={{ color: 'var(--v4-standby)' }}
              >
                <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: 'var(--v4-standby)', flexShrink: 0 }} aria-hidden />
                {stopped} stopped
              </span>
            )}
          </div>

          {/* ── Search input ──────────────────────────────────────────── */}
          <div className="relative mb-4">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--v4-trace)' }} />
            <input
              placeholder="Search containers…"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full rounded-[0.5rem] pl-7 pr-3 py-1.5 text-[0.75rem] outline-none min-h-[36px]"
              style={{
                background: 'var(--v4-raised)',
                color: 'var(--v4-signal)',
                border: 'none',
                fontFamily: "'Geist Mono', monospace",
              }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid rgba(88,166,255,0.4)')}
              onBlur={e => (e.currentTarget.style.outline = 'none')}
            />
          </div>

          {/* ── Search results (only when searching) ─────────────────── */}
          {searchActive && (
            <div className="flex flex-col mb-4">
              {searchResults.length === 0 ? (
                <p className="text-[0.75rem] py-2 px-2" style={{ color: 'var(--v4-trace)' }}>
                  No containers match "{search}"
                </p>
              ) : (
                searchResults.map((c, i) => (
                  <div key={c.name}>
                    {i > 0 && <Hairline />}
                    <ContainerRow container={c} onSelect={onSelectContainer} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Needs-attention list (always visible when not searching) ─ */}
          {!searchActive && (
            <>
              {hasAttention ? (
                <div className="flex flex-col mb-4">
                  <div
                    className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] mb-2 px-2"
                    style={{ color: 'var(--v4-fault)' }}
                  >
                    Needs attention
                  </div>
                  {attentionList.map((c, i) => (
                    <div key={c.name}>
                      {i > 0 && <Hairline />}
                      <ContainerRow container={c} onSelect={onSelectContainer} />
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="text-[0.75rem] px-2 mb-4"
                  style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}
                >
                  all containers running
                </p>
              )}

              {/* ── Collapsed stack groups ──────────────────────────────── */}
              <div className="flex flex-col gap-1">
                {sortedGroupKeys.map(groupKey => {
                  const groupContainers = groupMap[groupKey];
                  const isExpanded = expandedGroups.has(groupKey);
                  const groupRunning = groupContainers.filter(c => c.running).length;
                  const groupTotal   = groupContainers.length;
                  const groupHasFault = groupContainers.some(c => c.healthy === 'unhealthy' || !c.running);
                  const groupStatusColor = groupHasFault ? 'var(--v4-degraded)' : 'var(--v4-nominal)';
                  const groupLabel = groupRunning === groupTotal
                    ? 'all running'
                    : `${groupRunning}/${groupTotal} running`;

                  return (
                    <div key={groupKey} className="rounded-[0.5rem] overflow-hidden" style={{ background: 'var(--v4-well)' }}>
                      {/* Group header (always visible, tap to expand) */}
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => toggleGroup(groupKey)}
                        aria-expanded={isExpanded}
                      >
                        <ChevronRight
                          size={12}
                          className="shrink-0 transition-transform duration-150"
                          style={{
                            color: 'var(--v4-trace)',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                        />
                        <span
                          className="flex-1 text-[0.8125rem] font-medium truncate"
                          style={{ color: 'var(--v4-signal)', fontFamily: "'Geist Mono', monospace" }}
                        >
                          {groupKey}
                        </span>
                        <span
                          className="text-[0.6875rem] shrink-0 font-mono"
                          style={{ color: 'var(--v4-trace)' }}
                        >
                          {groupTotal}
                        </span>
                        <span
                          className="text-[0.6875rem] shrink-0 font-mono"
                          style={{ color: groupStatusColor }}
                        >
                          {groupLabel}
                        </span>
                      </button>

                      {/* Group rows (visible when expanded) */}
                      {isExpanded && (
                        <div className="flex flex-col" style={{ borderTop: '1px solid var(--v4-hairline)' }}>
                          {groupContainers.map((c, i) => (
                            <div key={c.name}>
                              {i > 0 && <Hairline />}
                              <ContainerRow container={c} onSelect={onSelectContainer} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Container row (tap-target only, no action buttons) ────────────────────────

interface ContainerRowProps {
  container: Container;
  onSelect: (c: Container) => void;
}

function ContainerRow({ container: c, onSelect }: ContainerRowProps) {
  const isProtected = PROTECTED_CONTAINERS.has(c.name);
  const stripeColor = c.healthy === 'unhealthy'
    ? 'var(--v4-fault)'
    : c.running
    ? 'var(--v4-nominal)'
    : 'var(--v4-standby)';

  return (
    <button
      className="w-full flex items-center gap-3 py-2.5 px-2 min-w-0 min-h-[44px] text-left v4-tile rounded-[0.375rem]"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        boxShadow: `inset 2px 0 0 ${stripeColor}`,
      }}
      onClick={() => onSelect(c)}
    >
      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Mono
            className="text-[0.8125rem] font-medium truncate min-w-0"
            style={{ color: 'var(--v4-signal)' }}
          >
            {c.name}
          </Mono>
          {isProtected && (
            <span title="Protected — cannot be stopped from dashboard" className="shrink-0 inline-flex">
              <Shield size={10} style={{ color: 'var(--v4-degraded)' }} />
            </span>
          )}
        </div>
        <Mono trace className="text-[0.6875rem] block truncate">{c.status}</Mono>
      </div>

      {/* Chevron cue */}
      <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--v4-trace)' }} />
    </button>
  );
}

// ── Container detail modal ─────────────────────────────────────────────────────

interface ContainerDetailModalProps {
  container: Container | null;
  open: boolean;
  onClose: () => void;
  loading: Record<string, boolean>;
  result: InlineResult | null;
  onRestart: (name: string) => void;
  onStop: (name: string) => void;
  onStart: (name: string) => void;
}

function ContainerDetailModal({ container: c, open, onClose, loading, result, onRestart, onStop, onStart }: ContainerDetailModalProps) {
  if (!c) return null;

  const isProtected = PROTECTED_CONTAINERS.has(c.name);
  const level = containerStatusLevel(c);
  const statusLabel = c.healthy === 'unhealthy'
    ? 'unhealthy'
    : c.running
    ? c.status?.toLowerCase().includes('restarting') ? 'restarting' : 'running'
    : 'stopped';

  const isRestartLoading = !!loading[`c-restart-${c.name}`];
  const isStopLoading    = !!loading[`c-stop-${c.name}`];
  const isStartLoading   = !!loading[`c-start-${c.name}`];
  const anyLoading       = isRestartLoading || isStopLoading || isStartLoading;

  return (
    <DetailModal
      open={open}
      onClose={onClose}
      title={c.name}
      statusLevel={level}
      statusLabel={statusLabel}
    >
      <div className="flex flex-col gap-5">
        {/* ── Info rows ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-0">
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="text-[0.75rem] shrink-0" style={{ color: 'var(--v4-readout)' }}>Status</span>
            <Mono dim className="text-[0.75rem] text-right break-all">{c.status || '—'}</Mono>
          </div>
          <Hairline />
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="text-[0.75rem] shrink-0" style={{ color: 'var(--v4-readout)' }}>Image</span>
            <Mono dim className="text-[0.6875rem] text-right break-all" style={{ maxWidth: '70%' }}>{c.image || '—'}</Mono>
          </div>
          {isProtected && (
            <>
              <Hairline />
              <div className="flex items-center gap-2 py-2">
                <Shield size={11} style={{ color: 'var(--v4-degraded)' }} />
                <span className="text-[0.75rem]" style={{ color: 'var(--v4-degraded)' }}>
                  Protected — stop/restart blocked at API level
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Action result ─────────────────────────────────────────── */}
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

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {/* Restart */}
          <button
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[44px] flex-1 justify-center disabled:opacity-40 active:-translate-y-px transition-transform"
            style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: anyLoading ? 'default' : 'pointer' }}
            disabled={anyLoading}
            onClick={() => onRestart(c.name)}
          >
            <RotateCcw size={13} className="shrink-0" />
            {isRestartLoading ? 'Restarting…' : 'Restart'}
          </button>

          {/* Stop / Start */}
          {c.running ? (
            <button
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[44px] flex-1 justify-center disabled:opacity-40 active:-translate-y-px transition-transform"
              style={{
                background: 'rgba(248,81,73,0.08)',
                color: 'var(--v4-fault)',
                border: '1px solid rgba(248,81,73,0.25)',
                cursor: anyLoading || isProtected ? 'default' : 'pointer',
              }}
              disabled={anyLoading || isProtected}
              onClick={() => onStop(c.name)}
              title={isProtected ? 'Protected container' : undefined}
            >
              <Square size={13} className="shrink-0" />
              {isStopLoading ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-[0.5rem] text-[0.8125rem] font-medium min-h-[44px] flex-1 justify-center disabled:opacity-40 active:-translate-y-px transition-transform"
              style={{
                background: 'rgba(63,185,80,0.08)',
                color: 'var(--v4-nominal)',
                border: '1px solid rgba(63,185,80,0.25)',
                cursor: anyLoading ? 'default' : 'pointer',
              }}
              disabled={anyLoading}
              onClick={() => onStart(c.name)}
            >
              <Play size={13} className="shrink-0" />
              {isStartLoading ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>

        {/* ── Log tail ──────────────────────────────────────────────── */}
        <div>
          <Hairline />
          <div className="mt-4">
            <div
              className="text-[0.6875rem] uppercase tracking-[0.06em] mb-2"
              style={{ color: 'var(--v4-readout)' }}
            >
              Logs
            </div>
            <ContainerLogTail containerName={c.name} lines={100} />
          </div>
        </div>
      </div>
    </DetailModal>
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
