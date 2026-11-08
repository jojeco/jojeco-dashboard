/**
 * /api/agent/status — the dashboard's state, condensed for AI agents (and humans in a hurry).
 * Built from the same 15s snapshot the UI renders, so "what Jordan sees" == "what Claude checks".
 * Returns a verdict, a flat issue list (severity / area / item / detail) and key numbers.
 * ?format=text → compact markdown for pasting into a prompt or a health-check report.
 * Auth: LAN, JWT, or X-Api-Key == AGENT_STATUS_KEY (read-only; for the jojeco-mcp tool / scripts).
 */
import express from 'express';
import { lanOrAuth } from '../lib/middleware.js';

const AGENT_KEY = process.env.AGENT_STATUS_KEY || '';
const DISK_WARN = 90;
const DISK_CRIT = 97;
const ALERT_WINDOW_S = 6 * 3600;
const ALERT_BAD = /\b(fail(ed|ure)?|errors?|down|critical|unreachable|problems?|stale)\b/i;
const ALERT_GOOD = /HealthRestored|\bOK\b|backed up|restored|recovered|^Health: Health$/i;

function agentAuth(req, res, next) {
  if (AGENT_KEY && req.headers['x-api-key'] === AGENT_KEY) return next();
  return lanOrAuth(req, res, next);
}

export function buildAgentStatus(snap) {
  const s = snap?.sections ?? {};
  const issues = [];
  const add = (severity, area, item, detail) => issues.push({ severity, area, item, detail });

  // Hosts: always-on machines offline are faults; personal rigs being off is normal
  const machines = s.lab?.machines ?? [];
  for (const m of machines) {
    if (!m.online) {
      if (m.always_on) add('crit', 'host', m.name, 'offline');
      continue;
    }
    for (const d of m.disks ?? []) {
      if (d.percent >= DISK_CRIT) add('crit', 'disk', `${m.name} ${d.label}`, `${d.percent}% used`);
      else if (d.percent >= DISK_WARN) add('warn', 'disk', `${m.name} ${d.label}`, `${d.percent}% used`);
    }
  }

  // Lab services (port/HTTP checks per host)
  let svcTotal = 0, svcDown = 0;
  for (const g of s.labHostServices?.groups ?? []) {
    for (const svc of g.services) {
      svcTotal++;
      if (svc.online === false) { svcDown++; add('crit', 'service', `${g.host}/${svc.label}`, `port ${svc.port ?? '?'} not responding`); }
    }
  }

  // CT100 containers
  const containers = Array.isArray(s.docker) ? s.docker : [];
  for (const c of containers) {
    if (c.health === 'unhealthy') add('crit', 'container', c.name, `unhealthy (${c.status})`);
    else if (c.state !== 'running') add('warn', 'container', c.name, c.status);
  }

  // Scheduled jobs
  for (const a of Array.isArray(s.automation) ? s.automation : []) {
    if (a.status === 'error') add('crit', 'automation', a.label, (a.lastLines ?? []).slice(-2).join(' | ') || 'error');
    else if (a.status !== 'ok') add('warn', 'automation', a.label, `${a.status}, last run ${a.lastRun ?? 'never'}`);
  }

  // Recent ntfy alerts that look like problems (recoveries/OKs filtered out)
  const now = Date.now() / 1000;
  const recentBad = (Array.isArray(s.alerts) ? s.alerts : [])
    .filter(a => now - a.time < ALERT_WINDOW_S)
    .filter(a => (a.priority ?? 3) >= 4 || (ALERT_BAD.test(`${a.title ?? ''} ${a.message}`) && !ALERT_GOOD.test(a.message)));
  for (const a of recentBad.slice(0, 10)) {
    add('info', 'alert', a.title || 'ntfy', `${new Date(a.time * 1000).toISOString()} ${String(a.message).split('\n')[0].slice(0, 160)}`);
  }

  const crit = issues.filter(i => i.severity === 'crit').length;
  const warn = issues.filter(i => i.severity === 'warn').length;
  const verdict = crit ? 'crit' : warn ? 'warn' : 'ok';
  const running = containers.filter(c => c.state === 'running').length;

  return {
    verdict,
    generatedAt: new Date().toISOString(),
    snapshotAt: snap?.at ? new Date(snap.at).toISOString() : null,
    summary: `${verdict.toUpperCase()}: ${crit} critical, ${warn} warnings | hosts ${machines.filter(m => m.online).length}/${machines.length} online | services ${svcTotal - svcDown}/${svcTotal} up | containers ${running}/${containers.length} running`,
    counts: {
      hosts: { online: machines.filter(m => m.online).length, total: machines.length },
      services: { up: svcTotal - svcDown, total: svcTotal },
      containers: { running, total: containers.length },
      critical: crit, warnings: warn,
    },
    issues,
    system: s.system ?? null,
  };
}

function toText(st) {
  const lines = [`# Lab status — ${st.summary}`, `snapshot ${st.snapshotAt ?? 'n/a'}`];
  if (!st.issues.length) lines.push('', 'No issues.');
  for (const sev of ['crit', 'warn', 'info']) {
    const list = st.issues.filter(i => i.severity === sev);
    if (!list.length) continue;
    lines.push('', `## ${sev}`);
    for (const i of list) lines.push(`- [${i.area}] ${i.item}: ${i.detail}`);
  }
  return lines.join('\n') + '\n';
}

export default function agentStatusRouter(getSnapshot) {
  const router = express.Router();
  router.get('/api/agent/status', agentAuth, (req, res) => {
    const st = buildAgentStatus(getSnapshot('auth'));
    if (req.query.format === 'text') return res.type('text/plain').send(toText(st));
    res.json(st);
  });
  return router;
}
