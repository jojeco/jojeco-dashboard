/** Shared types for Controls page components */

export interface TriggerJob {
  status: 'running' | 'done' | 'error' | 'aborted';
  startedAt: number;
  finishedAt: number | null;
  output: string | null;
  error: string | null;
  canAbort?: boolean;
}

export interface AutomationJob {
  id: string;
  label: string;
  schedule: string;
  status: string;
  healthy: boolean;
  lastRun: string | null;
  lastRunTs: number | null;
  lastLines: string[];
}

export interface UpdateResult {
  id: string;
  name: string;
  image: string;
  updateAvailable: boolean;
  canCheck: boolean;
  localDigest: string | null;
  remoteDigest: string | null;
}

export interface FailoverStatus {
  s2_online: boolean;
  s3_online: boolean;
  failover_active: boolean;
  watchdog_status: string;
  last_sync: string | null;
}

export interface Container {
  name: string;
  running: boolean;
  healthy: 'healthy' | 'unhealthy' | 'none' | string;
  status: string;
}

export type Toast = { id: number; msg: string; ok: boolean };
