// ─── Media page shared utilities ──────────────────────────────────────────────

import type { Torrent, TorrentTab } from './types';

/** Format bytes to human-readable string. */
export function fmt(b: number, zero = '—') {
  if (!b) return zero;
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

/** Format ETA seconds to human-readable string. */
export function fmtEta(s: number) {
  if (s < 0 || s > 604800) return '∞';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Color for torrent state. */
export function stateColor(s: string): string {
  if (['downloading', 'metaDL', 'allocating'].includes(s)) return 'var(--accent)';
  if (['uploading', 'stalledUP', 'queuedUP', 'forcedUP'].includes(s)) return 'var(--ok)';
  if (s.startsWith('paused')) return 'var(--warn)';
  if (['error', 'missingFiles'].includes(s)) return 'var(--err)';
  return 'var(--t3)';
}

/** Color for progress bar by torrent tab. */
export function barColor(tab: TorrentTab): string {
  if (tab === 'done') return 'var(--ok)';
  if (tab === 'error') return 'var(--err)';
  return 'var(--accent)';
}

/** Map torrent to its tab. */
export function classifyTab(t: Torrent): TorrentTab {
  if (['error', 'missingFiles'].includes(t.state)) return 'error';
  if (['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state) || t.progress >= 1) return 'done';
  return 'active';
}

export const STATE_LABELS: Record<string, string> = {
  downloading: 'Downloading',
  uploading: 'Seeding',
  pausedDL: 'Paused',
  pausedUP: 'Done (seeding paused)',
  stalledDL: 'Stalled',
  stalledUP: 'Seeding (idle)',
  queuedDL: 'Queued',
  checkingDL: 'Checking',
  error: 'Error',
  missingFiles: 'Missing files',
  allocating: 'Allocating',
  metaDL: 'Fetching metadata',
  forcedUP: 'Force seeding',
};

/** Compute relative date label for upcoming items. */
export function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const abs = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diff === 0) return { label: abs, note: 'Today',                   color: 'var(--ok)'    };
  if (diff === 1) return { label: abs, note: 'Tomorrow',               color: 'var(--accent)' };
  if (diff < 0)  return { label: abs, note: `${Math.abs(diff)}d ago`, color: 'var(--t3)'    };
  if (diff < 7)  return { label: abs, note: `in ${diff}d`,            color: 'var(--warn)'   };
  return               { label: abs, note: `in ${diff}d`,            color: 'var(--t3)'    };
}

/** Label/color for Tdarr worker type. */
export function workerTypeLabel(type: string) {
  if (type === 'transcodegpu')   return { label: 'GPU Transcode', color: '#a78bfa' };
  if (type === 'transcodecpu')   return { label: 'CPU Transcode', color: 'var(--warn)' };
  if (type === 'healthcheckgpu') return { label: 'GPU Health',    color: 'var(--accent)' };
  return                                { label: 'CPU Health',    color: 'var(--t3)' };
}
