import { Download, Upload, Wifi, WifiOff } from 'lucide-react';
import type { TransferInfo } from './types';
import { fmt } from './utils';

export function TransferStats({ transfer }: { transfer: TransferInfo | null }) {
  if (!transfer) return null;

  const tiles = [
    { icon: Download, label: 'Download',   val: fmt(transfer.dl_info_speed, '0 B') + '/s', color: 'var(--accent)' },
    { icon: Upload,   label: 'Upload',     val: fmt(transfer.up_info_speed, '0 B') + '/s', color: 'var(--ok)'    },
    { icon: Download, label: 'Session DL', val: fmt(transfer.dl_info_data,  '0 B'),         color: 'var(--t3)'    },
  ];

  return (
    <div className="j-grid-4">
      {tiles.map(({ icon: Icon, label, val, color }) => (
        <div key={label} className="j-panel" style={{ padding: '12px 14px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon size={12} style={{ color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          <div style={{ fontSize: 18, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
        </div>
      ))}
      {/* VPN tile */}
      <div className="j-panel" style={{ padding: '12px 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {transfer.connection_status === 'connected'
            ? <Wifi size={12} style={{ color: 'var(--ok)', flexShrink: 0 }} />
            : <WifiOff size={12} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>VPN</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {transfer.connection_status}
        </div>
      </div>
    </div>
  );
}
