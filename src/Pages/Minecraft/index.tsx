/**
 * MinecraftPage (v3) — design-system rebuild.
 *
 * Design rules:
 *  - Surface elevation only — no white/hard borders
 *  - Status color only on status content (dots, badges)
 *  - minWidth: 0 on all grid/flex items (390px safety)
 *  - No setInterval in component — useSnapshot('minecraft') for cadence
 *  - ConfirmDialog before any start/stop/restart action
 *  - ToastStack for mutation feedback
 *
 * Data flow:
 *  - Server status: useSnapshot('minecraft') → McServer records
 *  - Mutations: POST http://MC_API/:id/:action (same origin as old page)
 *  - On-demand log/error fetch per ServerCard (already isolated there)
 */
import { useState, useCallback } from 'react';
import { Server, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useSnapshot } from '@/hooks/useSnapshot';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ServerCard } from './ServerCard';

// ── Types ──────────────────────────────────────────────────────────────────────
type Toast = { id: number; msg: string; ok: boolean };

// ── Config ─────────────────────────────────────────────────────────────────────
const MC_API = 'http://192.168.50.10:8765';

// ── SectionLabel (local, matches Controls/Services pattern) ───────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

// ── ToastStack ─────────────────────────────────────────────────────────────────
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

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MinecraftPage() {
  const { data: snapshotServers, loading, refresh } = useSnapshot('minecraft');
  const [mutLoading, setMutLoading] = useState<Record<string, boolean>>({});
  const [toasts, setToasts]         = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; description: string; fn: () => void;
  }>({ open: false, title: '', description: '', fn: () => {} });

  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const openConfirm = useCallback((title: string, description: string, fn: () => void) => {
    setConfirmState({ open: true, title, description, fn });
  }, []);

  const handleAction = useCallback(async (id: string, act: 'start' | 'stop' | 'restart') => {
    const key = `${id}_${act}`;
    setMutLoading(l => ({ ...l, [key]: true }));
    try {
      const r = await fetch(`${MC_API}/${id}/${act}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      if (data.ok) {
        toast(`${act.charAt(0).toUpperCase() + act.slice(1)}ed ${id}`);
        // Refresh snapshot after a brief wait for server state to propagate
        setTimeout(refresh, 3000);
      } else {
        toast(data.error || `${act} failed`, false);
      }
    } catch (e) {
      toast(`Request failed: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setMutLoading(l => { const n = { ...l }; delete n[key]; return n; });
    }
  }, [toast, refresh]);

  // Build server list from snapshot (or empty)
  const serverList = snapshotServers ? Object.values(snapshotServers) : [];
  const apiDown = !loading && serverList.length === 0 && snapshotServers === null;

  // Status summary counts
  const counts = { running: 0, starting: 0, stopped: 0 };
  serverList.forEach(s => { if (s.status in counts) counts[s.status as keyof typeof counts]++; });

  return (
    <div style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <ToastStack toasts={toasts} />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel="Confirm"
        onConfirm={confirmState.fn}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
        destructive={false}
      />

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--raised)', boxShadow: 'var(--shadow-ring)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Server size={17} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1 }}>
              Minecraft
            </h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, letterSpacing: '0.02em' }}>
              Server 1 · 192.168.50.10
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Connectivity indicator */}
          {apiDown
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--err)', fontWeight: 600 }}>
                <WifiOff size={13} /> Offline
              </span>
            : serverList.length > 0
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>
                  <Wifi size={13} /> Connected
                </span>
              : null
          }
          {/* Refresh button */}
          <button
            onClick={refresh}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--raised)', border: 'none', fontSize: 11, fontWeight: 500, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-ring)', transition: 'color 150ms, background 150ms', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t1)'; (e.currentTarget as HTMLElement).style.background = 'var(--raised-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; (e.currentTarget as HTMLElement).style.background = 'var(--raised)'; }}
          >
            <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── API offline state ── */}
      {apiDown ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', background: 'var(--raised)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-card)' }}>
          <WifiOff size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3, color: 'var(--t3)' }} />
          <div style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 500, marginBottom: 6 }}>mc_manager API unreachable</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Make sure mc_manager.py is running on Server 1 (port 8765)</div>
        </div>
      ) : loading && serverList.length === 0 ? (
        /* ── Loading skeleton ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: 'var(--raised)', borderRadius: 'var(--r-md)', height: 220, boxShadow: 'var(--shadow-card)', opacity: 0.5 }} />
          ))}
        </div>
      ) : (
        /* ── Server cards ── */
        <>
          <SectionLabel>Servers ({serverList.length})</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: 14,
            }}
          >
            {serverList.map(srv => (
              <div key={srv.id} style={{ minWidth: 0 }}>
                <ServerCard
                  srv={srv}
                  onAction={handleAction}
                  loading={mutLoading}
                  onConfirm={openConfirm}
                  apiBase={MC_API}
                />
              </div>
            ))}
          </div>

          {/* ── Status summary footer ── */}
          {serverList.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 20, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              {counts.running > 0  && <span style={{ fontSize: 11, color: 'var(--ok)',   fontWeight: 600 }}>{counts.running} running</span>}
              {counts.starting > 0 && <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600 }}>{counts.starting} starting</span>}
              {counts.stopped > 0  && <span style={{ fontSize: 11, color: 'var(--t3)',   fontWeight: 600 }}>{counts.stopped} stopped</span>}
              <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>
                Snapshot cadence · 5s LAN / 20s WAN
              </span>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
