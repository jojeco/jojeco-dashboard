import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();
const AC_BASE = 'http://192.168.50.13:3201';

let acCache = null;
let acCacheTime = 0;
const CACHE_TTL = 30000;

async function acFetch(path = '/status', method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${AC_BASE}${path}`, opts);
  if (!r.ok) throw new Error(`AC service HTTP ${r.status}`);
  return r.json();
}

const invalidate = () => { acCache = null; acCacheTime = 0; };

router.get('/api/ac/status', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    if (acCache && now - acCacheTime < CACHE_TTL) return res.json(acCache);
    const data = await acFetch('/status');
    acCache = data; acCacheTime = now;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/ac/power', authMiddleware, async (req, res) => {
  const { power } = req.body;
  if (typeof power !== 'boolean') return res.status(400).json({ error: 'power must be boolean' });
  try { invalidate(); res.json(await acFetch('/power', 'POST', { power })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/ac/temperature', authMiddleware, async (req, res) => {
  const t = parseFloat(req.body.temperature);
  if (isNaN(t) || t < 17 || t > 30) return res.status(400).json({ error: 'temperature must be 17-30°C' });
  try { invalidate(); res.json(await acFetch('/temperature', 'POST', { temperature: t })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/ac/mode', authMiddleware, async (req, res) => {
  const { mode } = req.body;
  if (!mode) return res.status(400).json({ error: 'mode required' });
  try { invalidate(); res.json(await acFetch('/mode', 'POST', { mode })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
