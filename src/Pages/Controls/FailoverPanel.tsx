/**
 * FailoverPanel — S2→S3 failover status and controls.
 * Activate and Deactivate require confirmation (passed as handlers that
 * wire up the ConfirmDialog in the parent).
 */
import { Activity, Zap, ZapOff, RotateCw, RefreshCw, Loader } from 'lucide-react';
import type { FailoverStatus } from './types';

interface FailoverPanelProps {
  failover: FailoverStatus | null;
  failoverOutput: string | null;
  loading: Record<string, boolean>;
  onActivate: () => void;    // parent wires confirm dialog
  onDeactivate: () => void;  // parent wires confirm dialog
  onSync: () => void;
  onRefresh: () => void;
}

export function FailoverPanel({
  failover,
  failoverOutput,
  loading,
  onActivate,
  onDeactivate,
  onSync,
  onRefresh,
}: FailoverPanelProps) {
  const baseBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 14px',
    minHeight: 40,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'var(--raised)',
    color: 'var(--t2)',
    boxShadow: 'var(--shadow-ring)',
    transition: 'background 120ms, color 120ms',
    flexShrink: 0,
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r)',
        padding: '16px 18px',
        boxShadow: 'var(--shadow-ring), var(--shadow-card)',
      }}
    >
      {/* Status row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px 16px',
          marginBottom: 12,
        }}
      >
        {/* S2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`j-dot ${failover === null ? '' : failover.s2_online ? 'j-dot-ok' : 'j-dot-err'}`} />
          <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>S2</span>
          <span style={{ fontSize: 11, color: failover === null ? 'var(--t3)' : failover.s2_online ? 'var(--ok)' : 'var(--err)' }}>
            {failover === null ? '…' : failover.s2_online ? 'online' : 'offline'}
          </span>
        </div>

        <span style={{ color: 'var(--t3)', fontSize: 12, flexShrink: 0 }}>→</span>

        {/* S3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`j-dot ${failover === null ? '' : failover.s3_online ? 'j-dot-ok' : 'j-dot-err'}`} />
          <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>S3</span>
          <span style={{ fontSize: 11, color: failover === null ? 'var(--t3)' : failover.s3_online ? 'var(--ok)' : 'var(--err)' }}>
            {failover === null ? '…' : failover.s3_online ? 'online' : 'offline'}
          </span>
        </div>

        {/* Watchdog */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Activity
            size={12}
            style={{ color: failover?.watchdog_status === 'active' ? 'var(--ok)' : 'var(--t3)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Watchdog:</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              borderRadius: 4,
              padding: '2px 7px',
              background: failover?.watchdog_status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,100,100,0.15)',
              color: failover?.watchdog_status === 'active' ? 'var(--ok)' : 'var(--t3)',
            }}
          >
            {failover?.watchdog_status ?? '…'}
          </span>
        </div>

        {/* Active/Normal badge */}
        {failover?.failover_active ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(245,158,11,0.15)',
              boxShadow: '0 0 0 1px rgba(245,158,11,0.4)',
              borderRadius: 6,
              padding: '3px 10px',
            }}
          >
            <Zap size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.02em' }}>
              FAILOVER ACTIVE
            </span>
          </div>
        ) : failover !== null ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(34,197,94,0.08)',
              boxShadow: '0 0 0 1px rgba(34,197,94,0.2)',
              borderRadius: 6,
              padding: '3px 10px',
            }}
          >
            <ZapOff size={12} style={{ color: 'var(--ok)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)' }}>Normal</span>
          </div>
        ) : null}
      </div>

      {/* Last sync */}
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
        <span style={{ color: 'var(--t2)' }}>Last volume sync:</span>{' '}
        {failover?.last_sync ?? 'No sync log found'}
      </div>

      {/* Output box */}
      {failoverOutput !== null && (
        <pre
          style={{
            margin: '0 0 14px',
            fontSize: 10,
            color: 'var(--t2)',
            fontFamily: "'Geist Mono', monospace",
            background: 'var(--canvas)',
            borderRadius: 4,
            padding: '8px 10px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 120,
            overflow: 'auto',
            boxShadow: 'var(--shadow-ring)',
          }}
        >
          {failoverOutput || '(no output)'}
        </pre>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          style={{
            ...baseBtn,
            background: 'rgba(239,68,68,0.1)',
            boxShadow: '0 0 0 1px rgba(239,68,68,0.3)',
            color: 'var(--err)',
          }}
          disabled={loading['fo-activate']}
          onClick={onActivate}
          onMouseEnter={e => { if (!loading['fo-activate']) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
        >
          {loading['fo-activate']
            ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <Zap size={12} style={{ flexShrink: 0 }} />
          }
          {loading['fo-activate'] ? 'Activating…' : 'Activate Failover'}
        </button>

        {failover?.failover_active && (
          <button
            style={{
              ...baseBtn,
              color: 'var(--ok)',
              background: 'rgba(34,197,94,0.08)',
              boxShadow: '0 0 0 1px rgba(34,197,94,0.2)',
            }}
            disabled={loading['fo-deactivate']}
            onClick={onDeactivate}
            onMouseEnter={e => { if (!loading['fo-deactivate']) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.08)'; }}
          >
            {loading['fo-deactivate']
              ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <ZapOff size={12} style={{ flexShrink: 0 }} />
            }
            {loading['fo-deactivate'] ? 'Deactivating…' : 'Deactivate Failover'}
          </button>
        )}

        <button
          style={baseBtn}
          disabled={loading['fo-sync']}
          onClick={onSync}
          onMouseEnter={e => { if (!loading['fo-sync']) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
        >
          {loading['fo-sync']
            ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <RotateCw size={12} style={{ flexShrink: 0 }} />
          }
          {loading['fo-sync'] ? 'Starting…' : 'Sync Volumes Now'}
        </button>

        <button
          style={{ ...baseBtn, marginLeft: 'auto' }}
          onClick={onRefresh}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
        >
          <RefreshCw size={11} style={{ flexShrink: 0 }} /> Refresh
        </button>
      </div>
    </div>
  );
}
