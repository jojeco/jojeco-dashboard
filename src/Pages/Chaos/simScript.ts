/** Simulation script — hardcoded scenario; no network calls. Preserved verbatim from old page. */
import type { LogEntry, SimStep } from './types';

let _lid = 1;
export function resetLid() { _lid = 1; }
const ml = (level: LogEntry['level'], msg: string): LogEntry => ({ id: _lid++, ts: new Date().toISOString().split('T')[1].slice(0, 12), level, msg });

export const SIM_SCRIPT: SimStep[] = [
  { delay: 0,     log: ml('info', 'Chaos engine v2.4.1 initialising...') },
  { delay: 700,   log: ml('info', 'Scanning 18 lab services...') },
  { delay: 1400,  log: ml('warn', 'Nextcloud Redis :6379 — no AUTH detected') },
  { delay: 2100,  log: ml('warn', 'LiteLLM DB :5432 — pg_hba.conf allows local trust') },
  { delay: 2900,  log: ml('crit', 'Attack vector confirmed: unauthenticated Redis FLUSHALL') },
  { delay: 3700,  log: ml('crit', 'Sending FLUSHALL to :6379...') },
  { delay: 4300,  log: ml('crit', 'NC Redis wiped — sessions + file locks cleared'), patch: { id: 'nextcloud-redis', status: 'down', latency: null } },
  { delay: 5300,  log: ml('warn', 'Nextcloud: session store unreachable') },
  { delay: 6100,  log: ml('crit', 'Nextcloud: marking DEGRADED (DB fallback saturating)'), patch: { id: 'nextcloud', status: 'degraded', latency: 3800 } },
  { delay: 7200,  log: ml('warn', 'Auth Redis :6380 — also unauthenticated') },
  { delay: 8000,  log: ml('crit', 'Flushing auth session store...'), patch: { id: 'authelia-redis', status: 'down', latency: null } },
  { delay: 8800,  log: ml('crit', 'Authelia: all sessions invalidated — users logged out'), patch: { id: 'authelia', status: 'down', latency: null } },
  { delay: 10000, log: ml('info', '─────────────────────────────────────────') },
  { delay: 10100, log: ml('crit', 'RUN COMPLETE  |  4 services impacted') },
  { delay: 10200, log: ml('info', 'Chain: NC Redis → Nextcloud + Auth Redis → Authelia') },
  { delay: 10300, log: ml('ok',   'Fix: requirepass in redis.conf on both Redis instances') },
];
