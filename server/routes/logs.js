// Loki container log tail — returns the last N log lines for a container from
// Loki (24h window), oldest-first, with a 10s per-(container,lines) in-memory
// cache. Degrades to { unavailable } rather than erroring when Loki is down.
// Extracted from server.js (Phase 4 route split); handler body byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const LOKI_BASE = process.env.LOKI_URL || 'http://192.168.50.13:3110';
// Per-container in-memory cache: containerName → { at, lines }
const lokiCache = new Map();
const LOKI_TTL = 10_000; // 10s

router.get('/api/logs/container/:name', authMiddleware, async (req, res) => {
  const containerName = req.params.name;
  const lines = Math.min(parseInt(req.query.lines) || 100, 300);

  const cacheKey = `${containerName}:${lines}`;
  const hit = lokiCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LOKI_TTL) {
    return res.json(hit.data);
  }

  try {
    // Query Loki: get last N lines for the container, ordered newest-last
    const now = Date.now();
    const start = (now - 24 * 60 * 60 * 1000) * 1e6; // nanoseconds, 24h window
    const end   = now * 1e6;
    const query = encodeURIComponent(`{container="${containerName}"}`);
    const url   = `${LOKI_BASE}/loki/api/v1/query_range?query=${query}&start=${start}&end=${end}&limit=${lines}&direction=backward`;

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      if (r.status === 404 || r.status === 400) {
        return res.json({ unavailable: true, reason: `Loki: ${r.status}` });
      }
      return res.status(502).json({ unavailable: true, reason: `Loki ${r.status}: ${errText.slice(0, 200)}` });
    }

    const data = await r.json();
    // Loki streams: data.data.result[].values = [[tsNs, line], ...] sorted newest-first
    const rawEntries = (data?.data?.result ?? []).flatMap(stream =>
      (stream.values ?? []).map(([tsNs, line]) => ({
        ts: Math.floor(parseInt(tsNs) / 1e6), // convert ns → ms
        line,
      }))
    );
    // Sort ascending (oldest first = newest last), cap to N lines
    rawEntries.sort((a, b) => a.ts - b.ts);
    const result = rawEntries.slice(-lines);

    lokiCache.set(cacheKey, { at: Date.now(), data: result });
    res.json(result);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return res.json({ unavailable: true, reason: 'Loki timeout' });
    }
    console.error('[logs] Loki error:', e.message);
    res.json({ unavailable: true, reason: 'Loki unreachable' });
  }
});

export default router;
