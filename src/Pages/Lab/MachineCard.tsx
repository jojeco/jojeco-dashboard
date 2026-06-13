/**
 * MachineCard — renders one lab machine with online status, CPU/RAM/Disk/GPU rings,
 * expandable section for per-drive breakdown, GPU detail, 24h temp sparkline, and
 * top processes fetched on expand.
 */
import { useState } from 'react';
import type React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Machine } from '@/hooks/useSnapshot';
import { RingGauge } from './RingGauge';
import { TempSparkline, TempPoint } from './TempSparkline';
import { fmtBytes, pctColor, tempColor, isIntegrated } from './utils';

interface Process { pid: number; name: string; cpu: number; mem: number }

interface MachineCardProps {
  m: Machine;
  history: TempPoint[];
  isMobile: boolean;
  processes: Process[];
  onExpand: (id: string) => void;
}

function machineCardStyle(m: Machine): React.CSSProperties {
  if (!m.online) return { boxShadow: 'var(--shadow-ring), var(--shadow-card)', opacity: 0.55 };
  const pcts = [m.cpu, m.mem?.percent].filter(v => v != null) as number[];
  if (pcts.some(p => p >= 85)) {
    return { boxShadow: '0 0 0 1px rgba(234,179,8,0.15), var(--shadow-card), inset 0 1px 0 rgba(234,179,8,0.2)' };
  }
  return { boxShadow: '0 0 0 1px rgba(34,197,94,0.10), var(--shadow-card)' };
}

export function MachineCard({ m, history, isMobile, processes, onExpand }: MachineCardProps) {
  const [open, setOpen] = useState(false);

  const totalDisk = (m.disks ?? []).reduce((s, d) => s + d.size, 0);
  const usedDisk  = (m.disks ?? []).reduce((s, d) => s + d.used, 0);
  const diskPct   = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;

  const gaugeSize = isMobile ? 60 : 68;

  return (
    <Card className="transition-opacity"
      style={{ animation: 'fadeUp 350ms cubic-bezier(0.16,1,0.3,1) both', ...machineCardStyle(m) }}>
      {/* Header */}
      <div className="flex justify-between items-start p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`j-dot ${m.online ? 'j-dot-ok' : 'j-dot-off'}`}
              style={m.online ? { animation: 'pulseDot 2.5s ease-in-out infinite' } : {}}
            />
            <span className="text-sm font-bold text-[var(--t1)] tracking-tight">{m.name}</span>
          </div>
          <div className="text-[11px] text-[var(--t2)] pl-[15px]">{m.role}</div>
          <div className="text-[10px] text-[var(--t3)] pl-[15px] font-mono mt-0.5">{m.host}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {m.temp != null && m.online && (
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[var(--raised-2)]"
              style={{ color: tempColor(m.temp) }}>
              CPU {m.temp.toFixed(0)}°
            </span>
          )}
          {m.gpu?.temp != null && m.online && !isIntegrated(m.gpu.name ?? '') && (
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[var(--raised-2)]"
              style={{ color: tempColor(m.gpu.temp) }}>
              GPU {m.gpu.temp}°
            </span>
          )}
          {!m.online && <span className="j-chip">Offline</span>}
          {m.online && (
            <button
              onClick={() => { const next = !open; setOpen(next); if (next) onExpand(m.id); }}
              className="w-7 h-7 rounded-lg border border-[var(--line)] bg-[var(--raised)] text-[var(--t3)] flex items-center justify-center transition-all hover:text-[var(--t1)] hover:border-[var(--line-2)]"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Ring gauges row */}
      {m.online && (
        <div className="flex justify-around px-4 pb-4 gap-2">
          {m.cpu != null && <RingGauge pct={m.cpu} label="CPU" size={gaugeSize} />}
          {m.mem && <RingGauge pct={m.mem.percent} label="RAM" sublabel={fmtBytes(m.mem.total)} size={gaugeSize} />}
          {totalDisk > 0 && <RingGauge pct={diskPct} label="Disk" sublabel={fmtBytes(totalDisk)} warn={75} crit={90} size={gaugeSize} />}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && m.gpu.utilization != null && (
            <RingGauge pct={m.gpu.utilization} label="GPU" warn={80} crit={95} size={gaugeSize} />
          )}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && m.gpu.nvenc_util != null && (
            <RingGauge pct={m.gpu.nvenc_util} label="NVENC" warn={70} crit={90} size={gaugeSize} />
          )}
        </div>
      )}

      {/* Expanded detail */}
      {open && m.online && (
        <div className="border-t border-[var(--line)] p-4 flex flex-col gap-3.5">
          {/* Per-drive breakdown (only if >1 disk) */}
          {m.disks.length > 1 && (
            <div>
              <div className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-2">Drives</div>
              <div className="flex flex-col gap-1.5">
                {m.disks.map(d => (
                  <div key={d.label}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[var(--t2)]">{d.label}</span>
                      <span className="font-mono text-[10px] font-bold" style={{ color: pctColor(d.percent, 75, 90) }}>
                        {d.percent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="j-bar-track">
                      <div className="j-bar-fill" style={{ width: `${d.percent}%`, background: pctColor(d.percent, 75, 90) }} />
                    </div>
                    <div className="text-[9px] text-[var(--t3)] mt-0.5 font-mono">{fmtBytes(d.used)} / {fmtBytes(d.size)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GPU detail */}
          {m.gpu && !isIntegrated(m.gpu.name ?? '') && (
            <div>
              <div className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-2">
                GPU · {m.gpu.name}
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                {m.gpu.mem_percent != null && <RingGauge pct={m.gpu.mem_percent} label="VRAM" warn={80} crit={95} size={56} />}
                {m.gpu.utilization != null && <RingGauge pct={m.gpu.utilization} label="3D" warn={80} crit={95} size={56} />}
                {m.gpu.nvenc_util != null && <RingGauge pct={m.gpu.nvenc_util} label="NVENC" warn={70} crit={90} size={56} />}
                {m.gpu.temp != null && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl font-mono font-bold" style={{ color: tempColor(m.gpu.temp) }}>
                      {m.gpu.temp}°
                    </span>
                    <span className="text-[9px] text-[var(--t3)] uppercase tracking-wider">Temp</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Temperature sparkline */}
          <div>
            <div className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-2">
              Temperature (24h)
            </div>
            <TempSparkline history={history} />
          </div>

          {/* Top processes */}
          {processes && processes.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[var(--t3)] uppercase tracking-widest mb-2">Top Processes</div>
              <div className="flex flex-col gap-0.5">
                <div className="grid gap-1 text-[9px] text-[var(--t3)] font-bold uppercase tracking-wider pb-1 border-b border-[var(--line)]"
                  style={{ gridTemplateColumns: '1fr 52px 52px' }}>
                  <span>Process</span><span className="text-right">CPU%</span><span className="text-right">MEM%</span>
                </div>
                {processes.slice(0, 8).map(p => (
                  <div key={p.pid} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '1fr 52px 52px' }}>
                    <span className="font-mono text-[var(--t2)] truncate">{p.name}</span>
                    <span className="font-mono text-right" style={{ color: p.cpu > 20 ? 'var(--warn)' : 'var(--t2)' }}>
                      {p.cpu.toFixed(1)}
                    </span>
                    <span className="font-mono text-right" style={{ color: p.mem > 20 ? 'var(--warn)' : 'var(--t2)' }}>
                      {p.mem.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton for processes (when expanded but no data yet) */}
      {open && m.online && processes.length === 0 && (
        <div className="border-t border-[var(--line)] p-4">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-24" />
        </div>
      )}
    </Card>
  );
}
