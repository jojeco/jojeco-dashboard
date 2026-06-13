/**
 * ServiceCard — v3 design system.
 * Surface elevation only — no explicit borders. Status stripe via box-shadow inset.
 */
import { ExternalLink, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Service } from '@/types/service';
import { type HealthStatus } from '@/hooks/useServiceHealth';
import { ICON_MAP } from '@/utils/constants';

// ── Uptime Sparkline (24 buckets) ──────────────────────────────────────────────
function UptimeSparkline({ data }: { data: (number | null)[] }) {
  const valid = data.filter(v => v !== null) as number[];
  if (valid.length < 3) return null;
  const W = 56, H = 16;
  const n = data.length;
  const toX = (i: number) => (i / Math.max(n - 1, 1)) * W;
  const toY = (v: number) => H - (v / 100) * H;
  const pts = data
    .map((v, i) => v !== null ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null)
    .filter(Boolean)
    .join(' ');
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  const color = avg >= 95 ? 'var(--ok)' : avg >= 80 ? 'var(--warn)' : 'var(--err)';
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity={0.65} />
    </svg>
  );
}

// ── ServiceCard ────────────────────────────────────────────────────────────────

interface ServiceCardProps {
  service: Service;
  onEdit: (service: Service) => void;
  health: HealthStatus;
  isGuest?: boolean;
  sparkline?: (number | null)[];
}

export function ServiceCard({ service, onEdit, health, isGuest, sparkline }: ServiceCardProps) {
  const Icon = service.icon ? (ICON_MAP[service.icon] ?? Server) : Server;
  const bestUrl = isGuest ? null : (service.url || service.lanUrl);
  const isOnline  = health.status === 'online';
  const isOffline = health.status === 'offline';

  // Status stripe via inset box-shadow — no explicit border color
  const cardShadow = isOffline
    ? '0 0 0 1px rgba(239,68,68,0.12), var(--shadow-card), inset 0 1px 0 rgba(239,68,68,0.2)'
    : isOnline
      ? '0 0 0 1px rgba(34,197,94,0.08), var(--shadow-card)'
      : 'var(--shadow-ring), var(--shadow-card)';

  const dotClass = isOnline ? 'j-dot-ok' : isOffline ? 'j-dot-err' : 'j-dot-off';
  const statusColor = isOnline ? 'var(--ok)' : isOffline ? 'var(--err)' : 'var(--t3)';

  return (
    <Card
      onClick={() => !isGuest && onEdit(service)}
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: isGuest ? 'default' : 'pointer',
        boxShadow: cardShadow,
        transition: 'box-shadow 150ms, transform 100ms',
        userSelect: 'none',
        minWidth: 0,        // grid item: don't let content min-width overflow the column
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!isGuest) (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
      }}
    >
      {/* Top row: icon + status dot */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        {/* Icon — raised background, shadow-ring only (no explicit border) */}
        <div style={{
          padding: 7,
          background: 'var(--raised)',
          borderRadius: 'var(--r-sm)',
          boxShadow: 'var(--shadow-ring)',
          flexShrink: 0,
        }}>
          <Icon size={13} style={{ color: 'var(--t2)', display: 'block' }} />
        </div>
        {/* Right: response time + dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {health.responseTime != null && (
            <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
              {health.responseTime}ms
            </span>
          )}
          <span
            className={`j-dot ${dotClass}`}
            style={isOnline ? { animation: 'pulseDot 2s ease-in-out infinite' } : {}}
          />
        </div>
      </div>

      {/* Name + description */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {service.name}
        </div>
        {service.description && (
          <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {service.description}
          </div>
        )}
      </div>

      {/* Bottom: tags + sparkline + status + link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto', minWidth: 0, flexWrap: 'wrap' }}>
        {/* Tags — shadow-ring only, no border rule */}
        {service.tags?.slice(0, 2).map(tag => (
          <span key={tag} style={{
            fontSize: 9,
            padding: '2px 5px',
            borderRadius: 3,
            background: 'var(--raised)',
            color: 'var(--t3)',
            boxShadow: 'var(--shadow-ring)',
          }}>
            {tag}
          </span>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
          {sparkline && sparkline.filter(v => v !== null).length >= 3 && (
            <UptimeSparkline data={sparkline} />
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
            {isOnline ? 'Up' : isOffline ? 'Down' : '—'}
          </span>
          {bestUrl && (
            <a
              href={bestUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--t3)', transition: 'color 120ms', lineHeight: 1 }}
              onClick={e => e.stopPropagation()}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)'}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--t3)'}
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
