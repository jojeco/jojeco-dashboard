/** DepMap — renders service dependency edges (from ──▶ to). */
import type { LabService } from './types';
import { STATUS_COLOR } from './constants';

export function DepMap({ services }: { services: LabService[] }) {
  const byId = Object.fromEntries(services.map(s => [s.id, s]));
  const edges = services.flatMap(s => s.dependsOn.map(d => ({ from: d, to: s.id })));
  if (edges.length === 0) return null;

  return (
    <div style={{ background: 'var(--raised)', borderRadius: 'var(--r-md)', padding: '14px 16px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Dependency Map
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 0', minWidth: 0 }}>
        {edges.map((e, i) => {
          const f = byId[e.from];
          const t = byId[e.to];
          if (!f || !t) return null;
          const bad = f.status !== 'healthy' || t.status !== 'healthy';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 20, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: STATUS_COLOR[f.status], fontWeight: 600, whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ color: bad ? 'var(--err)' : 'var(--t3)', flexShrink: 0 }}>──▶</span>
              <span style={{ fontSize: 11, color: STATUS_COLOR[t.status], fontWeight: 600, whiteSpace: 'nowrap' }}>{t.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
