/**
 * ContainerControls — searchable, filterable container list with
 * restart / stop / start actions. Stop requires confirmation (passed as handler).
 */
import { RotateCcw, Square, Play, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Container } from './types';

interface ContainerControlsProps {
  containers: Container[];
  loading: Record<string, boolean>;
  onRestart: (name: string) => void;
  onStop: (name: string) => void;   // parent wires confirm dialog
  onStart: (name: string) => void;
  onRefresh: () => void;
  onPrune: () => void;
}

export function ContainerControls({
  containers,
  loading,
  onRestart,
  onStop,
  onStart,
  onRefresh,
  onPrune,
}: ContainerControlsProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');

  const filtered = containers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true
      : filter === 'running' ? c.running
      : !c.running;
    return matchSearch && matchFilter;
  });

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    background: 'var(--raised)',
    border: 'none',
    color: 'var(--t1)',
    borderRadius: 'var(--r-sm)',
    padding: '7px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    boxShadow: 'var(--shadow-ring)',
    minWidth: 0,
    transition: 'box-shadow 120ms',
  };

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px',
    minHeight: 40,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--accent-dim)' : 'var(--raised)',
    color: active ? 'var(--accent)' : 'var(--t2)',
    boxShadow: active ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-ring)',
    transition: 'background 120ms, color 120ms',
    flexShrink: 0,
  });

  const actionBtnStyle = (variant: 'neutral' | 'stop' | 'start'): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    minHeight: 36,
    borderRadius: 'var(--r-sm)',
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    flexShrink: 0,
    transition: 'background 120ms',
    ...(variant === 'stop'
      ? { background: 'rgba(239,68,68,0.08)', color: 'var(--err)', boxShadow: '0 0 0 1px rgba(239,68,68,0.2)' }
      : variant === 'start'
      ? { background: 'var(--accent-dim)', color: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent-border)' }
      : { background: 'var(--raised)', color: 'var(--t2)', boxShadow: 'var(--shadow-ring)' }),
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'running', 'stopped'] as const).map(f => (
            <button key={f} style={filterBtnStyle(filter === f)} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 100 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input
            placeholder="Search containers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 28, width: '100%', boxSizing: 'border-box' }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 2px var(--accent-border)'}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.boxShadow = 'var(--shadow-ring)'}
          />
        </div>

        {/* Count + refresh */}
        <span style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} containers
        </span>
        <button
          style={{ ...actionBtnStyle('neutral'), padding: '7px 12px', minHeight: 40 }}
          onClick={onRefresh}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
        >
          <RefreshCw size={11} style={{ flexShrink: 0 }} /> Refresh
        </button>
        <button
          style={{ ...actionBtnStyle('neutral'), padding: '7px 12px', minHeight: 40 }}
          disabled={loading['prune']}
          onClick={onPrune}
          onMouseEnter={e => { if (!loading['prune']) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
        >
          <Trash2 size={11} style={{ flexShrink: 0 }} /> {loading['prune'] ? 'Pruning…' : 'Prune'}
        </button>
      </div>

      {/* Container list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--t3)' }}>
            {containers.length === 0 ? 'Loading containers…' : 'No containers match'}
          </div>
        )}
        {filtered.map(c => (
          <div
            key={c.name}
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'var(--shadow-ring)',
              minWidth: 0,
            }}
          >
            <span
              className={`j-dot ${c.healthy === 'unhealthy' ? 'j-dot-err' : c.running ? 'j-dot-ok' : 'j-dot-warn'}`}
              style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--t1)',
                  fontFamily: "'Geist Mono', monospace",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--t3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.status}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                style={actionBtnStyle('neutral')}
                disabled={loading[`restart-c-${c.name}`]}
                onClick={() => onRestart(c.name)}
                onMouseEnter={e => { if (!loading[`restart-c-${c.name}`]) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
              >
                <RotateCcw size={10} style={{ flexShrink: 0 }} /> Restart
              </button>

              {c.running ? (
                <button
                  style={actionBtnStyle('stop')}
                  disabled={loading[`stop-c-${c.name}`]}
                  onClick={() => onStop(c.name)}
                  onMouseEnter={e => { if (!loading[`stop-c-${c.name}`]) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
                >
                  <Square size={10} style={{ flexShrink: 0 }} /> Stop
                </button>
              ) : (
                <button
                  style={actionBtnStyle('start')}
                  disabled={loading[`start-c-${c.name}`]}
                  onClick={() => onStart(c.name)}
                  onMouseEnter={e => { if (!loading[`start-c-${c.name}`]) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.22)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)'; }}
                >
                  <Play size={10} style={{ flexShrink: 0 }} /> Start
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
