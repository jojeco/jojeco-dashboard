/**
 * AlertBell — bell icon with severity badge for app chrome.
 *
 * Placement:
 *   Desktop: inside DesktopRail, above the LiveIndicator (bottom of rail)
 *   Mobile:  inside MobileHeader, right side between LabStatusSummary and LiveIndicator
 *
 * Severity logic (highest unseen alert wins):
 *   RED   (fault)   — priority ≥ 5 OR tags/message matches urgent|critical|fail|error|down|🔴
 *   AMBER (degraded)— priority == 4 OR tags/message matches warn|warning|degraded|🟡
 *   GREEN (nominal) — everything else
 *
 * "Unseen" = alerts with time > localStorage `v4:alertsSeenAt` (epoch ms).
 * Clicking: opens AlertHistoryModal + stamps `v4:alertsSeenAt = Date.now()`.
 * No badge when no unseen alerts.
 * RED badge pulses via .v4-breathe; AMBER/GREEN are static.
 *
 * Uses the snapshot `alerts` section (SSE-driven, no extra poller).
 */

import { useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { AlertHistoryModal } from './AlertHistoryModal';
import type { NtfyAlert } from '../../hooks/useSnapshot';

// ── Severity classification ───────────────────────────────────────────────────

type Severity = 'fault' | 'degraded' | 'nominal';

const FAULT_RE   = /urgent|critical|fail|error|down/i;
const DEGRADED_RE = /warn|warning|degraded/i;
// Emoji constants avoid regex unicode issues
const FAULT_EMOJI   = '🔴';
const DEGRADED_EMOJI = '🟡';

function classifyAlert(alert: NtfyAlert): Severity {
  if (
    alert.priority >= 5 ||
    FAULT_RE.test(alert.message) ||
    (alert.title && FAULT_RE.test(alert.title)) ||
    alert.tags.some(t => FAULT_RE.test(t) || t === FAULT_EMOJI)
  ) {
    return 'fault';
  }
  if (
    alert.priority === 4 ||
    DEGRADED_RE.test(alert.message) ||
    (alert.title && DEGRADED_RE.test(alert.title)) ||
    alert.tags.some(t => DEGRADED_RE.test(t) || t === DEGRADED_EMOJI)
  ) {
    return 'degraded';
  }
  return 'nominal';
}

const SEVERITY_RANK: Record<Severity, number> = { fault: 2, degraded: 1, nominal: 0 };

function highestSeverity(severities: Severity[]): Severity | null {
  if (severities.length === 0) return null;
  return severities.reduce((a, b) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b));
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = 'v4:alertsSeenAt';

function getSeenAt(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function stampSeenAt(): void {
  try {
    localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {
    // storage unavailable — not fatal
  }
}

// ── Badge color map ───────────────────────────────────────────────────────────

const BADGE_COLOR: Record<Severity, string> = {
  fault:    'var(--v4-fault)',
  degraded: 'var(--v4-degraded)',
  nominal:  'var(--v4-nominal)',
};

// ── AlertBell component ───────────────────────────────────────────────────────

interface AlertBellProps {
  /** 'rail' for desktop left rail (18px icon), 'header' for mobile header (16px icon) */
  placement?: 'rail' | 'header';
}

export function AlertBell({ placement = 'rail' }: AlertBellProps) {
  const { data: alerts } = useSnapshot('alerts');
  const [open, setOpen] = useState(false);

  // Derive unseen severity from snapshot data (SSE-driven, refreshes automatically)
  const seenAt = getSeenAt();
  const unseen = (alerts ?? []).filter(a => a.time * 1000 > seenAt);
  const unread = unseen.length;
  const severity = highestSeverity(unseen.map(classifyAlert));

  const handleOpen = useCallback(() => {
    setOpen(true);
    stampSeenAt();
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const iconSize = placement === 'rail' ? 18 : 16;

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label={
          severity
            ? `${unread} unseen alert${unread === 1 ? '' : 's'} — highest severity: ${severity}`
            : 'View alert history'
        }
        title={
          severity
            ? `${unread} unseen alert${unread === 1 ? '' : 's'}`
            : 'Alert history'
        }
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '0.5rem',
          padding: placement === 'rail' ? '0.5625rem' : '0.375rem',
          color: severity ? 'var(--v4-signal)' : 'var(--v4-trace)',
          transition: 'color 120ms ease',
          // Minimum 44px tap target
          minWidth: 44,
          minHeight: 44,
        }}
        className="v4-tile"
      >
        <Bell size={iconSize} strokeWidth={severity ? 2 : 1.6} />

        {/* Badge — only when there are unseen alerts */}
        {severity && (
          <span
            aria-hidden
            className={severity === 'fault' ? 'v4-breathe' : undefined}
            style={{
              position: 'absolute',
              top: placement === 'rail' ? 6 : 4,
              right: placement === 'rail' ? 6 : 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: BADGE_COLOR[severity],
              boxShadow: `0 0 0 2px var(--v4-console)`,
              // For header placement, ring color matches header bg
              ...(placement === 'header' ? { boxShadow: '0 0 0 2px var(--v4-raised)' } : {}),
            }}
          />
        )}

        {/* Count chip — show when ≥2 unseen to give a quantity sense */}
        {severity && unread >= 2 && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: placement === 'rail' ? 3 : 1,
              right: placement === 'rail' ? 3 : 1,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: BADGE_COLOR[severity],
              color: 'var(--v4-void)',
              fontSize: '0.5625rem',
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingInline: 3,
              boxShadow: placement === 'header'
                ? '0 0 0 1.5px var(--v4-raised)'
                : '0 0 0 1.5px var(--v4-console)',
            }}
          >
            {unread > 99 ? '99' : unread}
          </span>
        )}
      </button>

      <AlertHistoryModal open={open} onClose={handleClose} />
    </>
  );
}
