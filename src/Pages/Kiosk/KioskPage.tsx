/**
 * /kiosk — Galaxy Tab A wall display
 * Fullscreen, no nav, dark theme, auto-refreshes every 30s.
 * Designed for 1280×800 / 1920×1200 viewing from across the room.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server, Box, Database, Zap, Activity, Wifi, Bell,
  CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock,
} from 'lucide-react';
import { getToken } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Machine {
  id: string; name: string; online: boolean;
  cpu: number | null;
  mem: { percent: number; total: number } | null;
  disks: Array<{ label: string; used: number; size: number; percent: number }>;
}

interface LabOverview {
  machines: Machine[];
  status: 'healthy' | 'degraded' | 'critical';
  issues: Array<{ severity: string; message: string }>;
  lvmThinPool: number | null;
  claudeRunning: boolean | null;
}

interface DockerContainer {
  name: string; state: string; status: string;
}

interface KioskData {
  lab: LabOverview | null;
  docker: DockerContainer[] | null;
  litellmSpend: number | null;
  uptimeKuma: { total: number; up: number; down: number } | null;
  grafanaAlerts: Array<{ id: string; name: string; state: string }> | null;
  piAp: 'up' | 'down' | 'unknown';
}

type CardStatus = 'ok' | 'warn' | 'crit' | 'loading' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number, warn = 65, crit = 85): string {
  if (pct >= crit) return 'var(--k-red)';
  if (pct >= warn) return 'var(--k-amber)';
  return 'var(--k-green)';
}

function progressBar(pct: number, warn = 65, crit = 85) {
  const color = pctColor(pct, warn, crit);
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${clamped}%`,
        background: color, borderRadius: 4,
        transition: 'width 600ms ease',
        boxShadow: `0 0 8px ${color}66`,
      }} />
    </div>
  );
}

function fmtBytes(b: number) {
  if (b >= 1e12) return (b / 1e12).toFixed(1) + 'T';
  if (b >= 1e9)  return (b / 1e9).toFixed(1) + 'G';
  if (b >= 1e6)  return (b / 1e6).toFixed(0) + 'M';
  return b + 'B';
}

function statusIcon(s: CardStatus, size = 20) {
  if (s === 'ok')      return <CheckCircle size={size} color="var(--k-green)" />;
  if (s === 'warn')    return <AlertTriangle size={size} color="var(--k-amber)" />;
  if (s === 'crit')    return <XCircle size={size} color="var(--k-red)" />;
  if (s === 'loading') return <RefreshCw size={size} color="var(--k-dim)" style={{ animation: 'kSpin 1s linear infinite' }} />;
  return <XCircle size={size} color="var(--k-dim)" />;
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function KCard({
  icon, title, status, children, span = 1,
}: {
  icon: React.ReactNode; title: string; status: CardStatus;
  children: React.ReactNode; span?: number;
}) {
  const borderColor =
    status === 'crit'    ? 'var(--k-red)'   :
    status === 'warn'    ? 'var(--k-amber)'  :
    status === 'ok'      ? 'var(--k-green-dim)' : 'var(--k-border)';

  const glow =
    status === 'crit'  ? '0 0 0 1px var(--k-red-dim),   0 4px 24px rgba(239,68,68,0.18)' :
    status === 'warn'  ? '0 0 0 1px var(--k-amber-dim),  0 4px 24px rgba(234,179,8,0.14)'  :
    status === 'ok'    ? '0 0 0 1px var(--k-green-dim2), 0 4px 24px rgba(34,197,94,0.10)'  : 'none';

  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: 'var(--k-surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 14,
      padding: '18px 20px',
      boxShadow: glow,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      minWidth: 0,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--k-accent)', opacity: 0.85 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--k-t2)' }}>
            {title}
          </span>
        </div>
        {statusIcon(status, 18)}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Card: Server Health ───────────────────────────────────────────────────────

function ServerHealthCard({ machines }: { machines: Machine[] | null }) {
  if (!machines) {
    return (
      <KCard icon={<Server size={20} />} title="Server Health" status="error">
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Unable to load</div>
      </KCard>
    );
  }

  const shown = machines.filter(m => ['server1','server2','server3','macmini'].includes(m.id) || m.online);
  const anyCrit = shown.some(m => m.online && ((m.cpu ?? 0) >= 85 || (m.mem?.percent ?? 0) >= 85));
  const anyWarn = shown.some(m => m.online && ((m.cpu ?? 0) >= 65 || (m.mem?.percent ?? 0) >= 65));
  const status: CardStatus = !machines.length ? 'loading' : anyCrit ? 'crit' : anyWarn ? 'warn' : 'ok';

  return (
    <KCard icon={<Server size={20} />} title="Server Health" status={status} span={2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {machines.map(m => (
          <div key={m.id} style={{ opacity: m.online ? 1 : 0.45 }}>
            {/* name + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: m.online ? 'var(--k-green)' : 'var(--k-dim)',
                  boxShadow: m.online ? '0 0 6px var(--k-green)' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--k-t1)' }}>{m.name}</span>
              </div>
              {!m.online && <span style={{ fontSize: 12, color: 'var(--k-dim)' }}>OFFLINE</span>}
            </div>
            {m.online && (
              <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {m.cpu != null && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--k-t2)', marginBottom: 3 }}>
                      <span>CPU</span><span style={{ color: pctColor(m.cpu), fontFamily: 'monospace', fontWeight: 700 }}>{m.cpu.toFixed(0)}%</span>
                    </div>
                    {progressBar(m.cpu)}
                  </div>
                )}
                {m.mem && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--k-t2)', marginBottom: 3 }}>
                      <span>RAM</span>
                      <span style={{ color: pctColor(m.mem.percent), fontFamily: 'monospace', fontWeight: 700 }}>
                        {m.mem.percent.toFixed(0)}% <span style={{ color: 'var(--k-dim)', fontWeight: 400 }}>of {fmtBytes(m.mem.total)}</span>
                      </span>
                    </div>
                    {progressBar(m.mem.percent)}
                  </div>
                )}
                {/* disk summary */}
                {m.disks && m.disks.length > 0 && (() => {
                  const totalSize = m.disks.reduce((s, d) => s + (d.size || 0), 0);
                  const totalUsed = m.disks.reduce((s, d) => s + (d.used || 0), 0);
                  const pct = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--k-t2)', marginBottom: 3 }}>
                        <span>Disk</span>
                        <span style={{ color: pctColor(pct, 75, 90), fontFamily: 'monospace', fontWeight: 700 }}>
                          {pct.toFixed(0)}% <span style={{ color: 'var(--k-dim)', fontWeight: 400 }}>of {fmtBytes(totalSize)}</span>
                        </span>
                      </div>
                      {progressBar(pct, 75, 90)}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>
    </KCard>
  );
}

// ─── Card: Docker Status ───────────────────────────────────────────────────────

function DockerCard({ containers }: { containers: DockerContainer[] | null }) {
  if (!containers) {
    return (
      <KCard icon={<Box size={20} />} title="Docker" status="error">
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Unable to load</div>
      </KCard>
    );
  }

  const running = containers.filter(c => c.state === 'running');
  const down    = containers.filter(c => c.state !== 'running');
  const status: CardStatus = down.length > 3 ? 'crit' : down.length > 0 ? 'warn' : 'ok';

  return (
    <KCard icon={<Box size={20} />} title="Docker" status={status}>
      {/* counts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: down.length > 0 ? 14 : 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'monospace', color: 'var(--k-green)', lineHeight: 1 }}>{running.length}</div>
          <div style={{ fontSize: 11, color: 'var(--k-t2)', marginTop: 4 }}>RUNNING</div>
        </div>
        {down.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'monospace', color: 'var(--k-red)', lineHeight: 1 }}>{down.length}</div>
            <div style={{ fontSize: 11, color: 'var(--k-t2)', marginTop: 4 }}>DOWN</div>
          </div>
        )}
      </div>
      {down.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {down.slice(0, 8).map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
              background: 'var(--k-red-dim)', borderRadius: 7,
            }}>
              <XCircle size={13} color="var(--k-red)" />
              <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--k-red)' }}>{c.name}</span>
            </div>
          ))}
          {down.length > 8 && (
            <div style={{ fontSize: 12, color: 'var(--k-dim)', paddingLeft: 8 }}>+{down.length - 8} more</div>
          )}
        </div>
      )}
    </KCard>
  );
}

// ─── Card: LVM Thin Pool ───────────────────────────────────────────────────────

function LvmCard({ pct }: { pct: number | null }) {
  const status: CardStatus =
    pct === null ? 'loading' :
    pct >= 85    ? 'crit' :
    pct >= 70    ? 'warn' : 'ok';

  return (
    <KCard icon={<Database size={20} />} title="LVM Thin Pool" status={status}>
      {pct === null ? (
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 48, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1, color: pctColor(pct, 70, 85) }}>
              {pct.toFixed(1)}
            </span>
            <span style={{ fontSize: 22, color: 'var(--k-t2)' }}>%</span>
          </div>
          {progressBar(pct, 70, 85)}
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--k-dim)' }}>
            {pct >= 85 ? '⚠ CRITICAL — run docker system prune' :
             pct >= 70 ? 'Warning — approaching limit' :
             'Docker overlay storage healthy'}
          </div>
        </>
      )}
    </KCard>
  );
}

// ─── Card: LiteLLM Spend ──────────────────────────────────────────────────────

function LiteLLMCard({ spend }: { spend: number | null }) {
  // Cap is $20 per CLAUDE.md. Use VITE env if set, fallback to 20.
  const cap = parseFloat(import.meta.env.VITE_LITELLM_SPEND_CAP || '20');
  const pct  = spend != null ? (spend / cap) * 100 : null;
  const status: CardStatus =
    spend === null ? 'loading' :
    pct! >= 80     ? 'crit'   :
    pct! >= 60     ? 'warn'   : 'ok';

  return (
    <KCard icon={<Zap size={20} />} title="LiteLLM Spend" status={status}>
      {spend === null ? (
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 38, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1, color: pctColor(pct!, 60, 80) }}>
              ${spend.toFixed(2)}
            </span>
            <span style={{ fontSize: 16, color: 'var(--k-t2)' }}>/ ${cap.toFixed(0)}</span>
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--k-dim)' }}>Month-to-date</div>
          {progressBar(pct!, 60, 80)}
        </>
      )}
    </KCard>
  );
}

// ─── Card: Uptime Kuma ────────────────────────────────────────────────────────

function UptimeKumaCard({ data }: { data: { total: number; up: number; down: number } | null }) {
  const status: CardStatus =
    data === null     ? 'loading' :
    data.down > 2     ? 'crit'   :
    data.down > 0     ? 'warn'   : 'ok';

  return (
    <KCard icon={<Activity size={20} />} title="Uptime Kuma" status={status}>
      {data === null ? (
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1, color: 'var(--k-green)' }}>{data.up}</div>
            <div style={{ fontSize: 11, color: 'var(--k-t2)', marginTop: 4 }}>UP</div>
          </div>
          <div style={{ fontSize: 28, color: 'var(--k-dim)', fontWeight: 200 }}>/</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1, color: data.down > 0 ? 'var(--k-red)' : 'var(--k-dim)' }}>{data.down}</div>
            <div style={{ fontSize: 11, color: 'var(--k-t2)', marginTop: 4 }}>DOWN</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--k-dim)' }}>{data.total} monitors</div>
            {data.total > 0 && (
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: pctColor((data.down / data.total) * 100 > 0 ? 100 : 0, 1, 20) }}>
                {Math.round((data.up / data.total) * 100)}%
              </div>
            )}
          </div>
        </div>
      )}
    </KCard>
  );
}

// ─── Card: Pi AP ──────────────────────────────────────────────────────────────

function PiApCard({ status: apStatus }: { status: 'up' | 'down' | 'unknown' }) {
  const cardStatus: CardStatus =
    apStatus === 'up'   ? 'ok'   :
    apStatus === 'down' ? 'warn' : 'loading';

  return (
    <KCard icon={<Wifi size={20} />} title="Outdoor AP" status={cardStatus}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: apStatus === 'up' ? 'var(--k-green)' : apStatus === 'down' ? 'var(--k-red)' : 'var(--k-dim)',
          boxShadow: apStatus === 'up' ? '0 0 12px var(--k-green)' : 'none',
        }} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: apStatus === 'up' ? 'var(--k-green)' : apStatus === 'down' ? 'var(--k-red)' : 'var(--k-dim)' }}>
            {apStatus === 'up' ? 'ONLINE' : apStatus === 'down' ? 'UNREACHABLE' : 'CHECKING…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--k-dim)' }}>192.168.50.31 — Pi AP</div>
        </div>
      </div>
      {apStatus === 'unknown' && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--k-dim)' }}>
          Note: Browser fetch to LAN IP — may be blocked by CORS
        </div>
      )}
    </KCard>
  );
}

// ─── Card: Grafana Alerts ─────────────────────────────────────────────────────

function GrafanaAlertsCard({ alerts }: { alerts: Array<{ id: string; name: string; state: string }> | null }) {
  const firing = (alerts ?? []).filter(a => a.state === 'alerting' || a.state === 'firing');
  const status: CardStatus =
    alerts === null ? 'loading' :
    firing.length > 0 ? 'crit' : 'ok';

  return (
    <KCard icon={<Bell size={20} />} title="Grafana Alerts" status={status}>
      {alerts === null ? (
        <div style={{ color: 'var(--k-dim)', fontSize: 14 }}>Loading…</div>
      ) : firing.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={28} color="var(--k-green)" />
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--k-green)' }}>All clear</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {firing.slice(0, 6).map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', background: 'var(--k-red-dim)', borderRadius: 7,
            }}>
              <AlertTriangle size={14} color="var(--k-red)" />
              <span style={{ fontSize: 13, color: 'var(--k-red)', fontFamily: 'monospace' }}>{a.name}</span>
            </div>
          ))}
          {firing.length > 6 && (
            <div style={{ fontSize: 12, color: 'var(--k-dim)' }}>+{firing.length - 6} more firing</div>
          )}
        </div>
      )}
    </KCard>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchWithAuth(path: string, opts?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchLabData(): Promise<{ lab: LabOverview | null; piAp: 'up' | 'down' | 'unknown' }> {
  const [labRes, piRes] = await Promise.allSettled([
    fetchWithAuth('/lab/overview'),
    fetchWithAuth('/kiosk/pi-ap'),
  ]);
  return {
    lab:  labRes.status  === 'fulfilled' ? labRes.value  : null,
    piAp: piRes.status   === 'fulfilled' ? piRes.value?.status ?? 'unknown' : 'unknown',
  };
}

async function fetchDockerData(): Promise<DockerContainer[] | null> {
  try {
    const data = await fetchWithAuth('/docker/containers');
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

async function fetchLiteLLMSpend(): Promise<number | null> {
  try {
    const data = await fetchWithAuth('/kiosk/litellm-spend');
    return typeof data?.spend === 'number' ? data.spend : null;
  } catch { return null; }
}

async function fetchUptimeKuma(): Promise<{ total: number; up: number; down: number } | null> {
  try {
    const data = await fetchWithAuth('/kiosk/uptime-kuma');
    return data?.total != null ? data : null;
  } catch { return null; }
}

async function fetchGrafanaAlerts(): Promise<Array<{ id: string; name: string; state: string }> | null> {
  try {
    const data = await fetchWithAuth('/kiosk/grafana-alerts');
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

// ─── Main Kiosk Page ──────────────────────────────────────────────────────────

export default function KioskPage() {
  const [data, setData]           = useState<KioskData>({
    lab: null, docker: null, litellmSpend: null,
    uptimeKuma: null, grafanaAlerts: null, piAp: 'unknown',
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [{ lab, piAp }, docker, litellmSpend, uptimeKuma, grafanaAlerts] = await Promise.all([
      fetchLabData(),
      fetchDockerData(),
      fetchLiteLLMSpend(),
      fetchUptimeKuma(),
      fetchGrafanaAlerts(),
    ]);
    setData({ lab, docker, litellmSpend, uptimeKuma, grafanaAlerts, piAp });
    setLastUpdated(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
    const INTERVAL_MS = parseInt(import.meta.env.VITE_KIOSK_REFRESH_MS || '30000', 10);
    timerRef.current = setInterval(refresh, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  // Overall banner status
  const overallStatus = data.lab?.status ?? 'healthy';
  const bannerColor =
    overallStatus === 'critical' ? 'var(--k-red)'   :
    overallStatus === 'degraded' ? 'var(--k-amber)'  : 'var(--k-green)';

  return (
    <>
      {/* Kiosk-scoped CSS variables + overrides */}
      <style>{`
        .k-root {
          --k-bg:        #080810;
          --k-surface:   #0f0f18;
          --k-border:    rgba(255,255,255,0.07);
          --k-accent:    #14b8a6;
          --k-green:     #22c55e;
          --k-green-dim: rgba(34,197,94,0.25);
          --k-green-dim2: rgba(34,197,94,0.12);
          --k-amber:     #f59e0b;
          --k-amber-dim: rgba(245,158,11,0.20);
          --k-red:       #ef4444;
          --k-red-dim:   rgba(239,68,68,0.12);
          --k-t1:        rgba(255,255,255,0.92);
          --k-t2:        rgba(255,255,255,0.55);
          --k-dim:       rgba(255,255,255,0.22);
        }
        @keyframes kSpin { to { transform: rotate(360deg); } }
        @keyframes kPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="k-root" style={{
        position: 'fixed', inset: 0,
        background: 'var(--k-bg)',
        color: 'var(--k-t1)',
        fontFamily: "'Geist', system-ui, sans-serif",
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        WebkitFontSmoothing: 'antialiased',
      }}>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: `2px solid ${bannerColor}33`,
          background: `${bannerColor}08`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: bannerColor,
              boxShadow: `0 0 12px ${bannerColor}`,
              animation: overallStatus !== 'healthy' ? 'kPulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--k-t1)' }}>
              Joje<span style={{ color: 'var(--k-accent)' }}>Co</span>
            </span>
            <span style={{
              fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: bannerColor, background: `${bannerColor}18`, padding: '3px 10px', borderRadius: 6,
            }}>
              {overallStatus}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {refreshing && <RefreshCw size={16} color="var(--k-dim)" style={{ animation: 'kSpin 1s linear infinite' }} />}
            {lastUpdated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--k-dim)', fontSize: 13 }}>
                <Clock size={14} />
                <span>
                  Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            )}
            <button
              onClick={refresh}
              style={{
                background: 'none', border: '1px solid var(--k-border)', borderRadius: 8,
                padding: '6px 14px', color: 'var(--k-t2)', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Issues banner (if any) ───────────────────────────────────── */}
        {data.lab?.issues && data.lab.issues.length > 0 && (
          <div style={{
            background: data.lab.issues.some(i => i.severity === 'critical') ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
            borderBottom: `1px solid ${data.lab.issues.some(i => i.severity === 'critical') ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.15)'}`,
            padding: '8px 24px',
            display: 'flex', gap: 16, overflowX: 'auto',
            flexShrink: 0,
          }}>
            {data.lab.issues.map((issue, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {issue.severity === 'critical'
                  ? <XCircle size={13} color="var(--k-red)" />
                  : <AlertTriangle size={13} color="var(--k-amber)" />
                }
                <span style={{
                  fontSize: 13,
                  color: issue.severity === 'critical' ? 'var(--k-red)' : 'var(--k-amber)',
                  fontFamily: 'monospace',
                }}>{issue.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Card grid ───────────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 'minmax(180px, auto)',
          gap: 16,
          alignContent: 'start',
        }}>
          {/* Server Health — 2 cols wide */}
          <ServerHealthCard machines={data.lab?.machines ?? null} />

          {/* Docker Status */}
          <DockerCard containers={data.docker} />

          {/* LVM Thin Pool */}
          <LvmCard pct={data.lab?.lvmThinPool ?? null} />

          {/* LiteLLM Spend */}
          <LiteLLMCard spend={data.litellmSpend} />

          {/* Uptime Kuma */}
          <UptimeKumaCard data={data.uptimeKuma} />

          {/* Pi AP */}
          <PiApCard status={data.piAp} />

          {/* Grafana Alerts */}
          <GrafanaAlertsCard alerts={data.grafanaAlerts} />
        </div>
      </div>
    </>
  );
}
