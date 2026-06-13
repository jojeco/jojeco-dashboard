/**
 * AutomationJobRow — one row per automation job showing status, schedule,
 * last-run time, and last log lines.
 */
import { CheckCircle, XCircle, AlertTriangle, Clock, Loader } from 'lucide-react';
import type { AutomationJob } from './types';
import { relativeTime } from './utils';

interface AutomationJobRowProps {
  job: AutomationJob;
  isRunning: boolean;
}

export function AutomationJobRow({ job, isRunning }: AutomationJobRowProps) {
  const statusColor =
    isRunning ? 'var(--accent)'
    : job.healthy ? 'var(--ok)'
    : job.status === 'unknown' ? 'var(--t3)'
    : job.status === 'stale' ? 'var(--warn)'
    : 'var(--err)';

  const statusLabel =
    isRunning ? 'running'
    : job.status === 'ok' ? 'healthy'
    : job.status === 'stale' ? 'stale'
    : job.status === 'error' ? 'error'
    : 'unknown';

  const StatusIcon =
    isRunning ? Loader
    : job.healthy ? CheckCircle
    : job.status === 'unknown' ? AlertTriangle
    : job.status === 'stale' ? Clock
    : XCircle;

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-sm)',
        padding: '12px 16px',
        boxShadow: 'var(--shadow-ring)',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <StatusIcon
          size={14}
          style={{
            color: statusColor,
            flexShrink: 0,
            ...(isRunning ? { animation: 'spin 1s linear infinite' } : {}),
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.label}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: statusColor,
            background: `${statusColor}18`,
            borderRadius: 4,
            padding: '2px 8px',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 11, color: 'var(--t3)', marginBottom: job.lastLines.length ? 8 : 0 }}>
        <span>
          <span style={{ color: 'var(--t2)' }}>Schedule: </span>
          {job.schedule}
        </span>
        <span>
          <span style={{ color: 'var(--t2)' }}>Last run: </span>
          {relativeTime(job.lastRunTs)}
        </span>
        {job.lastRun && (
          <span style={{ color: 'var(--t3)' }}>{new Date(job.lastRun).toLocaleString()}</span>
        )}
      </div>

      {/* Log snippet */}
      {job.lastLines.length > 0 && (
        <pre
          style={{
            margin: 0,
            fontSize: 10,
            color: 'var(--t3)',
            fontFamily: "'Geist Mono', monospace",
            background: 'var(--canvas)',
            borderRadius: 4,
            padding: '6px 8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 60,
            overflow: 'hidden',
          }}
        >
          {job.lastLines.join('\n')}
        </pre>
      )}
    </div>
  );
}
