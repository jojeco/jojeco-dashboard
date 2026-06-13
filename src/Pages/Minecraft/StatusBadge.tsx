/**
 * StatusBadge — pill badge for Minecraft server status.
 * running=ok, starting=warn, stopped=t3.
 * Design system: status color on text+dot only; pill bg is low-alpha tint.
 */

const STATUS_COLOR: Record<string, string> = {
  running:  'var(--ok)',
  starting: 'var(--warn)',
  stopped:  'var(--t3)',
};

const STATUS_LABEL: Record<string, string> = {
  running:  'Running',
  starting: 'Starting',
  stopped:  'Stopped',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'var(--t3)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
          boxShadow: status === 'running' ? `0 0 5px ${color}` : 'none',
        }}
      />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
