import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format bytes to human readable */
export function fmtBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/** Format percent with 1 decimal */
export function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

/** Format number with fallback dash */
export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

/** Relative time — "4m ago", "2h ago", "just now" */
export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Format ISO date string to short display */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = diffMs / 60000;
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    // Same year: show month/day
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Color for a percent value (CPU/RAM/disk) */
export function pctColor(pct: number | null): string {
  if (pct == null) return 'var(--v4-standby)';
  if (pct >= 90) return 'var(--v4-fault)';
  if (pct >= 75) return 'var(--v4-degraded)';
  return 'var(--v4-nominal)';
}

/** Status color from string */
export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'online': case 'running': case 'ok': case 'healthy': case 'success':
      return 'var(--v4-nominal)';
    case 'warning': case 'degraded': case 'stale': case 'partial':
      return 'var(--v4-degraded)';
    case 'offline': case 'failed': case 'down': case 'error': case 'fault':
      return 'var(--v4-fault)';
    default:
      return 'var(--v4-standby)';
  }
}

/** Stripe class from status string */
export function stripeClass(status: string): string {
  switch (status?.toLowerCase()) {
    case 'online': case 'running': case 'ok': case 'healthy': case 'success':
      return 'v4-stripe-nominal';
    case 'warning': case 'degraded': case 'stale': case 'partial':
      return 'v4-stripe-degraded';
    case 'offline': case 'failed': case 'down': case 'error': case 'fault':
      return 'v4-stripe-fault';
    default:
      return 'v4-stripe-standby';
  }
}
