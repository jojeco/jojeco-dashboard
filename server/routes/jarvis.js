// Jarvis voice-assistant API proxy — voice/text passthrough, health, session
// history. Extracted from server.js (Phase 3 route split); byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';
import { lanOrAuth } from '../lib/middleware.js';

const router = express.Router();

const JARVIS_API_URL = 'http://192.168.50.13:8300';
const JARVIS_KEY = 'jojeco-jarvis-2026';

router.post('/api/jarvis/voice', authMiddleware, async (req, res) => {
  try {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const upstream = await fetch(`${JARVIS_API_URL}/voice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${JARVIS_KEY}`, 'Content-Type': req.headers['content-type'] },
        body,
      });
      res.status(upstream.status);
      ['X-Transcript', 'X-Reply', 'Content-Type'].forEach(h => {
        const v = upstream.headers.get(h); if (v) res.set(h, v);
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post('/api/jarvis/text', authMiddleware, async (req, res) => {
  try {
    const upstream = await fetch(`${JARVIS_API_URL}/text`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${JARVIS_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(upstream.status);
    const ct = upstream.headers.get('Content-Type') || '';
    if (ct.includes('audio')) {
      res.set('Content-Type', ct);
      const xr = upstream.headers.get('X-Reply'); if (xr) res.set('X-Reply', xr);
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } else {
      res.json(await upstream.json());
    }
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get('/api/jarvis/health', lanOrAuth, async (req, res) => {
  try {
    const upstream = await fetch(`${JARVIS_API_URL}/health`);
    res.json(await upstream.json());
  } catch { res.status(503).json({ error: 'Jarvis API unreachable' }); }
});

router.get('/api/jarvis/history/:sessionId', authMiddleware, async (req, res) => {
  try {
    const upstream = await fetch(`${JARVIS_API_URL}/history/${req.params.sessionId}`, {
      headers: { 'Authorization': `Bearer ${JARVIS_KEY}` }
    });
    res.json(await upstream.json());
  } catch { res.status(502).json({ error: 'Jarvis API unreachable' }); }
});

router.delete('/api/jarvis/history/:sessionId', authMiddleware, async (req, res) => {
  try {
    const upstream = await fetch(`${JARVIS_API_URL}/history/${req.params.sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${JARVIS_KEY}` }
    });
    res.json(await upstream.json());
  } catch { res.status(502).json({ error: 'Jarvis API unreachable' }); }
});

export default router;
