/**
 * useSnapshot — shared data layer for the v3 dashboard.
 *
 * A single SnapshotProvider mounts in App.tsx and polls GET /api/snapshot
 * every 20 s (or 5 s on LAN). All pages read from this shared context via
 * useSnapshot(section?). No per-page setInterval needed.
 *
 * Pauses polling while document is hidden (visibility API).
 * Includes Bearer token from localStorage 'auth_token'.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  torrents: unknown | null;
  minecraft: Record<string, McServer> | null;
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
}

const SnapshotContext = createContext<SnapshotContextValue>({
  data: null, at: null, loading: true, refresh: () => {},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null { return localStorage.getItem('auth_token'); }

function isLan(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.');
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SnapshotSections | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch('/api/snapshot', { headers });
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      setData(json.sections as SnapshotSections);
      setAt(json.at as number);
    } catch {
      // Network error — keep stale data, stay silent
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { poll(); }, [poll]);

  useEffect(() => {
    poll();
    const ms = isLan() ? 5000 : 20000;
    intervalRef.current = setInterval(poll, ms);

    const handleVisibility = () => {
      if (!document.hidden && intervalRef.current === null) {
        poll();
        intervalRef.current = setInterval(poll, ms);
      } else if (document.hidden && intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [poll]);

  return (
    <SnapshotContext.Provider value={{ data, at, loading, refresh }}>
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
