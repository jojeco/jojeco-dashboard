/**
 * v4 ServiceHealthSummary — counts by host, tap → ServiceGroupDetailModal.
 * DESIGN.md: no 3-equal-cards rows, surface contrast separates, edge-stripes for status.
 * Data: labHostServices (host-grouped 22-service registry, Phase C1).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, EmptyState, Skeleton } from './Primitives';
import { ServiceGroupDetailModal } from './ServiceGroupDetailModal';
import { cn } from '../lib/utils';
import type { LabHostServicesGroup } from '../../hooks/useSnapshot';

export function ServiceHealthSummary({ className }: { className?: string }) {
  const { data, loading } = useSnapshot('labHostServices');
  const navigate = useNavigate();

  const [selectedGroup, setSelectedGroup] = useState<LabHostServicesGroup | null>(null);

  const groups = data?.groups ?? [];
  const all = groups.flatMap(g => g.services);
  const totalServices = all.length;
  const totalDown = all.filter(s => !s.online).length;
  // Section may lag its first SSE emit (30s TTL) — treat null as still loading,
  // only show the empty state when the section actually arrived empty.
  const waiting = loading || data == null;

  return (
    <>
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

        {waiting ? (
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

            {/* Host rows */}
            <div className="flex flex-col gap-1 v4-stagger">
              {groups.map(g => {
                const down = g.services.filter(s => !s.online);
                const hasDown = down.length > 0;
                return (
                  <button
                    key={g.host}
                    onClick={() => setSelectedGroup(g)}
                    className="flex items-center justify-between px-3 py-2 rounded-[0.5rem] v4-tile w-full text-left"
                    style={{
                      background: 'var(--v4-well)',
                      boxShadow: `inset 2px 0 0 ${hasDown ? 'var(--v4-fault)' : 'var(--v4-nominal)'}`,
                      minHeight: 44,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    <span className="flex flex-col min-w-0">
                      <span
                        className="text-[0.8125rem] font-medium uppercase tracking-wide"
                        style={{ color: 'var(--v4-readout)' }}
                      >
                        {g.host}
                      </span>
                      {hasDown && (
                        <span className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-fault)' }}>
                          {down.map(s => s.label).join(', ')}
                        </span>
                      )}
                    </span>
                    <Mono
                      className="text-[0.8125rem]"
                      style={{ color: hasDown ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
                    >
                      {g.services.length - down.length}/{g.services.length}
                    </Mono>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {/* ── Service group detail modal ─────────────────────────────── */}
      <ServiceGroupDetailModal
        group={selectedGroup}
        open={selectedGroup !== null}
        onClose={() => setSelectedGroup(null)}
      />
    </>
  );
}
