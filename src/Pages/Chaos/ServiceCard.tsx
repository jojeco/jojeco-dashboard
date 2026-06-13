/**
 * ServiceCard — displays a single lab service status tile.
 * Degraded/down services get a subtle colored shadow (not a border color).
 */
import type { LabService } from './types';
import { STATUS_COLOR, STATUS_DIM, fmt } from './constants';

export function ServiceCard({ svc }: { svc: LabService }) {
  const color = STATUS_COLOR[svc.status];
  const bad   = svc.status !== 'healthy' && svc.status !== 'unknown';

  return (
    <div
      style={{
        background: 'var(--raised)',
        borderRadius: 'var(--r-sm)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        boxShadow: bad
          ? `inset 0 0 0 1px ${STATUS_DIM[svc.status]}, var(--shadow-card)`
          : 'var(--shadow-card)',
        transition: 'box-shadow 200ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {svc.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: color,
              boxShadow: bad ? `0 0 5px ${color}` : 'none',
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 9, color, letterSpacing: '0.06em', fontWeight: 700 }}>
            {svc.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em' }}>LATENCY</div>
          <div style={{ fontSize: 11, color: svc.latency && svc.latency > 1000 ? 'var(--warn)' : 'var(--t2)', fontFamily: "'Geist Mono', monospace" }}>
            {fmt(svc.latency)}
          </div>
        </div>
        {svc.dependsOn.length > 0 && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em' }}>DEPENDS ON</div>
            <div style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {svc.dependsOn.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
