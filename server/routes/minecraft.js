// Minecraft manager proxy — passes through the mc_manager status endpoint on
// Server 1. Extracted from server.js (Phase 4 route split); handler body
// byte-identical.
import express from 'express';
import { lanOrAuth } from '../lib/middleware.js';

const router = express.Router();

router.get('/api/minecraft/status', lanOrAuth, async (req, res) => {
  try {
    const r = await fetch('http://192.168.50.10:8765/status', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'MC API unreachable' });
  }
});

export default router;
