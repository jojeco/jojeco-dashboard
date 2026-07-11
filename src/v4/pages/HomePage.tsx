/**
 * v4 Home — the money screen.
 * Mobile: strict single column — alerts → hosts → services → automation
 * Desktop (>=1280px): 8/4 asymmetric command-center grid per DESIGN.md §5
 *   Lead col (8): alert strip + host telemetry grid
 *   Rail (4): service health summary + automation digest
 *
 * Phase modal: HostTile → HostDetailModal, inline state via useState.
 *
 * Tile variants (design review): append ?tile=a|b|c to the URL.
 *   ?tile=a  — "Instrument bars": full-width 1-col cards, 4px meter bars, no sparklines
 *   ?tile=b  — "Big-number readout": 2-col grid, hero CPU%, sparkline as bg trace
 *   ?tile=c  — "Dense rows": single Console panel, one row per host, max density
 *   ?tile=d  — "Instrument rows": C density + background CPU trace + fleet header + depth layers
 *   (no param) — current design unchanged
 */
import { useState } from 'react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { HostTileA, HostTileASkeleton } from '../components/HostTileA';
import { HostTileB, HostTileBSkeleton } from '../components/HostTileB';
import { HostTileCPanel, HostTileCSkeleton } from '../components/HostTileC';
import { HostTileDPanel, HostTileDSkeleton } from '../components/HostTileD';
import { AlertStrip } from '../components/AlertStrip';
import { AutomationDigest } from '../components/AutomationDigest';
import { ServiceHealthSummary } from '../components/ServiceHealthSummary';
import { GamingGlance } from '../components/GamingGlance';
import { PanelTitle } from '../components/Primitives';
import { HostDetailModal } from '../components/HostDetailModal';
import { StoragePanel } from '../components/StoragePanel';
import { LoadChartsPanel } from '../components/LoadChartsPanel';
import { TorrentsPanel } from '../components/TorrentsPanel';
import type { Machine } from '../../hooks/useSnapshot';

// Which machine IDs to highlight (from context doc)
const PRIORITY_MACHINES = ['CT100', 'S1', 'S2', 'S3', 'MacMini', 'macmini', 's1', 's2', 's3', 'ct100'];

// Personal rigs — grouped at the bottom of the host panel (Jordan, 2026-07-11)
const PERSONAL_MACHINES = ['jopc', 'macbook', 'jomac', 'ainspc'];

/** Read ?tile= from the URL — no router dependency needed */
function useTileVariant(): 'a' | 'b' | 'c' | 'd' | null {
  const raw = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('tile')
    : null;
  if (raw === 'a' || raw === 'b' || raw === 'c' || raw === 'd') return raw;
  return null;
}

export default function HomePage() {
  const { data, loading } = useSnapshot('lab');
  const machines = data?.machines ?? [];

  // Host detail modal state
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  // Tile variant from URL
  const tileVariant = useTileVariant();

  // Sort: priority first, then alphabetical
  const sorted = [...machines].sort((a, b) => {
    const ai = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === a.id.toLowerCase() || p.toLowerCase() === a.name.toLowerCase());
    const bi = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === b.id.toLowerCase() || p.toLowerCase() === b.name.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  /** Render the host grid section for any layout context */
  function HostSection() {
    if (loading) {
      // Skeleton per variant
      if (tileVariant === 'a') {
        return (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => <HostTileASkeleton key={i} />)}
          </div>
        );
      }
      if (tileVariant === 'b') {
        return (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {Array.from({ length: 4 }).map((_, i) => <HostTileBSkeleton key={i} />)}
          </div>
        );
      }
      if (tileVariant === 'c') {
        return <HostTileCSkeleton />;
      }
      // Default = variant D skeleton
      return <HostTileDSkeleton />;
    }

    if (sorted.length === 0) {
      return (
        <p className="text-[0.875rem]" style={{ color: 'var(--v4-readout)' }}>
          No host data — check SSE connection
        </p>
      );
    }

    // Variant A — full-width 1-col stack
    if (tileVariant === 'a') {
      return (
        <div className="flex flex-col gap-2 v4-stagger">
          {sorted.map(m => (
            <HostTileA
              key={m.id}
              machine={m}
              onClick={() => setSelectedMachine(m)}
            />
          ))}
        </div>
      );
    }

    // Variant B — 2-col grid
    if (tileVariant === 'b') {
      return (
        <div className="grid gap-2 v4-stagger" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {sorted.map(m => (
            <HostTileB
              key={m.id}
              machine={m}
              onClick={() => setSelectedMachine(m)}
            />
          ))}
        </div>
      );
    }

    // Variant C — dense panel (single component receives all machines)
    if (tileVariant === 'c') {
      return (
        <HostTileCPanel
          machines={sorted}
          onClickMachine={(m) => setSelectedMachine(m)}
        />
      );
    }

    // Variant D — instrument-grade dense rows. DEFAULT since Jordan's approval 2026-07-11.
    // Personal rigs (JoPc/JoMac/AinsPC) grouped at the bottom.
    return (
      <HostTileDPanel
        machines={sorted}
        onClickMachine={(m) => setSelectedMachine(m)}
        secondaryIds={PERSONAL_MACHINES}
      />
    );
  }

  return (
    <>
      {/* ── Mobile layout (strict single column) ────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        {/* 1. Alert strip (only when something is wrong) */}
        <AlertStrip />

        {/* 2. Host telemetry tiles */}
        <section>
          <PanelTitle className="mb-3">Hosts</PanelTitle>
          <HostSection />
        </section>

        {/* 3. Service health */}
        <ServiceHealthSummary />

        {/* 3.25 Gaming glance */}
        <GamingGlance />

        {/* 3.5 Storage overview */}
        <StoragePanel />

        {/* 4. Automation digest */}
        <AutomationDigest />

        {/* 5. Downloads */}
        <TorrentsPanel />
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
            <HostSection />
          </section>

          {/* Live CPU history (review #3) */}
          <LoadChartsPanel />

          {/* Storage overview — fills the lead column (review #2) */}
          <StoragePanel />
        </div>

        {/* Rail (4): services + automation */}
        <div className="flex flex-col gap-4">
          <ServiceHealthSummary />
          <GamingGlance />
          <AutomationDigest />
          <TorrentsPanel />
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
