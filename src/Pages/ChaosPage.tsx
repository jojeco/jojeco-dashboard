import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SvcStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

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

function fmt(n: number | null) {
  if (n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

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

// ─── Main Page ────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001') + '/api';

export default function ChaosPage() {
  const [services, setServices]   = useState<LabService[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastPoll, setLastPoll]   = useState<Date | null>(null);
  const [simMode, setSimMode]     = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simServices, setSimServices] = useState<LabService[]>([]);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const logEndRef                 = useRef<HTMLDivElement>(null);
  const timers                    = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Real data polling
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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Sim controls
  const resetSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSimRunning(false);
    setSimServices(services.map(s => ({ ...s })));
    setLogs([]);
    _lid = 1;
  }, [services]);

  const launchSim = useCallback(() => {
    if (simRunning) return;
    resetSim();
    setSimRunning(true);
    SIM_SCRIPT.forEach(step => {
      const t = setTimeout(() => {
        setLogs(prev => [...prev, step.log]);
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
    setSimMode(true);
    setSimServices(services.map(s => ({ ...s })));
    setLogs([]);
    _lid = 1;
  }, [services]);

  const exitSim = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSimMode(false);
    setSimRunning(false);
    setLogs([]);
  }, []);

  const displayServices = simMode ? simServices : services;

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    svcs: displayServices.filter(s => s.category === cat),
  })).filter(g => g.svcs.length > 0);

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
            fontSize: 9, color: simMode ? '#ff3355' : '#00ff88',
            border: `1px solid ${simMode ? '#ff335533' : '#00ff8833'}`,
            borderRadius: 4, padding: '3px 8px', letterSpacing: '0.1em',
          }}>
            {simMode ? (simRunning ? '● SIMULATION RUNNING' : '● SIMULATION IDLE') : '● LIVE'}
          </div>
          {!simMode && lastPoll && (
            <span style={{ fontSize: 9, color: '#484f58' }}>polled {lastPoll.toLocaleTimeString()}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {simMode ? (
            <>
              <button onClick={resetSim} style={btnStyle('#30363d', '#8b949e')}>RESET</button>
              <button onClick={launchSim} disabled={simRunning} style={btnStyle(simRunning ? '#21262d' : '#ff333520', simRunning ? '#484f58' : '#ff3355', simRunning ? '#30363d' : '#ff3355')}>
                {simRunning ? 'RUNNING...' : 'LAUNCH CHAOS'}
              </button>
              <button onClick={exitSim} style={btnStyle('#21262d', '#8b949e')}>EXIT SIM</button>
            </>
          ) : (
            <>
              <button onClick={poll} style={btnStyle('#161b22', '#58a6ff', '#1f6feb')}>↺ REFRESH</button>
              <button onClick={enterSim} style={btnStyle('#ff333510', '#ff3355', '#ff335540')}>SIMULATE CHAOS</button>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

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

            {/* Sim log (only in sim mode) */}
            {simMode && (
              <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #21262d', fontSize: 10, color: '#484f58', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
                  <span>ATTACK LOG</span><span>{logs.length} entries</span>
                </div>
                <div style={{ padding: '12px 14px', maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {logs.length === 0
                    ? <span style={{ color: '#484f58', fontSize: 11 }}>Awaiting chaos launch...<span style={{ marginLeft: 2 }}>▊</span></span>
                    : logs.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5 }}>
                        <span style={{ color: '#484f58', flexShrink: 0, fontSize: 10 }}>{e.ts}</span>
                        <span style={{ color: LOG_COLOR[e.level] }}>{e.msg}</span>
                      </div>
                    ))
                  }
                  {simRunning && <span style={{ color: '#484f58', fontSize: 11 }}>▊</span>}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: 10, color: '#21262d', textAlign: 'center', paddingBottom: 8 }}>
          CHAOSMONKEY — LIVE: real lab data  •  SIMULATE: chaos demo
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
