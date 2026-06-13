/**
 * TriggerCard — one card per manual trigger with run/abort buttons,
 * live elapsed timer, and output log display.
 */
import { Play, Square, CheckCircle, XCircle, Loader } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TriggerJob } from './types';
import { elapsed } from './utils';

interface TriggerDef {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

interface TriggerCardProps {
  trig: TriggerDef;
  job: TriggerJob | undefined;
  loading: Record<string, boolean>;
  now: number;
  onFire: (id: string) => void;
  onAbort: (id: string) => void;
}

export function TriggerCard({ trig, job, loading, now, onFire, onAbort }: TriggerCardProps) {
  const Icon = trig.icon;
  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';
  const isAborted = job?.status === 'aborted';

  const jobStatusColor =
    isError ? 'var(--err)'
    : isDone ? 'var(--ok)'
    : isAborted ? 'var(--warn)'
    : 'var(--accent)';

  const jobStatusText = job
    ? isRunning ? `Running… ${elapsed(now - job.startedAt)}`
      : isDone ? `Done in ${elapsed((job.finishedAt ?? now) - job.startedAt)}`
      : isAborted ? 'Aborted'
      : `Error after ${elapsed((job.finishedAt ?? now) - job.startedAt)}`
    : '';

  const baseBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 14px',
    minHeight: 40,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    transition: 'background 120ms',
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: 'var(--shadow-ring), var(--shadow-card)',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {trig.label}
        </span>
        {isRunning && (
          <Loader size={12} style={{ color: 'var(--accent)', marginLeft: 'auto', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
        )}
        {isDone && (
          <CheckCircle size={12} style={{ color: 'var(--ok)', marginLeft: 'auto', flexShrink: 0 }} />
        )}
        {isError && (
          <XCircle size={12} style={{ color: 'var(--err)', marginLeft: 'auto', flexShrink: 0 }} />
        )}
        {isAborted && (
          <XCircle size={12} style={{ color: 'var(--warn)', marginLeft: 'auto', flexShrink: 0 }} />
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>{trig.desc}</div>

      {/* Job status block */}
      {job && (
        <div
          style={{
            background: 'var(--canvas)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            boxShadow: `0 0 0 1px ${isError ? 'rgba(239,68,68,0.2)' : isDone ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'}`,
          }}
        >
          <div style={{ marginBottom: job.output ? 6 : 0 }}>
            <span style={{ color: jobStatusColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {jobStatusText}
            </span>
          </div>
          {job.output && (
            <pre
              style={{
                margin: 0,
                color: 'var(--t2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 80,
                overflow: 'hidden',
                fontSize: 10,
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              {job.output}
            </pre>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          style={{
            ...baseBtn,
            flex: 1,
            background: isRunning ? 'var(--raised)' : 'var(--accent-dim)',
            color: isRunning ? 'var(--t3)' : 'var(--accent)',
            boxShadow: isRunning ? 'var(--shadow-ring)' : '0 0 0 1px var(--accent-border)',
          }}
          disabled={loading[`trigger-${trig.id}`] || isRunning}
          onClick={() => onFire(trig.id)}
          onMouseEnter={e => { if (!isRunning && !loading[`trigger-${trig.id}`]) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isRunning ? 'var(--raised)' : 'var(--accent-dim)'; }}
        >
          <Play size={12} style={{ flexShrink: 0 }} />
          {isRunning ? 'Running…' : 'Run now'}
        </button>

        {isRunning && (
          <button
            style={{
              ...baseBtn,
              background: 'rgba(239,68,68,0.12)',
              boxShadow: '0 0 0 1px rgba(239,68,68,0.3)',
              color: 'var(--err)',
            }}
            disabled={loading[`abort-${trig.id}`]}
            onClick={() => onAbort(trig.id)}
            onMouseEnter={e => { if (!loading[`abort-${trig.id}`]) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; }}
          >
            <Square size={12} style={{ flexShrink: 0 }} /> Abort
          </button>
        )}
      </div>
    </div>
  );
}
