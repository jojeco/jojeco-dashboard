/**
 * useSnapshot — shared data layer for the v3 dashboard.
 *
 * Phase 2: SnapshotProvider now drives data via SSE (useLabStream) instead of
 * polling. All pages read from this shared context via useSnapshot(section?).
 * The polling fallback is still available via refresh() for manual reloads.
 *
 * Consumers are unchanged — same API: { data, at, loading, refresh }.
 */
import { createContext, useContext, ReactNode } from 'react';
import { useLabStream } from './useLabStream';
import type { StreamStatus } from './useLabStream';
export type { StreamStatus };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrinterStatus {
  online: boolean;
  gcode_state?: string;
  job?: string | null;
  pct?: number;
  layer?: number;
  total_layers?: number;
  remaining_min?: number | null;
  nozzle_temp?: number | null;
  nozzle_target?: number | null;
  bed_temp?: number | null;
  bed_target?: number | null;
  speed_level?: string;
  active_tray?: number | null;
  tray_color?: string | null;
  tray_type?: string | null;
  print_error?: number;
  lastFetch?: number;
}

export interface LabHostService {
  id: string;
  label: string;
  port?: number;
  online: boolean;
  responseTime?: number | null;
  checkedAt?: number;
  tcp?: boolean;
}
export interface LabHostServicesGroup {
  host: string;
  hostIp: string;
  services: LabHostService[];
}
// Alias — legacy Services page (phase-c) imports this name
export type LabHostGroup = LabHostServicesGroup;
export interface LabHostServicesSection {
  checkedAt: number;
  groups: LabHostServicesGroup[];
}

export interface SnapshotSections {
  lab: LabSection | null;
  servicesHealth: ServicesHealthSection | null;
  docker: DockerContainer[] | null;
  fleet: FleetSection | null;
  ollama: OllamaSession[] | null;
  media: unknown | null;
  system: unknown | null;
  serverStatus: unknown | null;
  alerts: NtfyAlert[] | null;
  automation: AutomationJob[] | null;
  labHostServices: LabHostServicesSection | null;
  torrents: unknown | null;
  minecraft: Record<string, McServer> | null;
  printer: PrinterStatus | null;
}

export interface Disk { label: string; used: number; size: number; percent: number }
export interface Gpu  { name: string; temp: number | null; utilization: number | null; mem_percent: number | null; nvenc_util: number | null }
export interface Machine {
  id: string; name: string; host: string; role: string; os: string;
  always_on: boolean; gpu_label: string | null; online: boolean;
  cpu: number | null;
  mem: { used: number; total: number; percent: number } | null;
  disks: Disk[];
  gpu: Gpu | null;
  temp: number | null;
}
export interface LabSection {
  machines: Machine[];
  status: 'healthy' | 'degraded' | 'critical';
  issues: Array<{ severity: string; message: string }>;
  services: Record<string, boolean>;
  tailscale: unknown;
  lvmThinPool: number | null;
  claudeRunning: boolean | null;
}
export interface ServicesHealthSection {
  [id: string]: { status: 'online' | 'offline' | 'unknown'; responseTime?: number; checkedAt?: number };
}
export interface DockerContainer { name: string; state: string; health: string; status: string }
export interface OllamaNode {
  id: string; name: string; host: string; role: string; online: boolean;
  models: Array<{ name: string; size: number }>;
}
export interface FleetSection {
  nodes: OllamaNode[];
  litellm: { online: boolean; spend: number | null };
}
export interface OllamaSession { id: string; active: Array<{ name: string; size_vram?: number }> }
export interface NtfyAlert { id: string; time: number; title: string | null; message: string; priority: number; tags: string[] }
export interface AutomationJob { id: string; label: string; schedule: string; status: string; lastRun: string | null; lastLines: string[] }
export interface McServer { id: string; name: string; port: number; status: 'running' | 'starting' | 'stopped'; players?: string[] }

// ─── Context ──────────────────────────────────────────────────────────────────

interface SnapshotContextValue {
  data: SnapshotSections | null;
  at: number | null;
  loading: boolean;
  refresh: () => void;
  /** SSE connection state — used by the LiveIndicator in App.tsx */
  streamStatus: StreamStatus;
}

const SnapshotContext = createContext<SnapshotContextValue>({
  data: null, at: null, loading: true, refresh: () => {}, streamStatus: 'connecting',
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const { data: rawData, at, loading, refresh, streamStatus } = useLabStream();
  // Cast from the hook's generic Record type to the typed SnapshotSections
  const data = rawData as SnapshotSections | null;
  return (
    <SnapshotContext.Provider value={{ data, at, loading, refresh, streamStatus }}>
      {children}
    </SnapshotContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Returns the full snapshot or a specific section. */
export function useSnapshot(): SnapshotContextValue;
export function useSnapshot<K extends keyof SnapshotSections>(section: K): { data: SnapshotSections[K]; at: number | null; loading: boolean; refresh: () => void };
export function useSnapshot<K extends keyof SnapshotSections>(section?: K) {
  const ctx = useContext(SnapshotContext);
  if (!section) return ctx;
  return { data: ctx.data ? ctx.data[section] : null, at: ctx.at, loading: ctx.loading, refresh: ctx.refresh };
}
