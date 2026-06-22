/**
 * AlertCenter — in-dashboard ntfy alert feed.
 *
 * Two surfaces:
 *  1. Bell icon in the header/nav (desktop: icon-nav; mobile: mobile-header)
 *     → click → dropdown panel (most recent 6 alerts, auto-dismiss on outside click)
 *  2. /alerts full-page view (via AlertsPage route) showing 50 alerts with
 *     priority filter + time display.
 *
 * Data: reads from SnapshotProvider `alerts` section (SSE push, 30s TTL).
 * No extra fetching — piggybacks the existing stream.
 *
 * Priority → color mapping (matches ntfy priority scale):
 *   5 = max  → err (red)
 *   4 = high → warn (amber)
 *   3 = default → accent (teal)
 *   2 = low → t2 (muted)
 *   1 = min → t3 (very muted)
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, Info, ChevronRight, Wifi } from 'lucide-react';
import { useSnapshot, type NtfyAlert } from '@/hooks/useSnapshot';
import { useNavigate } from 'react-router-dom';

// ─── Priority helpers ─────────────────────────────────────────────────────────

function priorityColor(p: number): string {
  if (p >= 5) return 'var(--err)';
  if (p >= 4) return 'var(--warn)';
  if (p >= 3) return 'var(--accent)';
  if (p >= 2) return 'var(--t2)';
  return 'var(--t3)';
}

function priorityBgDim(p: number): string {
  if (p >= 5) return 'var(--err-dim)';
  if (p >= 4) return 'var(--warn-dim)';
  if (p >= 3) return 'var(--accent-dim)';
  return 'transparent';
}

function priorityBorder(p: number): string {
  if (p >= 5) return 'rgba(239,68,68,0.20)';
  if (p >= 4) return 'rgba(234,179,8,0.20)';
  if (p >= 3) return 'rgba(20,184,166,0.20)';
  return 'var(--line)';
}

function priorityLabel(p: number): string {
  if (p >= 5) return 'MAX';
  if (p >= 4) return 'HIGH';
  if (p >= 3) return 'MED';
  if (p >= 2) return 'LOW';
  return 'MIN';
}

function priorityIcon(p: number) {
  if (p >= 4) return <AlertTriangle size={11} />;
  return <Info size={11} />;
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function timeAgo(unixSec: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixSec;
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ─── Single alert row ─────────────────────────────────────────────────────────

function AlertRow({ alert, compact = false }: { alert: NtfyAlert; compact?: boolean }) {
  const color  = priorityColor(alert.priority);
  const bg     = priorityBgDim(alert.priority);
  const border = priorityBorder(alert.priority);

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: compact ? '8px 12px' : '10px 14px',
      background: bg,
      borderRadius: 8,
      border: `1px solid ${border}`,
      minWidth: 0,
    }}>
      {/* Priority stripe */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color,
          background: 'none',
          textTransform: 'uppercase',
          minWidth: 28,
        }}>
          {priorityIcon(alert.priority)}
          {priorityLabel(alert.priority)}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {alert.title && (
          <div style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            color: 'var(--t1)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {alert.title}
          </div>
        )}
        <div style={{
          fontSize: compact ? 11 : 12,
          color: 'var(--t2)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: compact ? 2 : 3,
          WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}>
          {alert.message}
        </div>
        {alert.tags.length > 0 && !compact && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {alert.tags.map(t => (
              <span key={t} style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                padding: '1px 6px', borderRadius: 99,
                background: 'var(--raised)', color: 'var(--t3)',
                border: '1px solid var(--line)',
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Time */}
      <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--t3)', alignSelf: 'flex-start', paddingTop: 1 }}>
        {timeAgo(alert.time)}
      </div>
    </div>
  );
}

// ─── Bell button (used in both IconNav and MobileHeader) ─────────────────────

export function AlertBell({ isMobile = false }: { isMobile?: boolean }) {
  const { data } = useSnapshot();
  const alerts = data?.alerts ?? [];
  const unread = alerts.filter(a => a.priority >= 4).length; // high+ as "unread"
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const preview = alerts.slice(0, 6);

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="j-icon-btn"
        data-label="Alerts"
        style={{
          position: 'relative',
          color: open ? 'var(--accent)' : undefined,
          background: open ? 'var(--accent-dim)' : undefined,
        }}
        aria-label="Alert Center"
      >
        <Bell size={isMobile ? 17 : 16} />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: 4, right: 4,
            width: 8, height: 8,
            borderRadius: '50%',
            background: 'var(--err)',
            boxShadow: '0 0 0 2px var(--canvas)',
            animation: 'livePulse 2s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'fixed',
          ...(isMobile ? {
            top: 58,
            left: 8,
            right: 8,
          } : {
            top: 0,
            left: 'calc(var(--nav-w) + 8px)',
          }),
          zIndex: 200,
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card), 0 0 0 1px rgba(255,255,255,0.06)',
          width: isMobile ? undefined : 340,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--t1)' }}>
                Alert Center
              </span>
              {alerts.length > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 99,
                  background: 'var(--raised-2)', color: 'var(--t3)',
                }}>{alerts.length}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => { setOpen(false); navigate('/alerts'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                }}
              >
                View all <ChevronRight size={12} />
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 2, display: 'flex' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {preview.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
                <Wifi size={20} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                No recent alerts
              </div>
            ) : (
              preview.map(a => <AlertRow key={a.id} alert={a} compact />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Full alerts page ─────────────────────────────────────────────────────────

const PRIORITY_FILTERS = [
  { label: 'All',  min: 0 },
  { label: 'High+', min: 4 },
  { label: 'Med+',  min: 3 },
] as const;

export function AlertsPage() {
  const { data, loading } = useSnapshot();
  const alerts = data?.alerts ?? [];
  const [minPriority, setMinPriority] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Refresh timeAgo labels every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = alerts.filter(a => a.priority >= minPriority);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em', marginBottom: 2 }}>
              Alert Center
            </h1>
            <p style={{ fontSize: 12, color: 'var(--t3)' }}>
              Last 48h of ntfy lab alerts — live via SSE stream
            </p>
          </div>

          {/* Priority filter pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PRIORITY_FILTERS.map(f => (
              <button
                key={f.label}
                onClick={() => setMinPriority(f.min)}
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  padding: '4px 10px', borderRadius: 99,
                  background: minPriority === f.min ? 'var(--accent)' : 'var(--raised)',
                  color: minPriority === f.min ? '#000' : 'var(--t2)',
                  border: 'none', cursor: 'pointer',
                  transition: 'background 150ms, color 150ms',
                }}
              >{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts list */}
      {loading && alerts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          Loading alerts…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-ring)',
        }}>
          <Bell size={28} style={{ color: 'var(--t3)', margin: '0 auto 10px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>No alerts</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {minPriority > 0 ? 'No alerts at this priority level.' : 'No alerts in the last 48 hours.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Priority group headers */}
          {filtered.map((alert, i) => {
            const showGroupHeader = i === 0 || filtered[i - 1].priority !== alert.priority;
            return (
              <div key={alert.id}>
                {showGroupHeader && i > 0 && (
                  <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                )}
                <AlertRow alert={alert} />
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
          Showing {filtered.length} of {alerts.length} alerts · refreshes automatically via SSE
        </div>
      )}
    </div>
  );
}
