// Chaos page routes — real lab service health grid + chaos-agent proxy
// (status/run/abort). Extracted from server.js (Phase 3 route split);
// byte-identical.
import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';

const router = express.Router();

const CHAOS_SERVICES = [
  // Core infrastructure
  { id: 'dashboard-api',  name: 'Dashboard API',  category: 'Core',    url: 'http://192.168.50.13:3001', dependsOn: [] },
  { id: 'authelia',       name: 'Authelia SSO',   category: 'Core',    url: 'http://192.168.50.13:9091', dependsOn: ['authelia-redis'] },
  { id: 'authelia-redis', name: 'Auth Redis',     category: 'Core',    url: 'http://192.168.50.13:6380', dependsOn: [] },
  { id: 'adguard',        name: 'AdGuard DNS',    category: 'Core',    url: 'http://192.168.50.13:3100', dependsOn: [] },
  // Media
  { id: 'plex',           name: 'Plex',           category: 'Media',   url: 'http://192.168.50.10:32400', dependsOn: [] },
  { id: 'sonarr',         name: 'Sonarr',         category: 'Media',   url: 'http://192.168.50.13:8989', dependsOn: [] },
  { id: 'radarr',         name: 'Radarr',         category: 'Media',   url: 'http://192.168.50.13:7878', dependsOn: [] },
  { id: 'tdarr',          name: 'Tdarr',          category: 'Media',   url: 'http://192.168.50.13:8265', dependsOn: [] },
  { id: 'bazarr',         name: 'Bazarr',         category: 'Media',   url: 'http://192.168.50.13:6767', dependsOn: [] },
  // Storage & cloud
  { id: 'nextcloud',      name: 'Nextcloud',      category: 'Storage', url: 'http://192.168.50.13:8880', dependsOn: ['nextcloud-redis', 'nextcloud-db'] },
  { id: 'nextcloud-redis',name: 'NC Redis',       category: 'Storage', url: 'http://192.168.50.13:6379', dependsOn: [] },
  { id: 'nextcloud-db',   name: 'NC MariaDB',     category: 'Storage', url: 'http://192.168.50.13:3306', dependsOn: [] },
  // AI
  { id: 'litellm',        name: 'LiteLLM',        category: 'AI',      url: 'http://192.168.50.13:4000', dependsOn: ['litellm-db'] },
  { id: 'litellm-db',     name: 'LiteLLM DB',     category: 'AI',      url: 'http://192.168.50.13:5432', dependsOn: [] },
  { id: 'ollama',         name: 'Ollama',         category: 'AI',      url: 'http://192.168.50.13:11434', dependsOn: [] },
  // Monitoring
  { id: 'prometheus',     name: 'Prometheus',     category: 'Monitoring', url: 'http://192.168.50.13:9090', dependsOn: [] },
  { id: 'grafana',        name: 'Grafana',        category: 'Monitoring', url: 'http://192.168.50.13:3000', dependsOn: ['prometheus'] },
  { id: 'netdata',        name: 'Netdata',        category: 'Monitoring', url: 'http://192.168.50.13:19999', dependsOn: [] },
  // Notifications & comms
  { id: 'ntfy',           name: 'ntfy',           category: 'Comms',   url: 'http://192.168.50.13:8080', dependsOn: [] },
];

router.get('/api/chaos/services', optionalAuthMiddleware, async (req, res) => {
  const results = await Promise.all(CHAOS_SERVICES.map(async svc => {
    const start = Date.now();
    try {
      const r = await fetch(svc.url, { signal: AbortSignal.timeout(4000) });
      const latency = Date.now() - start;
      const online = r.status < 500;
      return { ...svc, online, latency, status: online ? 'healthy' : 'degraded' };
    } catch {
      return { ...svc, online: false, latency: null, status: 'down' };
    }
  }));
  res.json(results);
});

// ── Chaos Agent proxy ────────────────────────────────────────────────────────

const CHAOS_AGENT_URL    = 'http://jojeco-chaos-agent:9999';
const CHAOS_AGENT_SECRET = process.env.CHAOS_SECRET || '';

async function chaosProxy(path, options = {}) {
  const res = await fetch(`${CHAOS_AGENT_URL}${path}`, {
    ...options,
    headers: { 'X-Chaos-Token': CHAOS_AGENT_SECRET, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'agent error'), { status: res.status, detail: err.detail });
  }
  return res.json();
}

router.get('/api/chaos/agent/status', authMiddleware, async (req, res) => {
  try { res.json(await chaosProxy('/status')); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

router.post('/api/chaos/agent/run/:module', authMiddleware, async (req, res) => {
  try {
    const result = await chaosProxy(`/run/${req.params.module}`, { method: 'POST', body: JSON.stringify(req.body) });
    res.json(result);
  } catch (e) { res.status(e.status || 503).json({ error: e.message, detail: e.detail }); }
});

router.post('/api/chaos/agent/abort', authMiddleware, async (req, res) => {
  try { res.json(await chaosProxy('/abort', { method: 'POST' })); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

export default router;
