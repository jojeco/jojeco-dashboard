import { Disc } from 'lucide-react';
import type { RipStatus } from './types';

const colorMap: Record<string, string> = {
  ripping:  '#a78bfa',
  importing: 'var(--accent)',
  done:     'var(--ok)',
  starting: 'var(--warn)',
  error:    'var(--err)',
};

export function RipCard({ rip }: { rip: RipStatus }) {
  if (rip.status === 'idle') return null;
  const color = colorMap[rip.status] || 'var(--t3)';
  return (
    <div className="j-panel" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Disc
          size={14}
          style={{
            flexShrink: 0,
            color: rip.status === 'ripping' ? '#a78bfa' : 'var(--t3)',
            animation: rip.status === 'ripping' ? 'spin 1s linear infinite' : 'none',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {rip.album || 'CD Rip'}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${color}18`, color, flexShrink: 0 }}>
          {rip.status}
        </span>
      </div>
      {rip.total > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 4, fontFamily: 'Geist Mono, monospace', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{rip.trackName || `Track ${rip.track}`}</span>
            <span style={{ flexShrink: 0 }}>{rip.track}/{rip.total} — {rip.percent}%</span>
          </div>
          <div className="j-bar-track">
            <div className="j-bar-fill" style={{ width: `${rip.percent}%`, background: color, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </>
      )}
    </div>
  );
}
