/**
 * LabPage (v3) — rebuilt with shadcn/ui + Tailwind from the 999-line monolith.
 *
 * Data entirely via useSnapshot() — no per-page setInterval.
 * Temp history still fetches /api/lab/temps/history once on mount
 * (the snapshot endpoint doesn't carry multi-hour time-series), but reuses
 * the shared refresh() for everything else.
 *
 * Desktop (≥1280px) uses a command-center layout: KPI strip + live System
 * Load charts + a 2-col machines grid in the main column, with a right rail
 * for the inference fleet and printer. Mobile/tablet keep the existing stack.
 *
 * Guest view (optionalAuth) preserved — same read-only rendering.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSnapshot } from '@/hooks/useSnapshot';
import { getToken } from '@/services/api';
import { StatTiles } from './StatTiles';
import { InfoPanels } from './InfoPanels';
import { MachineCard } from './MachineCard';
import { AINodeCard } from './AINodeCard';
import { ServiceHealthPanel } from './ServiceHealthPanel';
import { QuickLinks } from './QuickLinks';
import { PrinterCard } from './PrinterCard';
import { SystemLoadPanel } from './SystemLoadPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { TempPoint } from './TempSparkline';

/** Local media-query hook — true on desktop (≥1280px) for the command-center layout. */
function useIsDesktop(): boolean {
  const [v, setV] = useState(typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}

interface Process { pid: number; name: string; cpu: number; mem: number }
interface ProcessList { machine_id: string; processes: Process[] }
interface AdGuardStats { totalQueries: number; blockedQueries: number; blockedPercent: string; avgProcessingTime: string | null }
interface BackupStatus { lastRun: string | null; status: 'ok' | 'error' | 'unknown' | 'never'; message: string }

function isLan(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.');
}

export default function LabPage() {
  const { data, at, loading, refresh } = useSnapshot();
  const [showHealthPanel, setShowHealthPanel] = useState(false);
  const [history, setHistory] = useState<Record<string, TempPoint[]>>({});
  const [processes, setProcesses] = useState<Record<string, Process[]>>({});
  const [adguard, setAdguard] = useState<AdGuardStats | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);
  const desktop = useIsDesktop();

  // ── Derived section data from snapshot ──────────────────────────────────────
  const lab       = data?.lab ?? null;
  const fleet     = data?.fleet ?? null;
  const docker    = data?.docker ?? null;
  const minecraft = data?.minecraft ?? null;
  const svcHealth = data?.servicesHealth ?? null;
  const alerts    = data?.alerts ?? null;
  const automation = data?.automation ?? null;
  const printer   = data?.printer ?? null;

  // Sessions (ollama active runs)
  const sessions = Array.isArray(data?.ollama) ? (data!.ollama as Array<{ id: string; active: Array<{ name: string; size_vram?: number }> }>) : [];

  // ── Machine ordering ─────────────────────────────────────────────────────────
  const ORDER = ['server1', 'server2', 'server3', 'macmini'];
  const alwaysOn = (lab?.machines.filter(m => m.always_on) ?? [])
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const burst = lab?.machines.filter(m => !m.always_on) ?? [];
  const isMobile = isMobileRef.current;

  // ── Temp history (fetched once on mount, interval reuses shared refresh) ─────
  const fetchTempHistory = useCallback(async () => {
    const hrs = isMobileRef.current ? '3' : '24';
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const r = await fetch(`/api/lab/temps/history?hours=${hrs}`, { headers });
      if (r.ok) setHistory(await r.json());
    } catch {}
  }, []);

  // ── AdGuard + Backup (not in snapshot yet — fetch separately) ────────────────
  const fetchExtras = useCallback(async () => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const [ag, bk] = await Promise.allSettled([
      fetch('/api/adguard/stats', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/backup-status',  { headers }).then(r => r.ok ? r.json() : null),
    ]);
    if (ag.status === 'fulfilled' && ag.value) setAdguard(ag.value);
    if (bk.status === 'fulfilled' && bk.value) setBackup(bk.value);
  }, []);

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;
    fetchTempHistory();
    fetchExtras();
    const ms = isLan() ? 5000 : 20000;
    const id = setInterval(() => { fetchTempHistory(); fetchExtras(); }, ms);
    return () => clearInterval(id);
  }, [fetchTempHistory, fetchExtras]);

  // ── Process fetch on machine card expand ─────────────────────────────────────
  const fetchProcesses = useCallback(async (machineId: string) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const r = await fetch(`/api/lab/processes/${machineId}`, { headers });
      if (r.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; return; }
      if (r.ok) {
        const d: ProcessList = await r.json();
        setProcesses(prev => ({ ...prev, [machineId]: d.processes }));
      }
    } catch {}
  }, []);

  const lastRefresh = at ? new Date(at) : new Date();

  // ── Shared content blocks (used by both the mobile stack and the desktop command-center) ──
  const machinesBlock = (
    <>
      {alwaysOn.length > 0 && (
        <div>
          <div className="j-section-label">Always-On</div>
          <div className={`stagger ${desktop ? 'j-grid-2' : 'flex flex-col gap-2'}`}>
            {alwaysOn.map(m => (
              <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} processes={processes[m.id] ?? []} onExpand={fetchProcesses} />
            ))}
          </div>
        </div>
      )}

      {(burst.length > 0 || loading) && (
        <div>
          <div className="j-section-label">Burst Nodes</div>
          <div className={`stagger ${desktop ? 'j-grid-2' : 'flex flex-col gap-2'}`}>
            {burst.length > 0
              ? burst.map(m => (
                  <MachineCard key={m.id} m={m} history={history[m.id] ?? []} isMobile={isMobile} processes={processes[m.id] ?? []} onExpand={fetchProcesses} />
                ))
              : loading ? [1, 2].map(i => <Skeleton key={i} className="h-36" />) : null}
          </div>
        </div>
      )}

      {loading && alwaysOn.length === 0 && (
        <>
          <div className="j-section-label">Always-On</div>
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-[14px] mb-2" />)}
        </>
      )}
    </>
  );

  const fleetBlock = (fleet || loading) ? (
    <>
      <div className="j-section-label">Inference Fleet</div>
      <div className="flex flex-col gap-2 stagger">
        {fleet
          ? fleet.nodes.map(n => <AINodeCard key={n.id} node={n} sessions={sessions} />)
          : [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-[14px]" />)}
      </div>
    </>
  ) : null;

  const printerBlock = (
    <>
      <div className="j-section-label">3D Printer</div>
      {loading && !printer ? <Skeleton className="h-40 rounded-[14px]" /> : <PrinterCard printer={printer} />}
    </>
  );

  return (
    <div>
      {/* ── Service Health slide-out ── */}
      <ServiceHealthPanel open={showHealthPanel} onClose={() => setShowHealthPanel(false)} />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1 }}>
            Lab Overview
          </h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, letterSpacing: '0.02em' }}>
            JojeCo Home Lab · {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={refresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 'var(--r-sm)',
            background: 'var(--raised)', border: 'none',
            fontSize: 11, fontWeight: 500, color: 'var(--t3)',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: 'var(--shadow-ring)',
            transition: 'color 150ms, background 150ms',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t1)'; (e.currentTarget as HTMLElement).style.background = 'var(--raised-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; (e.currentTarget as HTMLElement).style.background = 'var(--raised)'; }}
        >
          <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          {lastRefresh.toLocaleTimeString()}
        </button>
      </div>

      {/* ── Hero stat tiles (KPI strip) ── */}
      <StatTiles
        lab={lab}
        fleet={fleet}
        docker={docker}
        servicesHealth={svcHealth}
        minecraft={minecraft}
        onOpenServicesPanel={() => setShowHealthPanel(true)}
      />

      {/* ── Alerts / Automation / AdGuard / Backup row ── */}
      <InfoPanels
        alerts={alerts}
        automation={automation}
        adguard={adguard}
        backup={backup}
      />

      {desktop ? (
        /* ── DESKTOP command-center: wide main column + right rail ── */
        <div className="mb-6" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
          <div className="flex flex-col gap-5 min-w-0">
            <SystemLoadPanel machines={lab?.machines ?? []} tick={at} />
            {machinesBlock}
          </div>
          <div className="flex flex-col gap-5">
            {fleetBlock}
            <div>{printerBlock}</div>
          </div>
        </div>
      ) : (
        /* ── Mobile / tablet: existing stacked layout ── */
        <>
          <div className="j-grid-half mb-6">
            <div className="flex flex-col gap-5">{machinesBlock}</div>
            <div>{fleetBlock}</div>
          </div>
          <div className="mb-6">{printerBlock}</div>
        </>
      )}

      {/* ── Quick Links ── */}
      <QuickLinks />
    </div>
  );
}
