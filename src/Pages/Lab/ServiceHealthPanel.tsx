/**
 * ServiceHealthPanel — slide-out drawer showing all monitored services.
 * Opens from the Services stat tile. Fetches /api/health/services on open.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getToken } from '@/services/api';

interface ServiceHealth {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  url?: string;
  response_time?: number;
  last_checked?: number;
}

interface ServiceHealthPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ServiceHealthPanel({ open, onClose }: ServiceHealthPanelProps) {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/health/services', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        if (Array.isArray(d.services)) setServices(d.services);
        else setServices(Object.values(d as Record<string, ServiceHealth>));
      })
      .finally(() => setLoading(false));
  }, [open]);

  const sorted = [...services].sort((a, b) => {
    if (a.status === 'offline' && b.status !== 'offline') return -1;
    if (b.status === 'offline' && a.status !== 'offline') return 1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, animation: 'fadeIn 150ms ease' }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 360,
        background: 'var(--raised)', borderLeft: '1px solid var(--line)', zIndex: 201,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.16,1,0.3,1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] shrink-0">
          <div>
            <div className="text-[15px] font-bold text-[var(--t1)]">Service Health</div>
            <div className="text-[11px] text-[var(--t3)] mt-0.5">{services.length} services tracked</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg border border-[var(--line)] bg-[var(--canvas)] text-[var(--t3)] flex items-center justify-center cursor-pointer hover:text-[var(--t1)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 flex flex-col gap-1.5">
          {loading && (
            <>
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-11 rounded-lg" />)}
            </>
          )}
          {!loading && services.length === 0 && (
            <div className="text-[12px] text-[var(--t3)] pt-4">No service data</div>
          )}
          {!loading && sorted.map(svc => {
            const isUp  = svc.status === 'online';
            const isOff = svc.status === 'offline';
            const ago   = svc.last_checked ? Math.floor((Date.now() - svc.last_checked) / 60000) : null;
            return (
              <div
                key={svc.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--canvas)]"
                style={{ border: `1px solid ${isOff ? 'rgba(244,63,94,0.2)' : 'var(--line)'}` }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isUp ? 'var(--ok)' : isOff ? 'var(--err)' : 'var(--t3)',
                  boxShadow: isUp ? '0 0 0 2px var(--ok-dim)' : isOff ? '0 0 0 2px rgba(244,63,94,0.15)' : undefined,
                  animation: isUp ? 'pulseDot 2.5s ease-in-out infinite' : undefined,
                }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--t1)] truncate">{svc.name || svc.id}</div>
                  {svc.url && <div className="text-[10px] text-[var(--t3)] font-mono truncate mt-0.5">{svc.url}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-bold" style={{ color: isUp ? 'var(--ok)' : isOff ? 'var(--err)' : 'var(--t3)' }}>
                    {isUp ? 'Up' : isOff ? 'Down' : '?'}
                  </div>
                  {svc.response_time && <div className="text-[9px] text-[var(--t3)] font-mono">{svc.response_time}ms</div>}
                  {ago !== null && <div className="text-[9px] text-[var(--t3)]">{ago}m ago</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
