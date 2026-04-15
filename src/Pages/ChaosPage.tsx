import { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type SvcStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
type PageMode  = 'live' | 'sim' | 'real';

interface LabService {
  id: string;
  name: string;
  category: string;
  url: string;
  dependsOn: string[];
  online: boolean;
  latency: number | null;
  status: SvcStatus;
}

interface LogEntry {
  id: number;
  ts: string;
  level: 'info' | 'warn' | 'crit' | 'ok';
  msg: string;
}

interface AgentStatus {
  agent: string;
  modules: string[];
  abort: boolean;
}

// ─── Simulation script (demo mode) ───────────────────────────────────────────

let _lid = 1;
const ml = (level: LogEntry['level'], msg: string): LogEntry => ({ id: _lid++, ts: new Date().toISOString().split('T')[1].slice(0,12), level, msg });

interface SimStep { delay: number; log: LogEntry; patch?: { id: string; status: SvcStatus; latency?: number | null } }

const SIM_SCRIPT: SimStep[] = [
  { delay: 0,     log: ml('info', 'Chaos engine v2.4.1 initialising...') },
  { delay: 700,   log: ml('info', 'Scanning 18 lab services...') },
  { delay: 1400,  log: ml('warn', 'Nextcloud Redis :6379 — no AUTH detected') },
  { delay: 2100,  log: ml('warn', 'LiteLLM DB :5432 — pg_hba.conf allows local trust') },
  { delay: 2900,  log: ml('crit', 'Attack vector confirmed: unauthenticated Redis FLUSHALL') },
  { delay: 3700,  log: ml('crit', 'Sending FLUSHALL to :6379...') },
  { delay: 4300,  log: ml('crit', 'NC Redis wiped — sessions + file locks cleared'), patch: { id: 'nextcloud-redis', status: 'down', latency: null } },
  { delay: 5300,  log: ml('warn', 'Nextcloud: session store unreachable') },
  { delay: 6100,  log: ml('crit', 'Nextcloud: marking DEGRADED (DB fallback saturating)'), patch: { id: 'nextcloud', status: 'degraded', latency: 3800 } },
  { delay: 7200,  log: ml('warn', 'Auth Redis :6380 — also unauthenticated') },
  { delay: 8000,  log: ml('crit', 'Flushing auth session store...'), patch: { id: 'authelia-redis', status: 'down', latency: null } },
  { delay: 8800,  log: ml('crit', 'Authelia: all sessions invalidated — users logged out'), patch: { id: 'authelia', status: 'down', latency: null } },
  { delay: 10000, log: ml('info', '─────────────────────────────────────────') },
  { delay: 10100, log: ml('crit', 'RUN COMPLETE  |  4 services impacted') },
  { delay: 10200, log: ml('info', 'Chain: NC Redis → Nextcloud + Auth Redis → Authelia') },
  { delay: 10300, log: ml('ok',   'Fix: requirepass in redis.conf on both Redis instances') },
];

// ─── Colours ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<SvcStatus | 'unknown', string> = {
  healthy:  '#00ff88',
  degraded: '#f0a500',
  down:     '#ff3355',
  unknown:  '#484f58',
};

const LOG_COLOR: Record<LogEntry['level'], string> = {
  info: '#8b949e', warn: '#f0a500', crit: '#ff3355', ok: '#00ff88',
};

const CATEGORY_ORDER = ['Core', 'Media', 'Storage', 'AI', 'Monitoring', 'Comms'];

const MODULE_DESC: Record<string, string> = {
  'redis-probe': 'Scan Redis instances for auth vulnerabilities',
  'port-scan':   'Scan host/CIDR for sensitive exposed ports',
  'dep-kill':    'Stop a Docker container to test dependency resilience',
};

function fmt(n: number | null) {
  if (n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

function nowTs() { return new Date().toISOString().split('T')[1].slice(0,12); }

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: LabService }) {
  const color = STATUS_COLOR[svc.status];
  const bad   = svc.status !== 'healthy';
  return (
    <div style={{
      background: '#0d1117',
      border: `1px solid ${bad ? color + '55' : '#21262d'}`,
      borderRadius: 6,
      padding: '12px 14px',
      transition: 'border-color 0.4s ease',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3' }}>{svc.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: color,
            boxShadow: bad ? `0 0 6px ${color}` : 'none',
          }} />
          <span style={{ fontSize: 9, color, letterSpacing: '0.06em', fontWeight: 700 }}>
            {svc.status.toUpperCase()}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div>
          <div style={{ fontSize: 9, color: '#484f58' }}>LATENCY</div>
          <div style={{ fontSize: 11, color: svc.latency && svc.latency > 1000 ? '#f0a500' : '#c9d1d9' }}>{fmt(svc.latency)}</div>
        </div>
        {svc.dependsOn.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: '#484f58' }}>DEPENDS ON</div>
            <div style={{ fontSize: 9, color: '#6e7681', lineHeight: 1.6 }}>{svc.dependsOn.join(', ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ services }: { services: LabService[] }) {
  const counts = { healthy: 0, degraded: 0, down: 0 };
  services.forEach(s => { if (s.status in counts) counts[s.status as keyof typeof counts]++; });
  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {([['HEALTHY', counts.healthy, '#00ff88'], ['DEGRADED', counts.degraded, '#f0a500'], ['DOWN', counts.down, '#ff3355'], ['TOTAL', services.length, '#8b949e']] as [string,number,string][]).map(([label, val, color]) => (
        <div key={label}>
          <div style={{ fontSize: 9, color: '#484f58', letterSpacing: '0.1em' }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Dependency Map ───────────────────────────────────────────────────────────

function DepMap({ services }: { services: LabService[] }) {
  const byId = Object.fromEntries(services.map(s => [s.id, s]));
  const edges = services.flatMap(s => s.dependsOn.map(d => ({ from: d, to: s.id })));
  if (edges.length === 0) return null;
  return (
    <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '14px 18px' }}>
      <div style={{ fontSize: 10, color: '#484f58', letterSpacing: '0.1em', marginBottom: 12 }}>DEPENDENCY MAP</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 0' }}>
        {edges.map((e, i) => {
          const f = byId[e.from]; const t = byId[e.to];
          if (!f || !t) return null;
          const bad = f.status !== 'healthy' || t.status !== 'healthy';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 24 }}>
              <span style={{ fontSize: 11, color: STATUS_COLOR[f.status], fontWeight: 600 }}>{f.name}</span>
              <span style={{ color: bad ? '#ff3355' : '#30363d' }}>──▶</span>
              <span style={{ fontSize: 11, color: STATUS_COLOR[t.status], fontWeight: 600 }}>{t.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Real Mode Control Panel ──────────────────────────────────────────────────

interface RealControlsProps {
  agentStatus: AgentStatus | null;
  agentOnline: boolean;
  running: boolean;
  module: string;
  target: string;
  dryRun: boolean;
  onModuleChange: (m: string) => void;
  onTargetChange: (t: string) => void;
  onDryRunChange: (v: boolean) => void;
  onRun: () => void;
  onAbort: () => void;
}

function RealControls({ agentStatus, agentOnline, running, module, target, dryRun, onModuleChange, onTargetChange, onDryRunChange, onRun, onAbort }: RealControlsProps) {
  const modules = agentStatus?.modules ?? ['redis-probe', 'port-scan', 'dep-kill'];
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${agentOnline ? '#ff335533' : '#30363d'}`, borderRadius: 6, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: '#484f58', letterSpacing: '0.1em' }}>CHAOS AGENT</div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          color: agentOnline ? '#00ff88' : '#ff3355',
          border: `1px solid ${agentOnline ? '#00ff8833' : '#ff335533'}`,
          borderRadius: 4, padding: '3px 8px',
        }}>
          {agentOnline ? '● ONLINE' : '● OFFLINE'}
        </div>
        {agentOnline && <span style={{ fontSize: 9, color: '#484f58' }}>{modules.length} modules available</span>}
      </div>

      {!agentOnline && (
        <div style={{ fontSize: 11, color: '#484f58' }}>Agent unreachable — check jojeco-chaos-agent container</div>
      )}

      {agentOnline && (
        <>
          {/* Module selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: '#484f58', letterSpacing: '0.1em' }}>MODULE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modules.map(m => (
                <button
                  key={m}
                  onClick={() => onModuleChange(m)}
                  style={{
                    ...btnStyle(module === m ? '#ff333520' : '#161b22', module === m ? '#ff3355' : '#8b949e', module === m ? '#ff335566' : '#30363d'),
                    padding: '6px 12px',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            {module && <div style={{ fontSize: 10, color: '#484f58', fontStyle: 'italic' }}>{MODULE_DESC[module] ?? ''}</div>}
          </div>

          {/* Target input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: '#484f58', letterSpacing: '0.1em' }}>
              TARGET <span style={{ color: '#30363d', fontWeight: 400 }}>
                {module === 'redis-probe' ? '(host:port or blank for auto-scan)' :
                 module === 'port-scan'   ? '(IP or CIDR, e.g. 192.168.50.0/24)' :
                 module === 'dep-kill'    ? '(container name, e.g. nextcloud)' : ''}
              </span>
            </div>
            <input
              type="text"
              value={target}
              onChange={e => onTargetChange(e.target.value)}
              placeholder={
                module === 'redis-probe' ? 'leave blank to auto-scan' :
                module === 'port-scan'   ? '192.168.50.0/24' :
                module === 'dep-kill'    ? 'container-name' : 'target'
              }
              style={{
                background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
                color: '#c9d1d9', fontSize: 11, padding: '8px 12px',
                fontFamily: "'JetBrains Mono', monospace", outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Dry run toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => onDryRunChange(!dryRun)}
              style={{
                ...btnStyle(dryRun ? '#00ff8820' : '#ff333520', dryRun ? '#00ff88' : '#ff3355', dryRun ? '#00ff8844' : '#ff335544'),
                padding: '6px 12px', minWidth: 100,
              }}
            >
              {dryRun ? '✓ DRY RUN' : '⚠ LIVE RUN'}
            </button>
            <span style={{ fontSize: 10, color: '#484f58' }}>
              {dryRun ? 'Safe — scan only, no destructive actions' : 'LIVE — will execute destructive actions if applicable'}
            </span>
          </div>

          {/* Run / Abort */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onRun}
              disabled={running || !module}
              style={btnStyle(
                running || !module ? '#21262d' : '#ff333520',
                running || !module ? '#484f58' : '#ff3355',
                running || !module ? '#30363d' : '#ff3355',
              )}
            >
              {running ? 'RUNNING...' : `RUN ${module.toUpperCase()}`}
            </button>
            {running && (
              <button onClick={onAbort} style={btnStyle('#f0a50020', '#f0a500', '#f0a50044')}>
                ■ ABORT
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001') + '/api';

export default function ChaosPage() {
  const [services, setServices]     = useState<LabService[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastPoll, setLastPoll]     = useState<Date | null>(null);
  const [mode, setMode]             = useState<PageMode>('live');

  // Sim state
  const [simRunning, setSimRunning] = useState(false);
  const [simServices, setSimServices] = useState<LabService[]>([]);
  const [simLogs, setSimLogs]       = useState<LogEntry[]>([]);
  const timers                      = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Real mode state
  const [agentStatus, setAgentStatus]   = useState<AgentStatus | null>(null);
  const [agentOnline, setAgentOnline]   = useState(false);
  const [realRunning, setRealRunning]   = useState(false);
  const [realLogs, setRealLogs]         = useState<LogEntry[]>([]);
  const [selModule, setSelModule]       = useState('redis-probe');
  const [target, setTarget]             = useState('');
  const [dryRun, setDryRun]             = useState(true);
  const realLogIdRef                    = useRef(1000);

  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Real log helper ──
  const addRealLog = useCallback((level: LogEntry['level'], msg: string) => {
    setRealLogs(prev => [...prev, { id: realLogIdRef.current++, ts: nowTs(), level, msg }]);
  }, []);

  // ── Service polling ──
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
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [poll]);

  // ── Agent status polling ──
  const pollAgent = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/chaos/agent/status`, { headers: { Authorization: `Bearer ${getToken()}` } });
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
    const iv = setInterval(pollAgent, 10000);
    return () => clearInterval(iv);
  }, [mode, pollAgent]);

  // ── Auto-scroll logs ──
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simLogs, realLogs]);

  // ── Sim controls ──
  const resetSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSimRunning(false);
    setSimServices(services.map(s => ({ ...s })));
    setSimLogs([]);
    _lid = 1;
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
    _lid = 1;
  }, [services]);

  const exitSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMode('live');
    setSimRunning(false);
    setSimLogs([]);
  }, []);

  // ── Real mode controls ──
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        addRealLog('crit', `Error ${r.status}: ${data.detail ?? JSON.stringify(data)}`);
      } else {
        // Parse and display results
        addRealLog('ok', `Module complete: ${data.module ?? selModule}`);
        if (data.findings) {
          const findings: string[] = Array.isArray(data.findings) ? data.findings : [JSON.stringify(data.findings)];
          if (findings.length === 0) {
            addRealLog('info', 'No findings.');
          } else {
            findings.forEach((f: string) => addRealLog('warn', f));
          }
        }
        if (data.open_ports !== undefined) {
          if (data.open_ports.length === 0) {
            addRealLog('info', `No sensitive ports open on ${data.target} (${data.count ?? 0} checked)`);
          } else {
            addRealLog('warn', `Open sensitive ports on ${data.target}:`);
            (data.open_ports as Array<{port: number; service: string}>).forEach(p => {
              addRealLog('crit', `  :${p.port} — ${p.service}`);
            });
          }
        }
        if (data.stopped !== undefined) {
          addRealLog(data.dry_run ? 'info' : 'crit', `Container "${data.container}": ${data.stopped ? 'STOPPED' : 'stop skipped (dry-run)'}`);
          if (data.dependents?.length) {
            addRealLog('warn', `Dependents affected: ${data.dependents.join(', ')}`);
          }
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
      await fetch(`${API_BASE}/chaos/agent/abort`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } });
      addRealLog('warn', 'Abort signal sent to agent');
      setRealRunning(false);
    } catch {
      addRealLog('crit', 'Failed to send abort');
    }
  }, [addRealLog]);

  // ── Display ──
  const displayServices = mode === 'sim' ? simServices : services;
  const logs = mode === 'sim' ? simLogs : realLogs;

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    svcs: displayServices.filter(s => s.category === cat),
  })).filter(g => g.svcs.length > 0);

  const modeBadgeColor = mode === 'real' ? '#ff3355' : mode === 'sim' ? '#f0a500' : '#00ff88';
  const modeBadgeBg    = mode === 'real' ? '#ff335533' : mode === 'sim' ? '#f0a50033' : '#00ff8833';
  const modeLabel = mode === 'real'
    ? (realRunning ? '● REAL RUNNING' : '● REAL MODE')
    : mode === 'sim'
    ? (simRunning ? '● SIMULATION RUNNING' : '● SIMULATION IDLE')
    : '● LIVE';

  return (
    <div style={{ minHeight: '100vh', background: '#080b0f', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid #21262d', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, background: '#0d1117',
        position: 'sticky', top: 0, zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3', letterSpacing: '0.05em' }}>
            ☠ CHAOSMONKEY
          </span>
          <div style={{
            fontSize: 9, color: modeBadgeColor,
            border: `1px solid ${modeBadgeBg}`,
            borderRadius: 4, padding: '3px 8px', letterSpacing: '0.1em',
          }}>
            {modeLabel}
          </div>
          {mode === 'live' && lastPoll && (
            <span style={{ fontSize: 9, color: '#484f58' }}>polled {lastPoll.toLocaleTimeString()}</span>
          )}
          {mode === 'real' && agentOnline && (
            <span style={{ fontSize: 9, color: '#484f58' }}>agent online</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mode === 'live' && (
            <>
              <button onClick={poll} style={btnStyle('#161b22', '#58a6ff', '#1f6feb')}>↺ REFRESH</button>
              <button onClick={enterSim} style={btnStyle('#f0a50010', '#f0a500', '#f0a50040')}>SIMULATE</button>
              <button onClick={enterReal} style={btnStyle('#ff333510', '#ff3355', '#ff335540')}>REAL CHAOS</button>
            </>
          )}
          {mode === 'sim' && (
            <>
              <button onClick={resetSim} style={btnStyle('#30363d', '#8b949e')}>RESET</button>
              <button onClick={launchSim} disabled={simRunning} style={btnStyle(simRunning ? '#21262d' : '#f0a50020', simRunning ? '#484f58' : '#f0a500', simRunning ? '#30363d' : '#f0a500')}>
                {simRunning ? 'RUNNING...' : 'LAUNCH SIM'}
              </button>
              <button onClick={exitSim} style={btnStyle('#21262d', '#8b949e')}>EXIT SIM</button>
            </>
          )}
          {mode === 'real' && (
            <button onClick={exitReal} style={btnStyle('#21262d', '#8b949e')}>EXIT REAL</button>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

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
            onRun={runModule}
            onAbort={abortAgent}
          />
        )}

        {/* Stats */}
        {!loading && <StatsRow services={displayServices} />}

        {loading ? (
          <div style={{ color: '#484f58', fontSize: 12 }}>Polling lab services<span style={{ animation: 'blink 1s step-end infinite' }}>...</span></div>
        ) : (
          <>
            {/* Service grid by category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {grouped.map(({ cat, svcs }) => (
                <div key={cat}>
                  <div style={{ fontSize: 9, color: '#484f58', letterSpacing: '0.12em', marginBottom: 10 }}>{cat.toUpperCase()}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {svcs.map(s => <ServiceCard key={s.id} svc={s} />)}
                  </div>
                </div>
              ))}
            </div>

            {/* Dep map */}
            <DepMap services={displayServices} />

            {/* Log panel — sim or real */}
            {(mode === 'sim' || mode === 'real') && (
              <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #21262d', fontSize: 10, color: '#484f58', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{mode === 'real' ? 'AGENT LOG' : 'ATTACK LOG'}</span>
                  <span>{logs.length} entries</span>
                </div>
                <div style={{ padding: '12px 14px', maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {logs.length === 0
                    ? <span style={{ color: '#484f58', fontSize: 11 }}>
                        {mode === 'real' ? 'Select a module and run...' : 'Awaiting chaos launch...'}<span style={{ marginLeft: 2 }}>▊</span>
                      </span>
                    : logs.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5 }}>
                        <span style={{ color: '#484f58', flexShrink: 0, fontSize: 10 }}>{e.ts}</span>
                        <span style={{ color: LOG_COLOR[e.level] }}>{e.msg}</span>
                      </div>
                    ))
                  }
                  {(simRunning || realRunning) && <span style={{ color: '#484f58', fontSize: 11 }}>▊</span>}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: 10, color: '#21262d', textAlign: 'center', paddingBottom: 8 }}>
          CHAOSMONKEY — LIVE: real lab data  •  SIMULATE: chaos demo  •  REAL: live agent
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${border ?? '#30363d'}`,
    padding: '7px 14px', borderRadius: 4, fontSize: 10,
    cursor: 'pointer', letterSpacing: '0.08em',
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
    transition: 'all 0.2s',
  };
}
