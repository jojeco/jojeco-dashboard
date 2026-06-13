/**
 * ChaosPage (v3) — decomposed rebuild with v3 design system.
 *
 * PUBLIC ROUTE — no ProtectedRoute wrapper. Must render logged-out.
 * /api/chaos/services uses optionalAuth (no auth required for GET).
 * /api/chaos/agent/* uses auth header if present (getToken may return null).
 *
 * Design rules:
 *  - Surface elevation only — no white/hard borders
 *  - Status colors on dots/labels/numbers only
 *  - minWidth: 0 on all flex/grid items
 *  - Service grid single-column at 390px (minmax(200px,1fr))
 *  - ConfirmDialog before RUN and ABORT (v3 addition)
 *  - Page-level 30s interval for /api/chaos/services ONLY.
 *    Rationale: /chaos is public. SnapshotProvider does a 401→redirect which
 *    would break the unauthenticated view. Using a local interval here is the
 *    safe choice (matches old page cadence). See TODO-v3.md for full note.
 *  - Agent polling (10s) only when mode === 'real'; pauses otherwise.
 *
 * Mutations:
 *  - RUN module → POST /api/chaos/agent/run/:module (ConfirmDialog)
 *  - ABORT → POST /api/chaos/agent/abort (ConfirmDialog)
 *  Both send Authorization header from getToken() — may be null (guest);
 *  endpoint returns 401 which is caught and surfaced as agentOnline=false.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '@/services/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatsRow }    from './StatsRow';
import { ServiceCard } from './ServiceCard';
import { DepMap }      from './DepMap';
import { LogPanel }    from './LogPanel';
import { RealControls } from './RealControls';
import { SIM_SCRIPT, resetLid } from './simScript';
import { CATEGORY_ORDER, nowTs } from './constants';
import type { LabService, LogEntry, AgentStatus, PageMode } from './types';

// ── API base ──────────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/api$/, '') + '/api';

// ── SectionLabel (local copy — ChaosPage is public, don't import Controls/) ──
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type Toast = { id: number; msg: string; ok: boolean };
function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: '10px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500, background: t.ok ? 'var(--raised)' : 'rgba(239,68,68,0.15)', boxShadow: t.ok ? '0 0 0 1px rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.5)' : '0 0 0 1px rgba(239,68,68,0.3), 0 8px 32px rgba(0,0,0,0.5)', color: t.ok ? 'var(--t1)' : 'var(--err)', wordBreak: 'break-word' }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChaosPage() {
  // ── Service data (public poll) ──────────────────────────────────────────────
  const [services, setServices] = useState<LabService[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [mode, setMode]         = useState<PageMode>('live');

  // ── Sim state ───────────────────────────────────────────────────────────────
  const [simRunning,   setSimRunning]   = useState(false);
  const [simServices,  setSimServices]  = useState<LabService[]>([]);
  const [simLogs,      setSimLogs]      = useState<LogEntry[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Real mode state ─────────────────────────────────────────────────────────
  const [agentStatus,  setAgentStatus]  = useState<AgentStatus | null>(null);
  const [agentOnline,  setAgentOnline]  = useState(false);
  const [realRunning,  setRealRunning]  = useState(false);
  const [realLogs,     setRealLogs]     = useState<LogEntry[]>([]);
  const [selModule,    setSelModule]    = useState('redis-probe');
  const [target,       setTarget]       = useState('');
  const [dryRun,       setDryRun]       = useState(true);
  const realLogIdRef = useRef(1000);

  // ── Confirm dialog ──────────────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; description: string; fn: () => void;
  }>({ open: false, title: '', description: '', fn: () => {} });
  const openConfirm = useCallback((title: string, description: string, fn: () => void) => {
    setConfirmState({ open: true, title, description, fn });
  }, []);

  // ── Toasts ──────────────────────────────────────────────────────────────────
  const [toasts] = useState<Toast[]>([]);

  // ── Real log helper ─────────────────────────────────────────────────────────
  const addRealLog = useCallback((level: LogEntry['level'], msg: string) => {
    setRealLogs(prev => [...prev, { id: realLogIdRef.current++, ts: nowTs(), level, msg }]);
  }, []);

  // ── Service polling — 30s page-level interval (see module docstring) ────────
  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/chaos/services`);
      if (!r.ok) return;
      const data: LabService[] = await r.json();
      setServices(data);
      setLastPoll(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 30_000);
    return () => clearInterval(iv);
  }, [poll]);

  // ── Agent status polling (real mode only, 10s) ────────────────────────────
  const pollAgent = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/chaos/agent/status`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (r.ok) {
        const data: AgentStatus = await r.json();
        setAgentStatus(data);
        setAgentOnline(data.agent === 'ok');
      } else {
        setAgentOnline(false);
      }
    } catch {
      setAgentOnline(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'real') return;
    pollAgent();
    const iv = setInterval(pollAgent, 10_000);
    return () => clearInterval(iv);
  }, [mode, pollAgent]);

  // ── Sim controls ─────────────────────────────────────────────────────────────
  const resetSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSimRunning(false);
    setSimServices(services.map(s => ({ ...s })));
    setSimLogs([]);
    resetLid();
  }, [services]);

  const launchSim = useCallback(() => {
    if (simRunning) return;
    resetSim();
    setSimRunning(true);
    SIM_SCRIPT.forEach(step => {
      const t = setTimeout(() => {
        setSimLogs(prev => [...prev, step.log]);
        if (step.patch) {
          const { id, ...patch } = step.patch;
          setSimServices(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
        }
        if (step === SIM_SCRIPT[SIM_SCRIPT.length - 1]) setSimRunning(false);
      }, step.delay);
      timers.current.push(t);
    });
  }, [simRunning, resetSim]);

  const enterSim = useCallback(() => {
    setMode('sim');
    setSimServices(services.map(s => ({ ...s })));
    setSimLogs([]);
    resetLid();
  }, [services]);

  const exitSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMode('live');
    setSimRunning(false);
    setSimLogs([]);
  }, []);

  // ── Real mode controls ───────────────────────────────────────────────────────
  const enterReal = useCallback(() => {
    setMode('real');
    setRealLogs([]);
    realLogIdRef.current = 1000;
  }, []);

  const exitReal = useCallback(() => {
    setMode('live');
    setRealRunning(false);
    setRealLogs([]);
  }, []);

  const runModule = useCallback(async () => {
    if (realRunning || !selModule) return;
    setRealRunning(true);
    addRealLog('info', `Launching ${selModule}${target ? ` → ${target}` : ''}  [${dryRun ? 'dry-run' : 'LIVE'}]`);
    try {
      const body: Record<string, unknown> = { dry_run: dryRun };
      if (target.trim()) body.target = target.trim();
      const r = await fetch(`${API_BASE}/chaos/agent/run/${selModule}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        addRealLog('crit', `Error ${r.status}: ${data.detail ?? JSON.stringify(data)}`);
      } else {
        addRealLog('ok', `Module complete: ${data.module ?? selModule}`);
        if (data.findings) {
          const findings: string[] = Array.isArray(data.findings) ? data.findings : [JSON.stringify(data.findings)];
          if (findings.length === 0) addRealLog('info', 'No findings.');
          else findings.forEach((f: string) => addRealLog('warn', f));
        }
        if (data.open_ports !== undefined) {
          if (data.open_ports.length === 0) {
            addRealLog('info', `No sensitive ports open on ${data.target} (${data.count ?? 0} checked)`);
          } else {
            addRealLog('warn', `Open sensitive ports on ${data.target}:`);
            (data.open_ports as Array<{ port: number; service: string }>).forEach(p => {
              addRealLog('crit', `  :${p.port} — ${p.service}`);
            });
          }
        }
        if (data.stopped !== undefined) {
          addRealLog(data.dry_run ? 'info' : 'crit', `Container "${data.container}": ${data.stopped ? 'STOPPED' : 'stop skipped (dry-run)'}`);
          if (data.dependents?.length) addRealLog('warn', `Dependents affected: ${data.dependents.join(', ')}`);
        }
        if (data.dry_run) addRealLog('info', '[dry-run] No destructive actions taken');
        addRealLog('info', '─────────────────────────────────────────');
      }
    } catch (e) {
      addRealLog('crit', `Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRealRunning(false);
    }
  }, [realRunning, selModule, target, dryRun, addRealLog]);

  const abortAgent = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/chaos/agent/abort`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
      addRealLog('warn', 'Abort signal sent to agent');
      setRealRunning(false);
    } catch {
      addRealLog('crit', 'Failed to send abort');
    }
  }, [addRealLog]);

  // ── Confirm-wrapped actions ──────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    openConfirm(
      `Run ${selModule}`,
      dryRun
        ? `Run "${selModule}" in DRY-RUN mode (scan only, no destructive actions)?`
        : `Run "${selModule}" in LIVE mode — this may execute destructive actions. Confirm?`,
      runModule,
    );
  }, [openConfirm, selModule, dryRun, runModule]);

  const handleAbort = useCallback(() => {
    openConfirm(
      'Abort agent run',
      'Send abort signal to the chaos agent? The current module will be interrupted.',
      abortAgent,
    );
  }, [openConfirm, abortAgent]);

  // ── Display ───────────────────────────────────────────────────────────────────
  const displayServices = mode === 'sim' ? simServices : services;
  const logs = mode === 'sim' ? simLogs : realLogs;

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    svcs: displayServices.filter(s => s.category === cat),
  })).filter(g => g.svcs.length > 0);

  const modeLabel =
    mode === 'real'
      ? (realRunning ? '● REAL RUNNING' : '● REAL MODE')
      : mode === 'sim'
      ? (simRunning ? '● SIMULATION RUNNING' : '● SIMULATION IDLE')
      : '● LIVE';

  const modeChipStyle = (m: PageMode): React.CSSProperties => {
    if (m === 'real') return { background: 'rgba(239,68,68,0.12)', color: 'var(--err)', border: '1px solid rgba(239,68,68,0.3)' };
    if (m === 'sim')  return { background: 'rgba(234,179,8,0.12)',  color: 'var(--warn)', border: '1px solid rgba(234,179,8,0.3)' };
    return            { background: 'rgba(34,197,94,0.12)', color: 'var(--ok)', border: '1px solid rgba(34,197,94,0.3)' };
  };

  const chipBase: React.CSSProperties = {
    padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.06em', cursor: 'pointer', fontFamily: "'Geist Mono', monospace",
    border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t3)',
    transition: 'all 120ms',
  };

  return (
    <div style={{ fontFamily: "'Geist Mono', monospace", paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <ToastStack toasts={toasts} />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel="Confirm"
        onConfirm={confirmState.fn}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
        destructive={true}
      />

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em', fontFamily: "'Geist', system-ui, sans-serif", lineHeight: 1 }}>
              ChaosMonkey
            </h1>
            <span style={{ ...chipBase, ...modeChipStyle(mode), cursor: 'default' }}>
              {modeLabel}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)', fontFamily: "'Geist', system-ui, sans-serif" }}>
            {mode === 'live' && lastPoll ? <>Lab service health · polled {lastPoll.toLocaleTimeString()}</> : null}
            {mode === 'live' && !lastPoll ? 'Lab service health' : null}
            {mode === 'real' && agentOnline  ? 'Live chaos agent · connected' : null}
            {mode === 'real' && !agentOnline ? 'Live chaos agent · disconnected' : null}
            {mode === 'sim'  ? 'Simulated chaos demo' : null}
          </p>
        </div>

        {/* Mode buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {mode === 'live' && (
            <>
              <button onClick={poll}      style={{ ...chipBase, background: 'rgba(20,184,166,0.12)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>↺ REFRESH</button>
              <button onClick={enterSim}  style={{ ...chipBase, background: 'rgba(234,179,8,0.12)',  color: 'var(--warn)', border: '1px solid rgba(234,179,8,0.3)' }}>SIMULATE</button>
              <button onClick={enterReal} style={{ ...chipBase, background: 'rgba(239,68,68,0.12)', color: 'var(--err)', border: '1px solid rgba(239,68,68,0.3)' }}>REAL CHAOS</button>
            </>
          )}
          {mode === 'sim' && (
            <>
              <button onClick={resetSim}   style={chipBase}>RESET</button>
              <button onClick={launchSim}  disabled={simRunning} style={{ ...chipBase, ...(simRunning ? { opacity: 0.45, cursor: 'default' } : { background: 'rgba(234,179,8,0.12)', color: 'var(--warn)', border: '1px solid rgba(234,179,8,0.3)' }) }}>
                {simRunning ? 'RUNNING...' : 'LAUNCH SIM'}
              </button>
              <button onClick={exitSim}    style={chipBase}>EXIT SIM</button>
            </>
          )}
          {mode === 'real' && (
            <button onClick={exitReal} style={chipBase}>EXIT REAL</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Real mode controls */}
        {mode === 'real' && (
          <RealControls
            agentStatus={agentStatus}
            agentOnline={agentOnline}
            running={realRunning}
            module={selModule}
            target={target}
            dryRun={dryRun}
            onModuleChange={setSelModule}
            onTargetChange={setTarget}
            onDryRunChange={setDryRun}
            onRun={handleRun}
            onAbort={handleAbort}
          />
        )}

        {/* Stats */}
        {!loading && <StatsRow services={displayServices} />}

        {loading ? (
          <div style={{ color: 'var(--t3)', fontSize: 12 }}>
            Polling lab services<span style={{ opacity: 0.5 }}>...</span>
          </div>
        ) : (
          <>
            {/* Service grid by category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {grouped.map(({ cat, svcs }) => (
                <div key={cat}>
                  <SectionLabel>{cat}</SectionLabel>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))',
                      gap: 10,
                    }}
                  >
                    {svcs.map(s => (
                      <div key={s.id} style={{ minWidth: 0 }}>
                        <ServiceCard svc={s} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Dependency map */}
            <DepMap services={displayServices} />

            {/* Log panel */}
            {(mode === 'sim' || mode === 'real') && (
              <LogPanel mode={mode} logs={logs} running={mode === 'sim' ? simRunning : realRunning} />
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ fontSize: 10, color: 'var(--t3)', textAlign: 'center', paddingBottom: 8, fontFamily: "'Geist', system-ui, sans-serif", opacity: 0.7 }}>
          CHAOSMONKEY — LIVE: real lab data · SIMULATE: chaos demo · REAL: live agent
        </div>
      </div>
    </div>
  );
}
