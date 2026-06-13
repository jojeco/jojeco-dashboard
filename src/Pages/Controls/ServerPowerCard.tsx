/**
 * ServerPowerCard — one card per server with online status,
 * restart/shutdown/WoL buttons, and Claude process controls.
 *
 * Destructive actions (shutdown, S2 restart, claude stop) trigger
 * the ConfirmDialog before firing.
 */
import { Power, RotateCcw, Wifi, Bot, Square } from 'lucide-react';

interface ServerDef {
  id: string;
  label: string;
  sub: string;
  canWake: boolean;
  warnRestart: boolean;
  hasClaude: boolean;
  claudeLocal?: boolean;
}

interface ServerPowerCardProps {
  srv: ServerDef;
  online: boolean | undefined;
  statusKnown: boolean;
  loading: Record<string, boolean>;
  onRestart: (srv: ServerDef) => void;
  onShutdown: (srv: ServerDef) => void;
  onWake: (id: string) => void;
  onClaudeStop: (id: string) => void;
  onClaudeRestart: (id: string) => void;
}

export function ServerPowerCard({
  srv,
  online,
  statusKnown,
  loading,
  onRestart,
  onShutdown,
  onWake,
  onClaudeStop,
  onClaudeRestart,
}: ServerPowerCardProps) {
  const baseBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '9px 12px',
    minHeight: 40,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    background: 'var(--raised)',
    border: 'none',
    color: 'var(--t2)',
    transition: 'background 120ms, color 120ms',
    boxShadow: 'var(--shadow-ring)',
  };

  const isRestartLoading = loading[`restart-${srv.id}`];
  const isShutdownLoading = loading[`shutdown-${srv.id}`];
  const isWakeLoading = loading[`wake-${srv.id}`];
  const isClaudeStopLoading = loading[`claude-${srv.id}-stop`];
  const isClaudeRestartLoading = loading[`claude-${srv.id}-restart`];

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-ring), var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {statusKnown && (
          <span
            className={`j-dot ${online ? 'j-dot-ok' : 'j-dot-err'}`}
            style={online ? { animation: 'pulseDot 2.5s ease-in-out infinite' } : {}}
          />
        )}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {srv.label}
        </span>
        {statusKnown && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: online ? 'var(--ok)' : 'var(--err)',
              marginLeft: 'auto',
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}
          >
            {online ? 'online' : 'offline'}
          </span>
        )}
      </div>

      {/* Sub-label */}
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.4, paddingLeft: statusKnown ? 15 : 0 }}>
        {srv.sub}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Restart + Shutdown (not shown for claudeLocal = CT100) */}
        {!srv.claudeLocal && (
          <>
            <button
              style={{ ...baseBtn }}
              disabled={isRestartLoading}
              onClick={() => onRestart(srv)}
              onMouseEnter={e => { if (!isRestartLoading) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
            >
              <RotateCcw size={13} style={{ flexShrink: 0 }} />
              {isRestartLoading ? 'Restarting…' : 'Restart'}
            </button>

            <button
              style={{ ...baseBtn, color: 'var(--err)', background: 'rgba(239,68,68,0.08)', boxShadow: '0 0 0 1px rgba(239,68,68,0.15)' }}
              disabled={isShutdownLoading}
              onClick={() => onShutdown(srv)}
              onMouseEnter={e => { if (!isShutdownLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
            >
              <Power size={13} style={{ flexShrink: 0 }} />
              {isShutdownLoading ? 'Shutting down…' : 'Shutdown'}
            </button>
          </>
        )}

        {/* Wake on LAN */}
        {srv.canWake && (
          <button
            style={{ ...baseBtn, color: 'var(--accent)', background: 'var(--accent-dim)', boxShadow: '0 0 0 1px var(--accent-border)' }}
            disabled={isWakeLoading}
            onClick={() => onWake(srv.id)}
            onMouseEnter={e => { if (!isWakeLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)'; }}
          >
            <Wifi size={13} style={{ flexShrink: 0 }} />
            {isWakeLoading ? 'Waking…' : 'Wake'}
          </button>
        )}

        {/* Claude controls */}
        {srv.hasClaude && (
          <div style={{ display: 'flex', gap: 6, marginTop: srv.claudeLocal ? 0 : 4 }}>
            <button
              style={{
                ...baseBtn,
                width: undefined,
                flex: 1,
                fontSize: 11,
                color: 'var(--err)',
                background: 'rgba(239,68,68,0.08)',
                boxShadow: '0 0 0 1px rgba(239,68,68,0.15)',
              }}
              disabled={isClaudeStopLoading}
              onClick={() => onClaudeStop(srv.id)}
              onMouseEnter={e => { if (!isClaudeStopLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
            >
              <Square size={11} style={{ flexShrink: 0 }} />
              {isClaudeStopLoading ? '…' : 'Stop Claude'}
            </button>

            <button
              style={{
                ...baseBtn,
                width: undefined,
                flex: 1,
                fontSize: 11,
                color: 'var(--ok)',
                background: 'rgba(34,197,94,0.08)',
                boxShadow: '0 0 0 1px rgba(34,197,94,0.15)',
              }}
              disabled={isClaudeRestartLoading}
              onClick={() => onClaudeRestart(srv.id)}
              onMouseEnter={e => { if (!isClaudeRestartLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.08)'; }}
            >
              <Bot size={11} style={{ flexShrink: 0 }} />
              {isClaudeRestartLoading ? '…' : 'Restart Claude'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
