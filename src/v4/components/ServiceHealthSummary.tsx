/**
 * v4 ServiceHealthSummary — counts by host, tap -> Services tab
 * DESIGN.md: no 3-equal-cards rows, surface contrast separates, edge-stripes for status.
 */
import { useNavigate } from 'react-router-dom';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, EmptyState, Skeleton } from './Primitives';
import { cn } from '../lib/utils';

// Group services by a best-guess host prefix
function groupByHost(services: Record<string, { status: string }>): Map<string, { up: number; down: number; total: number }> {
  const groups = new Map<string, { up: number; down: number; total: number }>();

  for (const [id, svc] of Object.entries(services)) {
    // Heuristic: "plex", "sonarr", "radarr" → Media; "nextcloud" → Cloud; etc.
    // Use first segment of id (e.g. "s1-plex" → "s1") or plain bucket
    const prefix = id.includes('-') ? id.split('-')[0] : 'lab';
    if (!groups.has(prefix)) groups.set(prefix, { up: 0, down: 0, total: 0 });
    const g = groups.get(prefix)!;
    g.total++;
    if (svc.status === 'online') g.up++;
    else g.down++;
  }

  return groups;
}

export function ServiceHealthSummary({ className }: { className?: string }) {
  const { data, loading } = useSnapshot('servicesHealth');
  const navigate = useNavigate();

  const services = data ?? {};
  const groups = groupByHost(services);
  const totalServices = Object.keys(services).length;
  const totalDown = Object.values(services).filter(s => s.status === 'offline').length;

  return (
    <Panel className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <PanelTitle>Services</PanelTitle>
        <button
          onClick={() => navigate('/v4/services')}
          className="text-[0.75rem] font-medium"
          style={{ background: 'none', border: 'none', color: 'var(--v4-amber)', cursor: 'pointer', padding: 0 }}
        >
          All →
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : totalServices === 0 ? (
        <EmptyState message="No service data" action="Check API connectivity" />
      ) : (
        <>
          {/* Summary line */}
          <div className="flex items-center gap-3 mb-3">
            <Mono
              className="text-[1.125rem] font-semibold"
              style={{ color: totalDown > 0 ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
            >
              {totalServices - totalDown}/{totalServices}
            </Mono>
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>
              {totalDown > 0 ? `${totalDown} down` : 'all up'}
            </span>
          </div>

          {/* Group rows */}
          <div className="flex flex-col gap-1 v4-stagger">
            {Array.from(groups.entries()).map(([prefix, g]) => {
              const hasDown = g.down > 0;
              return (
                <button
                  key={prefix}
                  onClick={() => navigate('/v4/services')}
                  className="flex items-center justify-between px-3 py-2 rounded-[0.5rem] v4-tile w-full text-left"
                  style={{
                    background: 'var(--v4-well)',
                    boxShadow: `inset 2px 0 0 ${hasDown ? 'var(--v4-fault)' : 'var(--v4-nominal)'}`,
                    minHeight: 44,
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  <span
                    className="text-[0.8125rem] font-medium uppercase tracking-wide"
                    style={{ color: 'var(--v4-readout)' }}
                  >
                    {prefix}
                  </span>
                  <Mono
                    className="text-[0.8125rem]"
                    style={{ color: hasDown ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
                  >
                    {g.up}/{g.total}
                  </Mono>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
