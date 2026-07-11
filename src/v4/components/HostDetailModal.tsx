/**
 * v4 HostDetailModal — tap a HostTile to see full metrics + meta.
 * Full CPU/RAM/disk/GPU values, larger sparkline, IP + role.
 * Real data only; "—" for unavailable per DESIGN.md §7.
 */
import { DetailModal } from './DetailModal';
import { Mono, Well, Hairline } from './Primitives';
import { Sparkline, useSparkBuffer } from './Sparkline';
import { fmtPct, fmtBytes, pctColor } from '../lib/utils';
import type { Machine } from '../../hooks/useSnapshot';

/** Known host metadata — IP + role from context doc */
const HOST_META: Record<string, { ip: string; role: string }> = {
  CT100:   { ip: '192.168.50.13', role: 'Primary server (Proxmox CT)' },
  ct100:   { ip: '192.168.50.13', role: 'Primary server (Proxmox CT)' },
  S1:      { ip: '192.168.50.10', role: 'Game / media server (Windows)' },
  s1:      { ip: '192.168.50.10', role: 'Game / media server (Windows)' },
  S2:      { ip: '192.168.50.11', role: 'Proxmox hypervisor' },
  s2:      { ip: '192.168.50.11', role: 'Proxmox hypervisor' },
  S3:      { ip: '192.168.50.12', role: 'Fallback / standby node' },
  s3:      { ip: '192.168.50.12', role: 'Fallback / standby node' },
  MacMini: { ip: '192.168.50.30', role: 'DNS + lightweight node' },
  macmini: { ip: '192.168.50.30', role: 'DNS + lightweight node' },
  JoPc:    { ip: '192.168.50.20', role: 'AI inference node (GPU)' },
  jopc:    { ip: '192.168.50.20', role: 'AI inference node (GPU)' },
  MacBook: { ip: '192.168.50.40', role: 'AI inference node (M4)' },
  macbook: { ip: '192.168.50.40', role: 'AI inference node (M4)' },
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>{label}</span>
      <Mono className="text-[0.75rem]" trace>{value}</Mono>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>{label}</span>
      <Mono className="text-[0.8125rem]" style={{ color: color ?? 'var(--v4-signal)' }}>
        {value}
      </Mono>
    </div>
  );
}

interface HostDetailModalProps {
  machine: Machine | null;
  open: boolean;
  onClose: () => void;
}

// Module-level GPU utilization trace store — same pattern as HostTileD traceStore
const gpuTraceStore = new Map<string, Array<{ v: number }>>();

function getGpuTrace(id: string): Array<{ v: number }> {
  if (!gpuTraceStore.has(id)) gpuTraceStore.set(id, []);
  return gpuTraceStore.get(id)!;
}

function pushGpuTrace(id: string, value: number, maxPoints = 30): void {
  const buf = getGpuTrace(id);
  buf.push({ v: value });
  if (buf.length > maxPoints) buf.shift();
}

export function HostDetailModal({ machine, open, onClose }: HostDetailModalProps) {
  const cpuSpark = useSparkBuffer(machine?.cpu ?? null);
  const memSpark = useSparkBuffer(machine?.mem?.percent ?? null);

  // GPU utilization history — push into module-level store when we have a value
  const gpuUtil = machine?.gpu?.utilization ?? null;
  const machineId = machine?.id ?? '';
  if (machine && gpuUtil != null) {
    pushGpuTrace(machineId, gpuUtil);
  }
  const gpuSpark = machine ? getGpuTrace(machineId) : [];

  if (!machine) return null;

  const meta = HOST_META[machine.id] ?? HOST_META[machine.name] ?? null;
  const statusLevel = !machine.online ? 'fault' : machine.cpu != null && machine.cpu > 90 ? 'degraded' : 'nominal';
  const statusLabel = !machine.online ? 'DOWN' : statusLevel === 'degraded' ? 'HIGH' : 'UP';

  // Temp: can be from GPU (gpu.temp) or machine-level (temp for non-GPU hosts)
  const cpuTempVal = machine.temp;
  const cpuTempColor = cpuTempVal != null
    ? (cpuTempVal > 85 ? 'var(--v4-fault)' : cpuTempVal > 70 ? 'var(--v4-degraded)' : 'var(--v4-trace)')
    : undefined;

  return (
    <DetailModal
      open={open}
      onClose={onClose}
      title={machine.name}
      statusLevel={statusLevel}
      statusLabel={statusLabel}
    >
      {!machine.online ? (
        <div className="py-6 text-center">
          <Mono className="text-[0.875rem]" style={{ color: 'var(--v4-fault)' }}>
            Host unreachable
          </Mono>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── CPU + temp (inline) ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.75rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--v4-readout)' }}>CPU</span>
              <div className="flex items-center gap-2">
                {/* Temp chip beside the CPU% readout */}
                {cpuTempVal != null && (
                  <span
                    className="font-mono tabular-nums text-[0.6875rem] px-1.5 py-0.5 rounded"
                    style={{
                      color: cpuTempColor,
                      background: cpuTempVal > 85
                        ? 'color-mix(in srgb, var(--v4-fault) 12%, transparent)'
                        : cpuTempVal > 70
                        ? 'color-mix(in srgb, var(--v4-degraded) 12%, transparent)'
                        : 'var(--v4-well)',
                    }}
                  >
                    {cpuTempVal}°C
                  </span>
                )}
                <Mono className="text-[1rem] font-semibold" style={{ color: pctColor(machine.cpu) }}>
                  {fmtPct(machine.cpu)}
                </Mono>
              </div>
            </div>
            <Sparkline
              data={cpuSpark.length > 1 ? cpuSpark : [{ v: machine.cpu ?? 0 }]}
              color={pctColor(machine.cpu)}
              height={48}
              tooltip
            />
          </section>

          <Hairline />

          {/* ── Memory ──────────────────────────────────────────── */}
          {machine.mem ? (
            <section>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.75rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--v4-readout)' }}>Memory</span>
                <Mono className="text-[0.875rem]" style={{ color: pctColor(machine.mem.percent) }}>
                  {fmtBytes(machine.mem.used)} / {fmtBytes(machine.mem.total)}
                </Mono>
              </div>
              <Sparkline
                data={memSpark.length > 1 ? memSpark : [{ v: machine.mem.percent }]}
                color={pctColor(machine.mem.percent)}
                height={36}
              />
              <div className="mt-1 text-right">
                <Mono dim className="text-[0.75rem]">{fmtPct(machine.mem.percent)} used</Mono>
              </div>
            </section>
          ) : (
            <MetricRow label="Memory" value="—" />
          )}

          {/* ── GPU (after RAM, before Disks) ───────────────────── */}
          {machine.gpu && (
            <>
              <Hairline />
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[0.75rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--v4-readout)' }}>GPU</span>
                  {machine.gpu.utilization != null && (
                    <Mono className="text-[0.875rem]" style={{ color: pctColor(machine.gpu.utilization) }}>
                      {fmtPct(machine.gpu.utilization)}
                    </Mono>
                  )}
                </div>
                <div className="text-[0.8125rem] mb-2 truncate" style={{ color: 'var(--v4-signal)' }}>
                  {machine.gpu.name || '—'}
                </div>
                {/* GPU utilization sparkline — same style as CPU/RAM sparklines */}
                {machine.gpu.utilization != null && (
                  <Sparkline
                    data={gpuSpark.length > 1 ? gpuSpark : [{ v: machine.gpu.utilization }]}
                    color={pctColor(machine.gpu.utilization)}
                    height={36}
                  />
                )}
                <div className="flex flex-col gap-0 mt-1">
                  {machine.gpu.temp != null && (
                    <MetricRow
                      label="Temp"
                      value={`${machine.gpu.temp}°C`}
                      color={machine.gpu.temp > 85 ? 'var(--v4-fault)' : machine.gpu.temp > 70 ? 'var(--v4-degraded)' : undefined}
                    />
                  )}
                  {machine.gpu.mem_percent != null && (
                    <MetricRow label="VRAM" value={fmtPct(machine.gpu.mem_percent)} color={pctColor(machine.gpu.mem_percent)} />
                  )}
                  {machine.gpu.nvenc_util != null && (
                    <MetricRow label="NVENC" value={fmtPct(machine.gpu.nvenc_util)} />
                  )}
                </div>
              </section>
            </>
          )}

          {/* ── Disks ───────────────────────────────────────────── */}
          {machine.disks && machine.disks.length > 0 && (
            <>
              <Hairline />
              <section>
                <span className="text-[0.75rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--v4-readout)' }}>
                  Disks
                </span>
                <div className="mt-1">
                  {machine.disks.map((d, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <span className="text-[0.8125rem]" style={{ color: 'var(--v4-signal)' }}>
                        {d.label || `Disk ${i + 1}`}
                      </span>
                      <div className="flex items-center gap-3">
                        <Mono dim className="text-[0.75rem]">
                          {fmtBytes(d.used)} / {fmtBytes(d.size)}
                        </Mono>
                        <Mono className="text-[0.8125rem]" style={{ color: pctColor(d.percent) }}>
                          {fmtPct(d.percent)}
                        </Mono>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ── Host meta ────────────────────────────────────────── */}
          {meta && (
            <>
              <Hairline />
              <Well className="px-3 py-1">
                <MetaRow label="IP" value={meta.ip} />
                <MetaRow label="Role" value={meta.role} />
              </Well>
            </>
          )}
        </div>
      )}
    </DetailModal>
  );
}
