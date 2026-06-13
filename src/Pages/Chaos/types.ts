/** Types for the Chaos page — ported from old ChaosPage.tsx */

export type SvcStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type PageMode  = 'live' | 'sim' | 'real';

export interface LabService {
  id: string;
  name: string;
  category: string;
  url: string;
  dependsOn: string[];
  online: boolean;
  latency: number | null;
  status: SvcStatus;
}

export interface LogEntry {
  id: number;
  ts: string;
  level: 'info' | 'warn' | 'crit' | 'ok';
  msg: string;
}

export interface AgentStatus {
  agent: string;
  modules: string[];
  abort: boolean;
}

export interface SimStep {
  delay: number;
  log: LogEntry;
  patch?: { id: string; status: SvcStatus; latency?: number | null };
}
