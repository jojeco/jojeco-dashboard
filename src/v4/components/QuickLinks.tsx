import { useMemo } from 'react';
import { cn } from '../lib/utils';
import * as LucideIcons from 'lucide-react';

export function getServiceUrl(svc: any): { url: string; isLanOnly: boolean; isRemote: boolean } {
  const isLan = window.location.hostname.startsWith('192.168.') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const hasExternal = !!svc.externalUrl;
  
  let url = '';
  let isLanOnly = !hasExternal;
  
  if (isLan) {
    url = svc.checkUrl || `http://${svc.hostIp}:${svc.port}`;
    if (svc.id === 'proxmox') url = `https://192.168.50.11:8006`; // Fallback specific to proxmox if checkUrl missing
    if (svc.checkUrl) url = svc.checkUrl;
  } else {
    if (hasExternal) {
      url = svc.externalUrl;
    } else {
      // Dead link for remote viewing, but gives the expected URL structure
      url = svc.checkUrl || `http://${svc.hostIp}:${svc.port}`;
    }
  }
  return { url, isLanOnly, isRemote: !isLan };
}

interface QuickLinksProps {
  services: any[];
  variant: 'grid' | 'strip';
  category?: 'lab' | 'media';
  className?: string;
}

export function QuickLinks({ services, variant, category, className }: QuickLinksProps) {
  const filtered = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s.quicklink && (!category || s.category === category));
  }, [services, category]);

  if (filtered.length === 0) return null;

  return (
    <div
      className={cn(
        variant === 'grid' 
          ? 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]'
          : 'flex gap-3 overflow-x-auto pb-2 scrollbar-hide',
        className
      )}
    >
      {filtered.map(svc => {
        const { url, isLanOnly, isRemote } = getServiceUrl(svc);
        const Icon = (LucideIcons as any)[svc.icon] || LucideIcons.ExternalLink;
        
        let statusColor = 'var(--v4-standby)'; // Unknown/missing
        if (svc.checkedAt) {
          statusColor = svc.online ? 'var(--v4-nominal)' : 'var(--v4-fault)';
        }

        const disabledRemotely = isRemote && isLanOnly;

        return (
          <a
            key={svc.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'group relative flex items-center gap-2.5 rounded-[0.75rem] min-h-[44px] px-3.5',
              'active:scale-[0.98] transition-transform overflow-hidden shrink-0',
              disabledRemotely ? 'opacity-50 pointer-events-none' : 'hover:bg-white/5',
              variant === 'strip' ? 'w-auto' : 'w-full'
            )}
            style={{ background: 'var(--v4-console)' }}
            title={disabledRemotely ? 'Available on LAN only' : `Open ${svc.label}`}
          >
            {/* Status edge stripe */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-[2px]" 
              style={{ background: statusColor }} 
            />
            
            <Icon size={16} style={{ color: 'var(--v4-readout)' }} className="shrink-0" />
            
            <span className="truncate text-[0.875rem] font-medium" style={{ color: 'var(--v4-signal)' }}>
              {svc.label}
            </span>

            {isLanOnly && (
              <span 
                className="ml-auto font-mono text-[0.625rem] tracking-wider shrink-0" 
                style={{ color: 'var(--v4-trace)' }}
              >
                LAN
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
