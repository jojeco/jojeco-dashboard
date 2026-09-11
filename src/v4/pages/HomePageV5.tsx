/**
 * v5 Home — viewport-locked command center.
 *
 * Desktop (lg+): 3-column CSS grid, full viewport height, no page scroll.
 *   Left  (40%): Hosts → Service Health
 *   Mid   (30%): Live Downloads (SABnzbd + qBit, 5s poll)
 *   Right (30%): Gaming → Storage summary
 *
 * Mobile: single-column stack (same as before).
 * Data: SSE snapshot for hosts/services/gaming + REST polling for downloads.
 */
import { useMemo, useState } from 'react';
import { useSnapshot } from '../../hooks/useSnapshot';
import type { Machine } from '../../hooks/useSnapshot';
import { HostDetailModal } from '../components/HostDetailModal';
import { HostTileDPanel, HostTileDSkeleton } from '../components/HostTileD';
import { ServiceHealthSummary } from '../components/ServiceHealthSummary';
import { StoragePanel } from '../components/StoragePanel';
import { GamingGlance } from '../components/GamingGlance';
import { AlertStrip } from '../components/AlertStrip';
import { LiveDownloadsPanel } from '../components/LiveDownloadsPanel';

const PRIORITY_IDS = ['CT100', 'S1', 'S2', 'S3', 'MacMini', 'macmini', 's1', 's2', 's3', 'ct100'];
const PERSONAL_IDS = ['jopc', 'macbook', 'jomac', 'ainspc'];

function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort((a, b) => {
    const ai = PRIORITY_IDS.findIndex(p => p.toLowerCase() === a.id.toLowerCase() || p.toLowerCase() === a.name.toLowerCase());
    const bi = PRIORITY_IDS.findIndex(p => p.toLowerCase() === b.id.toLowerCase() || p.toLowerCase() === b.name.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function HomePageV5() {
  const { data, loading } = useSnapshot('lab');
  const machines = useMemo(() => sortMachines(data?.machines ?? []), [data]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const labMachines = machines.filter(m => !PERSONAL_IDS.some(p => m.id.toLowerCase().includes(p) || m.name.toLowerCase().includes(p)));

  return (
    <>
      {/* Alert strip — full width above the grid, auto-height, hidden when clear */}
      <AlertStrip />

      {/* ── Desktop: 3-column viewport-locked grid ───────────────────── */}
      <div className="v5-home-grid">

        {/* Left column: Hosts + Service Health */}
        <div className="v5-col v5-col-left">
          <div className="v5-panel v5-panel-hosts">
            {loading
              ? <HostTileDSkeleton />
              : (
                <HostTileDPanel
                  machines={labMachines}
                  onClickMachine={setSelectedMachine}
                  secondaryIds={PERSONAL_IDS}
                />
              )
            }
          </div>
          <div className="v5-panel v5-panel-services">
            <ServiceHealthSummary />
          </div>
        </div>

        {/* Mid column: Live downloads */}
        <div className="v5-col v5-col-mid">
          <div className="v5-panel-fill">
            <LiveDownloadsPanel />
          </div>
        </div>

        {/* Right column: Gaming + Storage */}
        <div className="v5-col v5-col-right">
          <div className="v5-panel v5-panel-gaming">
            <GamingGlance />
          </div>
          <div className="v5-panel v5-panel-storage">
            <StoragePanel />
          </div>
        </div>

      </div>

      <HostDetailModal
        machine={selectedMachine}
        open={selectedMachine !== null}
        onClose={() => setSelectedMachine(null)}
      />
    </>
  );
}
