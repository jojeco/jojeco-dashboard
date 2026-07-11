/**
 * v4 LiveIndicator — breathing dot per DESIGN.md §6
 * Shows SSE connection state. Static chrome never animates.
 *
 * stale=true (localStorage cache >60 s old) shows "SYNCING…" (dimmed) so the
 * user knows they're seeing old data while the live feed catches up.
 */
import { useSnapshot } from '../../hooks/useSnapshot';
import type { StreamStatus } from '../../hooks/useSnapshot';
import { cn } from '../lib/utils';

const STATUS_LABEL: Record<StreamStatus, string> = {
  connected:    'LIVE',
  connecting:   'CONN',
  reconnecting: 'SYNC',
  closed:       'OFF',
};

interface LiveIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function LiveIndicator({ className, showLabel = true }: LiveIndicatorProps) {
  const { streamStatus, stale } = useSnapshot();
  // Show "SYNCING…" (dimmed) if the stream is live but data is from stale cache.
  // This is honest: old data is showing, fresh data is on its way.
  const connected = streamStatus === 'connected' && !stale;
  const syncing   = streamStatus === 'connected' && stale;
  const color = connected ? 'var(--v4-nominal)' : syncing ? 'var(--v4-trace)' : 'var(--v4-trace)';
  const label = syncing ? 'SYNCING…' : STATUS_LABEL[streamStatus];

  return (
    <span
      title={`Stream: ${streamStatus}${stale ? ' (stale cache)' : ''}`}
      className={cn('inline-flex items-center gap-1.5 select-none', className)}
      style={{ color, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
    >
      <span
        className={cn(connected ? 'v4-breathe' : '')}
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
