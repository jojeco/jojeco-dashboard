// ntfy alert feed — recent alerts (last 48h, capped) and full history (with a
// 30s in-memory cache). Reads the jojeco-alerts topic off the ntfy server.
// Extracted from server.js (Phase 4 route split); handler bodies byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const NTFY_BASE = process.env.NTFY_URL || 'http://192.168.50.13:8080';
const NTFY_TOPIC = 'jojeco-alerts';

router.get('/api/alerts/recent', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const r = await fetch(`${NTFY_BASE}/${NTFY_TOPIC}/json?poll=1&since=48h`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: 'ntfy unreachable' });
    const text = await r.text();
    const messages = text.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(m => m && m.event === 'message').reverse().slice(0, limit).map(m => ({
      id: m.id,
      time: m.time,
      title: m.title || null,
      message: m.message,
      priority: m.priority || 3,
      tags: m.tags || [],
    }));
    res.json(messages);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alerts', detail: e.message });
  }
});

// GET /api/alerts/history?hours=48 — full ntfy history, newest first, 30s cache
const alertHistoryCache = { at: 0, data: null };
const ALERT_HISTORY_TTL = 30_000;

router.get('/api/alerts/history', authMiddleware, async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 48, 168);
  if (alertHistoryCache.data && Date.now() - alertHistoryCache.at < ALERT_HISTORY_TTL) {
    return res.json(alertHistoryCache.data);
  }
  try {
    const r = await fetch(`${NTFY_BASE}/${NTFY_TOPIC}/json?poll=1&since=${hours}h`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return res.status(502).json({ error: 'ntfy unreachable' });
    const text = await r.text();
    const messages = text.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(m => m && m.event === 'message').reverse().map(m => ({
      id: m.id,
      time: m.time,
      title: m.title || null,
      message: m.message,
      priority: m.priority || 3,
      tags: m.tags || [],
    }));
    alertHistoryCache.data = messages;
    alertHistoryCache.at = Date.now();
    res.json(messages);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alert history', detail: e.message });
  }
});

export default router;
