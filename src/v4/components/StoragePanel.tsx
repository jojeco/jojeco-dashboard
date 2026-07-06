/**
 * v4 StoragePanel — every drive across every host, sorted by fullest first.
 * Fills the desktop lead column (review #2: too much empty space) and gives
 * the F:-drive class of problem a permanent home on the money screen.
 * Bars: Command Blue for data; Degraded/Fault take over ≥75/90% (state only).
 */
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, Skeleton } from './Primitives';
import { fmtBytes, cn } from '../lib/utils';

export function StoragePanel({ className }: { className?: string }) {
  const { data, loading } = useSnapshot('lab');
  const machines = data?.machines ?? [];
  const waiting = loading || data == null;

  const drives = machines
    .filter(m => m.online)
    .flatMap(m => m.disks.map(d => ({ host: m.name, ...d })))
    .sort((a, b) => b.percent - a.percent);

  const barColor = (pct: number) =>
    pct >= 90 ? 'var(--v4-fault)' : pct >= 75 ? 'var(--v4-degraded)' : 'var(--v4-amber)';

  return (
    <Panel className={cn('p-4', className)}>
      <PanelTitle className="mb-3">Storage</PanelTitle>
      {waiting ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {drives.map(d => (
            <div key={`${d.host}-${d.label}`} className="flex flex-col gap-1 py-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.75rem] truncate" style={{ color: 'var(--v4-readout)' }}>
                  {d.host} <Mono className="text-[0.75rem]" style={{ color: 'var(--v4-signal)' }}>{d.label}</Mono>
                </span>
                <Mono className="text-[0.6875rem] whitespace-nowrap" style={{ color: 'var(--v4-trace)' }}>
                  {fmtBytes(d.used)} / {fmtBytes(d.size)}
                </Mono>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--v4-well)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(d.percent, 100)}%`, background: barColor(d.percent) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
