/**
 * ControlsPage (v3) — decomposed rebuild with v3 design system.
 *
 * Design rules:
 *  - Surface elevation only (no white/hard borders) — var(--surface)/var(--raised) layering
 *  - Hairlines: 1px solid var(--line) [≤6% alpha] for structural dividers only
 *  - Section labels: 10px uppercase t3, 0.08em letterSpacing + hairline rule
 *  - Status color ONLY on status content (dots, labels, badges)
 *  - Destructive: var(--err) tint on bg+text; confirm dialog before firing
 *  - All grid/flex items: minWidth: 0 to prevent viewport overflow on 390px
 *  - Buttons: minHeight 40px thumb targets
 *  - No setInterval in this component — useSnapshot for serverStatus/automation;
 *    trigger status polling uses local interval only while jobs running
 *
 * Confirm dialogs required for:
 *  - Server shutdown (ALL)
 *  - Server restart (Server2/Proxmox only — warnRestart flag)
 *  - Claude stop
 *  - Failover activate
 *  - Failover deactivate
 *  - Container stop
 *  - Apply updates
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, Database, RefreshCw,
  GitBranch, Bot,
} from 'lucide-react';
import { api, getToken } from '@/services/api';
import { useSnapshot } from '@/hooks/useSnapshot';
import type { AutomationJob as SnapshotAutomJob } from '@/hooks/useSnapshot';

import { SectionLabel } from './SectionLabel';
import { ConfirmDialog } from './ConfirmDialog';
import { ToastStack } from './ToastStack';
import { ServerPowerCard } from './ServerPowerCard';
import { AutomationJobRow } from './AutomationJobRow';
import { TriggerCard } from './TriggerCard';
import { FailoverPanel } from './FailoverPanel';
import { ContainerControls } from './ContainerControls';
import { UpdatesPanel } from './UpdatesPanel';

import type { TriggerJob, AutomationJob, UpdateResult, FailoverStatus, Container, Toast } from './types';

// ─── Static data ─────────────────────────────────────────────────────────────

interface ServerDef {
  id: string;
  label: string;
  sub: string;
  canWake: boolean;
  warnRestart: boolean;
  hasClaude: boolean;
  claudeLocal?: boolean;
}

const SERVERS: ServerDef[] = [
  { id: 'ct100',   label: 'CT100 (You)', sub: 'LXC · CT100 · .13 · Main Claude', canWake: false, warnRestart: false, hasClaude: true,  claudeLocal: true  },
  { id: 'server1', label: 'Server 1',    sub: 'i7-4790 · Windows · .10',          canWake: true,  warnRestart: false, hasClaude: true                      },
  { id: 'server2', label: 'Server 2',    sub: 'Proxmox · i5-10505 · .11',         canWake: true,  warnRestart: true,  hasClaude: false                     },
  { id: 'server3', label: 'Server 3',    sub: 'Ubuntu · i7-8750H · .12',          canWake: true,  warnRestart: false, hasClaude: true                      },
  { id: 'macmini', label: 'Mac Mini',    sub: 'macOS · i5 · .30',                 canWake: true,  warnRestart: false, hasClaude: false                     },
  { id: 'jopc',    label: 'JoPc',        sub: 'Windows · RTX 3080 Ti · .20',      canWake: true,  warnRestart: false, hasClaude: false                     },
];

const TRIGGERS = [
  { id: 'health',         label: 'Health Check',  icon: ShieldCheck, desc: 'Check all service chains, restart any down containers' },
  { id: 'backup',         label: 'GDrive Backup', icon: Database,    desc: 'Dump databases and sync to Google Drive' },
  { id: 'snapshot',       label: 'Update Check',  icon: RefreshCw,   desc: 'Pull latest images, report critical updates' },
  { id: 'sync-context',   label: 'Sync Context',  icon: GitBranch,   desc: 'Push latest memory, stacks & context to GitHub' },
  { id: 'claude-server3', label: 'Claude → S3',   icon: Bot,         desc: 'Start Claude Code on Server 3 (fallback agent)' },
  { id: 'claude-server1', label: 'Claude → S1',   icon: Bot,         desc: 'Start Claude Code on Server 1 WSL2 (last resort)' },
] as const;

// ─── Helper: authFetch (uses api.ts token, handles 401 redirect) ─────────────

const BASE = (import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api') as string;

async function authPost(path: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; return { ok: false, data: {} }; }
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'Network error' } };
  }
}

async function authGet(path: string): Promise<{ ok: boolean; data: unknown }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; return { ok: false, data: null }; }
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ControlsPage() {
  // ── Snapshot data (serverStatus, automation) ────────────────────────────────
  const { data: snapData } = useSnapshot();
  const snapServerStatus = snapData?.serverStatus as Record<string, boolean> | null;
  const snapAutomation   = snapData?.automation as SnapshotAutomJob[] | null;

  // ── Local state ─────────────────────────────────────────────────────────────
  const [toasts,         setToasts]         = useState<Toast[]>([]);
  const [loading,        setLoading]         = useState<Record<string, boolean>>({});
  const [triggerJobs,    setTriggerJobs]     = useState<Record<string, TriggerJob>>({});
  const [containers,     setContainers]      = useState<Container[]>([]);
  const [updates,        setUpdates]         = useState<{ checked: number | null; results: UpdateResult[]; cached?: boolean } | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [applyJobId,     setApplyJobId]      = useState<string | null>(null);
  const [failover,       setFailover]        = useState<FailoverStatus | null>(null);
  const [failoverOutput, setFailoverOutput]  = useState<string | null>(null);
  const [now,            setNow]             = useState(Date.now());

  // ── Confirm dialog state ─────────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    fn: () => void;
  }>({ open: false, title: '', description: '', fn: () => {} });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevJobs  = useRef<Record<string, TriggerJob>>({});

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const setLoad = (key: string, val: boolean) =>
    setLoading(l => ({ ...l, [key]: val }));

  function withConfirm(title: string, description: string, fn: () => void, confirmLabel?: string) {
    setConfirmState({ open: true, title, description, fn, confirmLabel });
  }

  // ── Tick for elapsed timer (only active while jobs running) ──────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Trigger status polling (only while jobs running) ────────────────────────
  const fetchTriggerStatus = useCallback(async () => {
    const { ok, data } = await authGet('/controls/trigger-status');
    if (ok && data) {
      const jobs = data as Record<string, TriggerJob>;
      setTriggerJobs(jobs);
      if (applyJobId && jobs[applyJobId]) {
        const aj = jobs[applyJobId];
        if (aj.status !== 'running') {
          setApplyJobId(null);
          toast(aj.status === 'done' ? 'Updates applied successfully' : 'Update apply finished with errors', aj.status === 'done');
        }
      }
    }
  }, [applyJobId, toast]);

  useEffect(() => {
    const anyRunning = Object.values(triggerJobs).some(j => j.status === 'running') || !!applyJobId;
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchTriggerStatus, 3000);
    } else if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [triggerJobs, applyJobId, fetchTriggerStatus]);

  // ── Notify when trigger jobs finish ─────────────────────────────────────────
  useEffect(() => {
    Object.entries(triggerJobs).forEach(([action, job]) => {
      const prev = prevJobs.current[action];
      if (prev?.status === 'running' && job.status === 'done')   toast(`${action} completed`, true);
      if (prev?.status === 'running' && job.status === 'error')  toast(`${action} finished with errors`, false);
    });
    prevJobs.current = triggerJobs;
  }, [triggerJobs, toast]);

  // ── Mount: load containers + trigger status + failover ─────────────────────
  const loadContainers = useCallback(async () => {
    const { ok, data } = await authGet('/controls/containers');
    if (ok && Array.isArray(data)) setContainers(data as Container[]);
  }, []);

  const fetchFailoverStatus = useCallback(async () => {
    const { ok, data } = await authGet('/failover/status');
    if (ok && data) setFailover(data as FailoverStatus);
  }, []);

  useEffect(() => {
    loadContainers();
    fetchTriggerStatus();
    fetchFailoverStatus();
    const failoverPoll = setInterval(fetchFailoverStatus, 30000);
    return () => { clearInterval(failoverPoll); };
  }, [loadContainers, fetchTriggerStatus, fetchFailoverStatus]);

  // ── Server actions ───────────────────────────────────────────────────────────
  async function serverPost(path: string, loadKey: string) {
    setLoad(loadKey, true);
    const { ok, data } = await authPost(path);
    toast(ok ? String(data.message || 'Done') : String(data.error || 'Failed'), ok);
    setLoad(loadKey, false);
  }

  function handleRestart(srv: ServerDef) {
    const go = () => serverPost(`/controls/server/${srv.id}/restart`, `restart-${srv.id}`);
    if (srv.warnRestart) {
      withConfirm('Restart Proxmox Host', 'This will restart the entire Proxmox host and take CT 100 offline for ~60s.', go, 'Restart');
    } else {
      go();
    }
  }

  function handleShutdown(srv: ServerDef) {
    withConfirm(
      `Shutdown ${srv.label}`,
      `Are you sure you want to shut down ${srv.label}? This cannot be undone remotely.`,
      () => serverPost(`/controls/server/${srv.id}/shutdown`, `shutdown-${srv.id}`),
      'Shutdown',
    );
  }

  function handleWake(id: string) {
    serverPost(`/controls/server/${id}/wake`, `wake-${id}`);
  }

  function handleClaudeStop(id: string) {
    withConfirm(
      `Stop Claude on ${SERVERS.find(s => s.id === id)?.label ?? id}`,
      `Kill the Claude process? It can be restarted from this panel.`,
      () => {
        setLoad(`claude-${id}-stop`, true);
        authPost(`/controls/claude/${id}/stop`).then(({ ok, data }) => {
          toast(ok ? String(data.message || 'Done') : String(data.error || 'Failed'), ok);
          setLoad(`claude-${id}-stop`, false);
        });
      },
      'Stop Claude',
    );
  }

  function handleClaudeRestart(id: string) {
    setLoad(`claude-${id}-restart`, true);
    authPost(`/controls/claude/${id}/restart`).then(({ ok, data }) => {
      toast(ok ? String(data.message || 'Done') : String(data.error || 'Failed'), ok);
      setLoad(`claude-${id}-restart`, false);
    });
  }

  // ── Trigger actions ──────────────────────────────────────────────────────────
  async function fireTrigger(id: string) {
    setLoad(`trigger-${id}`, true);
    const { ok, data } = await authPost(`/controls/trigger/${id}`);
    if (ok) {
      setTriggerJobs(j => ({ ...j, [id]: { status: 'running', startedAt: Date.now(), finishedAt: null, output: null, error: null, canAbort: true } }));
    } else {
      toast(String(data.error || 'Failed to trigger'), false);
    }
    setLoad(`trigger-${id}`, false);
  }

  async function abortTrigger(id: string) {
    setLoad(`abort-${id}`, true);
    const { ok, data } = await authPost(`/controls/trigger/${id}/abort`);
    if (ok) {
      setTriggerJobs(j => ({ ...j, [id]: { ...j[id], status: 'aborted', finishedAt: Date.now(), output: 'Aborted by user', canAbort: false } }));
      toast('Job aborted', true);
    } else {
      toast(String(data.error || 'Failed to abort'), false);
    }
    setLoad(`abort-${id}`, false);
  }

  // ── Failover actions ─────────────────────────────────────────────────────────
  function handleActivateFailover() {
    withConfirm(
      'Activate Failover',
      'Activate failover? This will start lab services on Server 3 and may affect running workloads.',
      async () => {
        setLoad('fo-activate', true);
        setFailoverOutput(null);
        const { ok, data } = await authPost('/failover/activate');
        setFailoverOutput(String(data.output || ''));
        toast(ok ? String(data.message || 'Failover activated') : String(data.error || 'Activation failed'), ok);
        fetchFailoverStatus();
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
        setFailoverOutput(null);
        const { ok, data } = await authPost('/failover/deactivate');
        setFailoverOutput(String(data.output || ''));
        toast(ok ? String(data.message || 'Failover deactivated') : String(data.error || 'Deactivation failed'), ok);
        fetchFailoverStatus();
        setLoad('fo-deactivate', false);
      },
      'Deactivate',
    );
  }

  async function handleSyncNow() {
    setLoad('fo-sync', true);
    const { ok, data } = await authPost('/failover/sync-now');
    toast(ok ? String(data.message || 'Sync started') : 'Sync failed to start', ok);
    setLoad('fo-sync', false);
  }

  // ── Container actions ────────────────────────────────────────────────────────
  async function containerAction(name: string, action: 'restart' | 'stop' | 'start') {
    const key = `${action}-c-${name}`;
    setLoad(key, true);
    const { ok, data } = await authPost(`/controls/container/${name}/${action}`);
    toast(ok ? String(data.message || 'Done') : String(data.error || 'Failed'), ok);
    if (ok) await loadContainers();
    setLoad(key, false);
  }

  function handlePrune() {
    withConfirm(
      'Prune Docker',
      'Remove unused Docker data (stopped containers, dangling images, build cache) and trim the disk to free thin-pool space?',
      async () => {
        setLoad('prune', true);
        const { ok, data } = await authPost('/docker/prune');
        toast(ok ? String(data.message || 'Pruned') : String(data.error || 'Prune failed'), ok);
        if (ok) await loadContainers();
        setLoad('prune', false);
      },
      'Prune',
    );
  }

  function handleContainerStop(name: string) {
    withConfirm(
      `Stop ${name}`,
      `Stop container "${name}"? It can be started again from this panel.`,
      () => containerAction(name, 'stop'),
      'Stop',
    );
  }

  // ── Update actions ───────────────────────────────────────────────────────────
  async function checkUpdates(force = false) {
    setLoad('updates', true);
    const { ok, data } = await authGet(`/updates/available${force ? '?force=1' : ''}`);
    if (ok && data) {
      setUpdates(data as typeof updates);
      setSelectedUpdates(new Set());
    } else {
      toast('Failed to check for updates', false);
    }
    setLoad('updates', false);
  }

  async function applyUpdates() {
    const names = Array.from(selectedUpdates);
    if (names.length === 0) return;
    setLoad('applyUpdates', true);
    try {
      const data = await api.post<{ jobId?: string; error?: string }>('/updates/apply', { containers: names });
      if (data.jobId) {
        setApplyJobId(data.jobId);
        toast(`Updating ${names.length} container(s)…`, true);
      } else {
        toast(data.error || 'Failed to apply updates', false);
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Request failed', false);
    } finally {
      setLoad('applyUpdates', false);
    }
  }

  function handleApplyUpdates() {
    const names = Array.from(selectedUpdates);
    withConfirm(
      `Update ${names.length} container(s)`,
      `This will pull new images and restart: ${names.join(', ')}`,
      applyUpdates,
      `Apply ${names.length} update(s)`,
    );
  }

  // ── Derive server status ──────────────────────────────────────────────────────
  // snapServerStatus from snapshot (updated every 5-20s via shared provider)
  const serverStatusMap: Record<string, boolean> = (snapServerStatus as Record<string, boolean>) ?? {};

  // ── Derive automation from snapshot ─────────────────────────────────────────
  // Snapshot AutomationJob is a subset — map it to our local type
  const automationJobs: AutomationJob[] = (snapAutomation ?? []).map(j => ({
    ...j,
    healthy: j.status === 'ok',
    lastRunTs: j.lastRun ? new Date(j.lastRun).getTime() : null,
    lastLines: j.lastLines ?? [],
  }));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      {/* Toast stack */}
      <ToastStack toasts={toasts} />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.fn}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 'clamp(18px, 4vw, 22px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--t1)',
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          Controls
        </h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.02em' }}>
          Server power, container management, automation triggers, and failover.
        </p>
      </div>

      {/* ── Server Power ── */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Server Power</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}
        >
          {SERVERS.map(srv => (
            <div key={srv.id} style={{ minWidth: 0 }}>
              <ServerPowerCard
                srv={srv}
                online={serverStatusMap[srv.id]}
                statusKnown={srv.id in serverStatusMap}
                loading={loading}
                onRestart={handleRestart}
                onShutdown={handleShutdown}
                onWake={handleWake}
                onClaudeStop={handleClaudeStop}
                onClaudeRestart={handleClaudeRestart}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Automation Status ── */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Automation Status</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {automationJobs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t3)', padding: '14px 0' }}>
              Loading automation status…
            </div>
          ) : (
            automationJobs.map(job => {
              const trigId = job.id === 'backup' ? 'backup' : job.id;
              const isRunning = triggerJobs[trigId]?.status === 'running';
              return (
                <AutomationJobRow key={job.id} job={job} isRunning={isRunning} />
              );
            })
          )}
        </div>
      </section>

      {/* ── Manual Triggers ── */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Manual Triggers</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 10,
          }}
        >
          {TRIGGERS.map(trig => (
            <div key={trig.id} style={{ minWidth: 0 }}>
              <TriggerCard
                trig={trig}
                job={triggerJobs[trig.id]}
                loading={loading}
                now={now}
                onFire={fireTrigger}
                onAbort={abortTrigger}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Container Updates ── */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Container Updates</SectionLabel>
        <UpdatesPanel
          updates={updates}
          loading={loading}
          applyJobId={applyJobId}
          selectedUpdates={selectedUpdates}
          onCheck={checkUpdates}
          onSelectUpdate={(name, checked) => {
            setSelectedUpdates(prev => {
              const next = new Set(prev);
              checked ? next.add(name) : next.delete(name);
              return next;
            });
          }}
          onSelectAll={() => {
            setSelectedUpdates(new Set(updates?.results.filter(u => u.updateAvailable).map(u => u.name) ?? []));
          }}
          onApply={handleApplyUpdates}
        />
      </section>

      {/* ── S2 → S3 Failover ── */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>S2 → S3 Failover</SectionLabel>
        <FailoverPanel
          failover={failover}
          failoverOutput={failoverOutput}
          loading={loading}
          onActivate={handleActivateFailover}
          onDeactivate={handleDeactivateFailover}
          onSync={handleSyncNow}
          onRefresh={fetchFailoverStatus}
        />
      </section>

      {/* ── Container Controls ── */}
      <section>
        <SectionLabel>Container Controls</SectionLabel>
        <ContainerControls
          containers={containers}
          loading={loading}
          onRestart={name => containerAction(name, 'restart')}
          onStop={handleContainerStop}
          onStart={name => containerAction(name, 'start')}
          onRefresh={loadContainers}
          onPrune={handlePrune}
        />
      </section>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
