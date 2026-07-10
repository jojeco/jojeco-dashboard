/**
 * v4 ServiceGroupDetailModal — tap a host row in ServiceHealthSummary
 * to see the full service list: label, port, online, responseTime in mono.
 * Status edge-stripe per row per DESIGN.md §4.
 */
import { DetailModal } from './DetailModal';
import { Mono, Hairline } from './Primitives';
import type { LabHostServicesGroup } from '../../hooks/useSnapshot';

interface ServiceRowProps {
  service: {
    id: string;
    label: string;
    port?: number;
    online: boolean;
    responseTime?: number | null;
  };
}

function ServiceRow({ service }: ServiceRowProps) {
  const stripe = service.online ? 'var(--v4-nominal)' : 'var(--v4-fault)';
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[0.5rem] v4-settle"
      style={{
        background: 'var(--v4-well)',
        boxShadow: `inset 2px 0 0 ${stripe}`,
        minHeight: 44,
      }}
    >
      {/* Label + status text */}
      <div className="flex flex-col min-w-0">
        <span
          className="text-[0.8125rem] font-medium truncate"
          style={{ color: 'var(--v4-signal)' }}
        >
          {service.label}
        </span>
        {!service.online && (
          <Mono className="text-[0.6875rem]" style={{ color: 'var(--v4-fault)' }}>
            DOWN
          </Mono>
        )}
      </div>

      {/* Port + response time */}
      <div className="flex items-center gap-3 shrink-0">
        {service.port != null && (
          <Mono dim className="text-[0.75rem]">:{service.port}</Mono>
        )}
        {service.online && service.responseTime != null ? (
          <Mono className="text-[0.75rem]" style={{ color: 'var(--v4-nominal)' }}>
            {service.responseTime}ms
          </Mono>
        ) : service.online ? (
          <Mono dim className="text-[0.75rem]">—</Mono>
        ) : null}
      </div>
    </div>
  );
}

interface ServiceGroupDetailModalProps {
  group: LabHostServicesGroup | null;
  open: boolean;
  onClose: () => void;
}

export function ServiceGroupDetailModal({ group, open, onClose }: ServiceGroupDetailModalProps) {
  if (!group) return null;

  const down = group.services.filter(s => !s.online);
  const up   = group.services.filter(s => s.online);
  const statusLevel = down.length === 0 ? 'nominal' : down.length === group.services.length ? 'fault' : 'degraded';
  const statusLabel = down.length === 0 ? `${group.services.length} UP` : `${down.length} DOWN`;

  return (
    <DetailModal
      open={open}
      onClose={onClose}
      title={group.host}
      statusLevel={statusLevel}
      statusLabel={statusLabel}
    >
      <div className="flex flex-col gap-2">
        {/* Summary line */}
        <div className="flex items-center gap-2 mb-1">
          <Mono
            className="text-[1rem] font-semibold"
            style={{ color: down.length > 0 ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
          >
            {up.length}/{group.services.length}
          </Mono>
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>
            services up
            {group.hostIp ? ` · ` : ''}
          </span>
          {group.hostIp && (
            <Mono dim className="text-[0.75rem]">{group.hostIp}</Mono>
          )}
        </div>

        <Hairline />

        {/* Service rows — down first, then up */}
        <div className="flex flex-col gap-1.5 v4-stagger">
          {[...down, ...up].map(s => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </div>
      </div>
    </DetailModal>
  );
}
