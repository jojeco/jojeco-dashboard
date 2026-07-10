/**
 * AlertHistoryModal — 48h ntfy alert history.
 * DESIGN.md: bottom-sheet mobile, mid-screen desktop (via DetailModal).
 * Relative timestamps (Mono), priority-based status dot, grouped consecutive
 * identical messages ("×3"), empty state one-liner.
 */
import { useState, useEffect, useCallback } from 'react';
import { DetailModal } from './DetailModal';
import { Mono, Skeleton, StatusDot } from './Primitives';
import { getToken } from '../../services/api';
import type { NtfyAlert } from '../../hooks/useSnapshot';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') as string;

// ── Priority → status level mapping ──────────────────────────────────────────
// ntfy priorities: 1=min, 2=low, 3=default, 4=high, 5=urgent
type StatusLevel = 'nominal' | 'degraded' | 'fault' | 'standby';

function priorityLevel(p: number): StatusLevel {
  if (p >= 5) return 'fault';
  if (p >= 4) return 'degraded';
  if (p <= 1) return 'standby';
  return 'nominal';
}

function relativeTime(epochSec: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - epochSec;
  if (diffSec < 60)   return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// ── Grouping: collapse consecutive identical messages ─────────────────────────

interface AlertGroup {
  alert: NtfyAlert;
  count: number;
}

function groupAlerts(alerts: NtfyAlert[]): AlertGroup[] {
  const groups: AlertGroup[] = [];
  for (const alert of alerts) {
    const last = groups[groups.length - 1];
    if (last && last.alert.message === alert.message && last.alert.title === alert.title) {
      last.count++;
    } else {
      groups.push({ alert, count: 1 });
    }
  }
  return groups;
}

// ── Fetch hook ────────────────────────────────────────────────────────────────

async function fetchAlertHistory(): Promise<NtfyAlert[] | null> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const r = await fetch(`${API_BASE}/alerts/history?hours=48`, { headers });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data)) return null;
    return data as NtfyAlert[];
  } catch {
    return null;
  }
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertGroupRow({ group }: { group: AlertGroup }) {
  const { alert, count } = group;
  const level = priorityLevel(alert.priority);

  return (
    <div className="flex items-start gap-3 py-2.5 min-w-0">
      {/* Status dot */}
      <div className="shrink-0 mt-0.5">
        <StatusDot level={level} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {alert.title && (
          <div
            className="text-[0.8125rem] font-medium leading-snug mb-0.5 truncate"
            style={{ color: 'var(--v4-signal)' }}
          >
            {alert.title}
          </div>
        )}
        <div
          className="text-[0.75rem] leading-relaxed break-words"
          style={{ color: 'var(--v4-readout)' }}
        >
          {alert.message}
        </div>
      </div>

      {/* Right: time + repeat count */}
      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
        <Mono trace className="text-[0.6875rem] whitespace-nowrap">
          {relativeTime(alert.time)}
        </Mono>
        {count > 1 && (
          <Mono
            className="text-[0.6875rem] font-semibold"
            style={{ color: 'var(--v4-degraded)' }}
          >
            ×{count}
          </Mono>
        )}
      </div>
    </div>
  );
}

// ── Main modal component ──────────────────────────────────────────────────────

interface AlertHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

export function AlertHistoryModal({ open, onClose }: AlertHistoryModalProps) {
  const [alerts,  setAlerts]  = useState<NtfyAlert[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed,  setFailed]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const data = await fetchAlertHistory();
    if (data === null) setFailed(true);
    else setAlerts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && alerts === null && !loading) {
      void load();
    }
  }, [open, alerts, loading, load]);

  const groups = alerts ? groupAlerts(alerts) : [];

  return (
    <DetailModal
      open={open}
      onClose={onClose}
      title="Alert History"
      statusLevel={failed ? 'fault' : alerts === null ? 'standby' : 'nominal'}
      statusLabel={failed ? 'unavailable' : alerts === null ? 'loading' : `${alerts.length} · 48h`}
    >
      <div className="flex flex-col">
        {loading && alerts === null ? (
          /* Shimmer */
          <div className="flex flex-col gap-3 py-2">
            {(['w-1/2', 'w-3/5', 'w-2/3', 'w-1/2', 'w-4/5'] as const).map((w1, i) => {
              const w2s = ['w-3/5', 'w-4/5', 'w-1/2', 'w-3/4', 'w-2/3'] as const;
              const w2 = w2s[i];
              return (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
                <div className="flex-1 flex flex-col gap-1">
                  <Skeleton className={`h-3 ${w1}`} />
                  <Skeleton className={`h-3 ${w2}`} />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
              </div>
            );})}
          </div>
        ) : failed ? (
          <p className="text-[0.8125rem] py-6 text-center" style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}>
            ntfy unreachable — alert history unavailable
          </p>
        ) : groups.length === 0 ? (
          <p className="text-[0.8125rem] py-6 text-center" style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}>
            no alerts in 48h
          </p>
        ) : (
          <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': '1' } as React.CSSProperties}>
            {groups.map((group, i) => (
              <div
                key={`${group.alert.id}-${i}`}
                style={{ borderColor: 'var(--v4-hairline)' }}
              >
                <AlertGroupRow group={group} />
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailModal>
  );
}
