import { useState, useEffect } from 'react';
import { Printer, Activity, Database, Search, ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { Panel, PanelTitle, PageTitle, Mono, Skeleton } from '../components/Primitives';
import { DetailModal } from '../components/DetailModal';
import { getToken } from '../../services/api';
import { cn } from '../lib/utils';

export default function PrinterPage() {
  const [printerData, setPrinterData] = useState<any>(null);
  const [filamentSpools, setFilamentSpools] = useState<any[]>([]);
  const [loadingPrinter, setLoadingPrinter] = useState(true);
  const [loadingFilament, setLoadingFilament] = useState(true);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');

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

  const filteredSpools = filamentSpools.filter(spool => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (spool.color_name || '').toLowerCase().includes(q) ||
      (spool.type || '').toLowerCase().includes(q) ||
      (spool.brand || '').toLowerCase().includes(q) ||
      (spool.sku || '').toLowerCase().includes(q)
    );
  });

  const sortedSpools = [...filteredSpools].sort((a, b) => {
    const weightA = a.weight_remaining_g || 0;
    const weightB = b.weight_remaining_g || 0;
    return sortOrder === 'desc' ? weightB - weightA : weightA - weightB;
  });

  const spoolsByType = sortedSpools.reduce((acc, spool) => {
    const t = spool.type || 'Unknown';
    if (!acc[t]) acc[t] = [];
    acc[t].push(spool);
    return acc;
  }, {} as Record<string, any[]>);

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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-[var(--v4-trace)]" />
              <PanelTitle>Filament Inventory</PanelTitle>
            </div>
            {!loadingFilament && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--v4-trace)]" />
                  <input
                    type="text"
                    placeholder="Search color, brand..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-[var(--v4-well)] text-[0.8125rem] text-white placeholder:text-[var(--v4-trace)] rounded-md pl-8 pr-3 py-1.5 border border-white/5 focus:outline-none focus:border-[var(--v4-signal)] w-48 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="p-1.5 rounded-md bg-[var(--v4-well)] border border-white/5 hover:border-[var(--v4-signal)] text-[var(--v4-trace)] hover:text-white transition-colors"
                  title={`Sort by quantity (${sortOrder === 'desc' ? 'Most remaining first' : 'Least remaining first'})`}
                >
                  {sortOrder === 'desc' ? <ArrowDownAZ size={16} /> : <ArrowUpAZ size={16} />}
                </button>
              </div>
            )}
          </div>

          {loadingFilament ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.keys(spoolsByType).length === 0 ? (
                <div className="text-center p-6 text-[0.875rem] text-[var(--v4-trace)]">
                  No spools found matching your search.
                </div>
              ) : (
                Object.keys(spoolsByType).sort().map(type => (
                  <div key={type}>
                    <h3 className="text-[0.8125rem] uppercase tracking-wider mb-3" style={{ color: 'var(--v4-readout)' }}>
                      {type} ({spoolsByType[type].length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {spoolsByType[type].map((spool: any) => {
                        const isEmpty = spool.status === 'empty';
                        return (
                          <div 
                            key={spool.id} 
                            className={cn(
                              "p-3 rounded-lg border border-[var(--v4-well)] flex justify-between items-center bg-[var(--v4-bg-deep)] transition-all",
                              isEmpty && "opacity-70 grayscale-[30%] bg-[#1a1414]"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setSelectedSpool(spool)}
                                aria-label={`Preview ${spool.color_name} color`}
                                className="w-4 h-4 rounded-full border border-black/20 shrink-0 cursor-pointer transition-transform hover:scale-125 active:scale-95"
                                style={{ backgroundColor: spool.color_hex || '#888' }}
                              />
                              <div className="flex flex-col">
                                <span className={cn("text-[0.875rem] font-medium", isEmpty && "line-through text-[var(--v4-trace)]")}>
                                  {spool.color_name} {spool.type}
                                </span>
                                <span className="text-[0.6875rem] text-[var(--v4-trace)]">{spool.brand} • {spool.sku}</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end">
                              {isEmpty ? (
                                <>
                                  <span className="text-[0.75rem] text-[var(--v4-fault)] font-bold tracking-wide uppercase">
                                    Needs Restock
                                  </span>
                                  <span className="text-[0.625rem] text-[var(--v4-trace)] uppercase tracking-widest text-right">
                                    Unavailable
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Mono className={cn(
                                    "text-[0.875rem] font-bold",
                                    spool.weight_remaining_g < 200 ? "text-[var(--v4-fault)]" : spool.weight_remaining_g < 400 ? "text-[var(--v4-amber)]" : "text-[var(--v4-nominal)]"
                                  )}>
                                    {spool.weight_remaining_g}g
                                  </Mono>
                                  <span className="text-[0.625rem] text-[var(--v4-trace)] uppercase tracking-widest text-right">
                                    Remaining
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Panel>
      </div>

      <DetailModal
        open={!!selectedSpool}
        onClose={() => setSelectedSpool(null)}
        title={selectedSpool ? `${selectedSpool.color_name} ${selectedSpool.type}` : ''}
      >
        {selectedSpool && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div
              className="w-32 h-32 rounded-full border-2 border-black/20 shadow-lg"
              style={{ backgroundColor: selectedSpool.color_hex || '#888' }}
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[1rem] font-semibold" style={{ color: 'var(--v4-signal)' }}>
                {selectedSpool.color_name}
              </span>
              <Mono className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
                {selectedSpool.color_hex || 'no hex on record'}
              </Mono>
              <span className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
                {selectedSpool.brand} • {selectedSpool.type} • {selectedSpool.sku}
              </span>
              {selectedSpool.status === 'active' ? (
                <span className="text-[0.75rem] mt-2" style={{ color: 'var(--v4-nominal)' }}>
                  {selectedSpool.weight_remaining_g}g remaining
                </span>
              ) : (
                <span className="text-[0.75rem] mt-2 font-bold" style={{ color: 'var(--v4-fault)' }}>
                  UNAVAILABLE - RESTOCK NEEDED
                </span>
              )}
            </div>
          </div>
        )}
      </DetailModal>
    </div>
  );
}

