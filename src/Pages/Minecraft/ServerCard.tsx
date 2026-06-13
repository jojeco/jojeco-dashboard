/**
 * ServerCard — single Minecraft server card.
 *
 * Design rules:
 *  - Surface elevation only (var(--raised) bg, no explicit border)
 *  - Status color only on dot/badge
 *  - minWidth: 0 for overflow safety at 390px
 *  - minHeight 40px buttons
 *  - Confirm dialog before start/stop/restart
 */
import { useState, useCallback } from 'react';
import { Play, Square, RotateCcw, Users, FileText, AlertTriangle, Loader } from 'lucide-react';
import type { McServer } from '@/hooks/useSnapshot';
import { StatusBadge } from './StatusBadge';

interface ServerCardProps {
  srv: McServer;
  onAction: (id: string, act: 'start' | 'stop' | 'restart') => void;
  loading: Record<string, boolean>;
  onConfirm: (title: string, description: string, fn: () => void) => void;
  apiBase: string;
}

export function ServerCard({ srv, onAction, loading, onConfirm, apiBase }: ServerCardProps) {
  const [activeLog, setActiveLog]       = useState<'logs' | 'errors' | null>(null);
  const [logLines, setLogLines]         = useState<string[] | null>(null);
  const [errorLines, setErrorLines]     = useState<string[] | null>(null);
  const [logLoading, setLogLoading]     = useState(false);

  const isLoading = (act: string) => !!loading[`${srv.id}_${act}`];

  const fetchLog = useCallback(async (type: 'logs' | 'errors') => {
    if (activeLog === type) { setActiveLog(null); return; }
    setActiveLog(type);
    setLogLoading(true);
    try {
      const r = await fetch(`${apiBase}/${type}/${srv.id}`, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      if (type === 'logs')   setLogLines(data.logs ?? []);
      else                   setErrorLines(data.errors ?? []);
    } catch {
      if (type === 'logs')   setLogLines(['Failed to fetch logs']);
      else                   setErrorLines(['Failed to fetch errors']);
    } finally {
      setLogLoading(false);
    }
  }, [activeLog, apiBase, srv.id]);

  function handleAction(act: 'start' | 'stop' | 'restart') {
    const labels: Record<string, string> = { start: 'Start', stop: 'Stop', restart: 'Restart' };
    const descs: Record<string, string> = {
      start:   `Start server "${srv.name}"?`,
      stop:    `Stop server "${srv.name}"? Players will be disconnected.`,
      restart: `Restart server "${srv.name}"? Players will be briefly disconnected.`,
    };
    onConfirm(
      `${labels[act]} ${srv.name}`,
      descs[act],
      () => onAction(srv.id, act),
    );
  }

  /* ── button helpers ── */
  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    flex: 1, minWidth: 0,
    padding: '8px 6px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--raised)',
    boxShadow: 'var(--shadow-ring)',
    color: 'var(--t2)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    minHeight: 40,
    transition: 'background 120ms, color 120ms',
  };

  const canStart   = srv.status === 'stopped';
  const canStop    = srv.status !== 'stopped';
  const canRestart = srv.status !== 'stopped';

  const displayLines = activeLog === 'logs' ? logLines : errorLines;

  return (
    <div
      style={{
        background: 'var(--raised)',
        borderRadius: 'var(--r-md)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* ── Card header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {srv.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>
            :{srv.port}
          </div>
        </div>
        <StatusBadge status={srv.status} />
      </div>

      {/* ── Players ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t3)', borderTop: '1px solid var(--line)', paddingTop: 10, minWidth: 0, overflow: 'hidden' }}>
        <Users size={13} style={{ flexShrink: 0, color: srv.players && srv.players.length > 0 ? 'var(--ok)' : 'var(--t3)' }} />
        {srv.players && srv.players.length > 0
          ? <span style={{ color: 'var(--ok)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srv.players.join(', ')}</span>
          : <span>No players online</span>
        }
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
        <button
          style={{ ...btnBase, color: canStart && !isLoading('start') ? 'var(--ok)' : 'var(--t3)', opacity: canStart && !isLoading('start') ? 1 : 0.45 }}
          disabled={!canStart || isLoading('start')}
          onClick={() => handleAction('start')}
        >
          {isLoading('start') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Play size={13} style={{ flexShrink: 0 }} />}
          Start
        </button>
        <button
          style={{ ...btnBase, color: canStop && !isLoading('stop') ? 'var(--err)' : 'var(--t3)', opacity: canStop && !isLoading('stop') ? 1 : 0.45 }}
          disabled={!canStop || isLoading('stop')}
          onClick={() => handleAction('stop')}
        >
          {isLoading('stop') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Square size={13} style={{ flexShrink: 0 }} />}
          Stop
        </button>
        <button
          style={{ ...btnBase, color: canRestart && !isLoading('restart') ? 'var(--warn)' : 'var(--t3)', opacity: canRestart && !isLoading('restart') ? 1 : 0.45 }}
          disabled={!canRestart || isLoading('restart')}
          onClick={() => handleAction('restart')}
        >
          {isLoading('restart') ? <Loader size={13} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <RotateCcw size={13} style={{ flexShrink: 0 }} />}
          Restart
        </button>
      </div>

      {/* ── Log / Error toggle buttons ── */}
      <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
        <button
          style={{
            ...btnBase,
            flex: 'none',
            width: '50%',
            background: activeLog === 'logs' ? 'var(--accent-dim)' : 'var(--raised)',
            boxShadow: activeLog === 'logs' ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-ring)',
            color: activeLog === 'logs' ? 'var(--accent)' : 'var(--t3)',
          }}
          onClick={() => fetchLog('logs')}
        >
          <FileText size={12} style={{ flexShrink: 0 }} />
          {activeLog === 'logs' ? 'Hide Logs' : 'Logs'}
        </button>
        <button
          style={{
            ...btnBase,
            flex: 'none',
            width: '50%',
            background: activeLog === 'errors' ? 'rgba(239,68,68,0.10)' : 'var(--raised)',
            boxShadow: activeLog === 'errors' ? '0 0 0 1px rgba(239,68,68,0.35)' : 'var(--shadow-ring)',
            color: activeLog === 'errors' ? 'var(--err)' : 'var(--t3)',
          }}
          onClick={() => fetchLog('errors')}
        >
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          {activeLog === 'errors' ? 'Hide Errors' : 'Errors'}
        </button>
      </div>

      {/* ── Log viewer ── */}
      {activeLog && (
        <div
          style={{
            background: 'var(--canvas)',
            borderRadius: 8,
            padding: '10px 12px',
            maxHeight: 280,
            overflowY: 'auto',
            fontSize: 11,
            fontFamily: "'Geist Mono', monospace",
            lineHeight: 1.6,
            color: 'var(--t2)',
            boxShadow: '0 0 0 1px var(--line)',
            minWidth: 0,
            wordBreak: 'break-all',
          }}
        >
          {logLoading
            ? <div style={{ color: 'var(--t3)' }}>Loading...</div>
            : displayLines === null
              ? <div style={{ color: 'var(--t3)' }}>Loading...</div>
              : displayLines.length === 0
                ? <div style={{ color: activeLog === 'errors' ? 'var(--ok)' : 'var(--t3)' }}>
                    {activeLog === 'errors' ? 'No errors found' : 'No log output'}
                  </div>
                : displayLines.map((line, i) => (
                    <div key={i} style={{ color: activeLog === 'errors' ? 'var(--err)' : 'var(--t2)' }}>{line}</div>
                  ))
          }
        </div>
      )}
    </div>
  );
}
