/** StatsRow — summary counts (HEALTHY / DEGRADED / DOWN / TOTAL). */
import type { LabService } from './types';

export function StatsRow({ services }: { services: LabService[] }) {
  const counts = { healthy: 0, degraded: 0, down: 0 };
  services.forEach(s => { if (s.status in counts) counts[s.status as keyof typeof counts]++; });

  const tiles: [string, number, string][] = [
    ['HEALTHY',  counts.healthy,  'var(--ok)'],
    ['DEGRADED', counts.degraded, 'var(--warn)'],
    ['DOWN',     counts.down,     'var(--err)'],
    ['TOTAL',    services.length, 'var(--t2)'],
  ];

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {tiles.map(([label, val, color]) => (
        <div key={label}>
          <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '0.1em', fontFamily: "'Geist Mono', monospace" }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {val}
          </div>
        </div>
      ))}
    </div>
  );
}
