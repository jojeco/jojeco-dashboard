/**
 * RealControls — chaos agent control panel (real mode).
 * Requires ConfirmDialog before RUN or ABORT — both are destructive.
 */
import type { AgentStatus } from './types';
import { MODULE_DESC } from './constants';

interface RealControlsProps {
  agentStatus: AgentStatus | null;
  agentOnline: boolean;
  running: boolean;
  module: string;
  target: string;
  dryRun: boolean;
  onModuleChange: (m: string) => void;
  onTargetChange: (t: string) => void;
  onDryRunChange: (v: boolean) => void;
  onRun: () => void;
  onAbort: () => void;
}

function btnStyle(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg, color,
    border: `1px solid ${border ?? 'var(--line)'}`,
    padding: '8px 16px', borderRadius: 'var(--r-sm)', fontSize: 10,
    cursor: 'pointer', letterSpacing: '0.08em',
    fontFamily: "'Geist Mono', monospace", fontWeight: 600,
    minHeight: 40,
    transition: 'background 0.2s',
  };
}

export function RealControls({
  agentStatus, agentOnline, running,
  module, target, dryRun,
  onModuleChange, onTargetChange, onDryRunChange,
  onRun, onAbort,
}: RealControlsProps) {
  const modules = agentStatus?.modules ?? ['redis-probe', 'port-scan', 'dep-kill'];

  const chipBase: React.CSSProperties = {
    padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
    letterSpacing: '0.04em', border: '1px solid var(--line)',
    cursor: 'pointer', fontFamily: 'inherit', background: 'var(--raised)',
    color: 'var(--t3)', transition: 'all 120ms',
  };

  return (
    <div
      style={{
        background: 'var(--raised)',
        borderRadius: 'var(--r-md)',
        padding: '16px 18px',
        boxShadow: agentOnline
          ? 'inset 0 0 0 1px rgba(239,68,68,0.20), var(--shadow-card)'
          : 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          CHAOS AGENT
        </span>
        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', background: agentOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: agentOnline ? 'var(--ok)' : 'var(--err)', border: `1px solid ${agentOnline ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {agentOnline ? '● ONLINE' : '● OFFLINE'}
        </span>
        {agentOnline && (
          <span style={{ fontSize: 9, color: 'var(--t3)' }}>{modules.length} modules available</span>
        )}
      </div>

      {!agentOnline && (
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          Agent unreachable — check jojeco-chaos-agent container
        </div>
      )}

      {agentOnline && (
        <>
          {/* Module selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>MODULE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modules.map(m => (
                <button
                  key={m}
                  onClick={() => onModuleChange(m)}
                  style={{
                    ...chipBase,
                    background: module === m ? 'rgba(239,68,68,0.12)' : 'var(--raised)',
                    color: module === m ? 'var(--err)' : 'var(--t3)',
                    border: `1px solid ${module === m ? 'rgba(239,68,68,0.35)' : 'var(--line)'}`,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            {module && (
              <div style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>
                {MODULE_DESC[module] ?? ''}
              </div>
            )}
          </div>

          {/* Target input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              TARGET{' '}
              <span style={{ color: 'var(--t3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {module === 'redis-probe' ? '(host:port or blank for auto-scan)' :
                 module === 'port-scan'   ? '(IP or CIDR, e.g. 192.168.50.0/24)' :
                 module === 'dep-kill'    ? '(container name, e.g. nextcloud)' : ''}
              </span>
            </div>
            <input
              type="text"
              value={target}
              onChange={e => onTargetChange(e.target.value)}
              placeholder={
                module === 'redis-probe' ? 'leave blank to auto-scan' :
                module === 'port-scan'   ? '192.168.50.0/24' :
                module === 'dep-kill'    ? 'container-name' : 'target'
              }
              style={{
                background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
                color: 'var(--t2)', fontSize: 11, padding: '8px 12px',
                fontFamily: "'Geist Mono', monospace", outline: 'none',
                width: '100%', boxSizing: 'border-box',
                transition: 'border-color 120ms',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
            />
          </div>

          {/* Dry run toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => onDryRunChange(!dryRun)}
              style={{
                ...chipBase,
                background: dryRun ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                color: dryRun ? 'var(--ok)' : 'var(--err)',
                border: `1px solid ${dryRun ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                minWidth: 100,
              }}
            >
              {dryRun ? '✓ DRY RUN' : '⚠ LIVE RUN'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>
              {dryRun ? 'Safe — scan only, no destructive actions' : 'LIVE — will execute destructive actions if applicable'}
            </span>
          </div>

          {/* Run / Abort */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={onRun}
              disabled={running || !module}
              style={btnStyle(
                running || !module ? 'var(--raised)' : 'rgba(239,68,68,0.15)',
                running || !module ? 'var(--t3)'     : 'var(--err)',
                running || !module ? 'var(--line)'   : 'rgba(239,68,68,0.35)',
              )}
            >
              {running ? 'RUNNING...' : `RUN ${module.toUpperCase()}`}
            </button>
            {running && (
              <button onClick={onAbort} style={btnStyle('rgba(234,179,8,0.12)', 'var(--warn)', 'rgba(234,179,8,0.35)')}>
                ■ ABORT
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
