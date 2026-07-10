/**
 * HostServicesSection — Lab service health registry grouped by host.
 *
 * Design rules (matching ServicesPage):
 *  - Surface elevation only — no explicit borders on cards
 *  - Status dots use j-dot-ok / j-dot-err / j-dot-warn classes
 *  - Section label: 10px uppercase t3, 0.08em tracking + hairline rule
 *  - Mobile-first: 2-column minimum grid
 *  - No API keys — data comes from SSE snapshot (labHostServices section)
 */
import { type LabHostGroup, type LabHostService } from '@/hooks/useSnapshot';

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`j-dot ${online ? 'j-dot-ok' : 'j-dot-err'}`}
      style={{ flexShrink: 0 }}
    />
  );
}

// ── Single service tile ───────────────────────────────────────────────────────

function ServiceTile({ svc }: { svc: LabHostService }) {
  const isVestigial = svc.label.toLowerCase().includes('vestigial');
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-sm)',
        padding: '10px 12px',
        boxShadow: svc.online
          ? 'var(--shadow-ring)'
          : 'inset 3px 0 0 var(--err), var(--shadow-ring)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <StatusDot online={svc.online} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--t1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {svc.label}
        </span>
        {isVestigial && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--warn)',
              background: 'rgba(234,179,8,0.12)',
              borderRadius: 3,
              padding: '1px 5px',
              flexShrink: 0,
            }}
          >
            vestigial
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
          :{svc.port}
        </span>
        {svc.online && svc.responseTime != null && (
          <span style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
            {svc.responseTime}ms
          </span>
        )}
        {!svc.online && (
          <span style={{ fontSize: 10, color: 'var(--err)', fontWeight: 600 }}>offline</span>
        )}
      </div>
    </div>
  );
}

// ── Host group card ───────────────────────────────────────────────────────────

function HostGroup({ group }: { group: LabHostGroup }) {
  const online = group.services.filter(s => s.online).length;
  const total = group.services.length;
  const allOk = online === total;
  const allDown = online === 0;

  const pillColor = allOk ? 'var(--ok)' : allDown ? 'var(--err)' : 'var(--warn)';
  const pillBg    = allOk ? 'rgba(34,197,94,0.08)' : allDown ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.08)';
  const dotCls    = allOk ? 'j-dot-ok' : allDown ? 'j-dot-err' : 'j-dot-warn';

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Host header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--t2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}
        >
          {group.host}
        </span>
        <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
          {group.hostIp}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            background: pillBg,
            color: pillColor,
            boxShadow: `0 0 0 1px ${pillColor}33`,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          <span className={`j-dot ${dotCls}`} />
          {online}/{total}
        </div>
      </div>

      {/* Service tiles grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 6,
        }}
      >
        {group.services.map(svc => (
          <ServiceTile key={svc.id} svc={svc} />
        ))}
      </div>
    </div>
  );
}

// ── HostServicesSection ───────────────────────────────────────────────────────

interface HostServicesSectionProps {
  groups: LabHostGroup[] | null;
  loading?: boolean;
}

export function HostServicesSection({ groups, loading }: HostServicesSectionProps) {
  if (loading || !groups) {
    return (
      <div style={{ fontSize: 12, color: 'var(--t3)', padding: '16px 0' }}>
        Loading host service status…
      </div>
    );
  }

  const totalOnline = groups.flatMap(g => g.services).filter(s => s.online).length;
  const totalAll    = groups.flatMap(g => g.services).length;

  return (
    <div>
      {/* Section summary */}
      <div style={{ marginBottom: 14, fontSize: 11, color: 'var(--t3)' }}>
        <span style={{ color: totalOnline === totalAll ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {totalOnline}/{totalAll}
        </span>
        {' '}services online across {groups.length} hosts
      </div>

      {groups.map(group => (
        <HostGroup key={group.host} group={group} />
      ))}
    </div>
  );
}
