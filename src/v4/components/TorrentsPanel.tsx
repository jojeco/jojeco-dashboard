/**
 * v4 TorrentsPanel — qBittorrent transfer glance for the rail.
 * Speeds in Command Blue mono; "firewalled" connection state surfaced as Degraded.
 */
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, StatusChip, Skeleton } from './Primitives';
import { fmtBytes, cn } from '../lib/utils';

interface TorrentsInfo {
  connection_status?: string;
  dl_info_speed?: number;
  up_info_speed?: number;
  dl_info_data?: number;
  up_info_data?: number;
}

export function TorrentsPanel({ className }: { className?: string }) {
  const { data, loading } = useSnapshot('torrents');
  const t = (data ?? null) as TorrentsInfo | null;
  const waiting = loading || t == null;
  const conn = t?.connection_status ?? 'unknown';
  const connLevel = conn === 'connected' ? 'nominal' : conn === 'firewalled' ? 'degraded' : 'standby';

  return (
    <Panel className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <PanelTitle>Downloads</PanelTitle>
        {!waiting && <StatusChip level={connLevel as never} label={conn} />}
      </div>
      {waiting ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>DOWN</span>
            <Mono className="text-[0.9375rem]" style={{ color: 'var(--v4-amber)' }}>
              {fmtBytes(t?.dl_info_speed ?? 0)}/s
            </Mono>
            <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
              {fmtBytes(t?.dl_info_data ?? 0)} session
            </Mono>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>UP</span>
            <Mono className="text-[0.9375rem]" style={{ color: 'var(--v4-amber)' }}>
              {fmtBytes(t?.up_info_speed ?? 0)}/s
            </Mono>
            <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
              {fmtBytes(t?.up_info_data ?? 0)} session
            </Mono>
          </div>
        </div>
      )}
    </Panel>
  );
}
