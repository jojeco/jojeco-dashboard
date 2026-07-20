import { useState, useEffect } from 'react';
import { Printer, Activity, Database } from 'lucide-react';
import { Panel, PanelTitle, PageTitle, Mono, Hairline, Skeleton } from '../components/Primitives';
import { getToken } from '../../services/api';
import { cn } from '../lib/utils';

export default function PrinterPage() {
  const [printerData, setPrinterData] = useState<any>(null);
  const [filamentSpools, setFilamentSpools] = useState<any[]>([]);
  const [loadingPrinter, setLoadingPrinter] = useState(true);
  const [loadingFilament, setLoadingFilament] = useState(true);

  useEffect(() => {
    // Fetch filament spools
    fetch('/api/filament', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFilamentSpools(data);
        }
        setLoadingFilament(false);
      })
      .catch(err => {
        console.error('Failed to fetch filament:', err);
        setLoadingFilament(false);
      });

    // Fetch printer status initially and then poll
    const fetchPrinter = () => {
      fetch('/api/printer/p1s', {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then(res => res.json())
        .then(data => {
          setPrinterData(data);
          setLoadingPrinter(false);
        })
        .catch(err => {
          console.error('Failed to fetch printer:', err);
          setLoadingPrinter(false);
        });
    };

    fetchPrinter();
    const interval = setInterval(fetchPrinter, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, []);

  const activeSpools = filamentSpools.filter(s => s.status === 'active');
  const emptySpools = filamentSpools.filter(s => s.status === 'empty');

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
      <div className="flex items-center gap-3">
        <Printer size={24} className="text-[var(--v4-trace)]" />
        <PageTitle>3D Printer</PageTitle>
      </div>

      <div className="grid xl:grid-cols-[4fr_8fr] gap-6">
        {/* Printer Live Status Panel */}
        <Panel className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={18} className="text-[var(--v4-trace)]" />
            <PanelTitle>Bambu P1S Status</PanelTitle>
          </div>

          {loadingPrinter ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : printerData ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--v4-well)' }}>
                <span className="text-[0.875rem] font-medium" style={{ color: 'var(--v4-primary)' }}>Status</span>
                <span className="text-[0.875rem] font-bold" style={{ color: printerData.online ? 'var(--v4-nominal)' : 'var(--v4-fault)' }}>
                  {printerData.online ? printerData.gcode_state : 'OFFLINE'}
                </span>
              </div>

              {printerData.online && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg flex flex-col gap-1" style={{ background: 'var(--v4-well)' }}>
                      <span className="text-[0.75rem] tracking-wide" style={{ color: 'var(--v4-readout)' }}>NOZZLE</span>
                      <Mono className="text-lg">
                        {printerData.nozzle_temp ?? '--'}°C
                        <span className="text-xs" style={{ color: 'var(--v4-trace)' }}> / {printerData.nozzle_target ?? '--'}°C</span>
                      </Mono>
                    </div>
                    <div className="p-3 rounded-lg flex flex-col gap-1" style={{ background: 'var(--v4-well)' }}>
                      <span className="text-[0.75rem] tracking-wide" style={{ color: 'var(--v4-readout)' }}>BED</span>
                      <Mono className="text-lg">
                        {printerData.bed_temp ?? '--'}°C
                        <span className="text-xs" style={{ color: 'var(--v4-trace)' }}> / {printerData.bed_target ?? '--'}°C</span>
                      </Mono>
                    </div>
                  </div>

                  {printerData.job && (
                    <div className="p-3 rounded-lg flex flex-col gap-2" style={{ background: 'var(--v4-well)' }}>
                      <span className="text-[0.75rem] tracking-wide" style={{ color: 'var(--v4-readout)' }}>CURRENT JOB</span>
                      <div className="text-[0.875rem] font-medium truncate">{printerData.job}</div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <Mono className="text-[0.75rem]">Progress: {printerData.pct}%</Mono>
                        <Mono className="text-[0.75rem]">Remaining: {printerData.remaining_min}m</Mono>
                      </div>
                      <div className="w-full bg-[var(--v4-bg-deep)] h-2 rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-1000" 
                          style={{ 
                            width: `${printerData.pct}%`,
                            background: 'var(--v4-nominal)'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {printerData.active_tray !== null && (
                    <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--v4-well)' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: printerData.tray_color || '#ccc' }}></span>
                        <span className="text-[0.875rem] font-medium">{printerData.tray_type || 'Unknown'}</span>
                      </div>
                      <span className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>AMS Slot {printerData.active_tray + 1}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center p-6 text-[0.875rem]" style={{ color: 'var(--v4-trace)' }}>
              Could not load printer data.
            </div>
          )}
        </Panel>

        {/* Filament Inventory Panel */}
        <Panel className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={18} className="text-[var(--v4-trace)]" />
            <PanelTitle>Filament Inventory</PanelTitle>
          </div>

          {loadingFilament ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-[0.8125rem] uppercase tracking-wider mb-3" style={{ color: 'var(--v4-readout)' }}>
                  Active Spools ({activeSpools.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeSpools.map(spool => (
                    <div key={spool.id} className="p-3 rounded-lg border border-[var(--v4-well)] flex justify-between items-center bg-[var(--v4-bg-deep)]">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border border-black/20" style={{ backgroundColor: spool.color_hex || '#888' }} />
                        <div className="flex flex-col">
                          <span className="text-[0.875rem] font-medium">{spool.color_name} {spool.type}</span>
                          <span className="text-[0.6875rem] text-[var(--v4-trace)]">{spool.brand} • {spool.sku}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <Mono className={cn(
                          "text-[0.875rem] font-bold",
                          spool.weight_remaining_g < 200 ? "text-[var(--v4-fault)]" : spool.weight_remaining_g < 400 ? "text-[var(--v4-amber)]" : "text-[var(--v4-nominal)]"
                        )}>
                          {spool.weight_remaining_g}g
                        </Mono>
                        <span className="text-[0.625rem] text-[var(--v4-trace)] uppercase tracking-widest text-right">
                          Remaining
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {emptySpools.length > 0 && (
                <>
                  <Hairline />
                  <div>
                    <h3 className="text-[0.8125rem] uppercase tracking-wider mb-3" style={{ color: 'var(--v4-trace)' }}>
                      Empty Spools ({emptySpools.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {emptySpools.map(spool => (
                        <div key={spool.id} className="text-[0.75rem] px-2 py-1 rounded-md border border-[var(--v4-well)] text-[var(--v4-trace)] bg-[var(--v4-bg-deep)]">
                          {spool.color_name} {spool.type}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
