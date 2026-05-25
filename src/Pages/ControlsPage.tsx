import { useState, useEffect, useCallback, useRef } from 'react';
import { Power, RotateCcw, Wifi, RefreshCw, ShieldCheck, Database, Play, Square, CheckCircle, XCircle, Loader, Package, AlertTriangle, Clock, ArrowUpCircle, Bot, GitBranch, Activity, Zap, ZapOff, RotateCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api';

const SERVERS = [
  { id: 'ct100',   label: 'CT100 (You)',sub: 'LXC · CT100 · .13 · Main Claude', canWake: false, warnRestart: false, hasClaude: true,  claudeLocal: true },
  { id: 'server1', label: 'Server 1', sub: 'i7-4790 · Windows · .10',      canWake: true,  warnRestart: false, hasClaude: true  },
  { id: 'server2', label: 'Server 2', sub: 'Proxmox · i5-10505 · .11',     canWake: true,  warnRestart: true,  hasClaude: false },
  { id: 'server3', label: 'Server 3', sub: 'Ubuntu · i7-8750H · .12',      canWake: true,  warnRestart: false, hasClaude: true  },
  { id: 'macmini', label: 'Mac Mini', sub: 'macOS · i5 · .30',             canWake: true,  warnRestart: false, hasClaude: false },
  { id: 'jopc',    label: 'JoPc',     sub: 'Windows · RTX 3080 Ti · .20',  canWake: true,  warnRestart: false, hasClaude: false },
];

const TRIGGERS = [
  { id: 'health',        label: 'Health Check',    icon: ShieldCheck, desc: 'Check all service chains, restart any down containers' },
  { id: 'backup',        label: 'GDrive Backup',   icon: Database,    desc: 'Dump databases and sync to Google Drive' },
  { id: 'snapshot',      label: 'Update Check',    icon: RefreshCw,   desc: 'Pull latest images, report critical updates' },
  { id: 'sync-context',  label: 'Sync Context',    icon: GitBranch,   desc: 'Push latest memory, stacks & context to GitHub' },
  { id: 'claude-server3', label: 'Claude → S3',   icon: Bot,         desc: 'Start Claude Code on Server 3 (fallback agent)' },
  { id: 'claude-server1', label: 'Claude → S1',   icon: Bot,         desc: 'Start Claude Code on Server 1 WSL2 (last resort)' },
];

function useToken() {
  return localStorage.getItem('auth_token') || '';
}

async function authFetch(url: string, opts: RequestInit = {}, token: string) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  }
  return res;
}

function elapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function relativeTime(isoOrMs: string | number | null) {
  if (!isoOrMs) return 'never';
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (isNaN(ms)) return 'unknown';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

type Toast = { id: number; msg: string; ok: boolean };
type TriggerJob = { status: 'running' | 'done' | 'error' | 'aborted'; startedAt: number; finishedAt: number | null; output: string | null; error: string | null; canAbort?: boolean };
type AutomationJob = { id: string; label: string; schedule: string; status: string; healthy: boolean; lastRun: string | null; lastRunTs: number | null; lastLines: string[] };
type UpdateResult = { id: string; name: string; image: string; updateAvailable: boolean; canCheck: boolean; localDigest: string | null; remoteDigest: string | null };
type FailoverStatus = { s2_online: boolean; s3_online: boolean; failover_active: boolean; watchdog_status: string; last_sync: string | null };

export default function ControlsPage() {
  const token = useToken();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<any[]>([]);
  const [containerSearch, setContainerSearch] = useState('');
  const [confirm, setConfirm] = useState<{ action: string; label: string; fn: () => void } | null>(null);
  const [containerFilter, setContainerFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [serverStatus, setServerStatus] = useState<Record<string, boolean>>({});
  const [triggerJobs, setTriggerJobs] = useState<Record<string, TriggerJob>>({});
  const [automation, setAutomation] = useState<AutomationJob[]>([]);
  const [updates, setUpdates] = useState<{ checked: number | null; results: UpdateResult[]; cached?: boolean } | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [applyJobId, setApplyJobId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [failover, setFailover] = useState<FailoverStatus | null>(null);
  const [failoverOutput, setFailoverOutput] = useState<string | null>(null);

  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const setLoad = (key: string, val: boolean) => setLoading(l => ({ ...l, [key]: val }));

  async function apiPost(path: string, label: string) {
    setLoad(label, true);
    try {
      const r = await authFetch(`${API}${path}`, { method: 'POST' }, token);
      const data = await r.json();
      if (r.ok) toast(data.message || 'Done', true);
      else toast(data.error || 'Failed', false);
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad(label, false);
    }
  }

  async function fireTrigger(action: string) {
    setLoad(`trigger-${action}`, true);
    try {
      const r = await authFetch(`${API}/controls/trigger/${action}`, { method: 'POST' }, token);
      const data = await r.json();
      if (r.ok) {
        setTriggerJobs(j => ({ ...j, [action]: { status: 'running', startedAt: Date.now(), finishedAt: null, output: null, error: null, canAbort: true } }));
      } else {
        toast(data.error || 'Failed to trigger', false);
      }
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad(`trigger-${action}`, false);
    }
  }

  async function abortTrigger(action: string) {
    setLoad(`abort-${action}`, true);
    try {
      const r = await authFetch(`${API}/controls/trigger/${action}/abort`, { method: 'POST' }, token);
      const data = await r.json();
      if (r.ok) {
        setTriggerJobs(j => ({ ...j, [action]: { ...j[action], status: 'aborted', finishedAt: Date.now(), output: 'Aborted by user', canAbort: false } }));
        toast('Job aborted', true);
      } else {
        toast(data.error || 'Failed to abort', false);
      }
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad(`abort-${action}`, false);
    }
  }

  async function claudeControl(machine: string, action: 'stop' | 'restart') {
    setLoad(`claude-${machine}-${action}`, true);
    try {
      const r = await authFetch(`${API}/controls/claude/${machine}/${action}`, { method: 'POST' }, token);
      const data = await r.json();
      if (r.ok) toast(data.message || 'Done', true);
      else toast(data.error || 'Failed', false);
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad(`claude-${machine}-${action}`, false);
    }
  }

  async function fetchTriggerStatus() {
    try {
      const r = await authFetch(`${API}/controls/trigger-status`, {}, token);
      if (r.ok) {
        const jobs = await r.json();
        setTriggerJobs(jobs);
        // Also check for apply job
        if (applyJobId && jobs[applyJobId]) {
          const applyJob = jobs[applyJobId];
          if (applyJob.status !== 'running') {
            setApplyJobId(null);
            if (applyJob.status === 'done') toast('Updates applied successfully', true);
            else toast('Update apply finished with errors', false);
          }
        }
      }
    } catch {}
  }

  async function fetchServerStatus() {
    try {
      const r = await authFetch(`${API}/controls/server-status`, {}, token);
      if (r.ok) setServerStatus(await r.json());
    } catch {}
  }

  async function fetchAutomation() {
    try {
      const r = await authFetch(`${API}/automation/status`, {}, token);
      if (r.ok) setAutomation(await r.json());
    } catch {}
  }

  async function fetchFailoverStatus() {
    try {
      const r = await authFetch(`${API}/failover/status`, {}, token);
      if (r.ok) setFailover(await r.json());
    } catch {}
  }

  async function activateFailover() {
    setLoad('fo-activate', true);
    setFailoverOutput(null);
    try {
      const r = await authFetch(`${API}/failover/activate`, { method: 'POST' }, token);
      const data = await r.json();
      setFailoverOutput(data.output || '');
      if (data.success) toast('Failover activated', true);
      else toast(data.error || 'Activation failed', false);
      fetchFailoverStatus();
    } catch { toast('Request failed', false); }
    finally { setLoad('fo-activate', false); }
  }

  async function deactivateFailover() {
    setLoad('fo-deactivate', true);
    setFailoverOutput(null);
    try {
      const r = await authFetch(`${API}/failover/deactivate`, { method: 'POST' }, token);
      const data = await r.json();
      setFailoverOutput(data.output || '');
      if (data.success) toast('Failover deactivated', true);
      else toast(data.error || 'Deactivation failed', false);
      fetchFailoverStatus();
    } catch { toast('Request failed', false); }
    finally { setLoad('fo-deactivate', false); }
  }

  async function syncNow() {
    setLoad('fo-sync', true);
    try {
      const r = await authFetch(`${API}/failover/sync-now`, { method: 'POST' }, token);
      const data = await r.json();
      if (data.success) toast(data.message || 'Sync started', true);
      else toast('Sync failed to start', false);
    } catch { toast('Request failed', false); }
    finally { setLoad('fo-sync', false); }
  }

  async function fetchUpdates(force = false) {
    setLoad('updates', true);
    try {
      const r = await authFetch(`${API}/updates/available${force ? '?force=1' : ''}`, {}, token);
      if (r.ok) {
        const data = await r.json();
        setUpdates(data);
        setSelectedUpdates(new Set());
      }
    } catch {
      toast('Failed to check for updates', false);
    } finally {
      setLoad('updates', false);
    }
  }

  async function applyUpdates() {
    const names = Array.from(selectedUpdates);
    if (names.length === 0) return;
    setLoad('applyUpdates', true);
    try {
      const r = await authFetch(`${API}/updates/apply`, { method: 'POST', body: JSON.stringify({ containers: names }) }, token);
      const data = await r.json();
      if (r.ok) {
        setApplyJobId(data.jobId);
        toast(`Updating ${names.length} container(s)…`, true);
      } else {
        toast(data.error || 'Failed to apply updates', false);
      }
    } catch {
      toast('Request failed', false);
    } finally {
      setLoad('applyUpdates', false);
    }
  }

  function withConfirm(action: string, label: string, fn: () => void) {
    setConfirm({ action, label, fn });
  }

  async function loadContainers() {
    try {
      const r = await authFetch(`${API}/controls/containers`, {}, token);
      if (r.ok) setContainers(await r.json());
    } catch {}
  }

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll trigger status while any job is running
  useEffect(() => {
    const anyRunning = Object.values(triggerJobs).some(j => j.status === 'running') || applyJobId;
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchTriggerStatus, 3000);
    } else if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [triggerJobs, applyJobId]);

  // Notify when jobs finish
  const prevJobs = useRef<Record<string, TriggerJob>>({});
  useEffect(() => {
    Object.entries(triggerJobs).forEach(([action, job]) => {
      const prev = prevJobs.current[action];
      if (prev?.status === 'running' && job.status === 'done') {
        toast(`${action} completed`, true);
        if (action === 'backup') fetchAutomation(); // refresh backup status after manual run
      }
      if (prev?.status === 'running' && job.status === 'error') toast(`${action} finished with errors`, false);
    });
    prevJobs.current = triggerJobs;
  }, [triggerJobs]);

  useEffect(() => {
    loadContainers();
    fetchServerStatus();
    fetchTriggerStatus();
    fetchAutomation();
    fetchFailoverStatus();
    const serverPoll = setInterval(fetchServerStatus, 30000);
    const automationPoll = setInterval(fetchAutomation, 60000);
    const failoverPoll = setInterval(fetchFailoverStatus, 30000);
    return () => { clearInterval(serverPoll); clearInterval(automationPoll); clearInterval(failoverPoll); };
  }, []);

  const filteredContainers = containers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(containerSearch.toLowerCase());
    const matchFilter = containerFilter === 'all' ? true : containerFilter === 'running' ? c.running : !c.running;
    return matchSearch && matchFilter;
  });

  const updatesAvailable = updates?.results.filter(u => u.updateAvailable) ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, letterSpacing: '-0.02em' }}>Controls</h1>
      <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 28 }}>Server power, container management, automation status, and updates.</p>

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: t.ok ? 'var(--surface)' : 'var(--err-dim)',
            border: `1px solid ${t.ok ? 'var(--accent-border)' : 'rgba(239,68,68,0.30)'}`,
            color: t.ok ? 'var(--t1)' : 'var(--err)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: 320,
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="j-panel" style={{ padding: 24, maxWidth: 360, width: '90%' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Confirm: {confirm.action}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>{confirm.label}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="j-chip" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="j-chip" style={{ background: 'var(--err)', color: '#fff', border: 'none' }}
                onClick={() => { confirm.fn(); setConfirm(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Server Power Controls */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">Server Power</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {SERVERS.map(srv => {
            const online = serverStatus[srv.id];
            const statusKnown = srv.id in serverStatus;
            return (
              <div key={srv.id} className="j-panel" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  {statusKnown && (
                    <div className={`j-dot ${online ? 'j-dot-ok' : 'j-dot-err'}`} style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{srv.label}</span>
                  {statusKnown && (
                    <span style={{ fontSize: 10, color: online ? 'var(--ok)' : 'var(--err)', marginLeft: 'auto' }}>
                      {online ? 'online' : 'offline'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.4 }}>{srv.sub}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {!srv.claudeLocal && (<>
                  <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                    disabled={loading[`restart-${srv.id}`]}
                    onClick={() => {
                      const go = () => apiPost(`/controls/server/${srv.id}/restart`, `restart-${srv.id}`);
                      srv.warnRestart
                        ? withConfirm('Restart Proxmox host', 'This will restart the entire Proxmox host and take CT 100 offline for ~60s.', go)
                        : go();
                    }}>
                    <RotateCcw size={13} /> {loading[`restart-${srv.id}`] ? '...' : 'Restart'}
                  </button>
                  <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--err)' }}
                    disabled={loading[`shutdown-${srv.id}`]}
                    onClick={() => withConfirm(`Shutdown ${srv.label}`, `Are you sure you want to shut down ${srv.label}?`,
                      () => apiPost(`/controls/server/${srv.id}/shutdown`, `shutdown-${srv.id}`))}>
                    <Power size={13} /> {loading[`shutdown-${srv.id}`] ? '...' : 'Shutdown'}
                  </button>
                  </>)}
                  {srv.canWake && (
                    <button className="j-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--accent)' }}
                      disabled={loading[`wake-${srv.id}`]}
                      onClick={() => apiPost(`/controls/server/${srv.id}/wake`, `wake-${srv.id}`)}>
                      <Wifi size={13} /> {loading[`wake-${srv.id}`] ? '...' : 'Wake'}
                    </button>
                  )}
                  {srv.hasClaude && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button className="j-chip" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 11 }}
                        disabled={loading[`claude-${srv.id}-stop`]}
                        onClick={() => withConfirm(`Stop Claude on ${srv.label}`, `Kill the Claude process on ${srv.label}?`, () => claudeControl(srv.id, 'stop'))}>
                        <Square size={11} /> {loading[`claude-${srv.id}-stop`] ? '...' : 'Stop Claude'}
                      </button>
                      <button className="j-chip" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 11, color: 'var(--ok)' }}
                        disabled={loading[`claude-${srv.id}-restart`]}
                        onClick={() => claudeControl(srv.id, 'restart')}>
                        <Bot size={11} /> {loading[`claude-${srv.id}-restart`] ? '...' : 'Restart Claude'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Automation Status */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">Automation Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {automation.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--t3)', padding: 16 }}>Loading automation status…</div>
          )}
          {automation.map(job => {
            const isRunning = triggerJobs[job.id === 'backup' ? 'backup' : job.id]?.status === 'running';
            const StatusIcon = job.healthy ? CheckCircle : job.status === 'unknown' ? AlertTriangle : job.status === 'stale' ? Clock : XCircle;
            const statusColor = job.healthy ? 'var(--ok)' : job.status === 'unknown' ? 'var(--t3)' : 'var(--err)';
            const statusLabel = isRunning ? 'running' : job.status === 'ok' ? 'healthy' : job.status === 'stale' ? 'stale' : job.status === 'error' ? 'error' : 'unknown';
            return (
              <div key={job.id} className="j-panel" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {isRunning
                    ? <Loader size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    : <StatusIcon size={14} style={{ color: statusColor, flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{job.label}</span>
                  <span style={{ fontSize: 11, color: statusColor, fontWeight: 600, marginLeft: 'auto', background: `${statusColor}18`, borderRadius: 4, padding: '2px 7px' }}>
                    {isRunning ? 'running' : statusLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--t3)', marginBottom: job.lastLines.length ? 8 : 0 }}>
                  <span><span style={{ color: 'var(--t2)' }}>Schedule:</span> {job.schedule}</span>
                  <span><span style={{ color: 'var(--t2)' }}>Last run:</span> {relativeTime(job.lastRunTs)}</span>
                  {job.lastRun && <span style={{ color: 'var(--t3)' }}>{new Date(job.lastRun).toLocaleString()}</span>}
                </div>
                {job.lastLines.length > 0 && (
                  <pre style={{ margin: 0, fontSize: 10, color: 'var(--t3)', fontFamily: "'Geist Mono', monospace", background: 'var(--bg)', borderRadius: 4, padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}>
                    {job.lastLines.join('\n')}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Manual Triggers */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">Manual Triggers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {TRIGGERS.map(trig => {
            const Icon = trig.icon;
            const job = triggerJobs[trig.id];
            const isRunning = job?.status === 'running';
            const isDone = job?.status === 'done';
            const isError = job?.status === 'error';
            return (
              <div key={trig.id} className="j-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{trig.label}</span>
                  {isRunning && <Loader size={12} style={{ color: 'var(--accent)', marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
                  {isDone && <CheckCircle size={12} style={{ color: 'var(--ok)', marginLeft: 'auto' }} />}
                  {isError && <XCircle size={12} style={{ color: 'var(--err)', marginLeft: 'auto' }} />}
                  {job?.status === 'aborted' && <XCircle size={12} style={{ color: 'var(--warn, #f59e0b)', marginLeft: 'auto' }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>{trig.desc}</div>

                {job && (
                  <div style={{
                    background: 'var(--bg)', borderRadius: 6, padding: '8px 10px', fontSize: 11,
                    border: `1px solid ${isError ? 'rgba(239,68,68,0.2)' : isDone ? 'rgba(34,197,94,0.2)' : 'var(--line)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: job.output ? 6 : 0 }}>
                      <span style={{ color: isError ? 'var(--err)' : isDone ? 'var(--ok)' : 'var(--accent)', fontWeight: 600 }}>
                        {isRunning ? `Running… ${elapsed(now - job.startedAt)}` : isDone ? `Done in ${elapsed((job.finishedAt ?? now) - job.startedAt)}` : `Error after ${elapsed((job.finishedAt ?? now) - job.startedAt)}`}
                      </span>
                    </div>
                    {job.output && (
                      <pre style={{ margin: 0, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 80, overflow: 'hidden', fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>
                        {job.output}
                      </pre>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button className="j-chip" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}
                    disabled={loading[`trigger-${trig.id}`] || isRunning}
                    onClick={() => fireTrigger(trig.id)}>
                    <Play size={12} /> {isRunning ? 'Running…' : 'Run now'}
                  </button>
                  {isRunning && (
                    <button className="j-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: 'var(--err)' }}
                      disabled={loading[`abort-${trig.id}`]}
                      onClick={() => abortTrigger(trig.id)}>
                      <Square size={12} /> Abort
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Update Checker */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="j-section-label" style={{ marginBottom: 0 }}>Container Updates</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {updates?.checked && (
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                {updates.cached ? 'cached · ' : ''}checked {relativeTime(updates.checked)}
              </span>
            )}
            {!updates && (
              <button className="j-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={loading['updates']}
                onClick={() => fetchUpdates(false)}>
                {loading['updates'] ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Package size={11} />}
                {loading['updates'] ? 'Checking…' : 'Check for updates'}
              </button>
            )}
            {updates && (
              <button className="j-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={loading['updates']}
                onClick={() => fetchUpdates(true)}>
                {loading['updates'] ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
                {loading['updates'] ? 'Checking…' : 'Re-check'}
              </button>
            )}
          </div>
        </div>

        {loading['updates'] && !updates && (
          <div className="j-panel" style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Checking {containers.length} containers against registry… this takes a minute.</div>
          </div>
        )}

        {!updates && !loading['updates'] && (
          <div className="j-panel" style={{ padding: 16, fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
            Click "Check for updates" to compare running containers against their registries.
          </div>
        )}

        {updates && (
          <>
            {updatesAvailable.length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>
                  {updatesAvailable.length} update{updatesAvailable.length !== 1 ? 's' : ''} available
                </span>
                {selectedUpdates.size > 0 && (
                  <>
                    <button className="j-chip" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => setSelectedUpdates(new Set(updatesAvailable.map(u => u.name)))}>
                      Select all
                    </button>
                    <button className="j-chip" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent)', fontSize: 11 }}
                      disabled={loading['applyUpdates'] || !!applyJobId}
                      onClick={() => withConfirm(
                        `Update ${selectedUpdates.size} container(s)`,
                        `This will pull new images and restart: ${Array.from(selectedUpdates).join(', ')}`,
                        applyUpdates
                      )}>
                      <ArrowUpCircle size={11} />
                      {applyJobId ? 'Applying…' : `Apply (${selectedUpdates.size})`}
                    </button>
                  </>
                )}
              </div>
            )}

            {updatesAvailable.length === 0 && updates.results.filter(u => u.canCheck).length > 0 && (
              <div className="j-panel" style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle size={14} /> All containers are up to date
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {updates.results.filter(u => u.updateAvailable || u.canCheck).map(u => (
                <div key={u.name} className="j-panel" style={{
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  borderColor: u.updateAvailable ? 'rgba(99,179,237,0.25)' : undefined,
                }}>
                  {u.updateAvailable && (
                    <input type="checkbox" checked={selectedUpdates.has(u.name)}
                      onChange={e => {
                        const next = new Set(selectedUpdates);
                        if (e.target.checked) next.add(u.name); else next.delete(u.name);
                        setSelectedUpdates(next);
                      }}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                  )}
                  {!u.updateAvailable && <div style={{ width: 14, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', fontFamily: "'Geist Mono', monospace" }}>{u.name}</span>
                      {u.updateAvailable && (
                        <span style={{ fontSize: 10, background: 'rgba(99,179,237,0.15)', color: 'var(--accent)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>UPDATE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Geist Mono', monospace" }}>
                      {u.image} {u.localDigest && <span>· local: {u.localDigest}…</span>} {u.updateAvailable && u.remoteDigest && <span style={{ color: 'var(--accent)' }}>→ {u.remoteDigest}…</span>}
                    </div>
                  </div>
                </div>
              ))}
              {updates.results.filter(u => !u.canCheck).length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t3)', padding: '6px 2px' }}>
                  {updates.results.filter(u => !u.canCheck).length} container(s) could not be checked (private/unknown registry)
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* S2 → S3 Failover */}
      <section style={{ marginBottom: 32 }}>
        <div className="j-section-label">S2 → S3 Failover</div>
        <div className="j-panel" style={{ padding: '16px 18px' }}>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            {/* S2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className={`j-dot ${failover === null ? '' : failover.s2_online ? 'j-dot-ok' : 'j-dot-err'}`} />
              <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 500 }}>S2</span>
              <span style={{ fontSize: 11, color: failover === null ? 'var(--t3)' : failover.s2_online ? 'var(--ok)' : 'var(--err)' }}>
                {failover === null ? '…' : failover.s2_online ? 'online' : 'offline'}
              </span>
            </div>
            <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>
            {/* S3 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className={`j-dot ${failover === null ? '' : failover.s3_online ? 'j-dot-ok' : 'j-dot-err'}`} />
              <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 500 }}>S3</span>
              <span style={{ fontSize: 11, color: failover === null ? 'var(--t3)' : failover.s3_online ? 'var(--ok)' : 'var(--err)' }}>
                {failover === null ? '…' : failover.s3_online ? 'online' : 'offline'}
              </span>
            </div>
            {/* Watchdog */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Activity size={12} style={{ color: failover?.watchdog_status === 'active' ? 'var(--ok)' : 'var(--t3)' }} />
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Watchdog:</span>
              <span style={{
                fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '1px 6px',
                background: failover?.watchdog_status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(100,100,100,0.15)',
                color: failover?.watchdog_status === 'active' ? 'var(--ok)' : 'var(--t3)',
              }}>
                {failover?.watchdog_status ?? '…'}
              </span>
            </div>
            {/* Failover Active badge */}
            {failover?.failover_active && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.45)',
                borderRadius: 6, padding: '3px 10px',
              }}>
                <Zap size={12} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.02em' }}>FAILOVER ACTIVE</span>
              </div>
            )}
            {failover !== null && !failover.failover_active && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 6, padding: '3px 10px',
              }}>
                <ZapOff size={12} style={{ color: 'var(--ok)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)' }}>Normal</span>
              </div>
            )}
          </div>

          {/* Last sync */}
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
            <span style={{ color: 'var(--t2)' }}>Last volume sync:</span>{' '}
            {failover?.last_sync ?? 'No sync log found'}
          </div>

          {/* Output box */}
          {failoverOutput !== null && (
            <pre style={{
              margin: '0 0 14px', fontSize: 10, color: 'var(--t2)',
              fontFamily: "'Geist Mono', monospace", background: 'var(--bg)',
              borderRadius: 4, padding: '8px 10px', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
              border: '1px solid var(--line)',
            }}>
              {failoverOutput || '(no output)'}
            </pre>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="j-chip"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--err)',
              }}
              disabled={loading['fo-activate']}
              onClick={() => withConfirm(
                'Activate Failover',
                'Activate failover? This will start lab services on Server 3.',
                activateFailover
              )}
            >
              {loading['fo-activate'] ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
              {loading['fo-activate'] ? 'Activating…' : 'Activate Failover'}
            </button>

            {failover?.failover_active && (
              <button
                className="j-chip"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ok)' }}
                disabled={loading['fo-deactivate']}
                onClick={() => withConfirm(
                  'Deactivate Failover',
                  'Stop failover services on Server 3 and return to normal operation?',
                  deactivateFailover
                )}
              >
                {loading['fo-deactivate'] ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ZapOff size={12} />}
                {loading['fo-deactivate'] ? 'Deactivating…' : 'Deactivate Failover'}
              </button>
            )}

            <button
              className="j-chip"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              disabled={loading['fo-sync']}
              onClick={syncNow}
            >
              {loading['fo-sync'] ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCw size={12} />}
              {loading['fo-sync'] ? 'Starting…' : 'Sync Volumes Now'}
            </button>

            <button
              className="j-chip"
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
              onClick={fetchFailoverStatus}
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Container Controls */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <span className="j-panel-title">Containers ({filteredContainers.length})</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={containerFilter} onChange={e => setContainerFilter(e.target.value as any)}
              style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--t2)', borderRadius: 6, padding: '4px 8px' }}>
              <option value="all">All</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
            </select>
            <input placeholder="Search containers…" value={containerSearch} onChange={e => setContainerSearch(e.target.value)}
              style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--t1)', borderRadius: 6, padding: '4px 10px', width: 160 }} />
            <button className="j-chip" onClick={loadContainers} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredContainers.map(c => (
            <div key={c.name} className="j-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={`j-dot ${c.healthy === 'unhealthy' ? 'j-dot-err' : c.running ? 'j-dot-ok' : 'j-dot-warn'}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', fontFamily: "'Geist Mono', monospace" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  disabled={loading[`restart-c-${c.name}`]}
                  onClick={() => apiPost(`/controls/container/${c.name}/restart`, `restart-c-${c.name}`)}>
                  <RotateCcw size={10} /> Restart
                </button>
                {c.running ? (
                  <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--err)', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={loading[`stop-c-${c.name}`]}
                    onClick={() => withConfirm(`Stop ${c.name}`, `Stop container "${c.name}"?`,
                      () => apiPost(`/controls/container/${c.name}/stop`, `stop-c-${c.name}`))}>
                    <Square size={10} /> Stop
                  </button>
                ) : (
                  <button className="j-chip" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={loading[`start-c-${c.name}`]}
                    onClick={() => apiPost(`/controls/container/${c.name}/start`, `start-c-${c.name}`)}>
                    <Play size={10} /> Start
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
