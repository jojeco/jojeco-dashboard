/**
 * LogPanel — attack log (sim) or agent log (real).
 * Auto-scrolls on new entries via forwarded ref.
 */
import { useEffect, useRef } from 'react';
import type { LogEntry, PageMode } from './types';
import { LOG_COLOR } from './constants';

interface LogPanelProps {
  mode: PageMode;
  logs: LogEntry[];
  running: boolean;
}

export function LogPanel({ mode, logs, running }: LogPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const title = mode === 'real' ? 'AGENT LOG' : 'ATTACK LOG';
  const empty = mode === 'real' ? 'Select a module and run...' : 'Awaiting chaos launch...';

  return (
    <div style={{ background: 'var(--raised)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-card)' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: "'Geist Mono', monospace" }}>{logs.length} entries</span>
      </div>

      {/* Log lines */}
      <div style={{ padding: '12px 14px', maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, background: 'var(--canvas)', borderRadius: '0 0 var(--r-md) var(--r-md)' }}>
        {logs.length === 0
          ? (
            <span style={{ color: 'var(--t3)', fontSize: 11, fontFamily: "'Geist Mono', monospace" }}>
              {empty}<span style={{ marginLeft: 2 }}>▊</span>
            </span>
          )
          : logs.map(e => (
            <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5, minWidth: 0 }}>
              <span style={{ color: 'var(--t3)', flexShrink: 0, fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>{e.ts}</span>
              <span style={{ color: LOG_COLOR[e.level], fontFamily: "'Geist Mono', monospace", wordBreak: 'break-word', minWidth: 0 }}>{e.msg}</span>
            </div>
          ))
        }
        {running && <span style={{ color: 'var(--t3)', fontSize: 11 }}>▊</span>}
        <div ref={endRef} />
      </div>
    </div>
  );
}
