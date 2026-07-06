/**
 * v4 Home — the money screen.
 * Mobile: strict single column — alerts → hosts → services → automation
 * Desktop (>=1280px): 8/4 asymmetric command-center grid per DESIGN.md §5
 *   Lead col (8): alert strip + host telemetry grid
 *   Rail (4): service health summary + automation digest
 *
 * Phase modal: HostTile → HostDetailModal, inline state via useState.
 */
import { useState } from 'react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { HostTile, HostTileSkeleton } from '../components/HostTile';
import { AlertStrip } from '../components/AlertStrip';
import { AutomationDigest } from '../components/AutomationDigest';
import { ServiceHealthSummary } from '../components/ServiceHealthSummary';
import { PanelTitle } from '../components/Primitives';
import { HostDetailModal } from '../components/HostDetailModal';
import { StoragePanel } from '../components/StoragePanel';
import type { Machine } from '../../hooks/useSnapshot';

// Which machine IDs to highlight (from context doc)
const PRIORITY_MACHINES = ['CT100', 'S1', 'S2', 'S3', 'MacMini', 'macmini', 's1', 's2', 's3', 'ct100'];

export default function HomePage() {
  const { data, loading } = useSnapshot('lab');
  const machines = data?.machines ?? [];

  // Host detail modal state
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  // Sort: priority first, then alphabetical
  const sorted = [...machines].sort((a, b) => {
    const ai = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === a.id.toLowerCase() || p.toLowerCase() === a.name.toLowerCase());
    const bi = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === b.id.toLowerCase() || p.toLowerCase() === b.name.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* ── Mobile layout (strict single column) ────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        {/* 1. Alert strip (only when something is wrong) */}
        <AlertStrip />

        {/* 2. Host telemetry tiles */}
        <section>
          <PanelTitle className="mb-3">Hosts</PanelTitle>
          {loading ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {Array.from({ length: 5 }).map((_, i) => <HostTileSkeleton key={i} />)}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-[0.875rem]" style={{ color: 'var(--v4-readout)' }}>
              No host data — check SSE connection
            </p>
          ) : (
            <div
              className="grid gap-3 v4-stagger"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {sorted.map(m => (
                <HostTile
                  key={m.id}
                  machine={m}
                  onClick={() => setSelectedMachine(m)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 3. Service health */}
        <ServiceHealthSummary />

        {/* 3.5 Storage overview */}
        <StoragePanel />

        {/* 4. Automation digest */}
        <AutomationDigest />
      </div>

      {/* ── Desktop layout (8/4 command-center grid) ─────────────────── */}
      <div
        className="hidden xl:grid gap-6"
        style={{
          gridTemplateColumns: '8fr 4fr',
          alignItems: 'start',
        }}
      >
        {/* Lead column (8): alerts + hosts */}
        <div className="flex flex-col gap-4">
          {/* Alert strip */}
          <AlertStrip />

          {/* Host telemetry */}
          <section>
            <PanelTitle className="mb-3">Hosts</PanelTitle>
            {loading ? (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {Array.from({ length: 5 }).map((_, i) => <HostTileSkeleton key={i} />)}
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-[0.875rem]" style={{ color: 'var(--v4-readout)' }}>
                No host data — check SSE connection
              </p>
            ) : (
              <div
                className="grid gap-3 v4-stagger"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {sorted.map(m => (
                  <HostTile
                    key={m.id}
                    machine={m}
                    onClick={() => setSelectedMachine(m)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Storage overview — fills the lead column (review #2) */}
          <StoragePanel />
        </div>

        {/* Rail (4): services + automation */}
        <div className="flex flex-col gap-4">
          <ServiceHealthSummary />
          <AutomationDigest />
        </div>
      </div>

      {/* ── Host detail modal (shared, one instance) ─────────────────── */}
      <HostDetailModal
        machine={selectedMachine}
        open={selectedMachine !== null}
        onClose={() => setSelectedMachine(null)}
      />
    </>
  );
}
