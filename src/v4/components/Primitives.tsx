/**
 * v4 Primitive components — base building blocks per DESIGN.md
 * No borders. Surface contrast + edge-stripes + negative space.
 */
import { cn } from '../lib/utils';

// ── Panel / Card ────────────────────────────────────────────────────────────
interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
}
export function Panel({ as: Tag = 'div', className, children, ...props }: PanelProps) {
  return (
    <Tag
      className={cn('rounded-[1rem] shadow-[0_1px_0_rgba(0,0,0,0.4)]', className)}
      style={{ background: 'var(--v4-console)', ...props.style }}
      {...props}
    >
      {children}
    </Tag>
  );
}

// ── Recessed Well (chart plot areas, log tails) ─────────────────────────────
export function Well({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[0.75rem]', className)}
      style={{ background: 'var(--v4-well)', ...props.style }}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Panel title (0.875rem uppercase, muted readout) ─────────────────────────
export function PanelTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-[0.75rem] font-semibold uppercase tracking-[0.06em]', className)}
      style={{ color: 'var(--v4-readout)', ...props.style }}
      {...props}
    >
      {children}
    </h2>
  );
}

// ── Page title ──────────────────────────────────────────────────────────────
export function PageTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn('text-[1.25rem] font-semibold tracking-tight', className)}
      style={{ color: 'var(--v4-signal)', ...props.style }}
      {...props}
    >
      {children}
    </h1>
  );
}

// ── Mono readout (numbers, timestamps, IPs) ─────────────────────────────────
interface MonoProps extends React.HTMLAttributes<HTMLSpanElement> {
  dim?: boolean;
  trace?: boolean;
}
export function Mono({ className, dim, trace, children, ...props }: MonoProps) {
  return (
    <span
      className={cn('font-mono tabular-nums', className)}
      style={{
        color: trace ? 'var(--v4-trace)' : dim ? 'var(--v4-readout)' : 'var(--v4-signal)',
        ...props.style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

// ── Status dot (2px edge-stripe is for tiles; dot for inline status) ────────
type StatusLevel = 'nominal' | 'degraded' | 'fault' | 'standby';
interface StatusDotProps {
  level: StatusLevel;
  label?: string;
  className?: string;
}
const DOT_COLOR: Record<StatusLevel, string> = {
  nominal:  'var(--v4-nominal)',
  degraded: 'var(--v4-degraded)',
  fault:    'var(--v4-fault)',
  standby:  'var(--v4-standby)',
};
export function StatusDot({ level, label, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: DOT_COLOR[level] }}
        aria-hidden
      />
      {label && (
        <span className="font-mono text-[0.75rem] tabular-nums" style={{ color: DOT_COLOR[level] }}>
          {label}
        </span>
      )}
    </span>
  );
}

// ── Status chip (label + stripe-like pill) ───────────────────────────────────
interface StatusChipProps {
  level: StatusLevel;
  label: string;
  className?: string;
}
export function StatusChip({ level, label, className }: StatusChipProps) {
  const color = DOT_COLOR[level];
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.7rem] font-mono font-medium uppercase tracking-wide', className)}
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      <span className="rounded-full inline-block" style={{ width: 5, height: 5, background: color }} aria-hidden />
      {label}
    </span>
  );
}

// ── Skeleton shimmer block ───────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded v4-skeleton', className)}
      aria-hidden
    />
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
interface EmptyStateProps {
  message: string;
  action?: string;
  className?: string;
}
export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}
    >
      <p className="text-[0.875rem]" style={{ color: 'var(--v4-readout)' }}>{message}</p>
      {action && (
        <p className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>{action}</p>
      )}
    </div>
  );
}

// ── Primary button ───────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[0.5rem] px-4 py-2 text-[0.875rem] font-medium transition-transform active:-translate-y-px select-none cursor-pointer disabled:opacity-50';
  const variants = {
    primary:   'text-[var(--v4-void)] bg-[var(--v4-amber)] hover:brightness-105',
    secondary: 'text-[var(--v4-signal)] bg-[var(--v4-raised)] hover:bg-[var(--v4-raised)]/80',
    ghost:     'text-[var(--v4-readout)] bg-transparent hover:bg-[var(--v4-raised)]',
  };
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

// ── Hairline row separator ───────────────────────────────────────────────────
export function Hairline({ className }: { className?: string }) {
  return (
    <div
      className={cn('w-full', className)}
      style={{ height: 1, background: 'var(--v4-hairline)' }}
      aria-hidden
    />
  );
}
