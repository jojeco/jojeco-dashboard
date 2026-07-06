// Kiosk API routes — proxy sensitive/CORS-blocked calls server-side: LiteLLM
// spend, Uptime Kuma totals, Grafana alerts, Pi-AP reachability.
// Extracted from server.js (Phase 3 route split); byte-identical.
import express from 'express';
import { optionalAuthMiddleware } from '../auth.js';

const router = express.Router();

// Local copy of the LiteLLM key constant (byte-identical to server.js); kept
// module-scoped so this route file is self-contained.
const LITELLM_KEY = process.env.LITELLM_KEY;  // required — set in server/.env

const KIOSK_UPTIME_KUMA_URL   = process.env.KIOSK_UPTIME_KUMA_URL   || 'http://192.168.50.30:3001';
const KIOSK_GRAFANA_URL       = process.env.KIOSK_GRAFANA_URL        || 'http://192.168.50.13:3002';
const KIOSK_GRAFANA_USER      = process.env.KIOSK_GRAFANA_USER       || 'admin';
const KIOSK_GRAFANA_PASS      = process.env.KIOSK_GRAFANA_PASS;      // required — set in server/.env
const KIOSK_PI_AP_IP          = process.env.KIOSK_PI_AP_IP           || '192.168.50.31';

// LiteLLM spend — proxy through server to keep bearer token off the browser
router.get('/api/kiosk/litellm-spend', optionalAuthMiddleware, async (req, res) => {
  try {
    const r = await fetch('http://192.168.50.13:4000/global/spend', {
      headers: { Authorization: `Bearer ${LITELLM_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.json({ spend: null, error: `LiteLLM HTTP ${r.status}` });
    const data = await r.json();
    res.json({ spend: data.spend ?? null });
  } catch (e) {
    res.json({ spend: null, error: e.message });
  }
});

// Uptime Kuma — scrape the metrics endpoint (public, no auth)
router.get('/api/kiosk/uptime-kuma', optionalAuthMiddleware, async (req, res) => {
  try {
    // Try /metrics endpoint first (Prometheus format)
    const r = await fetch(`${KIOSK_UPTIME_KUMA_URL}/metrics`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();

    // Parse monitor_status lines: monitor_status{...} 1|0
    const lines = text.split('\n');
    let up = 0, down = 0;
    for (const line of lines) {
      if (line.startsWith('monitor_status{')) {
        const val = parseFloat(line.split(' ').pop());
        if (!isNaN(val)) { val >= 1 ? up++ : down++; }
      }
    }
    const total = up + down;
    res.json({ total, up, down });
  } catch (e) {
    // Fallback: try status page API
    try {
      const r2 = await fetch(`${KIOSK_UPTIME_KUMA_URL}/api/status-page/default`, { signal: AbortSignal.timeout(5000) });
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      const data = await r2.json();
      const monitors = data?.publicGroupList?.flatMap(g => g.monitorList) ?? [];
      const up2   = monitors.filter(m => m.uptime && parseFloat(m.uptime) > 0).length;
      const down2 = monitors.length - up2;
      res.json({ total: monitors.length, up: up2, down: down2 });
    } catch (e2) {
      res.json({ total: 0, up: 0, down: 0, error: e2.message });
    }
  }
});

// Grafana alerts — proxy with Basic auth
router.get('/api/kiosk/grafana-alerts', optionalAuthMiddleware, async (req, res) => {
  try {
    const auth = Buffer.from(`${KIOSK_GRAFANA_USER}:${KIOSK_GRAFANA_PASS}`).toString('base64');
    const r = await fetch(`${KIOSK_GRAFANA_URL}/api/alerting/alerts`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const alerts = Array.isArray(data) ? data.map(a => ({
      id: String(a.id ?? a.uid ?? Math.random()),
      name: a.name ?? a.title ?? a.labels?.alertname ?? 'Unknown alert',
      state: a.state ?? a.status?.state ?? 'unknown',
    })) : [];
    res.json(alerts);
  } catch (e) {
    res.json([]);
  }
});

// Pi AP reachability — server-side ping/fetch (no CORS issues)
router.get('/api/kiosk/pi-ap', optionalAuthMiddleware, async (req, res) => {
  try {
    // Try to reach the Pi on a known lightweight endpoint
    const r = await fetch(`http://${KIOSK_PI_AP_IP}`, { signal: AbortSignal.timeout(3000) });
    res.json({ status: 'up', code: r.status });
  } catch {
    // Not reachable — could be offline or just no HTTP server, try ping-style with a tiny fetch
    res.json({ status: 'down' });
  }
});

export default router;
