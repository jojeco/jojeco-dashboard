/**
 * v4 StoragePanel — drives grouped by host, fullest-drive-first group order.
 *
 * Each machine gets a compact header row (dimmed mono hostname + per-host
 * summary) followed by its drives sorted fullest-first, using the exact same
 * bar/row style as before. Group order: hosts with the fullest single drive
 * appear first so the most urgent storage is always at the top; personal rigs
 * (JoPc / JoMac / AinsPC) pin to the bottom under a divider.
 *
 * Bars: Command Blue for data; Degraded/Fault take over ≥75/90% (state only).
 */
import { useSnapshot } from '../../hooks/useSnapshot';
import type { Machine, Disk } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, Skeleton } from './Primitives';
import { fmtBytes, cn } from '../lib/utils';

// ── Personal rig ids (pinned to bottom, mirrors HostTileD.secondaryIds) ──────

const DEFAULT_PERSONAL_IDS = ['jopc', 'macbook', 'jomac', 'ainspc'];

function isPersonal(m: Machine, personalIds: string[]): boolean {
  return personalIds.some(s => {
    const t = s.toLowerCase();
    return m.id.toLowerCase() === t || m.name.toLowerCase() === t;
  });
}

// ── Bar color — fault/degraded take over at thresholds ───────────────────────

function barColor(pct: number): string {
  if (pct >= 90) return 'var(--v4-fault)';
  if (pct >= 75) return 'var(--v4-degraded)';
  return 'var(--v4-amber)';
}

// ── Free space summary for a set of disks ────────────────────────────────────

function hostSummary(disks: Disk[]): string {
  const count = disks.length;
  const totalFree = disks.reduce((acc, d) => acc + (d.size - d.used), 0);
  return `${count} drive${count !== 1 ? 's' : ''} · ${fmtBytes(totalFree)} free`;
}

// ── Host group header row ─────────────────────────────────────────────────────

function HostGroupHeader({ machine, disks }: { machine: Machine; disks: Disk[] }) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-0 pt-3 pb-1.5"
      style={{ borderBottom: '1px solid var(--v4-hairline)' }}
    >
      {/* Dimmed mono hostname — uppercase, small, matches "personal rigs" divider style */}
      <span
        className="font-mono uppercase leading-none shrink-0"
        style={{
          fontSize: '0.5625rem',
          color: 'var(--v4-trace)',
          letterSpacing: '0.08em',
        }}
      >
        {machine.name}
      </span>
      {/* Right-aligned summary */}
      <Mono
        className="text-[0.5625rem] whitespace-nowrap shrink-0"
        style={{ color: 'var(--v4-trace)', letterSpacing: '0.02em' }}
      >
        {hostSummary(disks)}
      </Mono>
    </div>
  );
}

// ── Personal rigs section divider (matches HostTileD style exactly) ───────────

function PersonalRigsDivider() {
  return (
    <div
      className="flex items-center gap-2 pt-4 pb-1"
    >
      <span
        className="font-mono uppercase leading-none shrink-0"
        style={{ fontSize: '0.5625rem', color: 'var(--v4-trace)', letterSpacing: '0.08em' }}
      >
        personal rigs
      </span>
      <div
        className="flex-1"
        style={{ height: 1, background: 'var(--v4-hairline)', opacity: 0.6 }}
        aria-hidden
      />
    </div>
  );
}

// ── Single drive row (exact original style) ───────────────────────────────────

function DriveRow({ disk }: { disk: Disk }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <Mono
          className="text-[0.75rem] truncate"
          style={{ color: 'var(--v4-signal)' }}
        >
          {disk.label}
        </Mono>
        <Mono
          className="text-[0.6875rem] whitespace-nowrap"
          style={{ color: 'var(--v4-trace)' }}
        >
          {fmtBytes(disk.used)} / {fmtBytes(disk.size)}
        </Mono>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--v4-well)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(disk.percent, 100)}%`,
            background: barColor(disk.percent),
          }}
        />
      </div>
    </div>
  );
}

// ── Host group (header + drives) ──────────────────────────────────────────────

function HostGroup({ machine }: { machine: Machine }) {
  // Sort drives fullest-first within the group
  const sortedDisks = [...machine.disks].sort((a, b) => b.percent - a.percent);

  return (
    <div className="flex flex-col">
      <HostGroupHeader machine={machine} disks={sortedDisks} />
      <div
        className="grid gap-x-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        {sortedDisks.map(d => (
          <DriveRow key={d.label} disk={d} />
        ))}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StoragePanelProps {
  className?: string;
  /**
   * Machine ids/names to pin at the bottom under a "personal rigs" divider.
   * Defaults to ['jopc', 'macbook', 'jomac', 'ainspc'].
   */
  personalIds?: string[];
}

// ── Main component ────────────────────────────────────────────────────────────

export function StoragePanel({ className, personalIds = DEFAULT_PERSONAL_IDS }: StoragePanelProps) {
  const { data, loading } = useSnapshot('lab');
  const machines = data?.machines ?? [];
  const waiting = loading || data == null;

  // Only show online machines that have at least one disk
  const online = machines.filter(m => m.online && m.disks.length > 0);

  // Split: lab hosts vs personal rigs
  const labMachines      = online.filter(m => !isPersonal(m, personalIds));
  const personalMachines = online.filter(m =>  isPersonal(m, personalIds));

  // Sort each group: machine whose fullest drive is highest goes first
  const byFullestDrive = (a: Machine, b: Machine) => {
    const maxA = a.disks.reduce((hi, d) => Math.max(hi, d.percent), 0);
    const maxB = b.disks.reduce((hi, d) => Math.max(hi, d.percent), 0);
    return maxB - maxA;
  };

  const sortedLab      = [...labMachines].sort(byFullestDrive);
  const sortedPersonal = [...personalMachines].sort(byFullestDrive);

  return (
    <Panel className={cn('p-4', className)}>
      <PanelTitle className="mb-3">Storage</PanelTitle>

      {waiting ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : online.length === 0 ? (
        <p
          className="text-[0.8125rem]"
          style={{ color: 'var(--v4-readout)' }}
        >
          No storage data — check agent connection
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Lab machines — grouped, fullest host first */}
          {sortedLab.map(m => (
            <HostGroup key={m.id} machine={m} />
          ))}

          {/* Personal rigs — pinned to bottom under divider */}
          {sortedPersonal.length > 0 && (
            <>
              <PersonalRigsDivider />
              {sortedPersonal.map(m => (
                <HostGroup key={m.id} machine={m} />
              ))}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
