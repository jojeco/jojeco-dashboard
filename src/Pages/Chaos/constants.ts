import type { SvcStatus } from './types';

export const STATUS_COLOR: Record<SvcStatus | 'unknown', string> = {
  healthy:  'var(--ok)',
  degraded: 'var(--warn)',
  down:     'var(--err)',
  unknown:  'var(--t3)',
};

export const STATUS_DIM: Record<SvcStatus | 'unknown', string> = {
  healthy:  'rgba(34,197,94,0.12)',
  degraded: 'rgba(234,179,8,0.18)',
  down:     'rgba(239,68,68,0.18)',
  unknown:  'var(--line)',
};

export const LOG_COLOR: Record<'info' | 'warn' | 'crit' | 'ok', string> = {
  info: 'var(--t2)',
  warn: 'var(--warn)',
  crit: 'var(--err)',
  ok:   'var(--ok)',
};

export const CATEGORY_ORDER = ['Core', 'Media', 'Storage', 'AI', 'Monitoring', 'Comms'];

export const MODULE_DESC: Record<string, string> = {
  'redis-probe': 'Scan Redis instances for auth vulnerabilities',
  'port-scan':   'Scan host/CIDR for sensitive exposed ports',
  'dep-kill':    'Stop a Docker container to test dependency resilience',
};

export function fmt(n: number | null) {
  if (n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

export function nowTs() { return new Date().toISOString().split('T')[1].slice(0, 12); }
