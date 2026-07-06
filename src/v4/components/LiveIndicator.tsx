/**
 * v4 LiveIndicator — breathing dot per DESIGN.md §6
 * Shows SSE connection state. Static chrome never animates.
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
  const { streamStatus } = useSnapshot();
  const connected = streamStatus === 'connected';
  const color = connected ? 'var(--v4-nominal)' : 'var(--v4-trace)';

  return (
    <span
      title={`Stream: ${streamStatus}`}
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
      {showLabel && <span>{STATUS_LABEL[streamStatus]}</span>}
    </span>
  );
}
