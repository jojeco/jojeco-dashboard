// AdGuard Home stats proxy — query/block stats + protection status, fetched with
// Basic auth. Extracted from server.js (Phase 3 route split); byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const ADGUARD_URL = process.env.ADGUARD_URL || 'http://192.168.50.30:3000';
const ADGUARD_USER = process.env.ADGUARD_USER || '';
const ADGUARD_PASS = process.env.ADGUARD_PASS || '';

async function adguardFetch(path) {
  const auth = Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASS}`).toString('base64');
  const r = await fetch(`${ADGUARD_URL}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`AdGuard API ${r.status}`);
  return r.json();
}

router.get('/api/adguard/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await adguardFetch('/control/stats');
    res.json({
      totalQueries: stats.num_dns_queries,
      blockedQueries: stats.num_blocked_filtering,
      blockedPercent: stats.num_dns_queries > 0
        ? ((stats.num_blocked_filtering / stats.num_dns_queries) * 100).toFixed(1)
        : '0',
      avgProcessingTime: stats.avg_processing_time
        ? (stats.avg_processing_time * 1000).toFixed(1)
        : null,
      topBlocked: (stats.top_blocked_domains || []).slice(0, 5),
      topClients: (stats.top_clients || []).slice(0, 5),
    });
  } catch (e) {
    res.status(502).json({ error: 'AdGuard unreachable', detail: e.message });
  }
});

router.get('/api/adguard/status', authMiddleware, async (req, res) => {
  try {
    const status = await adguardFetch('/control/status');
    res.json({
      running: status.running,
      protectionEnabled: status.protection_enabled,
      version: status.version,
    });
  } catch (e) {
    res.status(502).json({ error: 'AdGuard unreachable', detail: e.message });
  }
});

export default router;
